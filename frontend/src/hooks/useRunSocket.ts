// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useEffect, useRef, useState } from "react";

import { api, openRunSocket } from "../api";
import { useEditor } from "../store";
import { Issue, LoopEvent, RplAddr, RplSnapshot, RunStatus, Scenario } from "../types";

export interface RunSocketState {
  status: RunStatus | null;
  lines: string[];
  artifacts: { name: string; size: number }[];
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Owns the run WebSocket for the lifetime of the app, independent of which
 * tab happens to be visible. Every tab that shows run state (実行ログ, RPL
 * テーブル) reads from this instead of opening its own socket, so switching
 * tabs never drops a snapshot or a log line mid-run.
 */
export function useRunSocket(scenario: Scenario): RunSocketState {
  const setIssues = useEditor((s) => s.setIssues);
  const setBottomTab = useEditor((s) => s.setBottomTab);
  const addRplSnapshot = useEditor((s) => s.addRplSnapshot);
  const clearRplSnapshots = useEditor((s) => s.clearRplSnapshots);
  const addLoopEvent = useEditor((s) => s.addLoopEvent);
  const clearLoopEvents = useEditor((s) => s.clearLoopEvents);
  const addRplAddr = useEditor((s) => s.addRplAddr);
  const clearRplAddrs = useEditor((s) => s.clearRplAddrs);

  const [status, setStatus] = useState<RunStatus | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<{ name: string; size: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;

  useEffect(() => {
    const ws = openRunSocket((m) => {
      const msg = m as {
        type: string;
        text?: string;
        snapshot?: RplSnapshot;
        event?: LoopEvent;
        addr?: RplAddr;
      } & Partial<RunStatus>;
      if (msg.type === "line" && msg.text !== undefined) {
        setLines((prev) => [...prev, msg.text as string]);
      } else if (msg.type === "rplTable" && msg.snapshot !== undefined) {
        addRplSnapshot(msg.snapshot);
      } else if (msg.type === "loopEvent" && msg.event !== undefined) {
        addLoopEvent(msg.event);
      } else if (msg.type === "rplAddr" && msg.addr !== undefined) {
        addRplAddr(msg.addr);
      } else if (msg.type === "status") {
        setStatus(msg as unknown as RunStatus);
        if (msg.state !== "running") {
          api.artifacts().then(setArtifacts).catch(() => {});
        }
      }
    });
    return () => ws.close();
    // Opened exactly once for the app's lifetime: the socket replays its
    // backlog on connect, so reopening on every scenario edit would
    // duplicate every snapshot already received.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setError(null);
    setLines([]);
    clearRplSnapshots();
    clearLoopEvents();
    clearRplAddrs();
    let res: Response;
    try {
      res = await api.run(scenarioRef.current);
    } catch {
      setError("バックエンドに接続できません。起動しているか確認してください。");
      return;
    }
    if (res.status === 422) {
      const body = (await res.json()) as { issues: Issue[] };
      setIssues(body.issues);
      setBottomTab("issues");
      setError("検証エラーがあります。「問題」タブで確認してください。");
    } else if (res.status === 409) {
      setError("すでに実行中です。");
    } else if (!res.ok) {
      setError(`実行開始に失敗: ${res.status}`);
    } else {
      setBottomTab("log");
    }
  };

  const stop = () => {
    api.stopRun().catch(() => {});
  };

  return { status, lines, artifacts, error, start, stop };
}
