// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { Handle, Position } from "@xyflow/react";

import { NetworkType } from "../types";
import { CrownIcon, UnconnectedIcon, WiredIcon, WirelessIcon } from "./icons";

/** One shared segment this node belongs to. */
export interface DeviceBadge {
  id: string;
  type: NetworkType;
}

const WIRELESS_TYPES: NetworkType[] = ["lrwpan", "wifiAdhoc", "wifiInfra"];

function iconFor(badges: DeviceBadge[]) {
  if (badges.some((b) => WIRELESS_TYPES.includes(b.type))) return <WirelessIcon />;
  if (badges.length > 0) return <WiredIcon />;
  return <UnconnectedIcon />;
}

export function DeviceNode({
  data,
  selected,
}: {
  data: {
    label: string;
    badges?: DeviceBadge[];
    rangePx?: number | null;
    isRoot?: boolean;
    issues?: string[];
    hasWarning?: boolean;
    hasError?: boolean;
    pulsing?: boolean;
  };
  selected?: boolean;
}) {
  const badges = data.badges ?? [];
  const range = data.rangePx;
  const title = data.issues && data.issues.length > 0 ? data.issues.join("\n") : undefined;
  return (
    <div
      className={`device-node${selected ? " selected" : ""}${data.hasError ? " has-error" : ""}${data.hasWarning ? " has-warning" : ""}${data.pulsing ? " pulsing" : ""}`}
      title={title}
    >
      <Handle type="target" position={Position.Top} title="ドラッグでセグメントに接続" />
      <div className="device-icon-wrap">
        {/*
          Anchored to the icon itself (44x44), not the wider label/badge
          column below it, so the ring stays centred on the node regardless
          of how tall its label or badge row happens to be. Absolutely
          positioned and non-interactive, so a ring hundreds of pixels wide
          never grows the node's own hit area or hides a neighbour under it
          from clicks/drags -- only from view, which is the point.
        */}
        {range !== null && range !== undefined && (
          <div className="radio-range" style={{ width: range * 2, height: range * 2 }} />
        )}
        {data.isRoot && (
          <div className="root-badge" title="DODAG root">
            <CrownIcon />
          </div>
        )}
        <div className="device-icon">{iconFor(badges)}</div>
      </div>
      <div className="device-label">{data.label}</div>
      {/* Membership is shown here instead of as a spoke drawn to the hub. */}
      {badges.length > 0 && (
        <div className="device-badges">
          {badges.map((b) => (
            <span key={b.id} className={`badge seg-${b.type}`}>
              {b.id}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} title="ドラッグで P2P リンク / セグメントに接続" />
    </div>
  );
}
