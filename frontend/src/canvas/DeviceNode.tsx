import { Handle, Position } from "@xyflow/react";

export function DeviceNode({ data, selected }: { data: { label: string }; selected?: boolean }) {
  return (
    <div className={`device-node${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="device-icon">PC</div>
      <div className="device-label">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
