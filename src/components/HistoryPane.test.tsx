import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  chapter,
  checkpoint,
  deferred,
  workspaceApi,
} from "../test/fixtures";
import { HistoryPane } from "./HistoryPane";

test("loads summaries, fetches selected content, and cancels preview without restoring", async () => {
  const user = userEvent.setup();
  const summary = checkpoint();
  const api = workspaceApi({
    listCheckpoints: vi.fn().mockResolvedValue([summary]),
    getCheckpoint: vi.fn().mockResolvedValue(summary),
    restoreCheckpoint: vi.fn(),
  });

  render(
    <HistoryPane
      api={api}
      chapter={chapter({ editRevision: 18 })}
      onRestored={vi.fn()}
    />,
  );

  const version = await screen.findByRole("button", { name: /版本 17/ });
  expect(version).toHaveTextContent("手动创建");
  expect(api.getCheckpoint).not.toHaveBeenCalled();

  await user.click(version);

  expect(api.getCheckpoint).toHaveBeenCalledWith("cp17");
  expect(
    await screen.findByRole("dialog", { name: "预览历史版本" }),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: "历史版本正文" })).toHaveValue(
    "历史正文",
  );
  expect(api.restoreCheckpoint).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "取消" }));

  expect(screen.queryByRole("dialog", { name: "预览历史版本" })).toBeNull();
  expect(api.restoreCheckpoint).not.toHaveBeenCalled();
});

test("restores only after confirmation and refreshes the history list", async () => {
  const user = userEvent.setup();
  const selected = checkpoint();
  const restored = chapter({
    content: selected.content,
    editRevision: 19,
    nonWhitespaceCharCount: selected.nonWhitespaceCharCount,
    updatedAtMs: 30,
  });
  const onRestored = vi.fn();
  const beforeRestore = vi.fn().mockResolvedValue({
    chapterId: "c1",
    content: "恢复前正文",
    editRevision: 18,
    nonWhitespaceCharCount: 5,
    updatedAtMs: 29,
  });
  const api = workspaceApi({
    listCheckpoints: vi
      .fn()
      .mockResolvedValueOnce([selected])
      .mockResolvedValueOnce([
        checkpoint("cp19", "restore"),
        selected,
      ]),
    getCheckpoint: vi.fn().mockResolvedValue(selected),
    restoreCheckpoint: vi.fn().mockResolvedValue(restored),
  });

  render(
    <HistoryPane
      api={api}
      chapter={chapter({ editRevision: 18 })}
      beforeRestore={beforeRestore}
      onRestored={onRestored}
    />,
  );

  const restoreTrigger = await screen.findByRole("button", { name: /版本 17/ });
  await user.click(restoreTrigger);
  await user.click(
    await screen.findByRole("button", { name: "确认恢复" }),
  );

  expect(beforeRestore).toHaveBeenCalledTimes(1);
  expect(api.restoreCheckpoint).toHaveBeenCalledWith({
    chapterId: "c1",
    checkpointId: "cp17",
    expectedEditRevision: 18,
  });
  expect(onRestored).toHaveBeenCalledWith(restored);
  await waitFor(() => expect(api.listCheckpoints).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("button", { name: /版本 17.*恢复生成/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /版本 17.*手动创建/ })).toHaveFocus();
});

test("shows safe inline errors while keeping the history pane usable", async () => {
  const api = workspaceApi({
    listCheckpoints: vi.fn().mockRejectedValue(new Error("database path")),
  });

  render(
    <HistoryPane
      api={api}
      chapter={chapter()}
      onRestored={vi.fn()}
    />,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "无法读取历史版本，请重试。",
  );
  expect(screen.getByRole("button", { name: "重试历史列表" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "历史版本" })).toBeVisible();
});

test("keeps the newest history refresh when an older list request finishes later", async () => {
  const older = deferred<ReturnType<typeof checkpoint>[]>();
  const newer = deferred<ReturnType<typeof checkpoint>[]>();
  const latest = {
    ...checkpoint("cp19"),
    sourceEditRevision: 19,
  };
  const api = workspaceApi({
    listCheckpoints: vi
      .fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise),
  });
  const view = render(
    <HistoryPane
      api={api}
      chapter={chapter()}
      refreshToken={0}
      onRestored={vi.fn()}
    />,
  );

  view.rerender(
    <HistoryPane
      api={api}
      chapter={chapter()}
      refreshToken={1}
      onRestored={vi.fn()}
    />,
  );
  await act(async () => newer.resolve([latest]));
  expect(await screen.findByRole("button", { name: /版本 19/ })).toBeVisible();

  await act(async () => older.resolve([checkpoint()]));

  expect(screen.getByRole("button", { name: /版本 19/ })).toBeVisible();
  expect(screen.queryByRole("button", { name: /版本 17/ })).toBeNull();
});

