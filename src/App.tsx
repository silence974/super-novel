import { useEffect, useState } from "react";
import type { NovelApi } from "./api";
import { hasCommandErrorCode, safeCommandMessage, tauriApi } from "./api";
import { StartScreen } from "./components/StartScreen";
import type { WorkspaceDto } from "./contracts";

interface AppProps {
  api?: NovelApi;
}

type StartupState =
  | { kind: "loading" }
  | { kind: "start" }
  | { kind: "workspace"; workspace: WorkspaceDto }
  | { kind: "error"; message: string };

export function App({ api = tauriApi }: AppProps) {
  const [startup, setStartup] = useState<StartupState>({ kind: "loading" });

  useEffect(() => {
    let isCurrent = true;

    api
      .getWorkspace()
      .then((workspace) => {
        if (isCurrent) {
          setStartup({ kind: "workspace", workspace });
        }
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }
        if (hasCommandErrorCode(error, "not_found")) {
          setStartup({ kind: "start" });
          return;
        }
        setStartup({
          kind: "error",
          message: safeCommandMessage(
            error,
            "无法读取当前项目，请重试。",
          ),
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [api]);

  if (startup.kind === "loading") {
    return (
      <main className="loading-shell" aria-label="正在启动">
        <div className="loading-mark">SUPER NOVEL</div>
        <div className="loading-copy" role="status" aria-live="polite">
          <span className="loading-line loading-line-short" aria-hidden="true" />
          <span className="loading-line" aria-hidden="true" />
          <span>正在读取项目</span>
        </div>
      </main>
    );
  }

  if (startup.kind === "start") {
    return (
      <StartScreen
        api={api}
        onOpened={(workspace) => setStartup({ kind: "workspace", workspace })}
      />
    );
  }

  if (startup.kind === "error") {
    return (
      <main className="startup-error-shell" aria-label="启动错误">
        <p className="eyebrow">项目未能载入</p>
        <h1>暂时无法进入写作空间</h1>
        <p className="inline-error" role="alert">
          {startup.message}
        </p>
      </main>
    );
  }

  return (
    <main className="workspace-placeholder" aria-label="写作工作台">
      <p className="eyebrow">当前项目</p>
      <h1>{startup.workspace.project.name}</h1>
    </main>
  );
}
