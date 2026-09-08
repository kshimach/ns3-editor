// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { create } from "zustand";

import {
  App,
  Issue,
  LoopEvent,
  Network,
  NetworkType,
  RplAddr,
  RplConfig,
  RplSnapshot,
  Scenario,
  ScenarioNode,
  defaultNetwork,
  defaultScenario,
} from "./types";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "network"; id: string }
  | { kind: "app"; id: string }
  | null;

/** A short-lived notice about a side effect the user didn't directly ask for. */
export interface Toast {
  id: number;
  message: string;
}

/** Which tab the right-hand inspector panel shows. */
export type RightTab = "element" | "settings" | "rpl";

/** Which tab the bottom drawer shows. */
export type BottomTab = "issues" | "code" | "log" | "rpl";

interface EditorState {
  scenario: Scenario;
  selection: Selection;
  issues: Issue[];
  counter: number;
  /** Right-panel tab. Switches automatically when the canvas selection changes. */
  rightTab: RightTab;
  /** Bottom-drawer tab. Switches automatically on run/validation events. */
  bottomTab: BottomTab;
  /** Whether the bottom drawer is collapsed to its tab strip. */
  bottomCollapsed: boolean;
  /**
   * RPL table snapshots from the current run, in arrival order. Kept here
   * rather than inside RunView because the run's WebSocket lives there while
   * the tab that renders these is a sibling of it.
   */
  rplSnapshots: RplSnapshot[];
  /** Confirmed routing-loop events from the current run, in arrival order. */
  loopEvents: LoopEvent[];
  /**
   * Each node's own global IPv6 address, as reported by the run (see
   * scenario.cc.j2's DumpRplTables). Used only to resolve a snapshot's
   * preferredParent (an address) back to a node id, for the canvas's
   * parent-link overlay -- keyed by node index, last report wins.
   */
  rplAddrs: Record<number, string>;
  /**
   * Whether the canvas draws the approximate radio range ring around each
   * LR-WPAN/WiFi member node. Purely a view preference -- it affects nothing
   * the simulation does, so it lives here rather than on the scenario and is
   * not saved with it.
   */
  showRadioRange: boolean;
  /** Whether the canvas shows each node's raw id next to its name. View-only, not saved. */
  showNodeIds: boolean;
  /** Whether the canvas overlays each joined node's link to its preferred parent. */
  showParentLinks: boolean;
  /** Node index to visually pulse on the canvas (hovering a loop event row), or null. */
  pulsedNode: number | null;
  /** Notices about side effects the user didn't directly trigger (auto-join, IPv6 switch). */
  toasts: Toast[];
  /**
   * JSON of the scenario as of the last save/load, or null before the first
   * one. Compared against the live scenario to show the unsaved-changes dot;
   * kept as a plain string rather than a boolean so it survives being
   * derived at render time without an extra piece of state to keep in sync.
   */
  savedSnapshot: string | null;
  /** How many scenario edits can currently be undone / redone (for the toolbar buttons). */
  undoCount: number;
  redoCount: number;

  select: (sel: Selection) => void;
  setRightTab: (tab: RightTab) => void;
  setBottomTab: (tab: BottomTab) => void;
  toggleBottomCollapsed: () => void;
  setScenario: (s: Scenario) => void;
  setIssues: (issues: Issue[]) => void;
  updateScenario: (patch: Partial<Scenario>) => void;
  addRplSnapshot: (snapshot: RplSnapshot) => void;
  clearRplSnapshots: () => void;
  addLoopEvent: (event: LoopEvent) => void;
  clearLoopEvents: () => void;
  addRplAddr: (addr: RplAddr) => void;
  clearRplAddrs: () => void;
  toggleRadioRange: () => void;
  toggleNodeIds: () => void;
  toggleParentLinks: () => void;
  setPulsedNode: (node: number | null) => void;

  addNode: (x: number, y: number) => void;
  addSegment: (type: Exclude<NetworkType, "p2p">, x: number, y: number) => void;
  addP2p: (a: string, b: string) => void;
  addMember: (networkId: string, nodeId: string) => void;
  removeMember: (networkId: string, nodeId: string) => void;
  moveElement: (id: string, x: number, y: number) => void;
  removeElement: (id: string) => void;
  updateNode: (id: string, patch: Partial<ScenarioNode>) => void;
  updateNetwork: (id: string, patch: Partial<Network>) => void;
  addApp: (app: App) => void;
  updateApp: (id: string, patch: Partial<App>) => void;
  removeApp: (id: string) => void;
  addRplInstance: (instance: RplConfig) => void;
  updateRplInstance: (id: string, patch: Partial<RplConfig>) => void;
  removeRplInstance: (id: string) => void;
  setDodagRoot: (nodeId: string) => void;

