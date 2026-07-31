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
  data: { label: string; badges?: DeviceBadge[] };
  selected?: boolean;
}) {
  const badges = data.badges ?? [];
  return (
    <div className={`device-node${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="device-icon">PC</div>
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
