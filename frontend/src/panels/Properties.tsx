// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { Field } from "../components/Field";
import { NumberField } from "../components/NumberField";
import { useEditor } from "../store";
import { NETWORK_LABELS, Network, WIFI_STANDARD_LABELS } from "../types";

export function Properties() {
  const scenario = useEditor((s) => s.scenario);
  const selection = useEditor((s) => s.selection);

  if (!selection) {
    return (
      <div className="properties">
        <h3>プロパティ</h3>
        <div className="hint">キャンバスの要素を選択してください</div>
      </div>
    );
  }
  if (selection.kind === "node") {
    return <NodeProps id={selection.id} />;
  }
  if (selection.kind === "network") {
    const net = scenario.networks.find((n) => n.id === selection.id);
    return net ? <NetworkProps net={net} /> : null;
  }
  return null;
}

function NodeProps({ id }: { id: string }) {
  const scenario = useEditor((s) => s.scenario);
  const updateNode = useEditor((s) => s.updateNode);
  const removeElement = useEditor((s) => s.removeElement);
  const addMember = useEditor((s) => s.addMember);
  const removeMember = useEditor((s) => s.removeMember);
  const setDodagRoot = useEditor((s) => s.setDodagRoot);
  const setRightTab = useEditor((s) => s.setRightTab);
  const select = useEditor((s) => s.select);
  const node = scenario.nodes.find((n) => n.id === id);
  if (!node) return null;

  const shared = scenario.networks.filter((n) => n.type !== "p2p");
  const scale = scenario.simulation.scale || 1;
  const isRpl = scenario.stack.routing === "rpl";
  const isRoot = isRpl && scenario.stack.rpl[0]?.root === id;

  const relatedApps = scenario.apps.filter((a) =>
    Object.values(a)
      .filter((v): v is string => typeof v === "string")
      .includes(id),
  );

  return (
    <div className="properties">
      <h3>ノード {node.id}</h3>
      <Field label="名前">
        <input value={node.name} onChange={(e) => updateNode(id, { name: e.target.value })} />
      </Field>
      <Field label="座標" unit="m">
        <div className="coord-row">
          <NumberField
            value={Math.round(node.x * scale)}
            fallback={0}
            onCommit={(m) => updateNode(id, { x: m / scale })}
          />
          <NumberField
            value={Math.round(node.y * scale)}
            fallback={0}
            onCommit={(m) => updateNode(id, { y: m / scale })}
          />
        </div>
      </Field>

      {isRpl && (
        <Field label="DODAG root" help="この RPL インスタンスの起点にする">
          <label className="inline-checkbox">
            <input type="checkbox" checked={isRoot} onChange={() => setDodagRoot(id)} />
            root にする
          </label>
        </Field>
      )}

      <h4>所属ネットワーク</h4>
      {shared.length === 0 && <div className="hint">セグメントがありません</div>}
      <ul className="membership-list">
        {shared.map((net) => {
          const joined = net.members.includes(id);
          return (
            <li key={net.id}>
              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={joined}
                  onChange={() => (joined ? removeMember(net.id, id) : addMember(net.id, id))}
                />
                {NETWORK_LABELS[net.type]} ({net.id})
              </label>
            </li>
          );
        })}
      </ul>

      <h4>関連アプリ ({relatedApps.length})</h4>
      {relatedApps.length === 0 && <div className="hint">なし</div>}
      <ul>
        {relatedApps.map((a) => (
          <li key={a.id}>
            <button
              className="link-btn"
              onClick={() => {
                select({ kind: "app", id: a.id });
                setRightTab("settings");
              }}
            >
              {a.type}
            </button>
          </li>
        ))}
      </ul>

      <button className="danger" onClick={() => removeElement(id)}>
        ノードを削除
      </button>
    </div>
  );
}

