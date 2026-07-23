import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { StartScreen } from "./StartScreen";

test("creates a project after choosing a directory and entering a name", async () => {
  const user = userEvent.setup();
  const api = {
    chooseDirectory: vi.fn().mockResolvedValue("D:\\Novels\\长夜书"),
    createProject: vi.fn().mockResolvedValue({
      project: { id: "p1", name: "长夜书" },
      outline: { volumes: [], ungroupedChapters: [] },
      lastOpenedChapterId: null,
    }),
  };
  const onOpened = vi.fn();
  render(<StartScreen api={api as never} onOpened={onOpened} />);

  await user.type(screen.getByLabelText("项目名称"), "长夜书");
  await user.click(screen.getByRole("button", { name: "选择目录并创建" }));

  expect(api.createProject).toHaveBeenCalledWith("D:\\Novels\\长夜书", "长夜书");
  expect(onOpened).toHaveBeenCalledTimes(1);
});

test("opens a project after choosing its directory", async () => {
  const user = userEvent.setup();
  const workspace = {
    project: { id: "p2", name: "潮汐档案" },
    outline: { volumes: [], ungroupedChapters: [] },
    lastOpenedChapterId: null,
  };
  const api = {
    chooseDirectory: vi.fn().mockResolvedValue("D:\\Novels\\潮汐档案"),
    openProject: vi.fn().mockResolvedValue(workspace),
  };
  const onOpened = vi.fn();
  render(<StartScreen api={api as never} onOpened={onOpened} />);

  await user.click(screen.getByRole("button", { name: "打开已有项目" }));

  expect(api.openProject).toHaveBeenCalledWith("D:\\Novels\\潮汐档案");
  expect(onOpened).toHaveBeenCalledWith(workspace);
});

test("requires a project name before directory selection", () => {
  const api = {
    chooseDirectory: vi.fn(),
  };

  render(<StartScreen api={api as never} onOpened={vi.fn()} />);

  expect(screen.getByRole("button", { name: "选择目录并创建" })).toBeDisabled();
  expect(api.chooseDirectory).not.toHaveBeenCalled();
});

test("reports a safe command error inline", async () => {
  const user = userEvent.setup();
  const api = {
    chooseDirectory: vi.fn().mockResolvedValue("D:\\Novels\\残页"),
    openProject: vi.fn().mockRejectedValue({
      code: "invalid_project",
      message: "所选目录不是有效的 Super Novel 项目。",
      details: {},
      correlationId: "corr-9",
      stack: "sensitive-internals",
    }),
  };

  render(<StartScreen api={api as never} onOpened={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "打开已有项目" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "所选目录不是有效的 Super Novel 项目。",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent("sensitive-internals");
});

test("shows progress while a project is opening", async () => {
  const user = userEvent.setup();
  let finishOpen: (() => void) | undefined;
  const pendingWorkspace = new Promise((resolve) => {
    finishOpen = () =>
      resolve({
        project: { id: "p3", name: "渡口" },
        outline: { volumes: [], ungroupedChapters: [] },
        lastOpenedChapterId: null,
      });
  });
  const api = {
    chooseDirectory: vi.fn().mockResolvedValue("D:\\Novels\\渡口"),
    openProject: vi.fn().mockReturnValue(pendingWorkspace),
  };

  render(<StartScreen api={api as never} onOpened={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "打开已有项目" }));

  expect(screen.getByRole("status")).toHaveTextContent("正在打开项目");
  expect(screen.getByRole("button", { name: "正在打开" })).toBeDisabled();

  finishOpen?.();
  await waitFor(() => {
    expect(screen.queryByText("正在打开项目")).not.toBeInTheDocument();
  });
});
