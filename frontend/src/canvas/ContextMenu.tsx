// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useEffect } from "react";

import { freshAppId, useEditor } from "../store";
import { NETWORK_LABELS, NetworkType } from "../types";

/** Either a right-click on an existing node/segment, or on empty canvas. */
export type MenuTarget =
  | { kind: "element"; id: string; x: number; y: number }
  | { kind: "pane"; x: number; y: number; flowX: number; flowY: number };

const SEGMENT_TYPES: Exclude<NetworkType, "p2p">[] = ["csma", "wifiAdhoc", "wifiInfra", "lrwpan"];

/**
 * Right-click menu for a canvas element: join/leave a shared segment and jump
 * to its PHY/MAC settings without dragging a spoke from every node. Also
 * doubles as the "add here" menu when opened on empty canvas.
 */
export function ContextMenu({
  target,
  onClose,
  onAddNode,
  onAddSegment,
}: {
  target: MenuTarget;
  onClose: () => void;
  onAddNode: (x: number, y: number) => void;
  onAddSegment: (type: Exclude<NetworkType, "p2p">, x: number, y: number) => void;
}) {
  const scenario = useEditor((s) => s.scenario);
  const select = useEditor((s) => s.select);
  const addMember = useEditor((s) => s.addMember);
  const removeMember = useEditor((s) => s.removeMember);
  const removeElement = useEditor((s) => s.removeElement);
  const addApp = useEditor((s) => s.addApp);
  const setDodagRoot = useEditor((s) => s.setDodagRoot);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Every entry acts and then dismisses.
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  if (target.kind === "pane") {
    return (
      <div
        className="context-menu"
        style={{ left: target.x, top: target.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="context-section">ここに追加</div>
        <button onClick={run(() => onAddNode(target.flowX, target.flowY))}>ノード</button>
        {SEGMENT_TYPES.map((t) => (
          <button key={t} onClick={run(() => onAddSegment(t, target.flowX, target.flowY))}>
            {NETWORK_LABELS[t]}
          </button>
        ))}
      </div>
    );
  }

  const node = scenario.nodes.find((n) => n.id === target.id);
  const segment = scenario.networks.find((n) => n.id === target.id);
  const shared = scenario.networks.filter((n) => n.type !== "p2p");
  const isRpl = scenario.stack.routing === "rpl";
  const otherNode = scenario.nodes.find((n) => n.id !== target.id)?.id ?? target.id;

  const quickAdd = (type: "ping" | "onoff" | "aodvDiscover" | "p2pDiscover") =>
    run(() => {
      const base = { id: freshAppId(), from: target.id, to: otherNode, start: 1 };
      if (type === "ping") {
        addApp({ ...base, type, stop: null, count: 5, interval: 1 });
      } else if (type === "onoff") {
        addApp({ ...base, type, port: 9000, stop: null, dataRate: "500kbps", packetSize: 512 });
      } else {
        addApp({ ...base, type, hopByHop: false });
      }
      select({ kind: "app", id: base.id });
    });

  return (
    <div
      className="context-menu"
      style={{ left: target.x, top: target.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {node && (
        <>
          <div className="context-title">{node.name || node.id}</div>
          <div className="context-section">参加ネットワーク</div>
          {shared.length === 0 && <div className="context-empty">セグメントがありません</div>}
          {shared.map((net) => {
            const joined = net.members.includes(node.id);
            return (
              <button
                key={net.id}
                onClick={run(() =>
                  joined ? removeMember(net.id, node.id) : addMember(net.id, node.id),
                )}
              >
                {joined ? "☑" : "☐"} {NETWORK_LABELS[net.type]} ({net.id})
              </button>
            );
          })}
          {shared.some((net) => net.members.includes(node.id)) && (
            <>
              <div className="context-section">PHY/MAC</div>
              {shared
                .filter((net) => net.members.includes(node.id))
                .map((net) => (
                  <button
                    key={`phy:${net.id}`}
                    onClick={run(() => select({ kind: "network", id: net.id }))}
                  >
                    {net.id} の設定...
                  </button>
                ))}
            </>
          )}
          {isRpl && (
            <>
              <div className="context-section">RPL</div>
              <button onClick={run(() => setDodagRoot(node.id))}>
                {scenario.stack.rpl[0]?.root === node.id ? "☑" : "☐"} DODAG root にする
              </button>
            </>
          )}
          {scenario.nodes.length > 1 && (
            <>
              <div className="context-section">このノードからアプリを追加</div>
              <button onClick={quickAdd("ping")}>Ping</button>
              <button onClick={quickAdd("onoff")}>OnOff</button>
              {isRpl && <button onClick={quickAdd("aodvDiscover")}>AODV-RPL 探索</button>}
              {isRpl && <button onClick={quickAdd("p2pDiscover")}>P2P-RPL 探索</button>}
            </>
          )}
          <hr />
          <button className="danger" onClick={run(() => removeElement(node.id))}>
            ノードを削除
          </button>
        </>
      )}

      {segment && (
        <>
          <div className="context-title">
            {NETWORK_LABELS[segment.type]} ({segment.id})
          </div>
          <button onClick={run(() => select({ kind: "network", id: segment.id }))}>
            PHY/MAC 設定...
          </button>
          <button
            onClick={run(() => {
              for (const n of scenario.nodes) {
                addMember(segment.id, n.id);
              }
            })}
          >
            全ノードを参加させる ({scenario.nodes.length})
          </button>
          <hr />
          <button className="danger" onClick={run(() => removeElement(segment.id))}>
            セグメントを削除
          </button>
        </>
      )}
    </div>
  );
}
