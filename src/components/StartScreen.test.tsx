import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { StartScreen } from "./StartScreen";

const recentProjectsKey = "super-novel.recent-projects.v1";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

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
  expect(JSON.parse(localStorage.getItem(recentProjectsKey) ?? "[]")).toEqual([
    expect.objectContaining({
      name: "长夜书",
      directory: "D:\\Novels\\长夜书",
    }),
  ]);
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
  expect(JSON.parse(localStorage.getItem(recentProjectsKey) ?? "[]")).toEqual([
    expect.objectContaining({
      name: "潮汐档案",
      directory: "D:\\Novels\\潮汐档案",
    }),
  ]);
});

test("opens a recent project directly without showing the directory picker", async () => {
  const user = userEvent.setup();
  localStorage.setItem(
    recentProjectsKey,
    JSON.stringify([
      {
        name: "旧站来信",
        directory: "D:\\Novels\\旧站来信",
        lastOpenedAtMs: 7,
      },
    ]),
  );
  const workspace = {
    project: { id: "p-recent", name: "旧站来信" },
    outline: { volumes: [], ungroupedChapters: [] },
    lastOpenedChapterId: null,
  };
  const api = {
    chooseDirectory: vi.fn(),
    openProject: vi.fn().mockResolvedValue(workspace),
  };
  const onOpened = vi.fn();

  render(<StartScreen api={api as never} onOpened={onOpened} />);
  await user.click(
    screen.getByRole("button", { name: "打开最近项目 旧站来信" }),
  );

  expect(api.chooseDirectory).not.toHaveBeenCalled();
  expect(api.openProject).toHaveBeenCalledWith("D:\\Novels\\旧站来信");
  expect(onOpened).toHaveBeenCalledWith(workspace);
});

test("moves successful opens to the front and keeps eight entries", async () => {
  const user = userEvent.setup();
  const seeded = Array.from({ length: 8 }, (_, index) => ({
    name: `项目 ${index + 1}`,
    directory: `D:\\Novels\\项目-${index + 1}`,
    lastOpenedAtMs: index + 1,
  }));
  localStorage.setItem(recentProjectsKey, JSON.stringify(seeded));
  const workspace = {
    project: { id: "p-tide", name: "潮汐档案（新）" },
    outline: { volumes: [], ungroupedChapters: [] },
    lastOpenedChapterId: null,
  };
  const api = {
    chooseDirectory: vi.fn().mockResolvedValue("D:\\NOVELS\\潮汐档案"),
    openProject: vi.fn().mockResolvedValue(workspace),
  };

  render(<StartScreen api={api as never} onOpened={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "打开已有项目" }));

  const stored = JSON.parse(
    localStorage.getItem(recentProjectsKey) ?? "[]",
  ) as Array<{ name: string; directory: string }>;
  expect(stored).toHaveLength(8);
  expect(stored[0]).toMatchObject({
    name: "潮汐档案（新）",
    directory: "D:\\NOVELS\\潮汐档案",
  });
  expect(stored.some((item) => item.directory.endsWith("项目-1"))).toBe(false);
});

test("deduplicates recent Windows paths without changing their display casing", async () => {
  const user = userEvent.setup();
  localStorage.setItem(
    recentProjectsKey,
    JSON.stringify([
      {
        name: "旧名称",
        directory: "d:\\novels\\潮汐档案",
        lastOpenedAtMs: 3,
      },
    ]),
  );
  const workspace = {
    project: { id: "p-tide", name: "潮汐档案" },
    outline: { volumes: [], ungroupedChapters: [] },
    lastOpenedChapterId: null,
  };
  const api = {
    chooseDirectory: vi.fn().mockResolvedValue("D:\\NOVELS\\潮汐档案"),
    openProject: vi.fn().mockResolvedValue(workspace),
  };

  render(<StartScreen api={api as never} onOpened={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "打开已有项目" }));

  const stored = JSON.parse(localStorage.getItem(recentProjectsKey) ?? "[]");
  expect(stored).toEqual([
    expect.objectContaining({
      name: "潮汐档案",
      directory: "D:\\NOVELS\\潮汐档案",
    }),
  ]);
});

test("keeps a failed recent path until the user explicitly removes it", async () => {
  const user = userEvent.setup();
  localStorage.setItem(
    recentProjectsKey,
    JSON.stringify([
      {
        name: "失效项目",
        directory: "D:\\Moved\\失效项目",
        lastOpenedAtMs: 10,
      },
    ]),
  );
  const api = {
    openProject: vi.fn().mockRejectedValue({
      code: "invalid_project",
      message: "该项目路径已经失效。",
      details: {},
      correlationId: "corr-recent",
    }),
  };

  render(<StartScreen api={api as never} onOpened={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "打开最近项目 失效项目" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "该项目路径已经失效。",
  );
  expect(
    screen.getByRole("button", { name: "打开最近项目 失效项目" }),
  ).toBeVisible();

  await user.click(
    screen.getByRole("button", { name: "从最近项目中移除 失效项目" }),
  );
  expect(
    screen.queryByRole("button", { name: "打开最近项目 失效项目" }),
  ).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(recentProjectsKey) ?? "[]")).toEqual(
    [],
  );
});

test("ignores malformed or unavailable recent-project storage", () => {
  localStorage.setItem(recentProjectsKey, "{not-json");
  const first = render(
    <StartScreen api={{} as never} onOpened={vi.fn()} />,
  );
  expect(screen.queryByText("最近项目")).not.toBeInTheDocument();
  first.unmount();

  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  render(<StartScreen api={{} as never} onOpened={vi.fn()} />);
  expect(
    screen.getByRole("button", { name: "打开已有项目" }),
  ).toBeEnabled();
});

test("still opens a project when recent-project persistence exceeds quota", async () => {
  const user = userEvent.setup();
  localStorage.setItem(
    recentProjectsKey,
    JSON.stringify([
      {
        name: "纸上河流",
        directory: "D:\\Novels\\纸上河流",
        lastOpenedAtMs: 20,
      },
    ]),
  );
  const workspace = {
    project: { id: "p-quota", name: "纸上河流" },
    outline: { volumes: [], ungroupedChapters: [] },
    lastOpenedChapterId: null,
  };
  const onOpened = vi.fn();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });

  render(
    <StartScreen
      api={{ openProject: vi.fn().mockResolvedValue(workspace) } as never}
      onOpened={onOpened}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "打开最近项目 纸上河流" }),
  );

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
