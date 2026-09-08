// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useEffect, useRef } from "react";

import { RunSocketState } from "../hooks/useRunSocket";

const STATE_LABELS: Record<string, string> = {
  idle: "待機",
  running: "実行中",
  finished: "完了",
  stopped: "停止済み",
  failed: "失敗",
};

/**
 * Log + artifacts only -- the run/stop controls and the WebSocket itself
 * live in useRunSocket() at the app level, so switching away from this tab
 * mid-run never drops a line or a snapshot.
 */
export function RunView({ run }: { run: RunSocketState }) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [run.lines]);

  return (
    <div className="run-view">
      <div className="run-toolbar">
        {run.status && (
          <span className={`state-chip state-${run.status.state}`}>
            {STATE_LABELS[run.status.state] ?? run.status.state}
            {run.status.exitCode !== null && ` (exit ${run.status.exitCode})`}
          </span>
        )}
        {run.error && <span className="run-error">{run.error}</span>}
      </div>
      {run.lines.length === 0 ? (
        <div className="hint">
          まだログがありません。ツールバーの「実行」を押すとここにライブ表示されます。
        </div>
      ) : (
        <pre className="run-log" ref={logRef}>
          {run.lines.join("\n")}
        </pre>
      )}
      {run.artifacts.length > 0 && (
        <div className="artifacts">
          <h4>成果物</h4>
          <ul>
            {run.artifacts.map((a) => (
              <li key={a.name}>
                <a href={`/api/run/artifacts/${encodeURIComponent(a.name)}`} download>
                  {a.name}
                </a>{" "}
                ({formatSize(a.size)})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
