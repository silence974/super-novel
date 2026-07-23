import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { NovelApi } from "../api";
import type { SavedDraftDto } from "../contracts";
import {
  chapter,
  checkpoint,
  deferred,
  savedDraft,
  workspace,
  workspaceApi,
} from "../test/fixtures";
import { Workspace } from "./Workspace";

afterEach(() => {
  vi.useRealTimers();
});

test("loads the selected chapter and presents the three-pane saved workspace", async () => {
  const current = chapter({ content: "雨落在旧车站。", nonWhitespaceCharCount: 7 });
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(current),
  });

  render(<Workspace api={api} initialWorkspace={workspace()} />);

  expect(await screen.findByRole("textbox", { name: "雨夜 正文" })).toHaveValue(
    "雨落在旧车站。",
  );
  expect(
    within(screen.getByRole("region", { name: "正文编辑器" })).getByRole(
      "status",
    ),
  ).toHaveTextContent("已保存");
  expect(screen.getByRole("navigation", { name: "作品大纲" })).toBeVisible();
  expect(screen.getByRole("complementary", { name: "历史版本" })).toBeVisible();
});

test("flushes and checkpoints the current chapter before loading another chapter", async () => {
  const user = userEvent.setup();
  const events: string[] = [];
  const first = chapter({ content: "旧稿", editRevision: 3, nonWhitespaceCharCount: 2 });
  const second = chapter({
    id: "c2",
    title: "渡口",
    content: "新章正文",
    editRevision: 7,
    nonWhitespaceCharCount: 4,
  });
  const initial = workspace();
  initial.outline.volumes[0].chapters.push(second);
  const api = workspaceApi({
    getChapter: vi.fn(async (chapterId: string) => {
      events.push(`load:${chapterId}`);
      return chapterId === "c1" ? first : second;
    }),
    saveWorkingDraft: vi.fn(async (input) => {
      events.push("save");
      return savedDraft(input.content, 4, {
        nonWhitespaceCharCount: 4,
        updatedAtMs: 23,
      });
    }),
    createCheckpoint: vi.fn(
      async (input: Parameters<NovelApi["createCheckpoint"]>[0]) => {
        events.push(`checkpoint:${input.expectedEditRevision}`);
        return {
          id: "cp4",
          chapterId: "c1",
          source: "chapter_switch" as const,
          sourceEditRevision: input.expectedEditRevision,
          restoredFromCheckpointId: null,
          content: "旧稿续写",
          nonWhitespaceCharCount: 4,
          createdAtMs: 24,
        };
      },
    ),
  });

  render(<Workspace api={api} initialWorkspace={initial} />);
  const editor = await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.clear(editor);
  await user.type(editor, "旧稿续写");
  events.length = 0;
  await user.click(screen.getByRole("button", { name: /^渡口/ }));

  expect(await screen.findByRole("textbox", { name: "渡口 正文" })).toHaveValue(
    "新章正文",
  );
  expect(events).toEqual(["save", "checkpoint:4", "load:c2"]);
  expect(api.createCheckpoint).toHaveBeenCalledWith({
    chapterId: "c1",
    expectedEditRevision: 4,
    source: "chapter_switch",
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^雨夜/ })).toHaveTextContent("4 字");
  });
});

