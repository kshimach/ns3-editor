// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { Field } from "../components/Field";
import { NumberField } from "../components/NumberField";
import { useEditor } from "../store";
import { defaultRplConfig, RplConfig } from "../types";

const DEFAULTS = defaultRplConfig("_");

/**
 * The base (instance 0) RPL configuration -- the only one contrib/rpl
 * actually wires into ns-3 today. A scenario loaded from JSON with further
 * instances keeps them (nothing here deletes them), but there is no control
 * to add another: the multi-instance UI that used to offer one produced
 * instances that did nothing, which is worse than not offering it.
 */
export function RplPanel() {
  const scenario = useEditor((s) => s.scenario);
  const updateRplInstance = useEditor((s) => s.updateRplInstance);
  const nodes = scenario.nodes;

  if (scenario.stack.routing !== "rpl") {
    return (
      <div className="hint" style={{ padding: 12 }}>
        RPL 設定はルーティングを RPL に切り替えると表示されます (「設定」タブのスタック)。
      </div>
    );
  }

  const instance = scenario.stack.rpl[0];
  if (!instance) {
    return <div className="hint" style={{ padding: 12 }}>RPL インスタンスがありません。</div>;
  }
  const extra = scenario.stack.rpl.length - 1;
  const set = (patch: Partial<RplConfig>) => updateRplInstance(instance.id, patch);

  return (
    <div className="rpl-panel">
      {extra > 0 && (
        <p className="hint">
          instance 1 以降 ({extra} 件) は現在 ns-3 に渡されず未使用です (contrib/rpl の複数
          instance 対応待ち)。
        </p>
      )}

      <Field label="DODAG root">
        <select value={instance.root} onChange={(e) => set({ root: e.target.value })}>
          <option value="">(未選択)</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name || n.id}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Objective Function" help="経路選択の指標。OF0 はホップ数のみ、MRHOF は ETX (リンク品質) を最小化する">
        <select value={instance.ocp} onChange={(e) => set({ ocp: e.target.value as "of0" | "mrhof" })}>
          <option value="of0">OF0 (ホップ数)</option>
          <option value="mrhof">MRHOF (ETX)</option>
        </select>
      </Field>

      <Field label="LQL を advertise" help="RSSI 由来のリンク品質を DIO に含めて広告する">
        <label className="inline-checkbox">
          <input
            type="checkbox"
            checked={instance.enableLql}
            onChange={(e) => set({ enableLql: e.target.checked })}
          />
          有効にする
        </label>
      </Field>

      <Field
        label="Mode of Operation"
        help="RFC 6550 の MOP。Non-storing は下り経路を root だけが Source Route として保持する。Storing は各ルータが自分より下の経路も保持する"
      >
        <select value={instance.mop} onChange={(e) => set({ mop: e.target.value as "non-storing" | "storing" })}>
          <option value="non-storing">Non-storing (下りは Source Route)</option>
          <option value="storing">Storing (各ルータが下り経路を保持)</option>
        </select>
      </Field>

      <details className="param-group" open>
        <summary>RPL 詳細設定 (Trickle/DAO)</summary>
        <Field
          label="DIS 送信間隔"
          unit="s"
          help="DODAG 未参加時に撒く unsolicited DIS の周期"
          isDefault={instance.disInterval === DEFAULTS.disInterval}
          onReset={() => set({ disInterval: DEFAULTS.disInterval })}
        >
          <NumberField
            value={instance.disInterval}
            fallback={DEFAULTS.disInterval}
            min={0.001}
            onCommit={(disInterval) => set({ disInterval })}
          />
        </Field>
        <Field
          label="DIO Trickle Imin"
          unit="s"
          help="DIO Trickle タイマーの最小間隔。root のみがこの値を使い、他ノードは join した DIO の DODAG Configuration オプションから引き継ぐ"
          isDefault={instance.dioIntervalMin === DEFAULTS.dioIntervalMin}
          onReset={() => set({ dioIntervalMin: DEFAULTS.dioIntervalMin })}
        >
          <NumberField
            value={instance.dioIntervalMin}
            fallback={DEFAULTS.dioIntervalMin}
            min={0.001}
            step="0.001"
            onCommit={(dioIntervalMin) => set({ dioIntervalMin })}
          />
        </Field>
        <Field
          label="DIO Trickle doublings"
          help="Imax = Imin << doublings までの倍化回数 (既定で Imax は約17.5分)"
          isDefault={instance.dioIntervalDoublings === DEFAULTS.dioIntervalDoublings}
          onReset={() => set({ dioIntervalDoublings: DEFAULTS.dioIntervalDoublings })}
        >
          <NumberField
            value={instance.dioIntervalDoublings}
            fallback={DEFAULTS.dioIntervalDoublings}
            min={0}
            onCommit={(dioIntervalDoublings) => set({ dioIntervalDoublings })}
          />
        </Field>
        <Field
          label="DIO Trickle redundancy k"
          help="0 で抑制なし。Trickle の一貫性カウントによる送信抑制のしきい値"
          isDefault={instance.dioRedundancy === DEFAULTS.dioRedundancy}
          onReset={() => set({ dioRedundancy: DEFAULTS.dioRedundancy })}
        >
          <NumberField
            value={instance.dioRedundancy}
            fallback={DEFAULTS.dioRedundancy}
            min={0}
            onCommit={(dioRedundancy) => set({ dioRedundancy })}
          />
        </Field>
        <Field
          label="MinHopRankIncrease"
          help="root の rank でもある、1 ホップあたりの rank 増分"
          isDefault={instance.minHopRankIncrease === DEFAULTS.minHopRankIncrease}
          onReset={() => set({ minHopRankIncrease: DEFAULTS.minHopRankIncrease })}
        >
          <NumberField
            value={instance.minHopRankIncrease}
            fallback={DEFAULTS.minHopRankIncrease}
            min={1}
            max={65535}
            onCommit={(minHopRankIncrease) => set({ minHopRankIncrease })}
          />
        </Field>
        <Field
          label="DAO 再送間隔"
          unit="s"
          help="下り経路を root に伝える DAO の再送スケジュール"
          isDefault={instance.daoInterval === DEFAULTS.daoInterval}
          onReset={() => set({ daoInterval: DEFAULTS.daoInterval })}
        >
          <NumberField
            value={instance.daoInterval}
            fallback={DEFAULTS.daoInterval}
            min={0.001}
            onCommit={(daoInterval) => set({ daoInterval })}
          />
        </Field>
        <Field
          label="DAO-ACK タイムアウト"
          unit="s"
          isDefault={instance.daoAckTimeout === DEFAULTS.daoAckTimeout}
          onReset={() => set({ daoAckTimeout: DEFAULTS.daoAckTimeout })}
        >
          <NumberField
            value={instance.daoAckTimeout}
            fallback={DEFAULTS.daoAckTimeout}
            min={0.001}
            onCommit={(daoAckTimeout) => set({ daoAckTimeout })}
          />
        </Field>
        <Field
          label="DAO 再送回数"
          isDefault={instance.daoRetries === DEFAULTS.daoRetries}
          onReset={() => set({ daoRetries: DEFAULTS.daoRetries })}
        >
          <NumberField
            value={instance.daoRetries}
            fallback={DEFAULTS.daoRetries}
            min={0}
            max={255}
            onCommit={(daoRetries) => set({ daoRetries })}
          />
        </Field>
        <Field
          label="下り経路の寿命"
          unit="lifetime units"
          help="DAO が広告する経路の寿命。1 unit = 60 秒固定"
          isDefault={instance.pathLifetime === DEFAULTS.pathLifetime}
          onReset={() => set({ pathLifetime: DEFAULTS.pathLifetime })}
        >
          <NumberField
            value={instance.pathLifetime}
            fallback={DEFAULTS.pathLifetime}
            min={1}
            max={255}
            onCommit={(pathLifetime) => set({ pathLifetime })}
          />
        </Field>
      </details>

      <details className="param-group">
        <summary>AODV-RPL 探索設定 (詳細)</summary>
        <p className="hint">
          「+ AODV-RPL 探索」アプリを 1 つも追加していない場合、これらの値は生成コードに現れません。
        </p>
        <Field
          label="RREQ-DIO Trickle Imin"
          unit="s"
          isDefault={instance.aodvDioIntervalMin === DEFAULTS.aodvDioIntervalMin}
          onReset={() => set({ aodvDioIntervalMin: DEFAULTS.aodvDioIntervalMin })}
        >
          <NumberField
            value={instance.aodvDioIntervalMin}
            fallback={DEFAULTS.aodvDioIntervalMin}
            min={0.001}
            step="0.001"
            onCommit={(aodvDioIntervalMin) => set({ aodvDioIntervalMin })}
          />
        </Field>
        <Field
          label="Trickle doublings"
          isDefault={instance.aodvDioIntervalDoublings === DEFAULTS.aodvDioIntervalDoublings}
          onReset={() => set({ aodvDioIntervalDoublings: DEFAULTS.aodvDioIntervalDoublings })}
        >
          <NumberField
            value={instance.aodvDioIntervalDoublings}
            fallback={DEFAULTS.aodvDioIntervalDoublings}
            min={0}
            onCommit={(aodvDioIntervalDoublings) => set({ aodvDioIntervalDoublings })}
          />
        </Field>
        <Field
          label="RankLimit"
          help="0 で無制限。この rank を超えたノードは RREQ を転送しない"
          isDefault={instance.aodvRankLimit === DEFAULTS.aodvRankLimit}
          onReset={() => set({ aodvRankLimit: DEFAULTS.aodvRankLimit })}
        >
          <NumberField
            value={instance.aodvRankLimit}
            fallback={DEFAULTS.aodvRankLimit}
            min={0}
            max={127}
            onCommit={(aodvRankLimit) => set({ aodvRankLimit })}
          />
        </Field>
        <Field
          label="経路の寿命"
          isDefault={instance.aodvLifetime === DEFAULTS.aodvLifetime}
          onReset={() => set({ aodvLifetime: DEFAULTS.aodvLifetime })}
        >
          <select
            value={instance.aodvLifetime}
            onChange={(e) => set({ aodvLifetime: Number(e.target.value) })}
          >
            <option value={0}>無制限</option>
            <option value={1}>16 秒</option>
            <option value={2}>64 秒</option>
            <option value={3}>256 秒</option>
          </select>
        </Field>
        <Field
          label="RejoinReenable"
          unit="s"
          isDefault={instance.aodvRejoinReenable === DEFAULTS.aodvRejoinReenable}
          onReset={() => set({ aodvRejoinReenable: DEFAULTS.aodvRejoinReenable })}
        >
          <NumberField
            value={instance.aodvRejoinReenable}
            fallback={DEFAULTS.aodvRejoinReenable}
            min={0}
            onCommit={(aodvRejoinReenable) => set({ aodvRejoinReenable })}
          />
        </Field>
        <Field
          label="非対称モード (S=0)"
          help="RFC 9854 の 'S' フラグの反転。オンにすると RREP-Instance をフラッディングする非対称モードになる"
          isDefault={instance.aodvForceAsymmetric === DEFAULTS.aodvForceAsymmetric}
          onReset={() => set({ aodvForceAsymmetric: DEFAULTS.aodvForceAsymmetric })}
        >
          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={instance.aodvForceAsymmetric}
              onChange={(e) => set({ aodvForceAsymmetric: e.target.checked })}
            />
            有効にする
          </label>
        </Field>
      </details>

      <details className="param-group">
        <summary>P2P-RPL 探索設定 (詳細)</summary>
        <p className="hint">
          「+ P2P-RPL 探索」アプリを 1 つも追加していない場合、これらの値は生成コードに現れません。
        </p>
        <Field
          label="P2P mode DIO Trickle Imin"
          unit="s"
          isDefault={instance.p2pDioIntervalMin === DEFAULTS.p2pDioIntervalMin}
          onReset={() => set({ p2pDioIntervalMin: DEFAULTS.p2pDioIntervalMin })}
        >
          <NumberField
            value={instance.p2pDioIntervalMin}
            fallback={DEFAULTS.p2pDioIntervalMin}
            min={0.001}
            step="0.001"
            onCommit={(p2pDioIntervalMin) => set({ p2pDioIntervalMin })}
          />
        </Field>
        <Field
          label="Trickle doublings"
          isDefault={instance.p2pDioIntervalDoublings === DEFAULTS.p2pDioIntervalDoublings}
          onReset={() => set({ p2pDioIntervalDoublings: DEFAULTS.p2pDioIntervalDoublings })}
        >
          <NumberField
            value={instance.p2pDioIntervalDoublings}
            fallback={DEFAULTS.p2pDioIntervalDoublings}
            min={0}
            onCommit={(p2pDioIntervalDoublings) => set({ p2pDioIntervalDoublings })}
          />
        </Field>
        <Field
          label="Trickle redundancy k"
          isDefault={instance.p2pDioRedundancy === DEFAULTS.p2pDioRedundancy}
          onReset={() => set({ p2pDioRedundancy: DEFAULTS.p2pDioRedundancy })}
        >
          <NumberField
            value={instance.p2pDioRedundancy}
            fallback={DEFAULTS.p2pDioRedundancy}
            min={0}
            max={255}
            onCommit={(p2pDioRedundancy) => set({ p2pDioRedundancy })}
          />
        </Field>
        <Field
          label="MaxRank"
          help="0 で無制限。この rank を超えて探索は打ち切られる"
          isDefault={instance.p2pMaxRank === DEFAULTS.p2pMaxRank}
          onReset={() => set({ p2pMaxRank: DEFAULTS.p2pMaxRank })}
        >
          <NumberField
            value={instance.p2pMaxRank}
            fallback={DEFAULTS.p2pMaxRank}
            min={0}
            max={63}
            onCommit={(p2pMaxRank) => set({ p2pMaxRank })}
          />
        </Field>
        <Field
          label="経路の寿命"
          isDefault={instance.p2pLifetime === DEFAULTS.p2pLifetime}
          onReset={() => set({ p2pLifetime: DEFAULTS.p2pLifetime })}
        >
          <select
            value={instance.p2pLifetime}
            onChange={(e) => set({ p2pLifetime: Number(e.target.value) })}
          >
            <option value={0}>1 秒</option>
            <option value={1}>4 秒</option>
            <option value={2}>16 秒</option>
            <option value={3}>64 秒</option>
          </select>
        </Field>
        <Field
          label="P2P-DRO-ACK を要求"
          isDefault={instance.p2pDroAckRequested === DEFAULTS.p2pDroAckRequested}
          onReset={() => set({ p2pDroAckRequested: DEFAULTS.p2pDroAckRequested })}
        >
          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={instance.p2pDroAckRequested}
              onChange={(e) => set({ p2pDroAckRequested: e.target.checked })}
            />
            有効にする
          </label>
        </Field>
        <Field
          label="P2P-DRO-ACK 待ち時間"
          unit="s"
          isDefault={instance.p2pDroAckWaitTime === DEFAULTS.p2pDroAckWaitTime}
          onReset={() => set({ p2pDroAckWaitTime: DEFAULTS.p2pDroAckWaitTime })}
        >
          <NumberField
            value={instance.p2pDroAckWaitTime}
            fallback={DEFAULTS.p2pDroAckWaitTime}
            min={0.001}
            step="0.001"
            onCommit={(p2pDroAckWaitTime) => set({ p2pDroAckWaitTime })}
          />
        </Field>
        <Field
          label="P2P-DRO 再送回数"
          isDefault={instance.p2pDroMaxRetransmissions === DEFAULTS.p2pDroMaxRetransmissions}
          onReset={() => set({ p2pDroMaxRetransmissions: DEFAULTS.p2pDroMaxRetransmissions })}
        >
          <NumberField
            value={instance.p2pDroMaxRetransmissions}
            fallback={DEFAULTS.p2pDroMaxRetransmissions}
            min={0}
            max={255}
            onCommit={(p2pDroMaxRetransmissions) => set({ p2pDroMaxRetransmissions })}
          />
        </Field>
        <Field
          label="N (要求する経路数)"
          help="RFC 6997 §9.5 の 'N'。0 は単一経路のみ、1-3 はその件数だけ別経路 (代替) も収集する"
          isDefault={instance.p2pNumRoutes === DEFAULTS.p2pNumRoutes}
          onReset={() => set({ p2pNumRoutes: DEFAULTS.p2pNumRoutes })}
        >
          <select
            value={instance.p2pNumRoutes}
            onChange={(e) => set({ p2pNumRoutes: Number(e.target.value) })}
          >
            <option value={0}>0 (単一経路)</option>
            <option value={1}>1 (別経路を1件収集)</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </Field>
        {instance.p2pNumRoutes > 0 && (
          <Field
            label="代替経路の収集時間"
            unit="s"
            isDefault={instance.p2pDroCollectWindow === DEFAULTS.p2pDroCollectWindow}
            onReset={() => set({ p2pDroCollectWindow: DEFAULTS.p2pDroCollectWindow })}
          >
            <NumberField
              value={instance.p2pDroCollectWindow}
              fallback={DEFAULTS.p2pDroCollectWindow}
              min={0.001}
              step="0.001"
              onCommit={(p2pDroCollectWindow) => set({ p2pDroCollectWindow })}
            />
          </Field>
        )}
      </details>
    </div>
  );
}
