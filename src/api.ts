import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  ChapterDto,
  CheckpointDto,
  CheckpointSource,
  CheckpointSummaryDto,
  CommandError,
  SavedDraftDto,
  VolumeDto,
  WorkspaceDto,
} from "./contracts";

export interface NovelApi {
  chooseDirectory(): Promise<string | null>;
  createProject(directory: string, name: string): Promise<WorkspaceDto>;
  openProject(directory: string): Promise<WorkspaceDto>;
  closeProject(): Promise<void>;
  getWorkspace(): Promise<WorkspaceDto>;
  createVolume(title: string): Promise<VolumeDto>;
  createChapter(volumeId: string | null, title: string): Promise<ChapterDto>;
  getChapter(chapterId: string): Promise<ChapterDto>;
  saveWorkingDraft(input: {
    chapterId: string;
    expectedEditRevision: number;
    content: string;
  }): Promise<SavedDraftDto>;
  createCheckpoint(input: {
    chapterId: string;
    expectedEditRevision: number;
    source: CheckpointSource;
  }): Promise<CheckpointDto>;
  listCheckpoints(chapterId: string): Promise<CheckpointSummaryDto[]>;
  getCheckpoint(checkpointId: string): Promise<CheckpointDto>;
  restoreCheckpoint(input: {
    chapterId: string;
    checkpointId: string;
    expectedEditRevision: number;
  }): Promise<ChapterDto>;
}

function isCommandError(error: unknown): error is CommandError {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as Partial<CommandError>;
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}

export function hasCommandErrorCode(error: unknown, code: string): boolean {
  return isCommandError(error) && error.code === code;
}

export function safeCommandMessage(error: unknown, fallback: string): string {
  return isCommandError(error) ? error.message : fallback;
}

export const tauriApi: NovelApi = {
  async chooseDirectory() {
    const selection = await open({ directory: true, multiple: false });
    return typeof selection === "string" ? selection : null;
  },

  createProject(directory, name) {
    return invoke<WorkspaceDto>("create_project", { directory, name });
  },

  openProject(directory) {
    return invoke<WorkspaceDto>("open_project", { directory });
  },

  closeProject() {
    return invoke<void>("close_project");
  },

  getWorkspace() {
    return invoke<WorkspaceDto>("get_workspace");
  },

  createVolume(title) {
    return invoke<VolumeDto>("create_volume", { input: { title } });
  },

  createChapter(volumeId, title) {
    return invoke<ChapterDto>("create_chapter", { input: { volumeId, title } });
  },

  getChapter(chapterId) {
    return invoke<ChapterDto>("get_chapter", { chapterId });
  },

  async saveWorkingDraft(input) {
    const chapter = await invoke<ChapterDto>("save_working_draft", { input });
    return {
      chapterId: chapter.id,
      content: chapter.content,
      editRevision: chapter.editRevision,
      nonWhitespaceCharCount: chapter.nonWhitespaceCharCount,
      updatedAtMs: chapter.updatedAtMs,
    };
  },

  createCheckpoint(input) {
    return invoke<CheckpointDto>("create_checkpoint", { input });
  },

  listCheckpoints(chapterId) {
    return invoke<CheckpointSummaryDto[]>("list_checkpoints", { chapterId });
  },

  getCheckpoint(checkpointId) {
    return invoke<CheckpointDto>("get_checkpoint", { checkpointId });
  },

  restoreCheckpoint(input) {
    return invoke<ChapterDto>("restore_checkpoint", { input });
  },
};
