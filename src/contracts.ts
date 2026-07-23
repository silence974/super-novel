export type Id = string;
export type ChapterStatus = "planning" | "drafting" | "revising" | "final";
export type CheckpointSource =
  | "manual"
  | "periodic"
  | "chapter_switch"
  | "project_close"
  | "restore";

export interface ProjectDto {
  id: Id;
  name: string;
}

export interface ChapterSummaryDto {
  id: Id;
  title: string;
  status: ChapterStatus;
  position: number;
  editRevision: number;
  nonWhitespaceCharCount: number;
  updatedAtMs: number;
}

export interface VolumeDto {
  id: Id;
  title: string;
  position: number;
  chapters: ChapterSummaryDto[];
}

export interface OutlineDto {
  volumes: VolumeDto[];
  ungroupedChapters: ChapterSummaryDto[];
}

export interface WorkspaceDto {
  project: ProjectDto;
  outline: OutlineDto;
  lastOpenedChapterId: Id | null;
}

export interface ChapterDto extends ChapterSummaryDto {
  volumeId: Id | null;
  content: string;
  createdAtMs: number;
}

export interface SavedDraftDto {
  chapterId: Id;
  content: string;
  editRevision: number;
  nonWhitespaceCharCount: number;
  updatedAtMs: number;
}

export interface CheckpointSummaryDto {
  id: Id;
  chapterId: Id;
  source: CheckpointSource;
  sourceEditRevision: number;
  restoredFromCheckpointId: Id | null;
  nonWhitespaceCharCount: number;
  createdAtMs: number;
}

export interface CheckpointDto extends CheckpointSummaryDto {
  content: string;
}

export interface CommandError {
  code: string;
  message: string;
  details: Record<string, unknown>;
  correlationId: string;
}
