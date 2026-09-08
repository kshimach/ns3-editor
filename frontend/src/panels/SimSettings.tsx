// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { NumberField } from "../components/NumberField";
import { freshAppId, freshRplId, useEditor } from "../store";
import { App, RplConfig } from "../types";

export function SimSettings() {
  const scenario = useEditor((s) => s.scenario);
  const updateScenario = useEditor((s) => s.updateScenario);
  const addApp = useEditor((s) => s.addApp);
  const updateApp = useEditor((s) => s.updateApp);
  const removeApp = useEditor((s) => s.removeApp);
  const addRplInstance = useEditor((s) => s.addRplInstance);
  const updateRplInstance = useEditor((s) => s.updateRplInstance);
  const removeRplInstance = useEditor((s) => s.removeRplInstance);

  const sim = scenario.simulation;
  const stack = scenario.stack;

  return (
    <div className="sim-settings">
      <section>
        <h4>シミュレーション</h4>
        <label>
          時間 (s)
          <NumberField
            value={sim.duration}
            fallback={1}
            min={1}
            onCommit={(duration) => updateScenario({ simulation: { ...sim, duration } })}
          />
        </label>
        <label>
          シード
          <NumberField
            value={sim.seed}
            fallback={1}
            min={1}
            onCommit={(seed) => updateScenario({ simulation: { ...sim, seed } })}
          />
        </label>
        <label>
          スケール (px = m)
          <NumberField
            value={sim.scale}
            fallback={1}
            step="0.1"
            onCommit={(scale) => updateScenario({ simulation: { ...sim, scale } })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={sim.pcap}
            onChange={(e) => updateScenario({ simulation: { ...sim, pcap: e.target.checked } })}
          />
          pcap を書き出す
        </label>
        {stack.routing === "rpl" && (
          <label title="RPL テーブルタブに表示するスナップショットの間隔。0 で実行終了時の 1 回だけ">
            RPL テーブル取得間隔 (s)
            <NumberField
              value={sim.rplTableInterval}
              fallback={0}
              min={0}
              step="1"
              onCommit={(rplTableInterval) =>
                updateScenario({ simulation: { ...sim, rplTableInterval } })
              }
            />
          </label>
        )}
        <label>
          ログ (カンマ区切り)
          <input
            placeholder="RplRoutingProtocol, Ping"
            value={sim.logComponents.join(", ")}
            onChange={(e) =>
              updateScenario({
                simulation: {
                  ...sim,
                  logComponents: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
          />
        </label>
      </section>

      <section>
        <h4>スタック</h4>
        <label>
          IP
          <select
            value={stack.ip}
            onChange={(e) =>
              updateScenario({ stack: { ...stack, ip: e.target.value as "ipv4" | "ipv6" } })
            }
          >
            <option value="ipv4">IPv4</option>
            <option value="ipv6">IPv6</option>
          </select>
        </label>
        <label>
          ルーティング
          <select
            value={stack.routing}
            onChange={(e) =>
              updateScenario({
                stack: { ...stack, routing: e.target.value as "global" | "static" | "rpl" },
              })
            }
          >
            <option value="global">Global (IPv4)</option>
            <option value="static">Static</option>
            <option value="rpl">RPL (IPv6)</option>
          </select>
        </label>
        {stack.routing === "rpl" && (
          <div className="rpl-instances">
            <p className="hint">
              実際に ns-3 へ渡されるのは先頭 (base) instance のみです。
              2 つ目以降は contrib/rpl 側の複数 instance 対応待ちです。
              AODV-RPL / P2P-RPL 経路探索 (下の「アプリケーション」から追加) はこの制約と無関係に
              base instance 上で動作します。
            </p>
            {stack.rpl.map((instance, i) => (
              <RplInstanceRow
                key={instance.id}
                instance={instance}
                index={i}
                onChange={updateRplInstance}
                onRemove={stack.rpl.length > 1 ? removeRplInstance : undefined}
              />
            ))}
            <button
              className="tiny"
              onClick={() =>
                addRplInstance({
                  id: freshRplId(),
                  root: "",
                  ocp: "of0",
                  enableLql: false,
                  disInterval: 30,
                  dioIntervalMin: 4.096,
                  dioIntervalDoublings: 8,
                  dioRedundancy: 0,
                  minHopRankIncrease: 128,
                  daoInterval: 60,
                  daoAckTimeout: 5,
                  daoRetries: 3,
                  pathLifetime: 30,
                  aodvDioIntervalMin: 0.128,
                  aodvDioIntervalDoublings: 4,
                  aodvRankLimit: 8,
                  aodvLifetime: 1,
                  aodvRejoinReenable: 900,
                  p2pDioIntervalMin: 0.064,
                  p2pDioIntervalDoublings: 4,
                  p2pDioRedundancy: 1,
                  p2pMaxRank: 8,
                  p2pLifetime: 2,
                  p2pDroAckRequested: true,
                  p2pDroAckWaitTime: 1,
                  p2pDroMaxRetransmissions: 3,
                })
              }
            >
              + RPL instance
            </button>
          </div>
        )}
      </section>

      <section className="apps-section">
        <h4>アプリケーション</h4>
        <div className="app-add">
          <button
            onClick={() =>
              addApp({
                type: "ping",
                id: freshAppId(),
                from: scenario.nodes[0]?.id ?? "",
                to: scenario.nodes[1]?.id ?? scenario.nodes[0]?.id ?? "",
                start: 1,
                stop: null,
                count: 5,
                interval: 1,
              })
            }
          >
            + Ping
          </button>
          <button
            onClick={() =>
              addApp({
                type: "udpEcho",
                id: freshAppId(),
                server: scenario.nodes[0]?.id ?? "",
                client: scenario.nodes[1]?.id ?? scenario.nodes[0]?.id ?? "",
                port: 9,
                start: 1,
                stop: null,
                maxPackets: 10,
                interval: 1,
                packetSize: 64,
              })
            }
          >
            + UDP Echo
          </button>
          <button
            onClick={() =>
              addApp({
                type: "onoff",
                id: freshAppId(),
                from: scenario.nodes[0]?.id ?? "",
                to: scenario.nodes[1]?.id ?? scenario.nodes[0]?.id ?? "",
                port: 9000,
                start: 1,
                stop: null,
                dataRate: "500kbps",
                packetSize: 512,
              })
            }
          >
            + OnOff
          </button>
          {stack.routing === "rpl" && (
            <button
              onClick={() =>
                addApp({
                  type: "aodvDiscover",
                  id: freshAppId(),
                  from: scenario.nodes[0]?.id ?? "",
                  to: scenario.nodes[1]?.id ?? scenario.nodes[0]?.id ?? "",
                  start: 1,
                })
              }
            >
              + AODV-RPL 探索
            </button>
          )}
          {stack.routing === "rpl" && (
            <button
              onClick={() =>
                addApp({
                  type: "p2pDiscover",
                  id: freshAppId(),
                  from: scenario.nodes[0]?.id ?? "",
                  to: scenario.nodes[1]?.id ?? scenario.nodes[0]?.id ?? "",
                  start: 1,
                })
              }
            >
              + P2P-RPL 探索
            </button>
          )}
        </div>
        {scenario.apps.map((app) => (
          <AppRow key={app.id} app={app} onChange={updateApp} onRemove={removeApp} />
        ))}
      </section>
    </div>
  );
}

function AppRow({
  app,
  onChange,
  onRemove,
}: {
  app: App;
  onChange: (id: string, patch: Partial<App>) => void;
  onRemove: (id: string) => void;
}) {
  const nodes = useEditor((s) => s.scenario.nodes);
  const nodeSelect = (value: string, onSel: (v: string) => void) => (
    <select value={value} onChange={(e) => onSel(e.target.value)}>
      {nodes.map((n) => (
        <option key={n.id} value={n.id}>
          {n.name || n.id}
        </option>
      ))}
    </select>
  );

  return (
    <div className="app-row">
      <span className="app-kind">{app.type}</span>
      {(app.type === "ping" ||
        app.type === "onoff" ||
        app.type === "aodvDiscover" ||
        app.type === "p2pDiscover") && (
        <>
          {nodeSelect(app.from, (v) => onChange(app.id, { from: v } as Partial<App>))}
          <span>から</span>
          {nodeSelect(app.to, (v) => onChange(app.id, { to: v } as Partial<App>))}
          <span>へ</span>
        </>
      )}
      {app.type === "udpEcho" && (
        <>
          {nodeSelect(app.client, (v) => onChange(app.id, { client: v } as Partial<App>))}
          <span>から</span>
          {nodeSelect(app.server, (v) => onChange(app.id, { server: v } as Partial<App>))}
          <span>へ (port {app.port})</span>
        </>
      )}
      <label>
        開始
        <NumberField
          value={app.start}
          fallback={0}
          min={0}
          onCommit={(start) => onChange(app.id, { start })}
        />
      </label>
      {app.type === "ping" && (
        <label>
          回数
          <NumberField
            value={app.count}
            fallback={1}
            min={1}
            onCommit={(count) => onChange(app.id, { count } as Partial<App>)}
          />
        </label>
      )}
      <button className="tiny danger" onClick={() => onRemove(app.id)}>
        削除
      </button>
    </div>
  );
}

function RplInstanceRow({
  instance,
  index,
  onChange,
  onRemove,
}: {
  instance: RplConfig;
  index: number;
  onChange: (id: string, patch: Partial<RplConfig>) => void;
  onRemove?: (id: string) => void;
}) {
  const nodes = useEditor((s) => s.scenario.nodes);

  return (
    <div className="rpl-instance-row">
      <span className="rpl-instance-label">
        instance {index}
        {index === 0 && " (base)"}
      </span>
      <label>
        DODAG root
        <select
          value={instance.root}
          onChange={(e) => onChange(instance.id, { root: e.target.value })}
        >
          <option value="">(未選択)</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name || n.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Objective Function
        <select
          value={instance.ocp}
          onChange={(e) => onChange(instance.id, { ocp: e.target.value as "of0" | "mrhof" })}
        >
          <option value="of0">OF0 (ホップ数)</option>
          <option value="mrhof">MRHOF (ETX)</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={instance.enableLql}
          onChange={(e) => onChange(instance.id, { enableLql: e.target.checked })}
        />
        LQL (RSSI 由来) を advertise
      </label>
      {index === 0 && (
        <details className="rpl-aodv-settings">
          <summary>RPL 詳細設定 (Trickle/DAO)</summary>
          <label>
            DIS 送信間隔 (s)
            <NumberField
              value={instance.disInterval}
              fallback={30}
              min={0.001}
              onCommit={(disInterval) => onChange(instance.id, { disInterval })}
            />
          </label>
          <label>
            DIO Trickle Imin (s)
            <NumberField
              value={instance.dioIntervalMin}
              fallback={4.096}
              min={0.001}
              step="0.001"
              onCommit={(dioIntervalMin) => onChange(instance.id, { dioIntervalMin })}
            />
          </label>
          <label>
            DIO Trickle doublings
            <NumberField
              value={instance.dioIntervalDoublings}
              fallback={8}
              min={0}
              onCommit={(dioIntervalDoublings) =>
                onChange(instance.id, { dioIntervalDoublings })
              }
            />
          </label>
          <label>
            DIO Trickle redundancy k (0 = 抑制なし)
            <NumberField
              value={instance.dioRedundancy}
              fallback={0}
              min={0}
              onCommit={(dioRedundancy) => onChange(instance.id, { dioRedundancy })}
            />
          </label>
          <label>
            MinHopRankIncrease
            <NumberField
              value={instance.minHopRankIncrease}
              fallback={128}
              min={1}
              max={65535}
              onCommit={(minHopRankIncrease) =>
                onChange(instance.id, { minHopRankIncrease })
              }
            />
          </label>
          <label>
            DAO 再送間隔 (s)
            <NumberField
              value={instance.daoInterval}
              fallback={60}
              min={0.001}
              onCommit={(daoInterval) => onChange(instance.id, { daoInterval })}
            />
          </label>
          <label>
            DAO-ACK タイムアウト (s)
            <NumberField
              value={instance.daoAckTimeout}
              fallback={5}
              min={0.001}
              onCommit={(daoAckTimeout) => onChange(instance.id, { daoAckTimeout })}
            />
          </label>
          <label>
            DAO 再送回数
            <NumberField
              value={instance.daoRetries}
              fallback={3}
              min={0}
              max={255}
              onCommit={(daoRetries) => onChange(instance.id, { daoRetries })}
            />
          </label>
          <label>
            下り経路の寿命 (lifetime units)
            <NumberField
              value={instance.pathLifetime}
              fallback={30}
              min={1}
              max={255}
              onCommit={(pathLifetime) => onChange(instance.id, { pathLifetime })}
            />
          </label>
        </details>
      )}
      {index === 0 && (
        <details className="rpl-aodv-settings">
          <summary>AODV-RPL 探索設定 (詳細)</summary>
          <label>
            RREQ-DIO Trickle Imin (s)
            <NumberField
              value={instance.aodvDioIntervalMin}
              fallback={0.128}
              min={0.001}
              step="0.001"
              onCommit={(aodvDioIntervalMin) => onChange(instance.id, { aodvDioIntervalMin })}
            />
          </label>
          <label>
            Trickle doublings
            <NumberField
              value={instance.aodvDioIntervalDoublings}
              fallback={4}
              min={0}
              onCommit={(aodvDioIntervalDoublings) =>
                onChange(instance.id, { aodvDioIntervalDoublings })
              }
            />
          </label>
          <label>
            RankLimit (0 = 無制限)
            <NumberField
              value={instance.aodvRankLimit}
              fallback={8}
              min={0}
              max={127}
              onCommit={(aodvRankLimit) => onChange(instance.id, { aodvRankLimit })}
            />
          </label>
          <label>
            Lifetime
            <select
              value={instance.aodvLifetime}
              onChange={(e) => onChange(instance.id, { aodvLifetime: Number(e.target.value) })}
            >
              <option value={0}>無制限</option>
              <option value={1}>16 秒</option>
              <option value={2}>64 秒</option>
              <option value={3}>256 秒</option>
            </select>
          </label>
          <label>
            RejoinReenable (s)
            <NumberField
              value={instance.aodvRejoinReenable}
              fallback={900}
              min={0}
              onCommit={(aodvRejoinReenable) => onChange(instance.id, { aodvRejoinReenable })}
            />
          </label>
        </details>
      )}
      {index === 0 && (
        <details className="rpl-aodv-settings">
          <summary>P2P-RPL 探索設定 (詳細)</summary>
          <label>
            P2P mode DIO Trickle Imin (s)
            <NumberField
              value={instance.p2pDioIntervalMin}
              fallback={0.064}
              min={0.001}
              step="0.001"
              onCommit={(p2pDioIntervalMin) => onChange(instance.id, { p2pDioIntervalMin })}
            />
          </label>
          <label>
            Trickle doublings
            <NumberField
              value={instance.p2pDioIntervalDoublings}
              fallback={4}
              min={0}
              onCommit={(p2pDioIntervalDoublings) =>
                onChange(instance.id, { p2pDioIntervalDoublings })
              }
            />
          </label>
          <label>
            Trickle redundancy k
            <NumberField
              value={instance.p2pDioRedundancy}
              fallback={1}
              min={0}
              max={255}
              onCommit={(p2pDioRedundancy) => onChange(instance.id, { p2pDioRedundancy })}
            />
          </label>
          <label>
            MaxRank (0 = 無制限)
            <NumberField
              value={instance.p2pMaxRank}
              fallback={8}
              min={0}
              max={63}
              onCommit={(p2pMaxRank) => onChange(instance.id, { p2pMaxRank })}
            />
          </label>
          <label>
            Lifetime
            <select
              value={instance.p2pLifetime}
              onChange={(e) => onChange(instance.id, { p2pLifetime: Number(e.target.value) })}
            >
              <option value={0}>1 秒</option>
              <option value={1}>4 秒</option>
              <option value={2}>16 秒</option>
              <option value={3}>64 秒</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={instance.p2pDroAckRequested}
              onChange={(e) =>
                onChange(instance.id, { p2pDroAckRequested: e.target.checked })
              }
            />
            P2P-DRO-ACK を要求
          </label>
          <label>
            P2P-DRO-ACK 待ち時間 (s)
            <NumberField
              value={instance.p2pDroAckWaitTime}
              fallback={1}
              min={0.001}
              step="0.001"
              onCommit={(p2pDroAckWaitTime) => onChange(instance.id, { p2pDroAckWaitTime })}
            />
          </label>
          <label>
            P2P-DRO 再送回数
            <NumberField
              value={instance.p2pDroMaxRetransmissions}
              fallback={3}
              min={0}
              max={255}
              onCommit={(p2pDroMaxRetransmissions) =>
                onChange(instance.id, { p2pDroMaxRetransmissions })
              }
            />
          </label>
        </details>
      )}
      {onRemove && (
        <button className="tiny danger" onClick={() => onRemove(instance.id)}>
          削除
        </button>
      )}
    </div>
  );
}
