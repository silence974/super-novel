import { useState } from "react";
import type { FormEvent } from "react";
import type { NovelApi } from "../api";
import { safeCommandMessage } from "../api";
import type { WorkspaceDto } from "../contracts";

interface StartScreenProps {
  api: NovelApi;
  onOpened(workspace: WorkspaceDto): void;
}

type PendingAction = "create" | "open" | null;

export function StartScreen({ api, onOpened }: StartScreenProps) {
  const [name, setName] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();
  const isBusy = pendingAction !== null;

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedName || isBusy) {
      return;
    }

    setError(null);
    setPendingAction("create");
    try {
      const directory = await api.chooseDirectory();
      if (directory === null) {
        return;
      }
      onOpened(await api.createProject(directory, trimmedName));
    } catch (caught) {
      setError(
        safeCommandMessage(caught, "无法创建项目，请检查所选目录后重试。"),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function openProject() {
    if (isBusy) {
      return;
    }

    setError(null);
    setPendingAction("open");
    try {
      const directory = await api.chooseDirectory();
      if (directory === null) {
        return;
      }
      onOpened(await api.openProject(directory));
    } catch (caught) {
      setError(
        safeCommandMessage(caught, "无法打开项目，请检查所选目录后重试。"),
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="start-shell" aria-label="项目启动">
      <section className="start-intro" aria-labelledby="start-heading">
        <div className="wordmark" aria-label="Super Novel">
          SUPER NOVEL
        </div>
        <div className="intro-copy">
          <p className="eyebrow">专注长篇写作</p>
          <h1 id="start-heading">开始写作</h1>
          <p className="intro-description">
            从一个安静的工作空间开始。项目存放在你选择的本地目录中，创作内容由你掌控。
          </p>
        </div>
        <div className="intro-note">
          <span className="note-rule" aria-hidden="true" />
          <p>本地项目 · 清晰结构 · 专注正文</p>
        </div>
      </section>

      <section className="start-actions" aria-label="项目操作">
        <div className="actions-heading">
          <p className="section-index">新项目</p>
          <h2>给下一部作品一个名字</h2>
          <p>输入项目名称，然后选择一个空目录或新目录。</p>
        </div>

        <form className="create-form" onSubmit={createProject}>
          <div className="field">
            <label htmlFor="project-name">项目名称</label>
            <input
              id="project-name"
              name="projectName"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              placeholder="例如：长夜书"
              autoComplete="off"
              disabled={isBusy}
            />
            <p className="field-help">名称会显示在写作工作台和项目文件中。</p>
          </div>

          <button
            className="button button-primary"
            type="submit"
            disabled={!trimmedName || isBusy}
          >
            {pendingAction === "create" ? "正在创建" : "选择目录并创建"}
          </button>
        </form>

        <div className="existing-project">
          <div>
            <p className="existing-title">已经有项目？</p>
            <p>选择包含 Super Novel 项目的目录。</p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={openProject}
            disabled={isBusy}
          >
            {pendingAction === "open" ? "正在打开" : "打开已有项目"}
          </button>
        </div>

        {pendingAction ? (
          <div className="inline-status" role="status" aria-live="polite">
            <span className="status-track" aria-hidden="true">
              <span />
            </span>
            {pendingAction === "create" ? "正在创建项目" : "正在打开项目"}
          </div>
        ) : null}

        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
