import { useCallback, useEffect, useMemo, useState } from "react";
import type { NovelApi } from "../api";
import { safeCommandMessage } from "../api";
import type {
  ChapterDto,
  ChapterSummaryDto,
  OutlineDto,
  WorkspaceDto,
} from "../contracts";
import { useDraftAutosave } from "../useDraftAutosave";
import { EditorPane } from "./EditorPane";
import { OutlinePane } from "./OutlinePane";

interface WorkspaceProps {
  api: NovelApi;
  initialWorkspace: WorkspaceDto;
  autosaveDelayMs?: number;
}

function firstChapterId(outline: OutlineDto): string | null {
  for (const volume of outline.volumes) {
    if (volume.chapters[0]) {
      return volume.chapters[0].id;
    }
  }
  return outline.ungroupedChapters[0]?.id ?? null;
}

function updateChapterSummary(
  outline: OutlineDto,
  chapterId: string,
  patch: Partial<ChapterSummaryDto>,
): OutlineDto {
  return {
    volumes: outline.volumes.map((volume) => ({
      ...volume,
      chapters: volume.chapters.map((chapter) =>
        chapter.id === chapterId ? { ...chapter, ...patch } : chapter,
      ),
    })),
    ungroupedChapters: outline.ungroupedChapters.map((chapter) =>
      chapter.id === chapterId ? { ...chapter, ...patch } : chapter,
    ),
  };
}

function chapterSummary(chapter: ChapterDto): ChapterSummaryDto {
  return {
    id: chapter.id,
    title: chapter.title,
    status: chapter.status,
    position: chapter.position,
    editRevision: chapter.editRevision,
    nonWhitespaceCharCount: chapter.nonWhitespaceCharCount,
    updatedAtMs: chapter.updatedAtMs,
  };
}

