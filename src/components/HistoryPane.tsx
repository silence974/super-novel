import { useCallback, useEffect, useRef, useState } from "react";
import type { NovelApi } from "../api";
import { safeCommandMessage } from "../api";
import type {
  ChapterDto,
  CheckpointDto,
  CheckpointSource,
  CheckpointSummaryDto,
} from "../contracts";
import type { DraftSnapshot } from "../useDraftAutosave";

interface HistoryPaneProps {
  api: NovelApi;
  chapter: ChapterDto;
  beforeRestore?: () => Promise<DraftSnapshot>;
  onRestored(chapter: ChapterDto): void;
  onRestoreSettled?(): void;
  refreshToken?: number;
  currentDraft?: {
    editRevision: number;
    nonWhitespaceCharCount: number;
  };
  disabled?: boolean;
  onPreviewOpenChange?(open: boolean): void;
}

const sourceLabels: Record<CheckpointSource, string> = {
  manual: "手动创建",
  periodic: "定期保存",
  chapter_switch: "切换章节",
  project_close: "关闭项目",
  restore: "恢复生成",
};

function formatCreatedAt(createdAtMs: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAtMs));
}

export function HistoryPane({
  api,
  chapter,
  beforeRestore,
  onRestored,
  onRestoreSettled,
  refreshToken = 0,
  currentDraft,
  disabled = false,
  onPreviewOpenChange,
}: HistoryPaneProps) {
  const [summaries, setSummaries] = useState<CheckpointSummaryDto[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [listError, setListError] = useState("");
  const [preview, setPreview] = useState<CheckpointDto | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading">("idle");
  const [previewError, setPreviewError] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const mountedRef = useRef(false);
  const listGenerationRef = useRef(0);
  const previewGenerationRef = useRef(0);
  const restoreGenerationRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previewOpenRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      listGenerationRef.current += 1;
      previewGenerationRef.current += 1;
      restoreGenerationRef.current += 1;
      if (previewOpenRef.current) {
        onPreviewOpenChange?.(false);
      }
    };
  }, [onPreviewOpenChange]);

  const loadSummaries = useCallback(async () => {
    const generation = listGenerationRef.current + 1;
    listGenerationRef.current = generation;
    setListState("loading");
    setListError("");
    try {
      const loaded = await api.listCheckpoints(chapter.id);
      if (mountedRef.current && listGenerationRef.current === generation) {
        setSummaries(loaded);
        setListState("ready");
      }
    } catch (error: unknown) {
      if (mountedRef.current && listGenerationRef.current === generation) {
        setListError(
          safeCommandMessage(error, "无法读取历史版本，请重试。"),
        );
        setListState("error");
      }
    }
  }, [api, chapter.id]);

  useEffect(() => {
    void loadSummaries();
  }, [loadSummaries, refreshToken]);

  useEffect(() => {
    previewGenerationRef.current += 1;
    setPreview(null);
    setPreviewState("idle");
    setPreviewError("");
  }, [chapter.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (preview !== null && dialog !== null) {
      if (!dialog.open) {
        dialog.showModal();
      }
      if (!previewOpenRef.current) {
        previewOpenRef.current = true;
        onPreviewOpenChange?.(true);
      }
      return;
    }

    if (previewOpenRef.current) {
      previewOpenRef.current = false;
      onPreviewOpenChange?.(false);
      if (dialog?.open) {
        dialog.close();
      }
      previewTriggerRef.current?.focus();
    }
  }, [onPreviewOpenChange, preview]);

  const openPreview = async (
    summary: CheckpointSummaryDto,
    trigger: HTMLButtonElement,
  ) => {
    if (disabled) {
      return;
    }
    previewTriggerRef.current = trigger;
    const generation = previewGenerationRef.current + 1;
    previewGenerationRef.current = generation;
    setPreviewState("loading");
    setPreviewError("");
    try {
      const loaded = await api.getCheckpoint(summary.id);
      if (mountedRef.current && previewGenerationRef.current === generation) {
        setPreview(loaded);
      }
    } catch (error: unknown) {
      if (mountedRef.current && previewGenerationRef.current === generation) {
        setPreviewError(
          safeCommandMessage(error, "无法读取这个历史版本，请重试。"),
        );
      }
    } finally {
      if (mountedRef.current && previewGenerationRef.current === generation) {
        setPreviewState("idle");
      }
    }
  };

  const restorePreview = async () => {
    if (preview === null || isRestoring || disabled) {
      return;
    }

    setIsRestoring(true);
    setPreviewError("");
    const generation = restoreGenerationRef.current + 1;
    restoreGenerationRef.current = generation;
    try {
      const snapshot = beforeRestore ? await beforeRestore() : null;
      const restored = await api.restoreCheckpoint({
        chapterId: chapter.id,
        checkpointId: preview.id,
        expectedEditRevision: snapshot?.editRevision ?? chapter.editRevision,
      });
      if (mountedRef.current && restoreGenerationRef.current === generation) {
        onRestored(restored);
        setPreview(null);
        await loadSummaries();
      }
    } catch (error: unknown) {
      if (mountedRef.current && restoreGenerationRef.current === generation) {
        setPreviewError(
          safeCommandMessage(error, "无法恢复这个版本，当前正文没有改变。"),
        );
      }
    } finally {
      if (mountedRef.current && restoreGenerationRef.current === generation) {
        setIsRestoring(false);
        onRestoreSettled?.();
      }
    }
  };

  const closePreview = () => {
    previewGenerationRef.current += 1;
    setPreview(null);
    setPreviewError("");
  };

  return (
    <div className="history-content">
      <p className="pane-index">03</p>
      <h2>历史版本</h2>
      {currentDraft ? (
        <div className="current-draft-summary">
          <span>当前工作草稿</span>
          <strong>修订 {currentDraft.editRevision}</strong>
          <small>{currentDraft.nonWhitespaceCharCount} 字</small>
        </div>
      ) : null}

      {listState === "loading" ? (
        <div className="history-loading" role="status">
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          正在读取历史版本
        </div>
      ) : null}

      {listState === "error" ? (
        <div className="history-inline-error">
          <p role="alert">{listError}</p>
          <button type="button" onClick={() => void loadSummaries()}>
            重试历史列表
          </button>
        </div>
      ) : null}

      {listState === "ready" && summaries.length === 0 ? (
        <div className="history-empty">
          <span className="history-rule" />
          <p>还没有历史版本。</p>
          <span>写作时按 Ctrl+S，或使用顶栏按钮创建第一个版本。</span>
        </div>
      ) : null}

      {listState === "ready" && summaries.length > 0 ? (
        <ol className="checkpoint-list" aria-label="历史版本列表">
          {summaries.map((summary) => (
            <li key={summary.id}>
              <button
                type="button"
                onClick={(event) =>
                  void openPreview(summary, event.currentTarget)
                }
                disabled={disabled || previewState === "loading"}
                aria-label={`版本 ${summary.sourceEditRevision} · ${sourceLabels[summary.source]} · ${summary.nonWhitespaceCharCount} 字`}
              >
                <span>
                  <strong>版本 {summary.sourceEditRevision}</strong>
                  <small>{sourceLabels[summary.source]}</small>
                </span>
                <span>
                  <time dateTime={new Date(summary.createdAtMs).toISOString()}>
                    {formatCreatedAt(summary.createdAtMs)}
                  </time>
                  <small>{summary.nonWhitespaceCharCount} 字</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {previewState === "loading" ? (
        <p className="history-preview-status" role="status">
          正在载入版本正文
        </p>
      ) : null}
      {previewError && preview === null ? (
        <p className="history-preview-error" role="alert">
          {previewError}
        </p>
      ) : null}

      {preview ? (
        <dialog
          ref={dialogRef}
          className="history-dialog"
          aria-labelledby="history-dialog-title"
          onCancel={(event) => {
            event.preventDefault();
            closePreview();
          }}
        >
            <header>
              <div>
                <p className="pane-index">只读预览</p>
                <h2 id="history-dialog-title">预览历史版本</h2>
              </div>
              <dl>
                <div>
                  <dt>来源</dt>
                  <dd>{sourceLabels[preview.source]}</dd>
                </div>
                <div>
                  <dt>字数</dt>
                  <dd>{preview.nonWhitespaceCharCount} 字</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>
                    <time dateTime={new Date(preview.createdAtMs).toISOString()}>
                      {formatCreatedAt(preview.createdAtMs)}
                    </time>
                  </dd>
                </div>
              </dl>
            </header>
            <textarea
              aria-label="历史版本正文"
              readOnly
              value={preview.content}
            />
            {previewError ? (
              <p className="history-preview-error" role="alert">
                {previewError}
              </p>
            ) : null}
            <footer>
              <button
                className="button button-secondary"
                type="button"
                autoFocus
                disabled={isRestoring}
                onClick={closePreview}
              >
                取消
              </button>
              <button
                className="button button-danger"
                type="button"
                disabled={isRestoring || disabled}
                onClick={() => void restorePreview()}
              >
                {isRestoring ? "正在恢复" : "确认恢复"}
              </button>
            </footer>
        </dialog>
      ) : null}
    </div>
  );
}
