import { useCallback, useEffect, useRef, useState } from "react";
import { hasCommandErrorCode } from "./api";
import type {
  ChapterDto,
  SavedDraftDto,
  SaveWorkingDraftInput,
} from "./contracts";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export interface DraftSnapshot {
  chapterId: string;
  content: string;
  editRevision: number;
  nonWhitespaceCharCount: number;
  updatedAtMs: number;
}

interface UseDraftAutosaveOptions {
  chapter: ChapterDto;
  save(input: SaveWorkingDraftInput): Promise<SavedDraftDto>;
  onSaved?(draft: SavedDraftDto): void;
  delayMs?: number;
}

function countNonWhitespace(content: string): number {
  return Array.from(content).filter((character) => !/\s/u.test(character)).length;
}

export function useDraftAutosave({
  chapter,
  save,
  onSaved,
  delayMs = 800,
}: UseDraftAutosaveOptions) {
  const [content, setContentState] = useState(chapter.content);
  const [editRevision, setEditRevision] = useState(chapter.editRevision);
  const [state, setStateValue] = useState<SaveState>("saved");
  const [error, setError] = useState<unknown>(null);

  const chapterRef = useRef(chapter);
  const contentRef = useRef(chapter.content);
  const revisionRef = useRef(chapter.editRevision);
  const updatedAtRef = useRef(chapter.updatedAtMs);
  const savedContentRef = useRef(chapter.content);
  const generationRef = useRef(0);
  const stateRef = useRef<SaveState>("saved");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<DraftSnapshot> | null>(null);
  const mountedRef = useRef(true);
  const runSaveRef = useRef<() => Promise<DraftSnapshot>>(
    async () => Promise.reject(new Error("Autosave is not ready.")),
  );

  const updateState = useCallback((next: SaveState) => {
    stateRef.current = next;
    if (mountedRef.current) {
      setStateValue(next);
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(
    (waitMs: number) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runSaveRef.current().catch(() => undefined);
      }, waitMs);
    },
    [clearTimer],
  );

  const runSave = useCallback(async (): Promise<DraftSnapshot> => {
    clearTimer();

    const activeSave = inFlightRef.current;
    if (activeSave !== null) {
      try {
        await activeSave;
      } catch {
        // The current buffer is retried below with the latest known revision.
      }
      return runSaveRef.current();
    }

    const currentChapter = chapterRef.current;
    const currentContent = contentRef.current;
    if (
      currentContent === savedContentRef.current &&
      stateRef.current !== "error" &&
      stateRef.current !== "conflict"
    ) {
      return {
        chapterId: currentChapter.id,
        content: currentContent,
        editRevision: revisionRef.current,
        nonWhitespaceCharCount: countNonWhitespace(currentContent),
        updatedAtMs: updatedAtRef.current,
      };
    }

    const capturedGeneration = generationRef.current;
    const capturedContent = currentContent;
    updateState("saving");
    if (mountedRef.current) {
      setError(null);
    }

    const request = save({
      chapterId: currentChapter.id,
      expectedEditRevision: revisionRef.current,
      content: capturedContent,
    })
      .then((saved) => {
        revisionRef.current = saved.editRevision;
        updatedAtRef.current = saved.updatedAtMs;
        savedContentRef.current = capturedContent;
        if (mountedRef.current) {
          setEditRevision(saved.editRevision);
          onSaved?.(saved);
        }

        const isCurrent =
          capturedGeneration === generationRef.current &&
          capturedContent === contentRef.current;
        updateState(isCurrent ? "saved" : "dirty");
        if (!isCurrent && mountedRef.current) {
          schedule(0);
        }

        return {
          chapterId: saved.chapterId,
          content: capturedContent,
          editRevision: saved.editRevision,
          nonWhitespaceCharCount: saved.nonWhitespaceCharCount,
          updatedAtMs: saved.updatedAtMs,
        };
      })
      .catch((saveError: unknown) => {
        if (mountedRef.current) {
          setError(saveError);
        }
        updateState(
          hasCommandErrorCode(saveError, "revision_conflict") ? "conflict" : "error",
        );
        throw saveError;
      })
      .finally(() => {
        inFlightRef.current = null;
      });

    inFlightRef.current = request;
    return request;
  }, [clearTimer, onSaved, save, schedule, updateState]);

  runSaveRef.current = runSave;

  useEffect(() => {
    if (chapterRef.current.id === chapter.id) {
      return;
    }

    clearTimer();
    chapterRef.current = chapter;
    contentRef.current = chapter.content;
    revisionRef.current = chapter.editRevision;
    updatedAtRef.current = chapter.updatedAtMs;
    savedContentRef.current = chapter.content;
    generationRef.current = 0;
    setContentState(chapter.content);
    setEditRevision(chapter.editRevision);
    setError(null);
    updateState("saved");
  }, [chapter, clearTimer, updateState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  const setContent = useCallback(
    (nextContent: string) => {
      if (nextContent === contentRef.current) {
        return;
      }

      contentRef.current = nextContent;
      generationRef.current += 1;
      setContentState(nextContent);

      if (stateRef.current === "error" || stateRef.current === "conflict") {
        return;
      }

      updateState("dirty");
      if (inFlightRef.current === null) {
        schedule(delayMs);
      }
    },
    [delayMs, schedule, updateState],
  );

  const retry = useCallback(() => runSaveRef.current(), []);
  const flush = useCallback(() => runSaveRef.current(), []);

  return {
    content,
    editRevision,
    nonWhitespaceCharCount: countNonWhitespace(content),
    state,
    error,
    setContent,
    flush,
    retry,
  };
}