  pushToast: (message: string) => void;
  dismissToast: (id: number) => void;

  markSaved: () => void;
  undo: () => void;
  redo: () => void;
}

let nextId = 0;

/** Shared segments (everything but p2p) are the ones a node "joins". */
const sharedSegments = (scenario: Scenario) => scenario.networks.filter((n) => n.type !== "p2p");

// --- undo/redo history ---
//
// Kept as plain module-level arrays rather than in the zustand state itself:
// every entry is a whole past Scenario, and pushing one on every edit would
// mean every edit re-renders every undoCount/redoCount consumer twice (once
// for the edit, once for the history bookkeeping) for a number nothing
// outside the toolbar's two buttons needs at fine granularity. The reactive
// undoCount/redoCount fields below are only updated (via a normal `set`)
// when the *count* actually changes, which is what the toolbar renders from.
//
// A history entry is *not* pushed on every scenario change immediately --
// changes within HISTORY_DEBOUNCE_MS of each other are coalesced into one
// entry (dated from the start of the burst). This is what turns a node drag
// (dozens of moveElement calls while the mouse moves) or a burst of
// keystrokes in a text field into a single undo step, without Canvas or any
// input needing to know about history at all.
const HISTORY_DEBOUNCE_MS = 500;
const HISTORY_LIMIT = 50;
let historyPast: Scenario[] = [];
let historyFuture: Scenario[] = [];
let pendingBaseline: Scenario | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let suppressHistory = false;

function syncHistoryCounts(set: (patch: Partial<EditorState>) => void) {
  set({ undoCount: historyPast.length, redoCount: historyFuture.length });
}

function resetHistory(set: (patch: Partial<EditorState>) => void) {
  window.clearTimeout(pendingTimer);
  historyPast = [];
  historyFuture = [];
  pendingBaseline = null;
  syncHistoryCounts(set);
}

const initialScenario = defaultScenario();

