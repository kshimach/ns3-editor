// Mirror of backend/app/models.py. Keep the two in sync by hand for now.

export type NetworkType = "p2p" | "csma" | "wifiAdhoc" | "wifiInfra" | "lrwpan";

export interface ScenarioNode {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface Network {
  id: string;
  type: NetworkType;
  members: string[];
  x: number;
  y: number;
  p2p: { dataRate: string; delay: string };
  csma: { dataRate: string; delay: string };
  wifi: { standard: string; ssid: string; apNode: string | null };
  lrwpan: { panId: number; lossModel: string; errorModel: boolean | null };
}

export interface RplConfig {
  root: string;
  ocp: "of0" | "mrhof";
  enableLql: boolean;
}

export interface StackConfig {
  ip: "ipv4" | "ipv6";
  routing: "global" | "static" | "rpl";
  rpl: RplConfig;
}

export interface PingApp {
  type: "ping";
  id: string;
  from: string;
  to: string;
  start: number;
  stop: number | null;
  count: number;
  interval: number;
}

export interface UdpEchoApp {
  type: "udpEcho";
  id: string;
  server: string;
  client: string;
  port: number;
  start: number;
  stop: number | null;
  maxPackets: number;
  interval: number;
  packetSize: number;
}

export interface OnOffApp {
  type: "onoff";
  id: string;
  from: string;
  to: string;
  port: number;
  start: number;
  stop: number | null;
  dataRate: string;
  packetSize: number;
}

export type App = PingApp | UdpEchoApp | OnOffApp;

export interface Simulation {
  duration: number;
  seed: number;
  scale: number;
  pcap: boolean;
  logComponents: string[];
}

export interface Scenario {
  version: number;
  name: string;
  simulation: Simulation;
  nodes: ScenarioNode[];
  networks: Network[];
  stack: StackConfig;
  apps: App[];
}

export interface Issue {
  level: "error" | "warning";
  elementId: string | null;
  message: string;
}

export interface RunStatus {
  state: "idle" | "running" | "finished" | "stopped" | "failed";
  runId: string | null;
  exitCode: number | null;
  lineCount: number;
}

export function defaultNetwork(id: string, type: NetworkType, x: number, y: number): Network {
  return {
    id,
    type,
    members: [],
    x,
    y,
    p2p: { dataRate: "5Mbps", delay: "2ms" },
    csma: { dataRate: "100Mbps", delay: "6560ns" },
    wifi: { standard: "80211g", ssid: "ns3-ssid", apNode: null },
    lrwpan: { panId: 1, lossModel: "logDistance", errorModel: null },
  };
}

export function defaultScenario(): Scenario {
  return {
    version: 1,
    name: "scenario",
    simulation: { duration: 100, seed: 1, scale: 1.0, pcap: false, logComponents: [] },
    nodes: [],
    networks: [],
    stack: { ip: "ipv4", routing: "global", rpl: { root: "", ocp: "of0", enableLql: false } },
    apps: [],
  };
}

export const NETWORK_LABELS: Record<NetworkType, string> = {
  p2p: "P2P リンク",
  csma: "CSMA (有線バス)",
  wifiAdhoc: "WiFi アドホック",
  wifiInfra: "WiFi インフラ (AP)",
  lrwpan: "LR-WPAN (6LoWPAN)",
};