test("waits for the newest in-flight draft before checkpointing and loading", async () => {
  const user = userEvent.setup();
  const first = deferred<SavedDraftDto>();
  const second = deferred<SavedDraftDto>();
  const next = chapter({
    id: "c2",
    title: "渡口",
    content: "新章正文",
    editRevision: 7,
  });
  const initial = workspace();
  initial.outline.volumes[0].chapters.push(next);
  const events: string[] = [];
  const api = workspaceApi({
    getChapter: vi.fn(async (chapterId: string) => {
      events.push(`load:${chapterId}`);
      return chapterId === "c1" ? chapter() : next;
    }),
    saveWorkingDraft: vi
      .fn()
      .mockImplementationOnce(() => {
        events.push("save:1");
        return first.promise;
      })
      .mockImplementationOnce(() => {
        events.push("save:2");
        return second.promise;
      }),
    createCheckpoint: vi.fn(async (input) => {
      events.push(`checkpoint:${input.expectedEditRevision}`);
      return {
        id: "cp2",
        chapterId: "c1",
        source: "chapter_switch" as const,
        sourceEditRevision: input.expectedEditRevision,
        restoredFromCheckpointId: null,
        content: "第二版",
        nonWhitespaceCharCount: 3,
        createdAtMs: 25,
      };
    }),
  });

  render(<Workspace api={api} initialWorkspace={initial} autosaveDelayMs={0} />);
  const editor = await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.type(editor, "第一版");
  await waitFor(() => expect(api.saveWorkingDraft).toHaveBeenCalledTimes(1));
  await user.clear(editor);
  await user.type(editor, "第二版");
  events.length = 0;
  await user.click(screen.getByRole("button", { name: /^渡口/ }));

  await first.resolve(savedDraft("第一版", 1));
  await waitFor(() => expect(api.saveWorkingDraft).toHaveBeenCalledTimes(2));
  expect(api.createCheckpoint).not.toHaveBeenCalled();
  expect(api.getChapter).toHaveBeenCalledTimes(1);

  await second.resolve(savedDraft("第二版", 2));
  expect(
    await screen.findByRole("textbox", { name: "渡口 正文" }),
  ).toHaveValue("新章正文");
  expect(events).toEqual(["save:2", "checkpoint:2", "load:c2"]);
  expect(api.createCheckpoint).toHaveBeenCalledWith({
    chapterId: "c1",
    expectedEditRevision: 2,
    source: "chapter_switch",
  });
});

test("locks the editor accessibly while a chapter transition save is pending", async () => {
  const user = userEvent.setup();
  const pending = deferred<SavedDraftDto>();
  const next = chapter({ id: "c2", title: "渡口", content: "新章正文" });
  const initial = workspace();
  initial.outline.volumes[0].chapters.push(next);
  const api = workspaceApi({
    getChapter: vi.fn(async (chapterId: string) =>
      chapterId === "c1" ? chapter() : next,
    ),
    saveWorkingDraft: vi.fn().mockReturnValue(pending.promise),
  });

  render(<Workspace api={api} initialWorkspace={initial} />);
  const editor = await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.type(editor, "切换前正文");
  await user.click(screen.getByRole("button", { name: /^渡口/ }));

  expect(editor).toHaveAttribute("readonly");
  expect(screen.getByText("正在安全保存，完成前正文暂时锁定。")).toBeVisible();
  const lockedContent = (editor as HTMLTextAreaElement).value;
  await user.type(editor, "不应写入");
  expect(editor).toHaveValue(lockedContent);

  await pending.resolve(savedDraft("切换前正文", 1));
});

test("shows retry and conflict guidance without making the editor read-only", async () => {
  const user = userEvent.setup();
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter()),
    saveWorkingDraft: vi.fn().mockRejectedValue({
      code: "revision_conflict",
      message: "磁盘版本已经更新。",
      details: {},
      correlationId: "corr-7",
    }),
  });

  render(<Workspace api={api} initialWorkspace={workspace()} autosaveDelayMs={0} />);
  const editor = await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.type(editor, "本地文字");

  expect(await screen.findByRole("status")).toHaveTextContent("版本冲突");
  expect(screen.getByText(/复制本地正文/)).toBeVisible();
  expect(editor).not.toHaveAttribute("readonly");
});

test("updates the active outline summary after autosave succeeds", async () => {
  const user = userEvent.setup();
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter()),
    saveWorkingDraft: vi
      .fn()
      .mockResolvedValue(savedDraft("潮声入夜", 1, { updatedAtMs: 31 })),
  });

  render(<Workspace api={api} initialWorkspace={workspace()} autosaveDelayMs={0} />);
  const editor = await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.type(editor, "潮声入夜");

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^雨夜/ })).toHaveTextContent("4 字");
  });
});

test("adds a chapter to the active volume from the outline", async () => {
  const user = userEvent.setup();
  const created = chapter({
    id: "c9",
    title: "雾港",
    content: "",
    volumeId: "v1",
  });
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter()),
    createChapter: vi.fn().mockResolvedValue(created),
  });

  render(<Workspace api={api} initialWorkspace={workspace()} />);
  await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.click(screen.getByRole("button", { name: "新建章节" }));
  await user.type(screen.getByRole("textbox", { name: "章节标题" }), "雾港");
  await user.click(screen.getByRole("button", { name: "添加章节" }));

  expect(api.createChapter).toHaveBeenCalledWith("v1", "雾港");
  expect(await screen.findByRole("button", { name: /^雾港/ })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "雾港 正文" })).toBeVisible();
});

