import { create } from "zustand";

import {
  App,
  Issue,
  Network,
  NetworkType,
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

  select: (sel: Selection) => void;
  setScenario: (s: Scenario) => void;
  setIssues: (issues: Issue[]) => void;
  updateScenario: (patch: Partial<Scenario>) => void;

  addNode: (x: number, y: number) => void;
  addSegment: (type: Exclude<NetworkType, "p2p">, x: number, y: number) => void;
  addP2p: (a: string, b: string) => void;
  addMember: (networkId: string, nodeId: string) => void;
  moveElement: (id: string, x: number, y: number) => void;
  removeElement: (id: string) => void;
  updateNode: (id: string, patch: Partial<ScenarioNode>) => void;
  updateNetwork: (id: string, patch: Partial<Network>) => void;
  addApp: (app: App) => void;
  updateApp: (id: string, patch: Partial<App>) => void;
  removeApp: (id: string) => void;
}

let nextId = 0;

export const useEditor = create<EditorState>((set, get) => ({
  scenario: defaultScenario(),
  selection: null,
  issues: [],
  counter: 0,

  select: (selection) => set({ selection }),
  setScenario: (scenario) => {
    // Keep generated ids ahead of whatever the loaded scenario already uses.
    const used = [...scenario.nodes, ...scenario.networks, ...scenario.apps]
      .map((e) => /\d+$/.exec(e.id)?.[0])
      .filter(Boolean)
      .map(Number);
    nextId = used.length ? Math.max(...used) + 1 : 0;
    set({ scenario, selection: null, issues: [] });
  },
  setIssues: (issues) => set({ issues }),
  updateScenario: (patch) => set({ scenario: { ...get().scenario, ...patch } }),

  addNode: (x, y) => {
    const id = `n${nextId++}`;
    const { scenario } = get();
    set({
      scenario: {
        ...scenario,
        nodes: [...scenario.nodes, { id, name: id, x, y }],
      },
      selection: { kind: "node", id },
    });
  },

  addSegment: (type, x, y) => {
    const id = `net${nextId++}`;
    const { scenario } = get();
    set({
      scenario: { ...scenario, networks: [...scenario.networks, defaultNetwork(id, type, x, y)] },
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
