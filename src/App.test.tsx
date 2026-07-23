import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { App } from "./App";
import { chapter, workspace, workspaceApi } from "./test/fixtures";

test("loads the workspace once and shows the start screen when none is open", async () => {
  const api = {
    getWorkspace: vi.fn().mockRejectedValue({
      code: "not_found",
      message: "No workspace",
      details: {},
      correlationId: "corr-1",
    }),
  };

  render(<App api={api as never} />);

  expect(screen.getByRole("status")).toHaveTextContent("正在读取项目");
  expect(await screen.findByRole("heading", { name: "开始写作" })).toBeVisible();
  expect(api.getWorkspace).toHaveBeenCalledTimes(1);
});

test("shows the temporary workspace after startup succeeds", async () => {
  const api = {
    getWorkspace: vi.fn().mockResolvedValue({
      project: { id: "p1", name: "长夜书" },
      outline: { volumes: [], ungroupedChapters: [] },
      lastOpenedChapterId: null,
    }),
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
