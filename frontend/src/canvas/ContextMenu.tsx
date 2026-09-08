// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useEffect } from "react";

import { useEditor } from "../store";
import { NETWORK_LABELS } from "../types";

/** The canvas element the menu was opened on, and where to draw the menu. */
export interface MenuTarget {
  id: string;
  x: number;
  y: number;
}

/**
 * Right-click menu for a canvas element: join/leave a shared segment and jump
 * to its PHY/MAC settings without dragging a spoke from every node.
 */
export function ContextMenu({ target, onClose }: { target: MenuTarget; onClose: () => void }) {
  const scenario = useEditor((s) => s.scenario);
  const select = useEditor((s) => s.select);
  const addMember = useEditor((s) => s.addMember);
  const removeMember = useEditor((s) => s.removeMember);
  const removeElement = useEditor((s) => s.removeElement);

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

  const node = scenario.nodes.find((n) => n.id === target.id);
  const segment = scenario.networks.find((n) => n.id === target.id);
  const shared = scenario.networks.filter((n) => n.type !== "p2p");

  // Every entry acts and then dismisses.
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

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
