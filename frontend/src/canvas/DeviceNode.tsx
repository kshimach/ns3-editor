import { Handle, Position } from "@xyflow/react";

import { NetworkType } from "../types";

/** One shared segment this node belongs to. */
export interface DeviceBadge {
  id: string;
  type: NetworkType;
}

export function DeviceNode({
  data,
  selected,
}: {
  data: { label: string; badges?: DeviceBadge[]; lrwpanRangePx?: number | null };
  selected?: boolean;
}) {
  const badges = data.badges ?? [];
  const range = data.lrwpanRangePx;
  return (
    <div className={`device-node${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
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
          <div
            className="lrwpan-range"
            style={{ width: range * 2, height: range * 2 }}
          />
        )}
        <div className="device-icon">PC</div>
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
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
