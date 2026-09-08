// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import {
  Background,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node as RFNode,
  NodeChange,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useEditor } from "../store";
import { NetworkType } from "../types";
import { ContextMenu, MenuTarget } from "./ContextMenu";
import { DeviceNode } from "./DeviceNode";
import { EmptyState } from "./EmptyState";
import { HelpOverlay } from "./HelpOverlay";
import { lrWpanRangeMeters, wifiRangeMeters } from "./radioRange";
import { SegmentNode } from "./SegmentNode";

const nodeTypes = { device: DeviceNode, segment: SegmentNode };

/** Network types with a real, distance-dependent radio range. */
const RADIO_TYPES: NetworkType[] = ["lrwpan", "wifiAdhoc", "wifiInfra"];

function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  const dismissToast = useEditor((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast" onClick={() => dismissToast(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

function CanvasInner() {
  const scenario = useEditor((s) => s.scenario);
  const selection = useEditor((s) => s.selection);
  const issues = useEditor((s) => s.issues);
  const select = useEditor((s) => s.select);
  const moveElement = useEditor((s) => s.moveElement);
  const removeElement = useEditor((s) => s.removeElement);
  const addP2p = useEditor((s) => s.addP2p);
  const addMember = useEditor((s) => s.addMember);
  const addNode = useEditor((s) => s.addNode);
  const addSegment = useEditor((s) => s.addSegment);
  const showRadioRange = useEditor((s) => s.showRadioRange);
  const toggleRadioRange = useEditor((s) => s.toggleRadioRange);
  const showNodeIds = useEditor((s) => s.showNodeIds);
  const toggleNodeIds = useEditor((s) => s.toggleNodeIds);
  const showParentLinks = useEditor((s) => s.showParentLinks);
  const toggleParentLinks = useEditor((s) => s.toggleParentLinks);
  const pulsedNode = useEditor((s) => s.pulsedNode);
  const rplSnapshots = useEditor((s) => s.rplSnapshots);
  const rplAddrs = useEditor((s) => s.rplAddrs);
  const { screenToFlowPosition } = useReactFlow();

  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (e.key === "?" && !typing) {
        setShowHelp(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isEmpty = scenario.nodes.length === 0 && scenario.networks.length === 0;

  const hasRadioSegment = useMemo(
    () => scenario.networks.some((n) => RADIO_TYPES.includes(n.type)),
    [scenario.networks],
  );

  // Every issue bound to an id, grouped so a hover can show all of them at
  // once rather than just whichever happened to be first.
  const issuesByElement = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of issues) {
      if (!issue.elementId) continue;
      const list = map.get(issue.elementId) ?? [];
      list.push(issue.message);
      map.set(issue.elementId, list);
    }
    return map;
  }, [issues]);

  const errorIds = useMemo(
    () => new Set(issues.filter((i) => i.level === "error").map((i) => i.elementId)),
    [issues],
  );
  const warnIds = useMemo(
    () => new Set(issues.filter((i) => i.level === "warning").map((i) => i.elementId)),
    [issues],
  );

  const dodagRoot = scenario.stack.routing === "rpl" ? scenario.stack.rpl[0]?.root : undefined;

  const rfNodes: RFNode[] = useMemo(() => {
    const scale = scenario.simulation.scale || 1;
    const devices: RFNode[] = scenario.nodes.map((n, i) => {
      const radioMemberships = scenario.networks.filter(
        (net) => RADIO_TYPES.includes(net.type) && net.members.includes(n.id),
      );
      // A node joining more than one radio segment is not something the
      // editor steers anyone towards, but nothing rules it out either; the
      // widest ring is the one that actually bounds where this node can be
      // heard from.
      const rangePx =
        showRadioRange && radioMemberships.length > 0
          ? Math.max(
              ...radioMemberships.map(
                (net) =>
                  (net.type === "lrwpan"
                    ? lrWpanRangeMeters(net.lrwpan.lossModel)
                    : wifiRangeMeters()) / scale,
              ),
            )
          : null;
      return {
        id: n.id,
        type: "device",
        position: { x: n.x, y: n.y },
        data: {
          label: showNodeIds && n.name && n.name !== n.id ? `${n.name} (${n.id})` : n.name || n.id,
          // Shown on the node in place of a spoke drawn to the segment hub.
          badges: scenario.networks
            .filter((net) => net.type !== "p2p" && net.members.includes(n.id))
            .map((net) => ({ id: net.id, type: net.type })),
          rangePx,
          isRoot: n.id === dodagRoot,
          issues: issuesByElement.get(n.id),
          hasWarning: warnIds.has(n.id),
          hasError: errorIds.has(n.id),
          pulsing: pulsedNode === i,
        },
        selected: selection?.kind === "node" && selection.id === n.id,
        className: errorIds.has(n.id) ? "has-error" : undefined,
        // Explicit size so the node also shows up in the MiniMap (which does
        // not fall back to the measured DOM size for custom nodes).
        width: 64,
        height: 64,
      };
    });
    const segments: RFNode[] = scenario.networks
      .filter((n) => n.type !== "p2p")
      .map((n) => ({
        id: n.id,
        type: "segment",
        position: { x: n.x, y: n.y },
        data: {
          label: n.id,
          segType: n.type,
          issues: issuesByElement.get(n.id),
          hasWarning: warnIds.has(n.id),
          hasError: errorIds.has(n.id),
        },
        selected: selection?.kind === "network" && selection.id === n.id,
        className: errorIds.has(n.id) ? "has-error" : undefined,
        width: 70,
        height: 50,
      }));
    return [...devices, ...segments];
  }, [
    scenario,
    selection,
    errorIds,
    warnIds,
    issuesByElement,
    showRadioRange,
    showNodeIds,
    dodagRoot,
    pulsedNode,
  ]);

  const rfEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    // Only p2p links are drawn as edges. Membership in a shared segment is a
    // badge on the node instead: one spoke per member buries the canvas in
    // lines as soon as a PAN holds more than a handful of nodes, and every one
    // of them had to be dragged by hand.
    for (const net of scenario.networks) {
      if (net.type !== "p2p") continue;
      const [a, b] = net.members;
      if (!a || !b) continue;
      edges.push({
        id: net.id,
        source: a,
        target: b,
        label: net.p2p.dataRate,
        selected: selection?.kind === "network" && selection.id === net.id,
        className: `p2p-edge${errorIds.has(net.id) ? " has-error" : ""}`,
      });
    }

    if (showParentLinks) {
      // Reverse of rplAddrs: an address resolves back to whichever node
      // index reported it, so a snapshot's preferredParent (an address) can
      // be drawn as an edge to that node.
      const nodeByAddr = new Map<string, number>();
      for (const [idx, addr] of Object.entries(rplAddrs)) {
        nodeByAddr.set(addr, Number(idx));
      }
      // Latest snapshot per node: an older one for a node no longer running
      // would draw a stale link once a newer sample exists for it.
      const latestByNode = new Map<number, (typeof rplSnapshots)[number]>();
      for (const snap of rplSnapshots) {
        const prior = latestByNode.get(snap.node);
        if (!prior || snap.time >= prior.time) latestByNode.set(snap.node, snap);
      }
      for (const snap of latestByNode.values()) {
        if (!snap.joined || !snap.preferredParent) continue;
        const parentIdx = nodeByAddr.get(snap.preferredParent);
        const childId = scenario.nodes[snap.node]?.id;
        const parentId = parentIdx !== undefined ? scenario.nodes[parentIdx]?.id : undefined;
        if (!childId || !parentId || childId === parentId) continue;
        edges.push({
          id: `parent-link-${childId}`,
          source: childId,
          target: parentId,
          className: "parent-link-edge",
          animated: true,
        });
      }
    }
    return edges;
  }, [scenario, selection, errorIds, showParentLinks, rplSnapshots, rplAddrs]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          moveElement(change.id, change.position.x, change.position.y);
        }
      }
    },
    [moveElement],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      const isSegment = (id: string) => scenario.networks.some((n) => n.id === id);
      if (isSegment(conn.source) && !isSegment(conn.target)) {
        addMember(conn.source, conn.target);
      } else if (!isSegment(conn.source) && isSegment(conn.target)) {
        addMember(conn.target, conn.source);
      } else if (!isSegment(conn.source) && !isSegment(conn.target)) {
        addP2p(conn.source, conn.target);
      }
    },
    [scenario, addP2p, addMember],
  );

  const onDelete = useCallback(
    ({ nodes, edges }: { nodes: RFNode[]; edges: Edge[] }) => {
      for (const n of nodes) {
        removeElement(n.id);
      }
      // Only p2p links are edges now, and a p2p edge's id is its network id.
      for (const e of edges) {
        removeElement(e.id);
      }
    },
    [removeElement],
  );

  const onContextMenu = useCallback((e: ReactMouseEvent, n: RFNode) => {
    e.preventDefault();
    setMenu({ kind: "element", id: n.id, x: e.clientX, y: e.clientY });
  }, []);

  const onPaneContextMenu = useCallback(
    (e: ReactMouseEvent | MouseEvent) => {
      e.preventDefault();
      const point = "clientX" in e ? e : (e as MouseEvent);
      const flow = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      setMenu({ kind: "pane", x: point.clientX, y: point.clientY, flowX: flow.x, flowY: flow.y });
    },
    [screenToFlowPosition],
  );

  return (
    <>
      {isEmpty && <EmptyState />}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onDelete={onDelete}
        onNodeClick={(_, n) =>
          select(
            scenario.networks.some((net) => net.id === n.id)
              ? { kind: "network", id: n.id }
              : { kind: "node", id: n.id },
          )
        }
        onNodeContextMenu={onContextMenu}
        onEdgeClick={(_, e) => select({ kind: "network", id: e.id })}
        onPaneClick={() => {
          select(null);
          setMenu(null);
        }}
        onPaneContextMenu={onPaneContextMenu}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        <Panel position="top-right" className="canvas-toggles">
          {hasRadioSegment && (
            <label>
              <input type="checkbox" checked={showRadioRange} onChange={toggleRadioRange} />
              通信範囲を表示 (LR-WPAN / WiFi)
            </label>
          )}
          <label>
            <input type="checkbox" checked={showNodeIds} onChange={toggleNodeIds} />
            ノード ID を表示
          </label>
          {scenario.stack.routing === "rpl" && rplSnapshots.length > 0 && (
            <label>
              <input type="checkbox" checked={showParentLinks} onChange={toggleParentLinks} />
              RPL 親リンクを重ねる
            </label>
          )}
          <button className="help-btn" onClick={() => setShowHelp(true)} title="操作ガイド (?)">
            ?
          </button>
        </Panel>
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.type === "segment" ? "#d8c9a3" : "#4f9d69")}
          nodeStrokeColor={(n) => (n.type === "segment" ? "#b0a074" : "#2e7d32")}
          nodeStrokeWidth={3}
        />
        <Controls />
      </ReactFlow>
      {menu && (
        <ContextMenu
          target={menu}
          onClose={() => setMenu(null)}
          onAddNode={(x, y) => addNode(x, y)}
          onAddSegment={(type, x, y) => addSegment(type, x, y)}
        />
      )}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      <Toasts />
    </>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
