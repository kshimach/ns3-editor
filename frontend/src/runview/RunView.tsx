// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useEffect, useRef, useState } from "react";

import { api, openRunSocket } from "../api";
import { useEditor } from "../store";
import { Issue, RplSnapshot, RunStatus } from "../types";

const STATE_LABELS: Record<RunStatus["state"], string> = {
  idle: "待機",
  running: "実行中",
  finished: "完了",
  stopped: "停止済み",
  failed: "失敗",
};

export function RunView() {
  const scenario = useEditor((s) => s.scenario);
  const setIssues = useEditor((s) => s.setIssues);
  const addRplSnapshot = useEditor((s) => s.addRplSnapshot);
  const clearRplSnapshots = useEditor((s) => s.clearRplSnapshots);
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<{ name: string; size: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const ws = openRunSocket((m) => {
      const msg = m as {
        type: string;
        text?: string;
        snapshot?: RplSnapshot;
      } & Partial<RunStatus>;
      if (msg.type === "line" && msg.text !== undefined) {
        setLines((prev) => [...prev, msg.text as string]);
      } else if (msg.type === "rplTable" && msg.snapshot !== undefined) {
        addRplSnapshot(msg.snapshot);
      } else if (msg.type === "status") {
        setStatus(msg as unknown as RunStatus);
        if (msg.state !== "running") {
          api.artifacts().then(setArtifacts).catch(() => {});
        }
      }
    });
    wsRef.current = ws;
    return () => ws.close();
    // Mounted once: the socket replays its backlog on connect, so a
    // re-subscribe on every store change would duplicate every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [lines]);

  const start = async () => {
    setError(null);
    setLines([]);
    clearRplSnapshots();
    const res = await api.run(scenario);
    if (res.status === 422) {
      const body = (await res.json()) as { issues: Issue[] };
      setIssues(body.issues);
      setError("検証エラーがあります。生成コードタブで確認してください。");
    } else if (res.status === 409) {
      setError("すでに実行中です。");
    } else if (!res.ok) {
      setError(`実行開始に失敗: ${res.status}`);
    }
  };

  const running = status?.state === "running";

  return (
    <div className="run-view">
      <div className="run-toolbar">
        <button onClick={start} disabled={running}>
          実行
        </button>
        <button onClick={() => api.stopRun()} disabled={!running}>
          停止
        </button>
        {status && (
          <span className={`state-chip state-${status.state}`}>
            {STATE_LABELS[status.state]}
            {status.exitCode !== null && ` (exit ${status.exitCode})`}
          </span>
        )}
        {error && <span className="run-error">{error}</span>}
      </div>
      <pre className="run-log" ref={logRef}>
        {lines.join("\n")}
      </pre>
      {artifacts.length > 0 && (
        <div className="artifacts">
          <h4>成果物</h4>
          <ul>
            {artifacts.map((a) => (
              <li key={a.name}>
                <a href={`/api/run/artifacts/${encodeURIComponent(a.name)}`} download>
                  {a.name}
                </a>{" "}
                ({a.size} bytes)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