test("adds a volume to the outline", async () => {
  const user = userEvent.setup();
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter()),
    createVolume: vi.fn().mockResolvedValue({
      id: "v2",
      title: "第二卷",
      position: 2048,
      chapters: [],
    }),
  });

  render(<Workspace api={api} initialWorkspace={workspace()} />);
  await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.click(screen.getByRole("button", { name: "新建卷" }));
  await user.type(screen.getByRole("textbox", { name: "卷标题" }), "第二卷");
  await user.click(screen.getByRole("button", { name: "添加卷" }));

  expect(api.createVolume).toHaveBeenCalledWith("第二卷");
  expect(await screen.findByRole("heading", { name: "第二卷" })).toBeVisible();
});

test("keeps the creation form open and reports safe command failures", async () => {
  const user = userEvent.setup();
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter()),
    createVolume: vi.fn().mockRejectedValue({
      code: "validation_error",
      message: "卷标题不可用。",
      details: {},
      correlationId: "corr-volume",
    }),
  });

  render(<Workspace api={api} initialWorkspace={workspace()} />);
  await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.click(screen.getByRole("button", { name: "新建卷" }));
  await user.type(screen.getByRole("textbox", { name: "卷标题" }), "重复卷");
  await user.click(screen.getByRole("button", { name: "添加卷" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("卷标题不可用。");
  expect(screen.getByRole("textbox", { name: "卷标题" })).toHaveValue("重复卷");
});

test("Ctrl+S and the topbar action flush before creating manual checkpoints", async () => {
  const user = userEvent.setup();
  const events: string[] = [];
  let revision = 0;
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter()),
    saveWorkingDraft: vi.fn(async (input) => {
      revision += 1;
      events.push(`save:${input.content}`);
      return savedDraft(input.content, revision);
    }),
    createCheckpoint: vi.fn(async (input) => {
      events.push(`checkpoint:${input.source}:${input.expectedEditRevision}`);
      return {
        ...checkpoint(`cp${input.expectedEditRevision}`, input.source),
        sourceEditRevision: input.expectedEditRevision,
      };
    }),
  });

  render(<Workspace api={api} initialWorkspace={workspace()} />);
  const editor = await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.type(editor, "第一段");
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  await waitFor(() =>
    expect(events).toEqual(["save:第一段", "checkpoint:manual:1"]),
  );

  events.length = 0;
  await user.type(editor, "第二段");
  await user.click(screen.getByRole("button", { name: "创建版本" }));

  expect(events).toEqual([
    "save:第一段第二段",
    "checkpoint:manual:2",
  ]);
});

test("creates a periodic checkpoint at five minutes only when content changed", async () => {
  vi.useFakeTimers();
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter()),
    saveWorkingDraft: vi.fn(async (input) => savedDraft(input.content, 1)),
    createCheckpoint: vi.fn(async (input) => ({
      ...checkpoint("cp-periodic", input.source),
      sourceEditRevision: input.expectedEditRevision,
    })),
  });

  render(
    <Workspace
      api={api}
      initialWorkspace={workspace()}
      autosaveDelayMs={0}
    />,
  );
  await act(async () => Promise.resolve());
  const editor = screen.getByRole("textbox", { name: "雨夜 正文" });

  await act(async () => vi.advanceTimersByTimeAsync(300_000));
  expect(api.createCheckpoint).not.toHaveBeenCalled();

  fireEvent.change(editor, { target: { value: "五分钟后的正文" } });
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(api.saveWorkingDraft).toHaveBeenCalledTimes(1);
  expect(api.createCheckpoint).toHaveBeenCalledTimes(1);
  expect(api.createCheckpoint).toHaveBeenCalledWith({
    chapterId: "c1",
    expectedEditRevision: 1,
    source: "periodic",
  });

  await act(async () => vi.advanceTimersByTimeAsync(300_000));
  expect(api.createCheckpoint).toHaveBeenCalledTimes(1);
});

