// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { Issue, RunStatus, Scenario } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok && res.status !== 422) {
    throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () =>
    fetch("/api/health").then((r) => json<{ ok: boolean; ns3Dir: string; ns3DirExists: boolean }>(r)),

  listScenarios: () =>
    fetch("/api/scenarios").then((r) => json<{ file: string; name: string }[]>(r)),

  loadScenario: (name: string) =>
    fetch(`/api/scenarios/${encodeURIComponent(name)}`).then((r) => json<Scenario>(r)),

  saveScenario: (name: string, scenario: Scenario) =>
    fetch(`/api/scenarios/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario),
    }).then((r) => json<{ saved: string }>(r)),

  deleteScenario: (name: string) =>
    fetch(`/api/scenarios/${encodeURIComponent(name)}`, { method: "DELETE" }).then((r) =>
      json<{ deleted: string }>(r),
    ),

  validate: (scenario: Scenario) =>
    fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario),
    }).then((r) => json<Issue[]>(r)),

  generate: (scenario: Scenario) =>
    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario),
    }).then((r) => json<{ issues: Issue[]; code: string | null; scratchName?: string }>(r)),

  run: (scenario: Scenario) =>
    fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario),
    }),

  runStatus: () => fetch("/api/run").then((r) => json<RunStatus>(r)),

  stopRun: () => fetch("/api/run/stop", { method: "POST" }).then((r) => json<RunStatus>(r)),

  artifacts: () =>
    fetch("/api/run/artifacts").then((r) => json<{ name: string; size: number }[]>(r)),
};

export function openRunSocket(onMessage: (m: unknown) => void): WebSocket {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/run`);
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  return ws;
}