export const useEditor = create<EditorState>((set, get) => ({
  scenario: initialScenario,
  selection: null,
  issues: [],
  counter: 0,
  rightTab: "settings",
  bottomTab: "issues",
  bottomCollapsed: false,
  rplSnapshots: [],
  loopEvents: [],
  rplAddrs: {},
  showRadioRange: true,
  showNodeIds: false,
  showParentLinks: false,
  pulsedNode: null,
  toasts: [],
  // A never-edited, never-saved blank scenario is not "unsaved changes" --
  // only a real edit away from this exact snapshot should show the dot.
  savedSnapshot: JSON.stringify(initialScenario),
  undoCount: 0,
  redoCount: 0,

  select: (selection) =>
    set({
      selection,
      // A node/network selection is what the "要素" tab is for; selecting an
      // app is really a shortcut into its card on the "設定" tab, since apps
      // have no properties-panel view of their own.
      rightTab: selection === null ? get().rightTab : selection.kind === "app" ? "settings" : "element",
    }),
  setRightTab: (rightTab) => set({ rightTab }),
  setBottomTab: (bottomTab) => set({ bottomTab, bottomCollapsed: false }),
  toggleBottomCollapsed: () => set({ bottomCollapsed: !get().bottomCollapsed }),
  setScenario: (scenario) => {
    // Keep generated ids ahead of whatever the loaded scenario already uses.
    const used = [
      ...scenario.nodes,
      ...scenario.networks,
      ...scenario.apps,
      ...scenario.stack.rpl,
    ]
      .map((e) => /\d+$/.exec(e.id)?.[0])
      .filter(Boolean)
      .map(Number);
    nextId = used.length ? Math.max(...used) + 1 : 0;
    // The snapshots are indexed by node number, which now means a different
    // node than it did: keeping them would label the old run's tables with
    // the new scenario's names. Same reasoning for loopEvents.
    set({
      scenario,
      selection: null,
      issues: [],
      rplSnapshots: [],
      loopEvents: [],
      rplAddrs: {},
      savedSnapshot: JSON.stringify(scenario),
    });
    resetHistory(set);
  },
  setIssues: (issues) => set({ issues }),
  updateScenario: (patch) => set({ scenario: { ...get().scenario, ...patch } }),
  addRplSnapshot: (snapshot) => set({ rplSnapshots: [...get().rplSnapshots, snapshot] }),
  clearRplSnapshots: () => set({ rplSnapshots: [] }),
  addLoopEvent: (event) => set({ loopEvents: [...get().loopEvents, event] }),
  clearLoopEvents: () => set({ loopEvents: [] }),
  addRplAddr: (addr) => set({ rplAddrs: { ...get().rplAddrs, [addr.node]: addr.address } }),
  clearRplAddrs: () => set({ rplAddrs: {} }),
  toggleRadioRange: () => set({ showRadioRange: !get().showRadioRange }),
  toggleNodeIds: () => set({ showNodeIds: !get().showNodeIds }),
  toggleParentLinks: () => set({ showParentLinks: !get().showParentLinks }),
  setPulsedNode: (pulsedNode) => set({ pulsedNode }),

  pushToast: (message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message }] });
    setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  addNode: (x, y) => {
    const id = `n${nextId++}`;
    const { scenario } = get();
    // With exactly one shared segment there is no ambiguity about where a new
    // node belongs, so join it instead of leaving an orphan that the user has
    // to wire up by hand (and that fails validation until they do).
    const shared = sharedSegments(scenario);
    const joinId = shared.length === 1 ? shared[0].id : null;
    set({
      scenario: {
        ...scenario,
        nodes: [...scenario.nodes, { id, name: id, x, y }],
        networks: joinId
          ? scenario.networks.map((n) =>
              n.id === joinId ? { ...n, members: [...n.members, id] } : n,
            )
          : scenario.networks,
      },
      selection: { kind: "node", id },
    });
    if (joinId) {
      get().pushToast(`${id} を ${joinId} に参加させました`);
    }
  },

  addSegment: (type, x, y) => {
    const id = `net${nextId++}`;
    const { scenario } = get();
    const net = defaultNetwork(id, type, x, y);
    // Absorb every node that is not already on a shared segment: putting all
    // the nodes on one PAN is the common case and should need no dragging.
    // Nodes already on another segment keep that membership, so a second PAN
    // starts empty and is filled from the node context menu.
    const attached = new Set(sharedSegments(scenario).flatMap((n) => n.members));
    net.members = scenario.nodes.filter((n) => !attached.has(n.id)).map((n) => n.id);
    // 6LoWPAN only runs over IPv6, so adopt it instead of leaving a scenario
    // that cannot generate. Global routing is IPv4-only and would just trade
    // one error for another; static is the neutral landing spot, which leaves
    // RPL an explicit choice rather than something picked behind the user's
    // back (it would also need a DODAG root).
    const stack =
      type === "lrwpan"
        ? {
            ...scenario.stack,
            ip: "ipv6" as const,
            routing:
              scenario.stack.routing === "global"
                ? ("static" as const)
                : scenario.stack.routing,
          }
        : scenario.stack;
    set({
      scenario: { ...scenario, networks: [...scenario.networks, net], stack },
      selection: { kind: "network", id },
    });
    if (net.members.length > 0) {
      get().pushToast(`${net.members.length} 個の未所属ノードを ${id} に参加させました`);
    }
    if (type === "lrwpan" && scenario.stack.ip !== "ipv6") {
      get().pushToast("LR-WPAN 追加のため IP スタックを IPv6 に切り替えました");
    }
  },

  addP2p: (a, b) => {
    if (a === b) return;
    const { scenario } = get();
    const exists = scenario.networks.some(
      (n) => n.type === "p2p" && n.members.includes(a) && n.members.includes(b),
    );
    if (exists) return;
    const id = `net${nextId++}`;
    const net = defaultNetwork(id, "p2p", 0, 0);
    net.members = [a, b];
    set({
      scenario: { ...scenario, networks: [...scenario.networks, net] },
      selection: { kind: "network", id },
    });
  },

  addMember: (networkId, nodeId) => {
    const { scenario } = get();
    set({
      scenario: {
        ...scenario,
        networks: scenario.networks.map((n) =>
          n.id === networkId && !n.members.includes(nodeId)
            ? { ...n, members: [...n.members, nodeId] }
            : n,
        ),
      },
    });
  },

  removeMember: (networkId, nodeId) => {
    const { scenario } = get();
    set({
      scenario: {
        ...scenario,
        networks: scenario.networks.map((n) =>
          n.id === networkId
            ? {
                ...n,
                members: n.members.filter((m) => m !== nodeId),
                // A node that just left cannot go on being this network's AP.
                wifi: n.wifi.apNode === nodeId ? { ...n.wifi, apNode: null } : n.wifi,
              }
            : n,
        ),
      },
    });
  },

  moveElement: (id, x, y) => {
    const { scenario } = get();
    set({
      scenario: {
        ...scenario,
        nodes: scenario.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
        networks: scenario.networks.map((n) => (n.id === id ? { ...n, x, y } : n)),
      },
    });
  },

  removeElement: (id) => {
    const { scenario, selection } = get();
    const isNode = scenario.nodes.some((n) => n.id === id);
    set({
      scenario: {
        ...scenario,
        nodes: scenario.nodes.filter((n) => n.id !== id),
        networks: scenario.networks
          .filter((n) => n.id !== id)
          // Drop the removed node from memberships; a p2p link missing an
          // endpoint is meaningless, so drop it entirely.
          .map((n) => (isNode ? { ...n, members: n.members.filter((m) => m !== id) } : n))
          .filter((n) => n.type !== "p2p" || n.members.length === 2),
        apps: scenario.apps.filter(
          (a) =>
            !Object.values(a)
              .filter((v): v is string => typeof v === "string")
              .includes(id),
        ),
      },
      selection: selection?.id === id ? null : selection,
    });
  },

  updateNode: (id, patch) => {
    const { scenario } = get();
    set({
      scenario: {
        ...scenario,
        nodes: scenario.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      },
    });
  },

  updateNetwork: (id, patch) => {
    const { scenario } = get();
    set({
      scenario: {
        ...scenario,
        networks: scenario.networks.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      },
    });
  },

  addApp: (app) => {
    const { scenario } = get();
    set({
      scenario: { ...scenario, apps: [...scenario.apps, app] },
      selection: { kind: "app", id: app.id },
    });
  },

  updateApp: (id, patch) => {
    const { scenario } = get();
    set({
      scenario: {
        ...scenario,
        apps: scenario.apps.map((a) => (a.id === id ? ({ ...a, ...patch } as App) : a)),
      },
    });
  },

  removeApp: (id) => {
    const { scenario, selection } = get();
    set({
      scenario: { ...scenario, apps: scenario.apps.filter((a) => a.id !== id) },
      selection: selection?.id === id ? null : selection,
    });
  },

  addRplInstance: (instance) => {
    const { scenario } = get();
    set({
      scenario: {
        ...scenario,
        stack: { ...scenario.stack, rpl: [...scenario.stack.rpl, instance] },
      },
    });
  },

  updateRplInstance: (id, patch) => {
    const { scenario } = get();
    set({
      scenario: {
        ...scenario,
        stack: {
          ...scenario.stack,
          rpl: scenario.stack.rpl.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        },
      },
    });
  },

  removeRplInstance: (id) => {
    const { scenario } = get();
    set({
      scenario: {
        ...scenario,
        stack: { ...scenario.stack, rpl: scenario.stack.rpl.filter((r) => r.id !== id) },
      },
    });
  },

  setDodagRoot: (nodeId) => {
    const { scenario } = get();
    if (scenario.stack.rpl.length === 0) return;
    set({
      scenario: {
        ...scenario,
        stack: {
          ...scenario.stack,
          rpl: scenario.stack.rpl.map((r, i) => (i === 0 ? { ...r, root: nodeId } : r)),
        },
      },
    });
  },

  markSaved: () => set({ savedSnapshot: JSON.stringify(get().scenario) }),

  undo: () => {
    // A burst still mid-debounce counts as one more step to go back to: flush
    // it into history immediately rather than letting undo silently miss it.
    if (pendingBaseline !== null) {
      window.clearTimeout(pendingTimer);
      historyPast.push(pendingBaseline);
      pendingBaseline = null;
    }
    const prev = historyPast.pop();
    if (!prev) return;
    historyFuture.push(get().scenario);
    suppressHistory = true;
    set({ scenario: prev, selection: null });
    suppressHistory = false;
    syncHistoryCounts(set);
  },

  redo: () => {
    const next = historyFuture.pop();
    if (!next) return;
    historyPast.push(get().scenario);
    suppressHistory = true;
    set({ scenario: next, selection: null });
    suppressHistory = false;
    syncHistoryCounts(set);
  },
}));

// Coalesces scenario edits that land within HISTORY_DEBOUNCE_MS of each
// other into a single undo step -- see the comment above historyPast.
useEditor.subscribe((state, prevState) => {
  if (state.scenario === prevState.scenario || suppressHistory) return;
  if (pendingBaseline === null) {
    pendingBaseline = prevState.scenario;
  }
  window.clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    if (pendingBaseline !== null) {
      historyPast.push(pendingBaseline);
      if (historyPast.length > HISTORY_LIMIT) historyPast.shift();
      historyFuture = [];
      pendingBaseline = null;
      syncHistoryCounts(useEditor.setState);
    }
  }, HISTORY_DEBOUNCE_MS);
});

export function freshAppId(): string {
  return `app${nextId++}`;
}

export function freshRplId(): string {
  return `rpl${nextId++}`;
}
