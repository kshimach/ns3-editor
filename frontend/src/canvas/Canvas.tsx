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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MouseEvent as ReactMouseEvent, useCallback, useMemo, useState } from "react";

import { useEditor } from "../store";
import { ContextMenu, MenuTarget } from "./ContextMenu";
import { DeviceNode } from "./DeviceNode";
import { lrWpanRangeMeters } from "./lrwpanRange";
import { SegmentNode } from "./SegmentNode";

const nodeTypes = { device: DeviceNode, segment: SegmentNode };

export function Canvas() {
  const scenario = useEditor((s) => s.scenario);
  const selection = useEditor((s) => s.selection);
  const issues = useEditor((s) => s.issues);
  const select = useEditor((s) => s.select);
  const moveElement = useEditor((s) => s.moveElement);
  const removeElement = useEditor((s) => s.removeElement);
  const addP2p = useEditor((s) => s.addP2p);
  const addMember = useEditor((s) => s.addMember);
  const showLrWpanRange = useEditor((s) => s.showLrWpanRange);
  const toggleLrWpanRange = useEditor((s) => s.toggleLrWpanRange);

  const [menu, setMenu] = useState<MenuTarget | null>(null);

  const hasLrWpan = useMemo(
    () => scenario.networks.some((n) => n.type === "lrwpan"),
    [scenario.networks],
  );

  const errorIds = useMemo(
    () => new Set(issues.filter((i) => i.level === "error").map((i) => i.elementId)),
    [issues],
  );

  const rfNodes: RFNode[] = useMemo(() => {
    const scale = scenario.simulation.scale || 1;
    const devices: RFNode[] = scenario.nodes.map((n) => {
      const lrwpanMemberships = scenario.networks.filter(
        (net) => net.type === "lrwpan" && net.members.includes(n.id),
      );
      // A node joining more than one PAN is not something the editor steers
      // anyone towards, but nothing rules it out either; the widest ring is
      // the one that actually bounds where this node can be heard from.
      const lrwpanRangePx =
        showLrWpanRange && lrwpanMemberships.length > 0
          ? Math.max(
              ...lrwpanMemberships.map((net) => lrWpanRangeMeters(net.lrwpan.lossModel) / scale),
            )
          : null;
      return {
        id: n.id,
        type: "device",
        position: { x: n.x, y: n.y },
        data: {
          label: n.name || n.id,
          // Shown on the node in place of a spoke drawn to the segment hub.
          badges: scenario.networks
            .filter((net) => net.type !== "p2p" && net.members.includes(n.id))
            .map((net) => ({ id: net.id, type: net.type })),
          lrwpanRangePx,
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
        data: { label: n.id, segType: n.type },
        selected: selection?.kind === "network" && selection.id === n.id,
        className: errorIds.has(n.id) ? "has-error" : undefined,
        width: 70,
        height: 50,
      }));
    return [...devices, ...segments];
  }, [scenario, selection, errorIds, showLrWpanRange]);

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
    return edges;
  }, [scenario, selection, errorIds]);

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
    setMenu({ id: n.id, x: e.clientX, y: e.clientY });
  }, []);

  return (
    <>
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
        onPaneContextMenu={(e) => {
          e.preventDefault();
          setMenu(null);
        }}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        {hasLrWpan && (
          <Panel position="top-right" className="lrwpan-range-toggle">
            <label>
              <input
                type="checkbox"
                checked={showLrWpanRange}
                onChange={toggleLrWpanRange}
              />
              LR-WPAN 通信範囲を表示
            </label>
          </Panel>
        )}
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.type === "segment" ? "#d8c9a3" : "#4f9d69")}
          nodeStrokeColor={(n) => (n.type === "segment" ? "#b0a074" : "#2e7d32")}
          nodeStrokeWidth={3}
        />
        <Controls />
      </ReactFlow>
      {menu && <ContextMenu target={menu} onClose={() => setMenu(null)} />}
    </>
  );
}