test("closes only after flushing and checkpointing the current draft", async () => {
  const user = userEvent.setup();
  const events: string[] = [];
  const onClosed = vi.fn();
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter()),
    saveWorkingDraft: vi.fn(async (input) => {
      events.push("save");
      return savedDraft(input.content, 1);
    }),
    createCheckpoint: vi.fn(async (input) => {
      events.push(`checkpoint:${input.source}`);
      return checkpoint("cp-close", input.source);
    }),
    closeProject: vi.fn(async () => {
      events.push("close");
    }),
  });

  render(
    <Workspace
      api={api}
      initialWorkspace={workspace()}
      onClosed={onClosed}
    />,
  );
  await user.type(
    await screen.findByRole("textbox", { name: "雨夜 正文" }),
    "关闭前正文",
  );
  await user.click(screen.getByRole("button", { name: "关闭项目" }));

  expect(events).toEqual(["save", "checkpoint:project_close", "close"]);
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test("keeps the workspace and local text when closing fails", async () => {
  const user = userEvent.setup();
  const onClosed = vi.fn();
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter()),
    saveWorkingDraft: vi.fn(async (input) => savedDraft(input.content, 1)),
    createCheckpoint: vi.fn().mockRejectedValue({
      code: "internal_error",
      message: "版本暂时无法创建。",
      details: {},
      correlationId: "corr-close",
    }),
    closeProject: vi.fn(),
  });

  render(
    <Workspace
      api={api}
      initialWorkspace={workspace()}
      onClosed={onClosed}
    />,
  );
  const editor = await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.type(editor, "必须保留");
  await user.click(screen.getByRole("button", { name: "关闭项目" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "版本暂时无法创建。",
  );
  expect(editor).toHaveValue("必须保留");
  expect(onClosed).not.toHaveBeenCalled();
  expect(api.closeProject).not.toHaveBeenCalled();
});

test("ignores Ctrl+S and periodic scheduling while project close is pending", async () => {
  vi.useFakeTimers();
  const pending = deferred<ReturnType<typeof checkpoint>>();
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter()),
    createCheckpoint: vi.fn().mockReturnValue(pending.promise),
  });

  render(
    <Workspace
      api={api}
      initialWorkspace={workspace()}
      onClosed={vi.fn()}
    />,
  );
  await act(async () => Promise.resolve());
  fireEvent.change(screen.getByRole("textbox", { name: "雨夜 正文" }), {
    target: { value: "关闭前的新正文" },
  });
  fireEvent.click(screen.getByRole("button", { name: "关闭项目" }));
  await act(async () => Promise.resolve());
  expect(screen.getByRole("button", { name: /版本 17/ })).toBeDisabled();
  await act(async () => vi.advanceTimersByTimeAsync(300_000));
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });

  expect(api.createCheckpoint).toHaveBeenCalledTimes(1);
  expect(api.createCheckpoint).toHaveBeenCalledWith(
    expect.objectContaining({ source: "project_close" }),
  );

  await act(async () => pending.resolve(checkpoint("cp-close", "project_close")));
  await act(async () => Promise.resolve());
  expect(api.createCheckpoint).toHaveBeenCalledTimes(1);
});

test("restores the active chapter atomically and clears an autosave conflict", async () => {
  const user = userEvent.setup();
  const historical = checkpoint();
  const restored = chapter({
    content: "历史正文",
    editRevision: 20,
    nonWhitespaceCharCount: 4,
    updatedAtMs: 50,
  });
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter({ editRevision: 18 })),
    saveWorkingDraft: vi
      .fn()
      .mockRejectedValueOnce({
        code: "revision_conflict",
        message: "磁盘版本已经更新。",
        details: {},
        correlationId: "corr-restore",
      })
      .mockResolvedValueOnce(savedDraft("冲突正文", 19)),
    listCheckpoints: vi.fn().mockResolvedValue([historical]),
    getCheckpoint: vi.fn().mockResolvedValue(historical),
    restoreCheckpoint: vi.fn().mockResolvedValue(restored),
  });

  render(
    <Workspace
      api={api}
      initialWorkspace={workspace()}
      autosaveDelayMs={0}
    />,
  );
  const editor = await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.type(editor, "冲突正文");
  expect(await screen.findByRole("status")).toHaveTextContent("版本冲突");

  await user.click(await screen.findByRole("button", { name: /版本 17/ }));
  await user.click(
    await screen.findByRole("button", { name: "确认恢复" }),
  );

  expect(api.restoreCheckpoint).toHaveBeenCalledWith({
    chapterId: "c1",
    checkpointId: "cp17",
    expectedEditRevision: 19,
  });
  expect(editor).toHaveValue("历史正文");
  expect(screen.getByRole("status")).toHaveTextContent("已保存");
  expect(screen.getByText("修订 20")).toBeVisible();
  expect(screen.getByRole("button", { name: /^雨夜/ })).toHaveTextContent(
    "4 字",
  );
  expect(screen.queryByText(/复制本地正文/)).toBeNull();
});

