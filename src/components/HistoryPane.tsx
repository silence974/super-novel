import { useCallback, useEffect, useState } from "react";
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

  const loadSummaries = useCallback(async () => {
    setListState("loading");
    setListError("");
    try {
      const loaded = await api.listCheckpoints(chapter.id);
      setSummaries(loaded);
      setListState("ready");
    } catch (error: unknown) {
      setListError(
        safeCommandMessage(error, "无法读取历史版本，请重试。"),
      );
      setListState("error");
    }
  }, [api, chapter.id]);

  useEffect(() => {
    void loadSummaries();
  }, [loadSummaries, refreshToken]);

  const openPreview = async (summary: CheckpointSummaryDto) => {
    if (disabled) {
      return;
    }
    setPreviewState("loading");
    setPreviewError("");
    try {
      setPreview(await api.getCheckpoint(summary.id));
    } catch (error: unknown) {
      setPreviewError(
        safeCommandMessage(error, "无法读取这个历史版本，请重试。"),
      );
    } finally {
      setPreviewState("idle");
    }
  };

  const restorePreview = async () => {
    if (preview === null || isRestoring || disabled) {
      return;
    }

    setIsRestoring(true);
    setPreviewError("");
    try {
      const snapshot = beforeRestore ? await beforeRestore() : null;
      const restored = await api.restoreCheckpoint({
        chapterId: chapter.id,
        checkpointId: preview.id,
        expectedEditRevision: snapshot?.editRevision ?? chapter.editRevision,
      });
      onRestored(restored);
      setPreview(null);
      await loadSummaries();
    } catch (error: unknown) {
      setPreviewError(
        safeCommandMessage(error, "无法恢复这个版本，当前正文没有改变。"),
      );
    } finally {
      setIsRestoring(false);
      onRestoreSettled?.();
    }
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
                onClick={() => void openPreview(summary)}
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
        <div className="history-dialog-backdrop">
          <section
            className="history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-dialog-title"
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
                onClick={() => {
                  setPreview(null);
                  setPreviewError("");
                }}
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
          </section>
        </div>
      ) : null}
    </div>
  );
}