test("ignores an old chapter preview response after the active chapter changes", async () => {
  const user = userEvent.setup();
  const pendingPreview = deferred<ReturnType<typeof checkpoint>>();
  const oldSummary = checkpoint();
  const newSummary = {
    ...checkpoint("cp27", "periodic"),
    chapterId: "c2",
    sourceEditRevision: 27,
  };
  const api = workspaceApi({
    listCheckpoints: vi.fn(async (chapterId) =>
      chapterId === "c1" ? [oldSummary] : [newSummary],
    ),
    getCheckpoint: vi.fn().mockReturnValue(pendingPreview.promise),
  });
  const view = render(
    <HistoryPane
      api={api}
      chapter={chapter()}
      onRestored={vi.fn()}
    />,
  );

  await user.click(await screen.findByRole("button", { name: /版本 17/ }));
  view.rerender(
    <HistoryPane
      api={api}
      chapter={chapter({ id: "c2", editRevision: 27 })}
      onRestored={vi.fn()}
    />,
  );
  expect(await screen.findByRole("button", { name: /版本 27/ })).toBeVisible();

  await act(async () => pendingPreview.resolve(oldSummary));

  expect(screen.queryByRole("dialog", { name: "预览历史版本" })).toBeNull();
});

test("settles a pending history request safely after unmount", async () => {
  const pendingList = deferred<ReturnType<typeof checkpoint>[]>();
  const api = workspaceApi({
    listCheckpoints: vi.fn().mockReturnValue(pendingList.promise),
    getCheckpoint: vi.fn(),
    restoreCheckpoint: vi.fn(),
  });
  const view = render(
    <HistoryPane api={api} chapter={chapter()} onRestored={vi.fn()} />,
  );

  view.unmount();
  await act(async () => pendingList.resolve([checkpoint()]));

  expect(api.getCheckpoint).not.toHaveBeenCalled();
  expect(api.restoreCheckpoint).not.toHaveBeenCalled();
});

test("ignores a pending preview response after unmount", async () => {
  const user = userEvent.setup();
  const pendingPreview = deferred<ReturnType<typeof checkpoint>>();
  const onPreviewOpenChange = vi.fn();
  const api = workspaceApi({
    getCheckpoint: vi.fn().mockReturnValue(pendingPreview.promise),
    restoreCheckpoint: vi.fn(),
  });
  const view = render(
    <HistoryPane
      api={api}
      chapter={chapter()}
      onRestored={vi.fn()}
      onPreviewOpenChange={onPreviewOpenChange}
    />,
  );

  await user.click(await screen.findByRole("button", { name: /版本 17/ }));
  view.unmount();
  await act(async () => pendingPreview.resolve(checkpoint()));

  expect(onPreviewOpenChange).not.toHaveBeenCalledWith(true);
  expect(api.restoreCheckpoint).not.toHaveBeenCalled();
});

test("uses a native modal dialog, shows creation time, and restores focus on Escape", async () => {
  const user = userEvent.setup();
  const api = workspaceApi({
    restoreCheckpoint: vi.fn(),
  });

  render(
    <HistoryPane api={api} chapter={chapter()} onRestored={vi.fn()} />,
  );
  const trigger = await screen.findByRole("button", { name: /版本 17/ });
  await user.click(trigger);

  const dialog = await screen.findByRole("dialog", { name: "预览历史版本" });
  expect(dialog.tagName).toBe("DIALOG");
  expect(dialog).toHaveAttribute("open");
  expect(within(dialog).getByText("01/01 08:00")).toBeVisible();

  fireEvent(dialog, new Event("cancel", { cancelable: true }));

  expect(screen.queryByRole("dialog", { name: "预览历史版本" })).toBeNull();
  expect(trigger).toHaveFocus();
  expect(api.restoreCheckpoint).not.toHaveBeenCalled();
});
