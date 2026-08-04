import { useMemo, useState } from "react";

import { useEditor } from "../store";
import { RplSnapshot } from "../types";

/** ETX is carried as a plain number; two decimals is the useful resolution. */
function etx(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function seconds(value: number | null): string {
  // null on a topology entry means the infinite path lifetime of RFC 6550
  // section 6.7.8, which is a different thing from "no value".
  return value === null ? "無期限" : `${value.toFixed(1)}s`;
}

export function RplTables() {
  const snapshots = useEditor((s) => s.rplSnapshots);
  const scenario = useEditor((s) => s.scenario);
  const [timeIndex, setTimeIndex] = useState<number | null>(null);
  const [nodeId, setNodeId] = useState<number | null>(null);

  // A node's snapshot for a given instant is looked up by (time, node), so
  // both axes are derived from what actually arrived rather than from the
  // scenario: a node that never joined still reports, but one the run never
  // reached does not.
  const times = useMemo(
    () => [...new Set(snapshots.map((s) => s.time))].sort((a, b) => a - b),
    [snapshots],
  );
  const nodeIds = useMemo(
    () => [...new Set(snapshots.map((s) => s.node))].sort((a, b) => a - b),
    [snapshots],
  );

  // Both selectors default to following the newest data rather than pinning
  // to whatever was first selected, so a running simulation updates in place.
  const selectedTime = times.length === 0 ? null : times[timeIndex ?? times.length - 1] ?? null;
  const selectedNode = nodeId !== null && nodeIds.includes(nodeId) ? nodeId : (nodeIds[0] ?? null);

  const atTime = useMemo(
    () => snapshots.filter((s) => s.time === selectedTime),
    [snapshots, selectedTime],
  );
  const current = atTime.find((s) => s.node === selectedNode) ?? null;
  const root = atTime.find((s) => s.role === "root") ?? null;

  const nodeLabel = (index: number) => {
    const n = scenario.nodes[index];
    return n ? `${index}: ${n.name || n.id}` : `node ${index}`;
  };

  if (snapshots.length === 0) {
    return (
      <div className="rpl-tables empty">
        <p>
          RPL テーブルのスナップショットがまだありません。
          {scenario.stack.routing === "rpl"
            ? " 「実行」タブでシミュレーションを開始してください。"
            : " このシナリオは RPL でルーティングしていません。"}
        </p>
      </div>
    );
  }

  return (
    <div className="rpl-tables">
      <div className="rpl-controls">
        <label>
          時刻
          <input
            type="range"
            min={0}
            max={Math.max(0, times.length - 1)}
            value={timeIndex ?? times.length - 1}
            onChange={(e) => setTimeIndex(Number(e.target.value))}
          />
          <span className="rpl-time">{selectedTime !== null ? `${selectedTime}s` : "-"}</span>
        </label>
        <label>
          ノード
          <select
            value={selectedNode ?? ""}
            onChange={(e) => setNodeId(Number(e.target.value))}
          >
            {nodeIds.map((id) => (
              <option key={id} value={id}>
                {nodeLabel(id)}
              </option>
            ))}
          </select>
        </label>
        {timeIndex !== null && (
          <button onClick={() => setTimeIndex(null)} title="最新のスナップショットに追従する">
            最新へ
          </button>
        )}
      </div>

      {current && <NodeTables snapshot={current} />}
      {root && root.node !== selectedNode && <RootTopology snapshot={root} />}
      {current && current.role === "root" && <RootTopology snapshot={current} />}
    </div>
  );
}

function NodeTables({ snapshot }: { snapshot: RplSnapshot }) {
  if (!snapshot.joined) {
    return (
      <section className="rpl-node">
        <h4>
          node {snapshot.node} <span className="rpl-role">{snapshot.role}</span>
        </h4>
        <p className="rpl-unjoined">DODAG に参加していません</p>
      </section>
    );
  }

  return (
    <section className="rpl-node">
      <h4>
        node {snapshot.node} <span className="rpl-role">{snapshot.role}</span>
      </h4>
      <dl className="rpl-summary">
        <dt>rank</dt>
        <dd>{snapshot.rank}</dd>
        <dt>preferred parent</dt>
        <dd className="mono">{snapshot.preferredParent}</dd>
        <dt>DODAGID</dt>
        <dd className="mono">{snapshot.dodagId}</dd>
        <dt>OF</dt>
        <dd>{snapshot.ocp}</dd>
        <dt>path ETX</dt>
        <dd>{etx(snapshot.pathEtx)}</dd>
        <dt>version</dt>
        <dd>{snapshot.version}</dd>
      </dl>

      <h5>候補親 ({snapshot.parents.length})</h5>
      {snapshot.parents.length === 0 ? (
        <p className="rpl-unjoined">なし</p>
      ) : (
        <table className="rpl-table">
          <thead>
            <tr>
              <th>アドレス</th>
              <th>rank</th>
              <th>if</th>
              <th>受信回数</th>
              <th>最終受信</th>
              <th>link ETX</th>
              <th>path ETX</th>
              <th>LQL</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.parents.map((p) => (
              <tr
                key={p.address}
                className={p.address === snapshot.preferredParent ? "preferred" : undefined}
              >
                <td className="mono">{p.address}</td>
                <td>{p.rank}</td>
                <td>{p.interface}</td>
                <td>{p.freshness}</td>
                <td>{p.lastHeardAgo.toFixed(1)}s 前</td>
                <td>{etx(p.linkEtx)}</td>
                <td>{etx(p.pathEtx)}</td>
                <td>{p.lql === null ? "-" : p.lql}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RootTopology({ snapshot }: { snapshot: RplSnapshot }) {
  return (
    <section className="rpl-topology">
      <h5>root のトポロジ (DAO 由来, node {snapshot.node})</h5>
      {snapshot.topology.length === 0 ? (
        <p className="rpl-unjoined">まだ DAO を受け取っていません</p>
      ) : (
        <table className="rpl-table">
          <thead>
            <tr>
              <th>ターゲット</th>
              <th>親</th>
              <th>path seq</th>
              <th>残り寿命</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.topology.map((t) => (
              <tr key={t.target}>
                <td className="mono">{t.target}</td>
                <td className="mono">{t.parent}</td>
                <td>{t.pathSequence}</td>
                <td>{seconds(t.expiresIn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
