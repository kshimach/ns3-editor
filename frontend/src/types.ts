// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

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
  /** RFC 6550 Mode of Operation: Non-storing (SRH downward) or Storing. */
  mop: "non-storing" | "storing";
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
  /** RFC 9854 'S' flag inverted: false=symmetric (S=1), true=asymmetric (S=0). */
  aodvForceAsymmetric: boolean;
  /**
   * P2P-RPL (RFC 6997) route-discovery tuning, mirrored from the defaults
   * on rpl::RplRoutingProtocol's own TypeId (contrib/rpl). Only rendered
   * into rplHelper.Set(...) calls when the scenario has a p2pDiscover app.
   */
  p2pDioIntervalMin: number;
  p2pDioIntervalDoublings: number;
  p2pDioRedundancy: number;
  p2pMaxRank: number;
  p2pLifetime: number;
  p2pDroAckRequested: boolean;
  p2pDroAckWaitTime: number;
  /** RFC 6997 section 9.5's 'N': 0 = single route, 1-3 = also collect that many alternates. */
  p2pNumRoutes: number;
  p2pDroCollectWindow: number;
  p2pDroMaxRetransmissions: number;
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
  /** DiscoverRoute()'s hopByHop: false=H=0 Source Route, true=H=1. */
  hopByHop: boolean;
}

export interface P2pDiscoverApp {
  type: "p2pDiscover";
  id: string;
  from: string;
  to: string;
  start: number;
  /** DiscoverP2pRoute()'s hopByHop: false=H=0 Source Route, true=H=1. */
  hopByHop: boolean;
}

export type App = PingApp | UdpEchoApp | OnOffApp | AodvDiscoverApp | P2pDiscoverApp;

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

/** An AODV-RPL (RFC 9854) route this node discovered via DiscoverRoute(). */
export interface RplAodvRouteEntry {
  target: string;
  /** Every hop from this node outward, the target last. */
  hops: string[];
  rreqInstance: number;
  expiresIn: number;
}

/** A P2P-RPL (RFC 6997) route this node discovered via DiscoverP2pRoute(). */
export interface RplP2pRouteEntry {
  target: string;
  /** Every hop from this node outward, the target last. */
  hops: string[];
  instance: number;
  expiresIn: number;
}

/** A confirmed routing loop (RplRoutingProtocol's "RankErrorConfirmed" trace). */
export interface LoopEvent {
  node: number;
  time: number;
  instanceId: number;
}

/**
 * A downward route this node holds towards a descendant (Storing mode /
 * RFC 6550 MOP != 0 only -- empty in Non-storing, where only the root keeps
 * downward state, as `topology` above).
 */
export interface RplDownwardRouteEntry {
  target: string;
  nextHop: string;
  pathSequence: number;
  expiresIn: number | null;
}

/**
 * A node's own global IPv6 address, emitted by the generated code itself
 * (see scenario.cc.j2's DumpRplTables) rather than by contrib/rpl -- used
 * only to resolve `RplSnapshot.preferredParent` back to a node id for the
 * canvas's parent-link overlay.
 */
export interface RplAddr {
  node: number;
  address: string;
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
  /**
   * Independent of joined/topology above -- a node can hold AODV-RPL routes
   * whichever node discovered them, root or not. Source routing (H=0) keeps
   * no per-hop state, so only the origin of a discovery ever has an entry
   * for that target.
   */
  aodvRoutes: RplAodvRouteEntry[];
  /** P2P-RPL's own equivalent of aodvRoutes above, same H=0 caveat. */
  p2pRoutes: RplP2pRouteEntry[];
  /** Storing mode only (see RplDownwardRouteEntry); empty under Non-storing. */
  downwardRoutes: RplDownwardRouteEntry[];
}

export function defaultRplConfig(id: string): RplConfig {
  return {
    id,
    root: "",
    ocp: "of0",
    enableLql: false,
    mop: "non-storing",
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
    aodvForceAsymmetric: false,
    p2pDioIntervalMin: 0.064,
    p2pDioIntervalDoublings: 4,
    p2pDioRedundancy: 1,
    p2pMaxRank: 8,
    p2pLifetime: 2,
    p2pDroAckRequested: true,
    p2pDroAckWaitTime: 1,
    p2pDroMaxRetransmissions: 3,
    p2pNumRoutes: 0,
    p2pDroCollectWindow: 0.256,
  };
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
      rpl: [defaultRplConfig("rpl0")],
    },
    apps: [],
  };
}

/** Japanese display name for each app kind, used wherever a type is shown to the user. */
export const APP_LABELS: Record<App["type"], string> = {
  ping: "Ping",
  udpEcho: "UDP Echo",
  onoff: "OnOff",
  aodvDiscover: "AODV-RPL 探索",
  p2pDiscover: "P2P-RPL 探索",
};

/** Friendly form of the raw 802.11 standard tokens used by WifiParams.standard. */
export const WIFI_STANDARD_LABELS: Record<string, string> = {
  "80211a": "802.11a",
  "80211b": "802.11b",
  "80211g": "802.11g",
  "80211n": "802.11n",
  "80211ac": "802.11ac",
  "80211ax": "802.11ax",
};

export const NETWORK_LABELS: Record<NetworkType, string> = {
  p2p: "P2P リンク",
  csma: "CSMA (有線バス)",
  wifiAdhoc: "WiFi アドホック",
  wifiInfra: "WiFi インフラ (AP)",
  lrwpan: "LR-WPAN (6LoWPAN)",
};
