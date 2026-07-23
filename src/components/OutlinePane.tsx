import { useState } from "react";
import { safeCommandMessage } from "../api";
import type { OutlineDto } from "../contracts";

interface OutlinePaneProps {
  outline: OutlineDto;
  activeChapterId: string | null;
  disabled?: boolean;
  onSelectChapter(chapterId: string): void;
  onCreateVolume(title: string): Promise<void>;
  onCreateChapter(title: string): Promise<void>;
}

export function OutlinePane({
  outline,
  activeChapterId,
  disabled = false,
  onSelectChapter,
  onCreateVolume,
  onCreateChapter,
}: OutlinePaneProps) {
  const [creationKind, setCreationKind] = useState<"volume" | "chapter" | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [creationError, setCreationError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const isEmpty =
    outline.volumes.length === 0 && outline.ungroupedChapters.length === 0;

  const startCreating = (kind: "volume" | "chapter") => {
    setCreationKind(kind);
    setTitle("");
    setCreationError("");
  };

  const submitCreation = async () => {
    const normalizedTitle = title.trim();
    if (creationKind === null || normalizedTitle.length === 0) {
      return;
    }

    setIsCreating(true);
    setCreationError("");
    try {
      if (creationKind === "volume") {
        await onCreateVolume(normalizedTitle);
      } else {
        await onCreateChapter(normalizedTitle);
      }
      setCreationKind(null);
      setTitle("");
    } catch (error: unknown) {
      setCreationError(safeCommandMessage(error, "无法创建，请重试。"));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <nav className="outline-pane" aria-label="作品大纲">
      <div className="pane-heading">
        <div>
          <p className="pane-index">01</p>
          <h2>作品大纲</h2>
        </div>
        <div className="outline-actions" aria-label="大纲操作">
          <button
            type="button"
            disabled={disabled || isCreating}
            onClick={() => startCreating("volume")}
          >
            新建卷
          </button>
          <button
            type="button"
            disabled={disabled || isCreating}
            onClick={() => startCreating("chapter")}
          >
            新建章节
          </button>
        </div>
        {creationKind ? (
          <form
            className="outline-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCreation();
            }}
          >
            <label htmlFor={`outline-${creationKind}-title`}>
              {creationKind === "volume" ? "卷标题" : "章节标题"}
            </label>
            <input
              id={`outline-${creationKind}-title`}
              autoFocus
              value={title}
              disabled={isCreating}
              onChange={(event) => setTitle(event.target.value)}
            />
            <div>
              <button
                type="submit"
                disabled={isCreating || title.trim().length === 0}
              >
                {isCreating
                  ? "正在添加"
                  : creationKind === "volume"
                    ? "添加卷"
                    : "添加章节"}
              </button>
              <button
                type="button"
                disabled={isCreating}
                onClick={() => setCreationKind(null)}
              >
                取消
              </button>
            </div>
            {creationError ? <p role="alert">{creationError}</p> : null}
          </form>
        ) : null}
      </div>

      {isEmpty ? (
        <div className="pane-empty">
          <p>还没有章节</p>
          <span>创建章节后，正文会显示在这里。</span>
        </div>
      ) : (
        <div className="outline-tree">
          {outline.volumes.map((volume) => (
            <section className="volume-group" key={volume.id}>
              <h3>{volume.title}</h3>
              <div className="chapter-list">
                {volume.chapters.map((chapter) => (
                  <button
                    type="button"
                    className={
                      chapter.id === activeChapterId
                        ? "chapter-row chapter-row-active"
                        : "chapter-row"
                    }
                    key={chapter.id}
                    aria-current={
                      chapter.id === activeChapterId ? "page" : undefined
                    }
                    disabled={disabled}
                    onClick={() => onSelectChapter(chapter.id)}
                  >
                    <span>{chapter.title}</span>
                    <small>{chapter.nonWhitespaceCharCount} 字</small>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {outline.ungroupedChapters.length > 0 ? (
            <section className="volume-group">
              <h3>未分卷</h3>
              <div className="chapter-list">
                {outline.ungroupedChapters.map((chapter) => (
                  <button
                    type="button"
                    className={
                      chapter.id === activeChapterId
                        ? "chapter-row chapter-row-active"
                        : "chapter-row"
                    }
                    key={chapter.id}
                    aria-current={
                      chapter.id === activeChapterId ? "page" : undefined
                    }
                    disabled={disabled}
                    onClick={() => onSelectChapter(chapter.id)}
                  >
                    <span>{chapter.title}</span>
                    <small>{chapter.nonWhitespaceCharCount} 字</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </nav>
  );
}
