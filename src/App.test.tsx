import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import {
  chapter,
  checkpoint,
  savedDraft,
  workspace,
  workspaceApi,
} from "./test/fixtures";

const recentProjectsKey = "super-novel.recent-projects.v1";

beforeEach(() => {
  localStorage.clear();
});

test("loads the workspace once and shows the start screen when none is open", async () => {
  const api = {
    getWorkspace: vi.fn().mockRejectedValue({
      code: "not_found",
      message: "No workspace",
      details: {},
      correlationId: "corr-1",
    }),
    listenWindowCloseRequested: vi.fn().mockResolvedValue(() => undefined),
    completeWindowClose: vi.fn(),
  };

  render(<App api={api as never} />);

  expect(screen.getByRole("status")).toHaveTextContent("正在读取项目");
  expect(await screen.findByRole("heading", { name: "开始写作" })).toBeVisible();
  expect(api.getWorkspace).toHaveBeenCalledTimes(1);
});

test("shows persisted recent projects after startup finds no open workspace", async () => {
  localStorage.setItem(
    recentProjectsKey,
    JSON.stringify([
      {
        name: "北岸手稿",
        directory: "D:\\Novels\\北岸手稿",
        lastOpenedAtMs: 12,
      },
    ]),
  );
  const api = {
    getWorkspace: vi.fn().mockRejectedValue({
      code: "not_found",
      message: "No workspace",
      details: {},
      correlationId: "corr-recent-app",
    }),
    listenWindowCloseRequested: vi.fn().mockResolvedValue(() => undefined),
    completeWindowClose: vi.fn(),
  };

  render(<App api={api as never} />);

  expect(
    await screen.findByRole("button", { name: "打开最近项目 北岸手稿" }),
  ).toBeVisible();
});

test("shows the temporary workspace after startup succeeds", async () => {
  const api = {
    getWorkspace: vi.fn().mockResolvedValue({
      project: { id: "p1", name: "长夜书" },
      outline: { volumes: [], ungroupedChapters: [] },
      lastOpenedChapterId: null,
    }),
    listenWindowCloseRequested: vi.fn().mockResolvedValue(() => undefined),
    completeWindowClose: vi.fn(),
  };

  render(<App api={api as never} />);

  expect(await screen.findByRole("main", { name: "写作工作台" })).toHaveTextContent(
    "长夜书",
  );
  expect(api.getWorkspace).toHaveBeenCalledTimes(1);
});

test("shows a safe startup error for unexpected failures", async () => {
  const api = {
    getWorkspace: vi.fn().mockRejectedValue(new Error("stack-shaped detail")),
    listenWindowCloseRequested: vi.fn().mockResolvedValue(() => undefined),
    completeWindowClose: vi.fn(),
  };

  render(<App api={api as never} />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "无法读取当前项目，请重试。",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent("stack-shaped detail");
});

test("returns to the start screen after a workspace closes successfully", async () => {
  const user = userEvent.setup();
  const api = workspaceApi({
    getWorkspace: vi.fn().mockResolvedValue(workspace()),
    getChapter: vi.fn().mockResolvedValue(chapter()),
    closeProject: vi.fn().mockResolvedValue(undefined),
  });

  render(<App api={api} />);

  await user.click(
    await screen.findByRole("button", { name: "关闭项目" }),
  );

  expect(await screen.findByRole("heading", { name: "开始写作" })).toBeVisible();
});

test("native window close flushes and checkpoints before completing the close", async () => {
  const user = userEvent.setup();
  const events: string[] = [];
  let requestClose!: () => void;
  const api = workspaceApi({
    getWorkspace: vi.fn().mockResolvedValue(workspace()),
    getChapter: vi.fn().mockResolvedValue(chapter()),
    listenWindowCloseRequested: vi.fn(async (handler) => {
      requestClose = handler;
      return () => undefined;
    }),
    saveWorkingDraft: vi.fn(async (input) => {
      events.push(`save:${input.content}`);
      return savedDraft(input.content, 1);
    }),
    createCheckpoint: vi.fn(async (input) => {
      events.push(`checkpoint:${input.source}`);
      return checkpoint("cp-native", input.source);
    }),
    completeWindowClose: vi.fn(async () => {
      events.push("complete-window-close");
    }),
    closeProject: vi.fn(),
  });

  render(<App api={api} />);
  await user.type(
    await screen.findByRole("textbox", { name: "雨夜 正文" }),
    "关闭前正文",
  );
  await waitFor(() =>
    expect(api.listenWindowCloseRequested).toHaveBeenCalledTimes(1),
  );
  events.length = 0;

  act(() => requestClose());

  await waitFor(() =>
    expect(events).toEqual([
      "save:关闭前正文",
      "checkpoint:project_close",
      "complete-window-close",
    ]),
  );
  expect(api.closeProject).not.toHaveBeenCalled();
});

test("native window close remains blocked and reports an error when checkpointing fails", async () => {
  const user = userEvent.setup();
  let requestClose!: () => void;
  const api = workspaceApi({
    getWorkspace: vi.fn().mockResolvedValue(workspace()),
    getChapter: vi.fn().mockResolvedValue(chapter()),
    listenWindowCloseRequested: vi.fn(async (handler) => {
      requestClose = handler;
      return () => undefined;
    }),
    saveWorkingDraft: vi.fn(async (input) => savedDraft(input.content, 1)),
    createCheckpoint: vi.fn().mockRejectedValue({
      code: "internal_error",
      message: "关闭版本创建失败。",
      details: {},
      correlationId: "corr-native-close",
    }),
    completeWindowClose: vi.fn(),
  });

  render(<App api={api} />);
  const editor = await screen.findByRole("textbox", { name: "雨夜 正文" });
  await user.type(editor, "必须留下");
  await waitFor(() =>
    expect(api.listenWindowCloseRequested).toHaveBeenCalledTimes(1),
  );
  act(() => requestClose());

  expect(await screen.findByText("关闭版本创建失败。")).toBeVisible();
  expect(editor).toHaveValue("必须留下");
  expect(api.completeWindowClose).not.toHaveBeenCalled();
});
