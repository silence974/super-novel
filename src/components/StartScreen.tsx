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

interface RecentProject {
  name: string;
  directory: string;
  lastOpenedAtMs: number;
}

const recentProjectsKey = "super-novel.recent-projects.v1";
const recentProjectsLimit = 8;

function normalizedDirectory(directory: string): string {
  return directory.toLowerCase();
}

function isRecentProject(value: unknown): value is RecentProject {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<RecentProject>;
  return (
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.directory === "string" &&
    candidate.directory.trim().length > 0 &&
    typeof candidate.lastOpenedAtMs === "number" &&
    Number.isFinite(candidate.lastOpenedAtMs)
  );
}

function loadRecentProjects(): RecentProject[] {
  try {
    const stored = localStorage.getItem(recentProjectsKey);
    if (stored === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isRecentProject)
      .sort((left, right) => right.lastOpenedAtMs - left.lastOpenedAtMs)
      .slice(0, recentProjectsLimit);
  } catch {
    return [];
  }
}

function persistRecentProjects(projects: RecentProject[]): void {
  try {
    localStorage.setItem(recentProjectsKey, JSON.stringify(projects));
  } catch {
    // Storage can be unavailable in hardened WebViews. The in-memory list remains usable.
  }
}

export function StartScreen({ api, onOpened }: StartScreenProps) {
  const [name, setName] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingRecentDirectory, setPendingRecentDirectory] = useState<
    string | null
  >(null);
  const [failedRecentDirectory, setFailedRecentDirectory] = useState<
    string | null
  >(null);
  const [recentProjects, setRecentProjects] = useState(loadRecentProjects);
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();
  const isBusy = pendingAction !== null;

  function rememberProject(workspace: WorkspaceDto, directory: string) {
    const directoryKey = normalizedDirectory(directory);
    const next = [
      {
        name: workspace.project.name,
        directory,
        lastOpenedAtMs: Date.now(),
      },
      ...recentProjects.filter(
        (item) => normalizedDirectory(item.directory) !== directoryKey,
      ),
    ].slice(0, recentProjectsLimit);
    persistRecentProjects(next);
    setRecentProjects(next);
  }

  function removeRecentProject(directory: string) {
    const directoryKey = normalizedDirectory(directory);
    const next = recentProjects.filter(
      (item) => normalizedDirectory(item.directory) !== directoryKey,
    );
    persistRecentProjects(next);
    setRecentProjects(next);
    if (
      failedRecentDirectory !== null &&
      normalizedDirectory(failedRecentDirectory) ===
        normalizedDirectory(directory)
    ) {
      setFailedRecentDirectory(null);
      setError(null);
    }
  }

  async function openProjectDirectory(directory: string) {
    const workspace = await api.openProject(directory);
    rememberProject(workspace, directory);
    onOpened(workspace);
  }

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
      const workspace = await api.createProject(directory, trimmedName);
      rememberProject(workspace, directory);
      onOpened(workspace);
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
      await openProjectDirectory(directory);
    } catch (caught) {
      setError(
        safeCommandMessage(caught, "无法打开项目，请检查所选目录后重试。"),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function openRecentProject(project: RecentProject) {
    if (isBusy) {
      return;
    }

    setError(null);
    setFailedRecentDirectory(null);
    setPendingAction("open");
    setPendingRecentDirectory(project.directory);
    try {
      await openProjectDirectory(project.directory);
    } catch (caught) {
      setFailedRecentDirectory(project.directory);
      setError(
        safeCommandMessage(caught, "无法打开最近项目，请检查路径后重试。"),
      );
    } finally {
      setPendingRecentDirectory(null);
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

        {recentProjects.length > 0 ? (
          <section className="recent-projects" aria-labelledby="recent-heading">
            <div className="recent-heading">
              <p className="section-index">继续写作</p>
              <h3 id="recent-heading">最近项目</h3>
            </div>
            <ul>
              {recentProjects.map((project) => {
                const failed =
                  failedRecentDirectory !== null &&
                  normalizedDirectory(failedRecentDirectory) ===
                    normalizedDirectory(project.directory);
                const isOpening =
                  pendingRecentDirectory !== null &&
                  normalizedDirectory(pendingRecentDirectory) ===
                    normalizedDirectory(project.directory);
                return (
                  <li
                    className={
                      failed
                        ? "recent-project recent-project-failed"
                        : "recent-project"
                    }
                    key={normalizedDirectory(project.directory)}
                  >
                    <button
                      className="recent-project-open"
                      type="button"
                      aria-label={`打开最近项目 ${project.name}`}
                      disabled={isBusy}
                      onClick={() => void openRecentProject(project)}
                    >
                      <span>{project.name}</span>
                      <small title={project.directory}>
                        {project.directory}
                      </small>
                    </button>
                    <button
                      className="recent-project-remove"
                      type="button"
                      aria-label={`从最近项目中移除 ${project.name}`}
                      disabled={isBusy}
                      onClick={() => removeRecentProject(project.directory)}
                    >
                      移除
                    </button>
                    {isOpening ? (
                      <span className="recent-project-state">正在打开</span>
                    ) : failed ? (
                      <span className="recent-project-state">路径不可用，可移除</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

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
