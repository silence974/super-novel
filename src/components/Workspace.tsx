import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NovelApi } from "../api";
import { safeCommandMessage } from "../api";
import type {
  ChapterDto,
  ChapterSummaryDto,
  CheckpointSource,
  OutlineDto,
  WorkspaceDto,
} from "../contracts";
import { useDraftAutosave } from "../useDraftAutosave";
import { EditorPane } from "./EditorPane";
import { HistoryPane } from "./HistoryPane";
import { OutlinePane } from "./OutlinePane";

interface WorkspaceProps {
  api: NovelApi;
  initialWorkspace: WorkspaceDto;
  autosaveDelayMs?: number;
  onClosed?(): void;
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
  onClosed,
}: WorkspaceProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [chapter, setChapter] = useState<ChapterDto | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const [emptyCloseState, setEmptyCloseState] = useState<"idle" | "closing">(
    "idle",
  );
  const [emptyCloseError, setEmptyCloseError] = useState("");
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

  const closeEmptyProject = useCallback(async () => {
    if (emptyCloseState === "closing") {
      return;
    }
    setEmptyCloseState("closing");
    setEmptyCloseError("");
    try {
      await api.closeProject();
      onClosed?.();
    } catch (error: unknown) {
      setEmptyCloseError(
        safeCommandMessage(error, "项目暂时无法关闭，请重试。"),
      );
      setEmptyCloseState("idle");
    }
  }, [api, emptyCloseState, onClosed]);

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
          <div className="workspace-identity">
            <span className="workspace-wordmark">SUPER NOVEL</span>
            <span className="topbar-divider" aria-hidden="true" />
            <strong>{workspace.project.name}</strong>
          </div>
          <button
            className="topbar-close-button"
            type="button"
            disabled={emptyCloseState === "closing"}
            onClick={() => void closeEmptyProject()}
          >
            {emptyCloseState === "closing" ? "正在关闭" : "关闭项目"}
          </button>
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
        {emptyCloseError ? (
          <div className="workspace-error" role="alert">
            {emptyCloseError}
          </div>
        ) : null}
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
      onClosed={onClosed}
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
  onClosed?(): void;
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
  onClosed,
}: WorkspaceBodyProps) {
  const [isSwitching, setIsSwitching] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCheckpointing, setIsCheckpointing] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [checkpointError, setCheckpointError] = useState("");
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const checkpointQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const checkpointTailRef = useRef<Promise<unknown> | null>(null);
  const checkpointedContentRef = useRef(chapter.content);
  const currentContentRef = useRef(chapter.content);
  const lastCheckpointAtRef = useRef(Date.now());
  const [checkpointClock, setCheckpointClock] = useState(0);
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
  currentContentRef.current = draft.content;
  const transitionLocked = isSwitching || isClosing || isRestoring;
  const transitionLockedRef = useRef(transitionLocked);
  transitionLockedRef.current = transitionLocked;

  const activeVolume = workspace.outline.volumes.find((volume) =>
    volume.chapters.some((item) => item.id === chapter.id),
  );

  const createCheckpoint = useCallback(
    (source: CheckpointSource) => {
      setIsCheckpointing(true);
      setCheckpointError("");

      const operation = checkpointQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const saved = await draft.flush();
          onSummaryChanged(chapter.id, {
            editRevision: saved.editRevision,
            nonWhitespaceCharCount: saved.nonWhitespaceCharCount,
            updatedAtMs: saved.updatedAtMs,
          });
          const created = await api.createCheckpoint({
            chapterId: chapter.id,
            expectedEditRevision: saved.editRevision,
            source,
          });
          checkpointedContentRef.current = saved.content;
          lastCheckpointAtRef.current = Date.now();
          setCheckpointClock((current) => current + 1);
          setHistoryRefreshToken((current) => current + 1);
          return created;
        });

      checkpointQueueRef.current = operation;
      checkpointTailRef.current = operation;
      void operation
        .catch((error: unknown) => {
          setCheckpointError(
            safeCommandMessage(error, "无法创建历史版本，正文仍保留在编辑器中。"),
          );
        })
        .finally(() => {
          if (checkpointTailRef.current === operation) {
            checkpointTailRef.current = null;
            setIsCheckpointing(false);
          }
        });
      return operation;
    },
    [api, chapter.id, draft.flush, onSummaryChanged],
  );

  useEffect(() => {
    const remaining = Math.max(
      0,
      lastCheckpointAtRef.current + 300_000 - Date.now(),
    );
    const timer = setTimeout(() => {
      if (
        !transitionLockedRef.current &&
        currentContentRef.current !== checkpointedContentRef.current
      ) {
        void createCheckpoint("periodic").catch(() => undefined);
      }
    }, remaining);
    return () => clearTimeout(timer);
  }, [checkpointClock, createCheckpoint, draft.content, transitionLocked]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "s" &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        if (transitionLockedRef.current) {
          return;
        }
        void createCheckpoint("manual").catch(() => undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createCheckpoint]);

  const persistBeforeLeaving = () => createCheckpoint("chapter_switch");

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

  const closeProject = async () => {
    if (isClosing || isSwitching || isRestoring) {
      return;
    }
    setIsClosing(true);
    setCheckpointError("");
    try {
      await createCheckpoint("project_close");
      await api.closeProject();
      onClosed?.();
    } catch (error: unknown) {
      setCheckpointError(
        safeCommandMessage(error, "项目未能安全关闭，当前正文仍然保留。"),
      );
      setIsClosing(false);
    }
  };

  const restoredChapter = (restored: ChapterDto) => {
    draft.replaceDraft(restored);
    checkpointedContentRef.current = restored.content;
    currentContentRef.current = restored.content;
    lastCheckpointAtRef.current = Date.now();
    setCheckpointClock((current) => current + 1);
    setCheckpointError("");
    onSummaryChanged(restored.id, chapterSummary(restored));
    onChapterChanged(restored);
  };

  const flushBeforeRestore = async () => {
    setIsRestoring(true);
    setCheckpointError("");
    await checkpointQueueRef.current.catch(() => undefined);
    return draft.flush();
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
            disabled={isClosing || isSwitching || isRestoring || isCheckpointing}
            onClick={() => void createCheckpoint("manual").catch(() => undefined)}
          >
            {isCheckpointing ? "正在创建" : "创建版本"}
          </button>
          <button
            className="topbar-close-button"
            type="button"
            disabled={isClosing || isSwitching || isRestoring}
            onClick={() => void closeProject()}
          >
            {isClosing ? "正在关闭" : "关闭项目"}
          </button>
        </div>
      </header>

      <OutlinePane
        outline={workspace.outline}
        activeChapterId={chapter.id}
        disabled={transitionLocked}
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
        transitionLocked={transitionLocked}
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
          <HistoryPane
            api={api}
            chapter={{
              ...chapter,
              content: draft.content,
              editRevision: draft.editRevision,
              nonWhitespaceCharCount: draft.nonWhitespaceCharCount,
            }}
            currentDraft={{
              editRevision: draft.editRevision,
              nonWhitespaceCharCount: draft.nonWhitespaceCharCount,
            }}
            beforeRestore={flushBeforeRestore}
            onRestored={restoredChapter}
            onRestoreSettled={() => setIsRestoring(false)}
            refreshToken={historyRefreshToken}
            disabled={transitionLocked}
          />
        ) : null}
      </aside>

      {switchError || checkpointError ? (
        <div className="workspace-error" role="alert">
          {switchError || checkpointError}
        </div>
      ) : null}
    </main>
  );
}
