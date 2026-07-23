import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { chapter, checkpoint, workspaceApi } from "../test/fixtures";
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

  await user.click(await screen.findByRole("button", { name: /版本 17/ }));
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