test("blocks restore when the latest local draft cannot be flushed", async () => {
  const user = userEvent.setup();
  const historical = checkpoint();
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter({ editRevision: 18 })),
    saveWorkingDraft: vi.fn().mockRejectedValue({
      code: "internal_error",
      message: "当前正文无法保存。",
      details: {},
      correlationId: "corr-flush",
    }),
    listCheckpoints: vi.fn().mockResolvedValue([historical]),
    getCheckpoint: vi.fn().mockResolvedValue(historical),
    restoreCheckpoint: vi.fn(),
  });

  render(
    <Workspace
      api={api}
      initialWorkspace={workspace()}
      autosaveDelayMs={0}
    />,
  );
  const editor = await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.type(editor, "不能丢失");
  expect(await screen.findByRole("status")).toHaveTextContent("保存失败");

  await user.click(await screen.findByRole("button", { name: /版本 17/ }));
  await user.click(
    await screen.findByRole("button", { name: "确认恢复" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "当前正文无法保存。",
  );
  expect(api.restoreCheckpoint).not.toHaveBeenCalled();
  expect(editor).toHaveValue("不能丢失");
  expect(editor).not.toHaveAttribute("readonly");
});

test("waits for an active checkpoint before starting a restore", async () => {
  const user = userEvent.setup();
  const historical = checkpoint();
  const pending = deferred<ReturnType<typeof checkpoint>>();
  const api = workspaceApi({
    getChapter: vi.fn().mockResolvedValue(chapter({ editRevision: 18 })),
    createCheckpoint: vi.fn().mockReturnValue(pending.promise),
    listCheckpoints: vi.fn().mockResolvedValue([historical]),
    getCheckpoint: vi.fn().mockResolvedValue(historical),
    restoreCheckpoint: vi.fn().mockResolvedValue(
      chapter({ content: "历史正文", editRevision: 19 }),
    ),
  });

  render(<Workspace api={api} initialWorkspace={workspace()} />);
  await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.click(screen.getByRole("button", { name: "创建版本" }));
  await user.click(await screen.findByRole("button", { name: /版本 17/ }));
  await user.click(
    await screen.findByRole("button", { name: "确认恢复" }),
  );

  expect(api.restoreCheckpoint).not.toHaveBeenCalled();

  await act(async () => pending.resolve(historical));
  await waitFor(() => expect(api.restoreCheckpoint).toHaveBeenCalledTimes(1));
});

test("closes an empty project without trying to checkpoint", async () => {
  const user = userEvent.setup();
  const onClosed = vi.fn();
  const empty = workspace();
  empty.outline.volumes[0].chapters = [];
  empty.lastOpenedChapterId = null;
  const api = workspaceApi({
    closeProject: vi.fn().mockResolvedValue(undefined),
    createCheckpoint: vi.fn(),
  });

  render(<Workspace api={api} initialWorkspace={empty} onClosed={onClosed} />);
  await user.click(
    await screen.findByRole("button", { name: "关闭项目" }),
  );

  expect(api.createCheckpoint).not.toHaveBeenCalled();
  expect(api.closeProject).toHaveBeenCalledTimes(1);
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test("keeps an empty project open when closeProject fails", async () => {
  const user = userEvent.setup();
  const empty = workspace();
  empty.outline.volumes[0].chapters = [];
  empty.lastOpenedChapterId = null;
  const api = workspaceApi({
    closeProject: vi.fn().mockRejectedValue({
      code: "internal_error",
      message: "项目暂时无法关闭。",
      details: {},
      correlationId: "corr-empty-close",
    }),
  });

  render(<Workspace api={api} initialWorkspace={empty} onClosed={vi.fn()} />);
  await user.click(
    await screen.findByRole("button", { name: "关闭项目" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "项目暂时无法关闭。",
  );
  expect(screen.getByRole("main", { name: "写作工作台" })).toBeVisible();
});