function NetworkProps({ net }: { net: Network }) {
  const scenario = useEditor((s) => s.scenario);
  const updateNetwork = useEditor((s) => s.updateNetwork);
  const addMember = useEditor((s) => s.addMember);
  const removeMember = useEditor((s) => s.removeMember);
  const removeElement = useEditor((s) => s.removeElement);
  const nodeName = (id: string) => scenario.nodes.find((n) => n.id === id)?.name || id;

  return (
    <div className="properties">
      <h3>
        {NETWORK_LABELS[net.type]} {net.id}
      </h3>

      {net.type === "p2p" && (
        <>
          <Field label="データレート (DataRate)">
            <input
              placeholder="例: 5Mbps"
              value={net.p2p.dataRate}
              onChange={(e) => updateNetwork(net.id, { p2p: { ...net.p2p, dataRate: e.target.value } })}
            />
          </Field>
          <Field label="遅延 (Delay)">
            <input
              placeholder="例: 2ms"
              value={net.p2p.delay}
              onChange={(e) => updateNetwork(net.id, { p2p: { ...net.p2p, delay: e.target.value } })}
            />
          </Field>
        </>
      )}

      {net.type === "csma" && (
        <>
          <Field label="データレート (DataRate)">
            <input
              placeholder="例: 100Mbps"
              value={net.csma.dataRate}
              onChange={(e) =>
                updateNetwork(net.id, { csma: { ...net.csma, dataRate: e.target.value } })
              }
            />
          </Field>
          <Field label="遅延 (Delay)">
            <input
              placeholder="例: 6560ns"
              value={net.csma.delay}
              onChange={(e) => updateNetwork(net.id, { csma: { ...net.csma, delay: e.target.value } })}
            />
          </Field>
        </>
      )}

      {(net.type === "wifiAdhoc" || net.type === "wifiInfra") && (
        <>
          <Field label="規格">
            <select
              value={net.wifi.standard}
              onChange={(e) =>
                updateNetwork(net.id, { wifi: { ...net.wifi, standard: e.target.value } })
              }
            >
              {["80211a", "80211b", "80211g", "80211n", "80211ac", "80211ax"].map((s) => (
                <option key={s} value={s}>
                  {WIFI_STANDARD_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="SSID">
            <input
              value={net.wifi.ssid}
              onChange={(e) => updateNetwork(net.id, { wifi: { ...net.wifi, ssid: e.target.value } })}
            />
          </Field>
          {net.type === "wifiInfra" && (
            <Field label="AP ノード">
              <select
                value={net.wifi.apNode ?? ""}
                onChange={(e) =>
                  updateNetwork(net.id, { wifi: { ...net.wifi, apNode: e.target.value || null } })
                }
              >
                <option value="">(未選択)</option>
                {net.members.map((m) => (
                  <option key={m} value={m}>
                    {nodeName(m)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="hint">
            注意: デフォルト設定の WiFi は約 50m を超えると受信できません
            (preamble 検出閾値 -82dBm)。
          </div>
        </>
      )}

      {net.type === "lrwpan" && (
        <>
          <Field label="PAN ID">
            <NumberField
              value={net.lrwpan.panId}
              fallback={1}
              min={1}
              step="1"
              onCommit={(panId) => updateNetwork(net.id, { lrwpan: { ...net.lrwpan, panId } })}
            />
          </Field>
          <Field label="伝搬損失モデル">
            <select
              value={net.lrwpan.lossModel}
              onChange={(e) =>
                updateNetwork(net.id, { lrwpan: { ...net.lrwpan, lossModel: e.target.value } })
              }
            >
              <option value="logDistance">LogDistance</option>
              <option value="friis">Friis</option>
            </select>
          </Field>
          <Field
            label="エラーモデル"
            help="「自動」は RPL が MRHOF (ETX ベース) を使うときだけ有効になる。LQI が変動しないと ETX がホップ数と区別つかなくなるための措置"
          >
            <select
              value={net.lrwpan.errorModel === null ? "auto" : String(net.lrwpan.errorModel)}
              onChange={(e) => {
                const v = e.target.value;
                updateNetwork(net.id, {
                  lrwpan: { ...net.lrwpan, errorModel: v === "auto" ? null : v === "true" },
                });
              }}
            >
              <option value="auto">自動 (MRHOF 時のみ有効)</option>
              <option value="true">常に有効</option>
              <option value="false">無効</option>
            </select>
          </Field>
        </>
      )}

      <h4>メンバー ({net.members.length})</h4>
      {net.type === "p2p" ? (
        <>
          <ul>
            {net.members.map((m) => (
              <li key={m}>{nodeName(m)}</li>
            ))}
          </ul>
          <p className="hint">
            P2P リンクの両端はちょうど 2 ノード。変更するにはキャンバスでこのリンクを削除し、
            別のノード間へあらためてドラッグしてください。
          </p>
        </>
      ) : (
        <ul className="membership-list">
          {scenario.nodes.map((n) => {
            const joined = net.members.includes(n.id);
            return (
              <li key={n.id}>
                <label className="inline-checkbox">
                  <input
                    type="checkbox"
                    checked={joined}
                    onChange={() => (joined ? removeMember(net.id, n.id) : addMember(net.id, n.id))}
                  />
                  {n.name || n.id}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <button className="danger" onClick={() => removeElement(net.id)}>
        ネットワークを削除
      </button>
    </div>
  );
}
