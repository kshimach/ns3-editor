import {
  Background,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node as RFNode,
  NodeChange,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo } from "react";

import { useEditor } from "../store";
import { DeviceNode } from "./DeviceNode";
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
  const updateNetwork = useEditor((s) => s.updateNetwork);

  const errorIds = useMemo(
    () => new Set(issues.filter((i) => i.level === "error").map((i) => i.elementId)),
    [issues],
  );

  const rfNodes: RFNode[] = useMemo(() => {
    const devices: RFNode[] = scenario.nodes.map((n) => ({
      id: n.id,
      type: "device",
      position: { x: n.x, y: n.y },
      data: { label: n.name || n.id },
      selected: selection?.kind === "node" && selection.id === n.id,
      className: errorIds.has(n.id) ? "has-error" : undefined,
    }));
    const segments: RFNode[] = scenario.networks
      .filter((n) => n.type !== "p2p")
      .map((n) => ({
        id: n.id,
        type: "segment",
        position: { x: n.x, y: n.y },
        data: { label: n.id, segType: n.type },
        selected: selection?.kind === "network" && selection.id === n.id,
        className: errorIds.has(n.id) ? "has-error" : undefined,
      }));
    return [...devices, ...segments];
  }, [scenario, selection, errorIds]);

  const rfEdges: Edge[] = useMemo(() => {
    const scale = scenario.simulation.scale;
    const byId = new Map(scenario.nodes.map((n) => [n.id, n]));
    const edges: Edge[] = [];
    for (const net of scenario.networks) {
      if (net.type === "p2p") {
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
      } else {
        const wireless = net.type === "wifiAdhoc" || net.type === "wifiInfra" || net.type === "lrwpan";
        for (const m of net.members) {
          const dev = byId.get(m);
          // Wireless: what matters physically is the inter-node distance, but
          // labelling each spoke with hub distance is misleading, so show the
          // distance on the spoke only as a rough placement aid.
          const dist =
            wireless && dev
              ? Math.round(Math.hypot((dev.x - net.x) * scale, (dev.y - net.y) * scale))
              : null;
          edges.push({
            id: `m:${net.id}:${m}`,
            source: m,
            target: net.id,
            label: dist !== null ? `${dist}m` : undefined,
            className: "member-edge",
          });
        }
      }
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
      for (const e of edges) {
        if (e.id.startsWith("m:")) {
          const [, netId, nodeId] = e.id.split(":");
          const net = scenario.networks.find((n) => n.id === netId);
          if (net) {
            updateNetwork(netId, { members: net.members.filter((m) => m !== nodeId) });
          }
        } else {
          removeElement(e.id); // p2p edge id == network id
        }
      }
    },
    [scenario, removeElement, updateNetwork],
  );

  return (
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
      onEdgeClick={(_, e) => {
        if (!e.id.startsWith("m:")) {
          select({ kind: "network", id: e.id });
        }
      }}
      onPaneClick={() => select(null)}
      fitView
      deleteKeyCode={["Backspace", "Delete"]}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} />
      <MiniMap pannable zoomable />
      <Controls />
    </ReactFlow>
  );
}
