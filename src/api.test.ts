import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, expect, test, vi } from "vitest";
import { tauriApi } from "./api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
});

test("maps the saved chapter response to SavedDraftDto", async () => {
  const input = {
    chapterId: "chapter-7",
    expectedEditRevision: 3,
    content: "风吹过长街。",
  };
  invokeMock.mockResolvedValue({
    id: "chapter-7",
    volumeId: null,
    title: "第一章",
    status: "drafting",
    position: 2,
    content: input.content,
    editRevision: 4,
    nonWhitespaceCharCount: 6,
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_500,
  });

  const saved = await tauriApi.saveWorkingDraft(input);

  expect(invokeMock).toHaveBeenCalledWith("save_working_draft", { input });
  expect(saved).toEqual({
    chapterId: "chapter-7",
    content: input.content,
    editRevision: 4,
    nonWhitespaceCharCount: 6,
    updatedAtMs: 1_700_000_000_500,
  });
  expect(saved).not.toHaveProperty("id");
});

test("persists the selected chapter through the typed adapter", async () => {
  invokeMock.mockResolvedValue(undefined);

  await tauriApi.setLastOpenedChapter("chapter-9");

  expect(invokeMock).toHaveBeenCalledWith("set_last_opened_chapter", {
    chapterId: "chapter-9",
  });
});

test("exposes the native close request and completion protocol", async () => {
  const unlisten = vi.fn();
  const handler = vi.fn();
  listenMock.mockResolvedValue(unlisten);
  invokeMock.mockResolvedValue(undefined);

  await tauriApi.listenWindowCloseRequested(handler);
  const eventHandler = listenMock.mock.calls[0]?.[1];
  eventHandler?.({ event: "desktop-close-requested", id: 1, payload: null });
  await tauriApi.completeWindowClose();

  expect(listenMock).toHaveBeenCalledWith(
    "desktop-close-requested",
    expect.any(Function),
  );
  expect(handler).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("complete_window_close");
});
