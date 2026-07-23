import type { NovelApi } from "../api";
import type {
  ChapterDto,
  CheckpointDto,
  CheckpointSource,
  SavedDraftDto,
  WorkspaceDto,
} from "../contracts";

export function chapter(overrides: Partial<ChapterDto> = {}): ChapterDto {
  return {
    id: "c1",
    volumeId: "v1",
    title: "雨夜",
    status: "drafting",
    position: 1024,
    content: "",
    editRevision: 0,
    nonWhitespaceCharCount: 0,
    createdAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  };
}

export function savedDraft(
  content = "",
  editRevision = 1,
  overrides: Partial<SavedDraftDto> = {},
): SavedDraftDto {
  return {
    chapterId: "c1",
    content,
    editRevision,
    nonWhitespaceCharCount: Array.from(content).filter((character) => !/\s/u.test(character))
      .length,
    updatedAtMs: 2,
    ...overrides,
  };
}

export function checkpoint(
  id = "cp17",
  source: CheckpointSource = "manual",
): CheckpointDto {
  return {
    id,
    chapterId: "c1",
    source,
    sourceEditRevision: 17,
    restoredFromCheckpointId: null,
    content: "历史正文",
    nonWhitespaceCharCount: 4,
    createdAtMs: 17,
  };
}

export function workspace(): WorkspaceDto {
  const current = chapter();
  return {
    project: { id: "p1", name: "长夜书" },
    outline: {
      volumes: [
        {
          id: "v1",
          title: "第一卷",
          position: 1024,
          chapters: [current],
        },
      ],
      ungroupedChapters: [],
    },
    lastOpenedChapterId: current.id,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export function workspaceApi(overrides: Partial<NovelApi> = {}): NovelApi {
  const current = chapter();
  const currentCheckpoint = checkpoint();
  return {
    chooseDirectory: async () => null,
    createProject: async () => workspace(),
    openProject: async () => workspace(),
    closeProject: async () => undefined,
    getWorkspace: async () => workspace(),
    createVolume: async () => workspace().outline.volumes[0],
    createChapter: async () => current,
    getChapter: async () => current,
    saveWorkingDraft: async () => savedDraft(),
    createCheckpoint: async () => currentCheckpoint,
    listCheckpoints: async () => [currentCheckpoint],
    getCheckpoint: async () => currentCheckpoint,
    restoreCheckpoint: async () => current,
    ...overrides,
  };
}
