import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CommandError, SavedDraftDto } from "./contracts";
import { chapter, deferred, savedDraft } from "./test/fixtures";
import { useDraftAutosave } from "./useDraftAutosave";

afterEach(() => {
  vi.useRealTimers();
});

describe("useDraftAutosave", () => {
  test("saves once 800ms after the latest edit", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(savedDraft("雨夜", 1));
    const { result } = renderHook(() =>
      useDraftAutosave({
        chapter: chapter(),
        save,
        delayMs: 800,
      }),
    );

    act(() => result.current.setContent("雨"));
    await act(async () => vi.advanceTimersByTimeAsync(400));
    act(() => result.current.setContent("雨夜"));
    await act(async () => vi.advanceTimersByTimeAsync(799));
    expect(save).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      chapterId: "c1",
      expectedEditRevision: 0,
      content: "雨夜",
    });
    expect(result.current.state).toBe("saved");
    expect(result.current.editRevision).toBe(1);
  });

  test("a late response keeps newer text dirty and saves it next without overlap", async () => {
    vi.useFakeTimers();
    const first = deferred<SavedDraftDto>();
    const second = deferred<SavedDraftDto>();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() =>
      useDraftAutosave({ chapter: chapter(), save, delayMs: 0 }),
    );

    act(() => result.current.setContent("第一版"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(save).toHaveBeenCalledTimes(1);

    act(() => result.current.setContent("第二版"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve(savedDraft("第一版", 1)));
    expect(result.current.content).toBe("第二版");
    expect(result.current.state).toBe("dirty");

    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(save).toHaveBeenNthCalledWith(2, {
      chapterId: "c1",
      expectedEditRevision: 1,
      content: "第二版",
    });

    await act(async () => second.resolve(savedDraft("第二版", 2)));
    expect(result.current.state).toBe("saved");
    expect(result.current.editRevision).toBe(2);
  });

  test("maps revision conflicts without discarding the local buffer", async () => {
    vi.useFakeTimers();
    const conflict: CommandError = {
      code: "revision_conflict",
      message: "磁盘版本已经更新。",
      details: {},
      correlationId: "corr-conflict",
    };
    const save = vi.fn().mockRejectedValue(conflict);
    const { result } = renderHook(() =>
      useDraftAutosave({ chapter: chapter(), save, delayMs: 800 }),
    );

    act(() => result.current.setContent("保留这段正文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));

    expect(result.current.state).toBe("conflict");
    expect(result.current.content).toBe("保留这段正文");
  });

  test("keeps failed text and retries it on demand", async () => {
    vi.useFakeTimers();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(savedDraft("可重试正文", 1));
    const { result } = renderHook(() =>
      useDraftAutosave({ chapter: chapter(), save, delayMs: 800 }),
    );

    act(() => result.current.setContent("可重试正文"));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(result.current.state).toBe("error");

    await act(async () => {
      await result.current.retry();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.content).toBe("可重试正文");
    expect(result.current.state).toBe("saved");
  });

  test("does not start a follow-up save after unmount", async () => {
    vi.useFakeTimers();
    const first = deferred<SavedDraftDto>();
    const save = vi.fn().mockReturnValue(first.promise);
    const { result, unmount } = renderHook(() =>
      useDraftAutosave({ chapter: chapter(), save, delayMs: 0 }),
    );

    act(() => result.current.setContent("第一版"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.setContent("尚未发送的第二版"));
    unmount();

    await act(async () => first.resolve(savedDraft("第一版", 1)));
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(save).toHaveBeenCalledTimes(1);
  });

  test("flush drains edits made while its first save is pending", async () => {
    vi.useFakeTimers();
    const first = deferred<SavedDraftDto>();
    const second = deferred<SavedDraftDto>();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() =>
      useDraftAutosave({ chapter: chapter(), save, delayMs: 800 }),
    );

    act(() => result.current.setContent("第一版"));
    let flushPromise!: ReturnType<typeof result.current.flush>;
    act(() => {
      flushPromise = result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);

    act(() => result.current.setContent("第二版"));
    await act(async () => first.resolve(savedDraft("第一版", 1)));

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, {
      chapterId: "c1",
      expectedEditRevision: 1,
      content: "第二版",
    });
    let didResolve = false;
    void flushPromise.then(() => {
      didResolve = true;
    });
    await act(async () => undefined);
    expect(didResolve).toBe(false);

    await act(async () => second.resolve(savedDraft("第二版", 2)));
    await expect(flushPromise).resolves.toMatchObject({
      content: "第二版",
      editRevision: 2,
    });
  });

  test("returns to saved when an edit is reverted to the persisted content", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const { result } = renderHook(() =>
      useDraftAutosave({
        chapter: chapter({ content: "原文" }),
        save,
        delayMs: 800,
      }),
    );

    act(() => result.current.setContent("临时修改"));
    act(() => result.current.setContent("原文"));
    expect(result.current.state).toBe("dirty");

    await act(async () => vi.advanceTimersByTimeAsync(800));

    expect(save).not.toHaveBeenCalled();
    expect(result.current.state).toBe("saved");
  });
});
