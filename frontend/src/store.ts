import { create } from "zustand";

import {
  App,
  Issue,
  Network,
  NetworkType,
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

interface EditorState {
  scenario: Scenario;
  selection: Selection;
  issues: Issue[];
  counter: number;
  /**
   * RPL table snapshots from the current run, in arrival order. Kept here
   * rather than inside RunView because the run's WebSocket lives there while
   * the tab that renders these is a sibling of it.
   */
  rplSnapshots: RplSnapshot[];
  /**
   * Whether the canvas draws the approximate radio range ring around each
   * LR-WPAN/WiFi member node. Purely a view preference -- it affects nothing
   * the simulation does, so it lives here rather than on the scenario and is
   * not saved with it.
   */
  showRadioRange: boolean;

  select: (sel: Selection) => void;
  setScenario: (s: Scenario) => void;
  setIssues: (issues: Issue[]) => void;
  updateScenario: (patch: Partial<Scenario>) => void;
  addRplSnapshot: (snapshot: RplSnapshot) => void;
  clearRplSnapshots: () => void;
  toggleRadioRange: () => void;

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
}

let nextId = 0;

/** Shared segments (everything but p2p) are the ones a node "joins". */
const sharedSegments = (scenario: Scenario) => scenario.networks.filter((n) => n.type !== "p2p");

export const useEditor = create<EditorState>((set, get) => ({
  scenario: defaultScenario(),
  selection: null,
  issues: [],
  counter: 0,
  rplSnapshots: [],
  showRadioRange: true,

  select: (selection) => set({ selection }),
  setScenario: (scenario) => {
    // Keep generated ids ahead of whatever the loaded scenario already uses.
    const used = [...scenario.nodes, ...scenario.networks, ...scenario.apps]
      .map((e) => /\d+$/.exec(e.id)?.[0])
      .filter(Boolean)
      .map(Number);
    nextId = used.length ? Math.max(...used) + 1 : 0;
    // The snapshots are indexed by node number, which now means a different
    // node than it did: keeping them would label the old run's tables with
    // the new scenario's names.
    set({ scenario, selection: null, issues: [], rplSnapshots: [] });
  },
  setIssues: (issues) => set({ issues }),
  updateScenario: (patch) => set({ scenario: { ...get().scenario, ...patch } }),
  addRplSnapshot: (snapshot) => set({ rplSnapshots: [...get().rplSnapshots, snapshot] }),
  clearRplSnapshots: () => set({ rplSnapshots: [] }),
  toggleRadioRange: () => set({ showRadioRange: !get().showRadioRange }),

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
}));

export function freshAppId(): string {
  return `app${nextId++}`;
}
