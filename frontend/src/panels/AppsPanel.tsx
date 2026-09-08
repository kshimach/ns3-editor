// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { Field } from "../components/Field";
import { NumberField } from "../components/NumberField";
import { freshAppId, useEditor } from "../store";
import { APP_LABELS, App } from "../types";

const APP_KINDS: App["type"][] = ["ping", "udpEcho", "onoff", "aodvDiscover", "p2pDiscover"];

function blankApp(type: App["type"], fromId: string, toId: string): App {
  const id = freshAppId();
  switch (type) {
    case "ping":
      return { type, id, from: fromId, to: toId, start: 1, stop: null, count: 5, interval: 1 };
    case "udpEcho":
      return {
        type,
        id,
        server: fromId,
        client: toId,
        port: 9,
        start: 1,
        stop: null,
        maxPackets: 10,
        interval: 1,
        packetSize: 64,
      };
    case "onoff":
      return {
        type,
        id,
        from: fromId,
        to: toId,
        port: 9000,
        start: 1,
        stop: null,
        dataRate: "500kbps",
        packetSize: 512,
      };
    case "aodvDiscover":
      return { type, id, from: fromId, to: toId, start: 1, hopByHop: false };
    case "p2pDiscover":
      return { type, id, from: fromId, to: toId, start: 1, hopByHop: false };
  }
}

/** endpoints as [from-like, to-like], the field names differing only for udpEcho. */
function endpoints(app: App): [string, string] {
  return app.type === "udpEcho" ? [app.client, app.server] : [app.from, app.to];
}

export function AppsPanel() {
  const scenario = useEditor((s) => s.scenario);
  const selection = useEditor((s) => s.selection);
  const addApp = useEditor((s) => s.addApp);
  const updateApp = useEditor((s) => s.updateApp);
  const removeApp = useEditor((s) => s.removeApp);
  const nodes = scenario.nodes;
  const isRpl = scenario.stack.routing === "rpl";

  const add = (type: App["type"]) => {
    const from = nodes[0]?.id ?? "";
    const to = nodes[1]?.id ?? nodes[0]?.id ?? "";
    addApp(blankApp(type, from, to));
  };

  return (
    <section className="apps-panel">
      <div className="apps-panel-head">
        <h4>アプリケーション</h4>
        <select
          value=""
          aria-label="アプリを追加"
          onChange={(e) => {
            if (e.target.value) add(e.target.value as App["type"]);
            e.target.value = "";
          }}
        >
          <option value="">+ アプリを追加...</option>
          {APP_KINDS.map((k) => (
            <option
              key={k}
              value={k}
              disabled={(k === "aodvDiscover" || k === "p2pDiscover") && !isRpl}
            >
              {APP_LABELS[k]}
              {(k === "aodvDiscover" || k === "p2pDiscover") && !isRpl ? " (RPL のみ)" : ""}
            </option>
          ))}
        </select>
      </div>
      {scenario.apps.length === 0 && <p className="hint">まだアプリがありません</p>}
      {scenario.apps.map((app) => (
        <AppCard
          key={app.id}
          app={app}
          nodes={nodes}
          highlighted={selection?.kind === "app" && selection.id === app.id}
          onChange={updateApp}
          onRemove={removeApp}
        />
      ))}
    </section>
  );
}

