// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { NumberField } from "../components/NumberField";
import { useEditor } from "../store";
import { NETWORK_LABELS, Network } from "../types";

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
  const node = scenario.nodes.find((n) => n.id === id);
  if (!node) return null;

  const memberships = scenario.networks.filter((n) => n.members.includes(id));
  const scale = scenario.simulation.scale;

  return (
    <div className="properties">
      <h3>ノード {node.id}</h3>
      <label>
        名前
        <input value={node.name} onChange={(e) => updateNode(id, { name: e.target.value })} />
      </label>
      <div className="hint">
        位置: ({Math.round(node.x * scale)}m, {Math.round(node.y * scale)}m)
      </div>
      <h4>所属ネットワーク</h4>
      {memberships.length === 0 && <div className="hint">なし (未接続)</div>}
      <ul>
        {memberships.map((n) => (
          <li key={n.id}>
            {n.id} ({NETWORK_LABELS[n.type]})
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
          <label>
            DataRate
            <input
              value={net.p2p.dataRate}
              onChange={(e) => updateNetwork(net.id, { p2p: { ...net.p2p, dataRate: e.target.value } })}
            />
          </label>
          <label>
            Delay
            <input
              value={net.p2p.delay}
              onChange={(e) => updateNetwork(net.id, { p2p: { ...net.p2p, delay: e.target.value } })}
            />
          </label>
        </>
      )}

      {net.type === "csma" && (
        <>
          <label>
            DataRate
            <input
              value={net.csma.dataRate}
              onChange={(e) =>
                updateNetwork(net.id, { csma: { ...net.csma, dataRate: e.target.value } })
              }
            />
          </label>
          <label>
            Delay
            <input
              value={net.csma.delay}
              onChange={(e) => updateNetwork(net.id, { csma: { ...net.csma, delay: e.target.value } })}
            />
          </label>
        </>
      )}

      {(net.type === "wifiAdhoc" || net.type === "wifiInfra") && (
        <>
          <label>
            規格
            <select
              value={net.wifi.standard}
              onChange={(e) =>
                updateNetwork(net.id, { wifi: { ...net.wifi, standard: e.target.value } })
              }
            >
              {["80211a", "80211b", "80211g", "80211n", "80211ac", "80211ax"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            SSID
            <input
              value={net.wifi.ssid}
              onChange={(e) => updateNetwork(net.id, { wifi: { ...net.wifi, ssid: e.target.value } })}
            />
          </label>
          {net.type === "wifiInfra" && (
            <label>
              AP ノード
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
            </label>
          )}
          <div className="hint">
            注意: デフォルト設定の WiFi は約 50m を超えると受信できません
            (preamble 検出閾値 -82dBm)。
          </div>
        </>
      )}

      {net.type === "lrwpan" && (
        <>
          <label>
            PAN ID
            <NumberField
              value={net.lrwpan.panId}
              fallback={1}
              min={1}
              step="1"
              onCommit={(panId) => updateNetwork(net.id, { lrwpan: { ...net.lrwpan, panId } })}
            />
          </label>
          <label>
            伝搬損失モデル
            <select
              value={net.lrwpan.lossModel}
              onChange={(e) =>
                updateNetwork(net.id, { lrwpan: { ...net.lrwpan, lossModel: e.target.value } })
              }
            >
              <option value="logDistance">LogDistance</option>
              <option value="friis">Friis</option>
            </select>
          </label>
          <label>
            エラーモデル
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
          </label>
        </>
      )}

      <h4>メンバー ({net.members.length})</h4>
      <ul>
        {net.members.map((m) => (
          <li key={m}>
            {nodeName(m)}
            <button className="tiny" onClick={() => removeMember(net.id, m)}>
              外す
            </button>
          </li>
        ))}
      </ul>
      <button className="danger" onClick={() => removeElement(net.id)}>
        ネットワークを削除
      </button>
    </div>
  );
}
