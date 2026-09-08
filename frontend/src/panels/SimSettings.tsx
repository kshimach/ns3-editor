// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { Field } from "../components/Field";
import { NumberField } from "../components/NumberField";
import { useEditor } from "../store";
import { AppsPanel } from "./AppsPanel";

/**
 * The 設定 tab: simulation-wide settings, the IP/routing stack choice, and
 * the app list. RPL's own (much larger) parameter set lives on its own RPL
 * tab (RplPanel) instead of being crammed in here.
 */
export function SimSettings() {
  const scenario = useEditor((s) => s.scenario);
  const updateScenario = useEditor((s) => s.updateScenario);

  const sim = scenario.simulation;
  const stack = scenario.stack;

  return (
    <div className="sim-settings">
      <section>
        <h4>シミュレーション</h4>
        <Field label="時間" unit="s">
          <NumberField
            value={sim.duration}
            fallback={1}
            min={1}
            onCommit={(duration) => updateScenario({ simulation: { ...sim, duration } })}
          />
        </Field>
        <Field label="シード">
          <NumberField
            value={sim.seed}
            fallback={1}
            min={1}
            onCommit={(seed) => updateScenario({ simulation: { ...sim, seed } })}
          />
        </Field>
        <Field label="スケール" help="キャンバスの px をシミュレーションの m に変換する係数 (px x スケール = m)">
          <NumberField
            value={sim.scale}
            fallback={1}
            step="0.1"
            onCommit={(scale) => updateScenario({ simulation: { ...sim, scale } })}
          />
        </Field>
        <Field label="pcap を書き出す">
          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={sim.pcap}
              onChange={(e) => updateScenario({ simulation: { ...sim, pcap: e.target.checked } })}
            />
            有効にする
          </label>
        </Field>
        {stack.routing === "rpl" && (
          <Field
            label="RPL テーブル取得間隔"
            unit="s"
            help="RPL テーブルタブに表示するスナップショットの間隔。0 で実行終了時の 1 回だけ"
          >
            <NumberField
              value={sim.rplTableInterval}
              fallback={0}
              min={0}
              step="1"
              onCommit={(rplTableInterval) =>
                updateScenario({ simulation: { ...sim, rplTableInterval } })
              }
            />
          </Field>
        )}
        <Field label="ログ" help="NS_LOG に相当するログコンポーネント名をカンマ区切りで指定">
          <input
            placeholder="例: RplRoutingProtocol, Ping"
            value={sim.logComponents.join(", ")}
            onChange={(e) =>
              updateScenario({
                simulation: {
                  ...sim,
                  logComponents: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
          />
        </Field>
      </section>

      <section>
        <h4>スタック</h4>
        <Field label="IP">
          <select
            value={stack.ip}
            onChange={(e) =>
              updateScenario({ stack: { ...stack, ip: e.target.value as "ipv4" | "ipv6" } })
            }
          >
            <option value="ipv4">IPv4</option>
            <option value="ipv6">IPv6</option>
          </select>
        </Field>
        <Field label="ルーティング">
          <select
            value={stack.routing}
            onChange={(e) =>
              updateScenario({
                stack: { ...stack, routing: e.target.value as "global" | "static" | "rpl" },
              })
            }
          >
            <option value="global">Global (IPv4)</option>
            <option value="static">Static</option>
            <option value="rpl">RPL (IPv6)</option>
          </select>
        </Field>
        {stack.routing === "rpl" && (
          <p className="hint">RPL の詳細パラメータは右上の「RPL」タブで設定できます。</p>
        )}
      </section>

      <AppsPanel />
    </div>
  );
}