function AppCard({
  app,
  nodes,
  highlighted,
  onChange,
  onRemove,
}: {
  app: App;
  nodes: { id: string; name: string }[];
  highlighted: boolean;
  onChange: (id: string, patch: Partial<App>) => void;
  onRemove: (id: string) => void;
}) {
  const nodeSelect = (value: string, onSel: (v: string) => void) => (
    <select value={value} onChange={(e) => onSel(e.target.value)}>
      {nodes.map((n) => (
        <option key={n.id} value={n.id}>
          {n.name || n.id}
        </option>
      ))}
    </select>
  );

  const [fromId, toId] = endpoints(app);
  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name || id;
  const setFrom = (v: string) =>
    onChange(app.id, (app.type === "udpEcho" ? { client: v } : { from: v }) as Partial<App>);
  const setTo = (v: string) =>
    onChange(app.id, (app.type === "udpEcho" ? { server: v } : { to: v }) as Partial<App>);

  const hasStop = "stop" in app;
  const stop = hasStop ? (app as { stop: number | null }).stop : undefined;

  return (
    <div className={`app-card${highlighted ? " highlighted" : ""}`} id={`app-card-${app.id}`}>
      <div className="app-card-head">
        <span className="app-kind">{APP_LABELS[app.type]}</span>
        <span className="app-summary">
          {nodeName(fromId)} → {nodeName(toId)}
        </span>
        <button className="tiny danger" onClick={() => onRemove(app.id)}>
          削除
        </button>
      </div>
      <div className="app-card-body">
        <Field label={app.type === "udpEcho" ? "クライアント" : "送信元"}>
          {nodeSelect(fromId, setFrom)}
        </Field>
        <Field label={app.type === "udpEcho" ? "サーバー" : "宛先"}>
          {nodeSelect(toId, setTo)}
        </Field>
        <Field label="開始時刻" unit="s">
          <NumberField
            value={app.start}
            fallback={0}
            min={0}
            onCommit={(start) => onChange(app.id, { start })}
          />
        </Field>
        {hasStop && (
          <Field label="終了時刻" unit="s">
            <div className="stop-time-row">
              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={stop !== null}
                  onChange={(e) =>
                    onChange(app.id, { stop: e.target.checked ? app.start + 10 : null } as Partial<App>)
                  }
                />
                指定する
              </label>
              {stop !== null && (
                <NumberField
                  value={stop as number}
                  fallback={app.start + 10}
                  min={app.start}
                  onCommit={(v) => onChange(app.id, { stop: v } as Partial<App>)}
                />
              )}
            </div>
          </Field>
        )}

        {app.type === "ping" && (
          <>
            <Field label="回数">
              <NumberField
                value={app.count}
                fallback={1}
                min={1}
                onCommit={(count) => onChange(app.id, { count } as Partial<App>)}
              />
            </Field>
            <Field label="送信間隔" unit="s">
              <NumberField
                value={app.interval}
                fallback={1}
                min={0.001}
                step="0.1"
                onCommit={(interval) => onChange(app.id, { interval } as Partial<App>)}
              />
            </Field>
          </>
        )}

        {app.type === "udpEcho" && (
          <>
            <Field label="ポート">
              <NumberField
                value={app.port}
                fallback={9}
                min={1}
                max={65535}
                onCommit={(port) => onChange(app.id, { port } as Partial<App>)}
              />
            </Field>
            <Field label="最大パケット数">
              <NumberField
                value={app.maxPackets}
                fallback={100}
                min={1}
                onCommit={(maxPackets) => onChange(app.id, { maxPackets } as Partial<App>)}
              />
            </Field>
            <Field label="送信間隔" unit="s">
              <NumberField
                value={app.interval}
                fallback={1}
                min={0.001}
                step="0.1"
                onCommit={(interval) => onChange(app.id, { interval } as Partial<App>)}
              />
            </Field>
            <Field label="パケットサイズ" unit="bytes">
              <NumberField
                value={app.packetSize}
                fallback={64}
                min={1}
                onCommit={(packetSize) => onChange(app.id, { packetSize } as Partial<App>)}
              />
            </Field>
          </>
        )}

        {app.type === "onoff" && (
          <>
            <Field label="ポート">
              <NumberField
                value={app.port}
                fallback={9000}
                min={1}
                max={65535}
                onCommit={(port) => onChange(app.id, { port } as Partial<App>)}
              />
            </Field>
            <Field label="データレート" help="ns-3 の DataRate 文字列 (例: 500kbps, 1Mbps)">
              <input
                placeholder="例: 500kbps"
                value={app.dataRate}
                onChange={(e) => onChange(app.id, { dataRate: e.target.value } as Partial<App>)}
              />
            </Field>
            <Field label="パケットサイズ" unit="bytes">
              <NumberField
                value={app.packetSize}
                fallback={512}
                min={1}
                onCommit={(packetSize) => onChange(app.id, { packetSize } as Partial<App>)}
              />
            </Field>
          </>
        )}

        {(app.type === "aodvDiscover" || app.type === "p2pDiscover") && (
          <Field
            label="H=1 (hop-by-hop)"
            help="H=0 (既定) は起点ノードで求めた完全な経路 (Source Route) を使う。H=1 は各中継ノードが次ホップだけを覚える"
          >
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={app.hopByHop}
                onChange={(e) => onChange(app.id, { hopByHop: e.target.checked } as Partial<App>)}
              />
              有効にする
            </label>
          </Field>
        )}
      </div>
    </div>
  );
}
