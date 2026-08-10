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
  id: string;
  root: string;
  ocp: "of0" | "mrhof";
  enableLql: boolean;
  /**
   * Core RPL (RFC 6550) tuning, mirrored from the defaults on
   * rpl::RplRoutingProtocol's own TypeId (contrib/rpl). Only rendered into
   * rplHelper.Set(...) calls when a value differs from that default.
   */
  disInterval: number;
  dioIntervalMin: number;
  dioIntervalDoublings: number;
  dioRedundancy: number;
  minHopRankIncrease: number;
  daoInterval: number;
  daoAckTimeout: number;
  daoRetries: number;
  pathLifetime: number;
  /**
   * AODV-RPL (RFC 9854) route-discovery tuning, mirrored from the defaults
   * on rpl::RplRoutingProtocol's own TypeId (contrib/rpl). Only rendered
   * into rplHelper.Set(...) calls when the scenario has an aodvDiscover app.
   */
  aodvDioIntervalMin: number;
  aodvDioIntervalDoublings: number;
  aodvRankLimit: number;
  aodvLifetime: number;
  aodvRejoinReenable: number;
}

export interface StackConfig {
  ip: "ipv4" | "ipv6";
  routing: "global" | "static" | "rpl";
  /**
   * Only rpl[0] (the base DODAG instance) is actually wired into ns-3 by
   * codegen today: contrib/rpl has no API yet to join a second RPL
   * Instance. The list exists so multi-instance scenarios (AODV-RPL,
   * P2P-RPL) don't need another breaking schema change once that lands.
   */
  rpl: RplConfig[];
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

export interface AodvDiscoverApp {
  type: "aodvDiscover";
  id: string;
  from: string;
  to: string;
  start: number;
}

export type App = PingApp | UdpEchoApp | OnOffApp | AodvDiscoverApp;

export interface Simulation {
  duration: number;
  seed: number;
  scale: number;
  pcap: boolean;
  logComponents: string[];
  /** Seconds between RPL table snapshots; 0 takes one at the end of the run only. */
  rplTableInterval: number;
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

/**
 * One node's RPL state at one instant, as
 * RplRoutingProtocol::PrintRoutingTableJson() emits it.
 *
 * Every field is present on every snapshot; the ones the node's configuration
 * has nothing to say about carry null (path/link ETX under OF0, LQL when it
 * is disabled), so nothing here needs an existence check before it is read.
 */
export interface RplParentEntry {
  address: string;
  rank: number;
  interface: number;
  freshness: number;
  lastHeardAgo: number;
  linkEtx: number | null;
  pathEtx: number | null;
  lql: number | null;
}

export interface RplTopologyEntry {
  target: string;
  parent: string;
  pathSequence: number;
  /** null means the route was advertised with the infinite path lifetime. */
  expiresIn: number | null;
}

export interface RplSnapshot {
  node: number;
  time: number;
  role: "root" | "router";
  joined: boolean;
  dodagId: string | null;
  instance: number | null;
  version: number | null;
  ocp: "of0" | "mrhof" | null;
  rank: number | null;
  pathEtx: number | null;
  preferredParent: string | null;
  parents: RplParentEntry[];
  /** Only the root holds one in non-storing mode; empty everywhere else. */
  topology: RplTopologyEntry[];
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
    simulation: {
      duration: 100,
      seed: 1,
      scale: 1.0,
      pcap: false,
      logComponents: [],
      rplTableInterval: 10,
    },
    nodes: [],
    networks: [],
    stack: {
      ip: "ipv4",
      routing: "global",
      rpl: [
        {
          id: "rpl0",
          root: "",
          ocp: "of0",
          enableLql: false,
          disInterval: 30,
          dioIntervalMin: 4.096,
          dioIntervalDoublings: 8,
          dioRedundancy: 0,
          minHopRankIncrease: 128,
          daoInterval: 60,
          daoAckTimeout: 5,
          daoRetries: 3,
          pathLifetime: 30,
          aodvDioIntervalMin: 0.128,
          aodvDioIntervalDoublings: 4,
          aodvRankLimit: 8,
          aodvLifetime: 1,
          aodvRejoinReenable: 900,
        },
      ],
    },
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
