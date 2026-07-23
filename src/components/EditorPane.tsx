import type { ChapterDto } from "../contracts";
import type { SaveState } from "../useDraftAutosave";

const saveLabels: Record<SaveState, string> = {
  saved: "已保存",
  dirty: "未保存",
  saving: "保存中",
  error: "保存失败，可重试",
  conflict: "版本冲突",
};

interface EditorPaneProps {
  chapter: ChapterDto;
  content: string;
  editRevision: number;
  nonWhitespaceCharCount: number;
  saveState: SaveState;
  transitionLocked?: boolean;
  transitionLockMessage?: string;
  onContentChange(content: string): void;
  onRetry(): void;
}

export function EditorPane({
  chapter,
  content,
  editRevision,
  nonWhitespaceCharCount,
  saveState,
  transitionLocked = false,
  transitionLockMessage = "正在安全保存，完成前正文暂时锁定。",
  onContentChange,
  onRetry,
}: EditorPaneProps) {
  return (
    <section className="editor-pane" aria-label="正文编辑器">
      <header className="editor-heading">
        <p className="editor-location">工作草稿 / 修订 {editRevision}</p>
        <h1>{chapter.title}</h1>
        {transitionLocked ? (
          <p
            className="transition-lock-notice"
            id={`transition-lock-${chapter.id}`}
            aria-live="polite"
          >
            {transitionLockMessage}
          </p>
        ) : null}
      </header>

      <textarea
        aria-label={`${chapter.title} 正文`}
        aria-describedby={
          transitionLocked ? `transition-lock-${chapter.id}` : undefined
        }
        value={content}
        readOnly={transitionLocked}
        spellCheck={false}
        onChange={(event) => onContentChange(event.target.value)}
      />

      <footer className="editor-footer">
        <span>{nonWhitespaceCharCount} 字</span>
        <div
          className={`save-feedback save-feedback-${saveState}`}
          role="status"
          aria-live="polite"
        >
          <span>{saveLabels[saveState]}</span>
          {saveState === "error" ? (
            <button type="button" onClick={onRetry}>
              重试保存
            </button>
          ) : null}
        </div>
      </footer>

      {saveState === "conflict" ? (
        <div className="conflict-guidance" role="alert">
          <strong>本地正文仍保留在编辑器中。</strong>
          <span>请先复制本地正文，再重新加载磁盘版本后手动处理差异。</span>
        </div>
      ) : null}
    </section>
  );
}
