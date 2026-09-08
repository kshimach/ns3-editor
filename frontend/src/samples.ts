// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

/**
 * Human-readable descriptions for the sample scenarios shipped in
 * scenarios/*.json. The backend has no description field on Scenario and
 * GET /api/scenarios returns only {file, name}, so these live here, keyed
 * by the scenario's file stem (see docs/MANUAL.md's sample list, which this
 * mirrors).
 */
export interface SampleInfo {
  title: string;
  description: string;
  nodes: number;
  routing: "IPv4" | "RPL";
}

export const SAMPLE_DESCRIPTIONS: Record<string, SampleInfo> = {
  "wifi-adhoc-ping": {
    title: "WiFi アドホック",
    description: "IPv4 の WiFi アドホック 2 ノードで Ping。もっとも単純な構成",
    nodes: 2,
    routing: "IPv4",
  },
  "rpl-line": {
    title: "RPL 直列 3 ノード",
    description: "LR-WPAN 3 ノードを一直線に配置した RPL (MRHOF+LQL)。DODAG の基本形",
    nodes: 3,
    routing: "RPL",
  },
  "rpl-mesh": {
    title: "RPL メッシュ 5 ノード",
    description: "LR-WPAN 5 ノードのメッシュ (隣接 50m)。DODAG がきちんと収束する配置の実例",
    nodes: 5,
    routing: "RPL",
  },
  "rpl-aodv-mesh": {
    title: "AODV-RPL 経路探索",
    description:
      "rpl-mesh と同じ配置で AODV-RPL 探索を実行。base DODAG では root 経由 4 ホップの 2 ノード間が、直接 1 ホップの経路として見つかる",
    nodes: 5,
    routing: "RPL",
  },
  "rpl-p2p-mesh": {
    title: "P2P-RPL 経路探索",
    description: "rpl-aodv-mesh と同じ配置・同じ 2 ノード間を P2P-RPL で探索する版",
    nodes: 5,
    routing: "RPL",
  },
};
