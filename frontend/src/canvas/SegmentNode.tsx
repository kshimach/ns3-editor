// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { Handle, Position } from "@xyflow/react";

const SHORT: Record<string, string> = {
  csma: "CSMA",
  wifiAdhoc: "WiFi",
  wifiInfra: "AP",
  lrwpan: "PAN",
};

export function SegmentNode({
  data,
  selected,
}: {
  data: { label: string; segType: string };
  selected?: boolean;
}) {
  return (
    <div className={`segment-node seg-${data.segType}${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="segment-kind">{SHORT[data.segType] ?? data.segType}</div>
      <div className="segment-label">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
