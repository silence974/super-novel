import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { tauriApi } from "./api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
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