export function Workspace({
  api,
  initialWorkspace,
  autosaveDelayMs = 800,
}: WorkspaceProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [chapter, setChapter] = useState<ChapterDto | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const initialChapterId = useMemo(
    () =>
      initialWorkspace.lastOpenedChapterId ??
      firstChapterId(initialWorkspace.outline),
    [initialWorkspace],
  );

  const loadChapter = useCallback(
    async (chapterId: string) => {
      setLoadState("loading");
      setLoadError("");
      try {
        const loaded = await api.getChapter(chapterId);
        setChapter(loaded);
        setWorkspace((current) => ({
          ...current,
          outline: updateChapterSummary(
            current.outline,
            loaded.id,
            chapterSummary(loaded),
          ),
        }));
        setLoadState("ready");
      } catch (error: unknown) {
        setLoadError(safeCommandMessage(error, "无法读取章节，请重试。"));
        setLoadState("error");
      }
    },
    [api],
  );

  useEffect(() => {
    if (initialChapterId === null) {
      setLoadState("ready");
      return;
    }
    void loadChapter(initialChapterId);
  }, [initialChapterId, loadChapter]);

  const updateSummary = useCallback(
    (chapterId: string, patch: Partial<ChapterSummaryDto>) => {
      setWorkspace((current) => ({
        ...current,
        outline: updateChapterSummary(current.outline, chapterId, patch),
      }));
    },
    [],
  );

  const createVolume = useCallback(
    async (title: string) => {
      const created = await api.createVolume(title);
      setWorkspace((current) => ({
        ...current,
        outline: {
          ...current.outline,
          volumes: [...current.outline.volumes, created],
        },
      }));
    },
    [api],
  );

  const createChapter = useCallback(
    async (title: string) => {
      const volumeId =
        chapter !== null
          ? chapter.volumeId
          : (workspace.outline.volumes[0]?.id ?? null);
      const created = await api.createChapter(volumeId, title);
      const summary = chapterSummary(created);
      setWorkspace((current) => ({
        ...current,
        outline:
          created.volumeId === null
            ? {
                ...current.outline,
                ungroupedChapters: [
                  ...current.outline.ungroupedChapters,
                  summary,
                ],
              }
            : {
                ...current.outline,
                volumes: current.outline.volumes.map((volume) =>
                  volume.id === created.volumeId
                    ? { ...volume, chapters: [...volume.chapters, summary] }
                    : volume,
                ),
              },
      }));
      if (chapter === null) {
        setChapter(created);
        setLoadState("ready");
      }
      return created;
    },
    [api, chapter, workspace.outline.volumes],
  );

  if (loadState === "loading") {
    return (
      <main className="workspace-shell workspace-loading" aria-label="写作工作台">
        <div className="workspace-topbar">
          <span className="workspace-wordmark">SUPER NOVEL</span>
          <span>{workspace.project.name}</span>
        </div>
        <div className="workspace-loading-lines" role="status">
          <span />
          <span />
          正在读取章节
        </div>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="workspace-shell workspace-load-error" aria-label="写作工作台">
        <p className="pane-index">章节未能载入</p>
        <h1>正文暂时不可用</h1>
        <p role="alert">{loadError}</p>
        {initialChapterId ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void loadChapter(initialChapterId)}
          >
            重试读取
          </button>
        ) : null}
      </main>
    );
  }

  if (chapter === null) {
    return (
      <main className="workspace-shell empty-workspace" aria-label="写作工作台">
        <header className="workspace-topbar">
          <span className="workspace-wordmark">SUPER NOVEL</span>
          <span>{workspace.project.name}</span>
        </header>
        <OutlinePane
          outline={workspace.outline}
          activeChapterId={null}
          onSelectChapter={(chapterId) => void loadChapter(chapterId)}
          onCreateVolume={createVolume}
          onCreateChapter={async (title) => {
            await createChapter(title);
          }}
        />
        <section className="empty-editor">
          <p className="pane-index">空白项目</p>
          <h1>从第一章开始</h1>
          <p>创建章节后即可进入纯文本写作空间。</p>
        </section>
      </main>
    );
  }

  return (
    <WorkspaceBody
      key={chapter.id}
      api={api}
      workspace={workspace}
      chapter={chapter}
      autosaveDelayMs={autosaveDelayMs}
      onChapterChanged={setChapter}
      onSummaryChanged={updateSummary}
      onCreateVolume={createVolume}
      onCreateChapter={createChapter}
    />
  );
}

interface WorkspaceBodyProps {
  api: NovelApi;
  workspace: WorkspaceDto;
  chapter: ChapterDto;
  autosaveDelayMs: number;
  onChapterChanged(chapter: ChapterDto): void;
  onSummaryChanged(chapterId: string, patch: Partial<ChapterSummaryDto>): void;
  onCreateVolume(title: string): Promise<void>;
  onCreateChapter(title: string): Promise<ChapterDto>;
}

function WorkspaceBody({
  api,
  workspace,
  chapter,
  autosaveDelayMs,
  onChapterChanged,
  onSummaryChanged,
  onCreateVolume,
  onCreateChapter,
}: WorkspaceBodyProps) {
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const onDraftSaved = useCallback(
    (saved: {
      chapterId: string;
      editRevision: number;
      nonWhitespaceCharCount: number;
      updatedAtMs: number;
    }) => {
      onSummaryChanged(saved.chapterId, {
        editRevision: saved.editRevision,
        nonWhitespaceCharCount: saved.nonWhitespaceCharCount,
        updatedAtMs: saved.updatedAtMs,
      });
    },
    [onSummaryChanged],
  );
  const draft = useDraftAutosave({
    chapter,
    save: api.saveWorkingDraft,
    onSaved: onDraftSaved,
    delayMs: autosaveDelayMs,
  });

  const activeVolume = workspace.outline.volumes.find((volume) =>
    volume.chapters.some((item) => item.id === chapter.id),
  );

  const persistBeforeLeaving = async () => {
    const saved = await draft.flush();
    onSummaryChanged(chapter.id, {
      editRevision: saved.editRevision,
      nonWhitespaceCharCount: saved.nonWhitespaceCharCount,
      updatedAtMs: saved.updatedAtMs,
    });
    await api.createCheckpoint({
      chapterId: chapter.id,
      expectedEditRevision: saved.editRevision,
      source: "chapter_switch",
    });
  };

  const selectChapter = async (chapterId: string) => {
    if (chapterId === chapter.id || isSwitching) {
      return;
    }

    setIsSwitching(true);
    setSwitchError("");
    try {
      await persistBeforeLeaving();
      const nextChapter = await api.getChapter(chapterId);
      onChapterChanged(nextChapter);
    } catch (error: unknown) {
      setSwitchError(
        safeCommandMessage(error, "当前草稿未能安全保存，章节没有切换。"),
      );
      setIsSwitching(false);
    }
  };

  const createAndSelectChapter = async (title: string) => {
    if (isSwitching) {
      return;
    }

    setIsSwitching(true);
    setSwitchError("");
    try {
      await persistBeforeLeaving();
      const created = await onCreateChapter(title);
      onChapterChanged(created);
    } catch (error: unknown) {
      setIsSwitching(false);
      throw error;
    }
  };

  return (
    <main
      className={
        historyCollapsed
          ? "workspace-shell workspace-history-collapsed"
          : "workspace-shell"
      }
      aria-label="写作工作台"
    >
      <header className="workspace-topbar">
        <div className="workspace-identity">
          <span className="workspace-wordmark">SUPER NOVEL</span>
          <span className="topbar-divider" aria-hidden="true" />
          <strong>{workspace.project.name}</strong>
          <span>{activeVolume?.title ?? "未分卷"}</span>
        </div>
        <div className="workspace-controls">
          <span className={`topbar-save-state topbar-save-state-${draft.state}`}>
            {draft.state === "saved"
              ? "已保存"
              : draft.state === "saving"
                ? "保存中"
                : draft.state === "dirty"
                  ? "未保存"
                  : draft.state === "conflict"
                    ? "版本冲突"
                    : "保存失败"}
          </span>
          <button
            className="topbar-version-button"
            type="button"
            disabled
            title="历史版本功能将在下一阶段启用"
          >
            创建版本
          </button>
        </div>
      </header>

      <OutlinePane
        outline={workspace.outline}
        activeChapterId={chapter.id}
        disabled={isSwitching}
        onSelectChapter={(chapterId) => void selectChapter(chapterId)}
        onCreateVolume={onCreateVolume}
        onCreateChapter={createAndSelectChapter}
      />

      <EditorPane
        chapter={chapter}
        content={draft.content}
        editRevision={draft.editRevision}
        nonWhitespaceCharCount={draft.nonWhitespaceCharCount}
        saveState={draft.state}
        onContentChange={draft.setContent}
        onRetry={() => void draft.retry().catch(() => undefined)}
      />

      <aside className="history-pane" aria-label="历史版本">
        <button
          type="button"
          className="history-toggle"
          aria-expanded={!historyCollapsed}
          aria-label={historyCollapsed ? "展开历史版本" : "收起历史版本"}
          onClick={() => setHistoryCollapsed((current) => !current)}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path
              d={historyCollapsed ? "M6 3.5 10.5 8 6 12.5" : "m10 3.5-4.5 4.5 4.5 4.5"}
            />
          </svg>
        </button>
        {!historyCollapsed ? (
          <div className="history-content">
            <p className="pane-index">03</p>
            <h2>历史版本</h2>
            <div className="current-draft-summary">
              <span>当前工作草稿</span>
              <strong>修订 {draft.editRevision}</strong>
              <small>{draft.nonWhitespaceCharCount} 字</small>
            </div>
            <div className="history-empty">
              <span className="history-rule" />
              <p>检查点将在下一阶段显示在这里。</p>
            </div>
          </div>
        ) : null}
      </aside>

      {switchError ? (
        <div className="workspace-error" role="alert">
          {switchError}
        </div>
      ) : null}
    </main>
  );
}
