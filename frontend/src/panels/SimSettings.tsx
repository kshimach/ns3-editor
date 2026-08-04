import { NumberField } from "../components/NumberField";
import { freshAppId, useEditor } from "../store";
import { App } from "../types";

export function SimSettings() {
  const scenario = useEditor((s) => s.scenario);
  const updateScenario = useEditor((s) => s.updateScenario);
  const addApp = useEditor((s) => s.addApp);
  const updateApp = useEditor((s) => s.updateApp);
  const removeApp = useEditor((s) => s.removeApp);

  const sim = scenario.simulation;
  const stack = scenario.stack;
  const nodeOptions = scenario.nodes.map((n) => (
    <option key={n.id} value={n.id}>
      {n.name || n.id}
    </option>
  ));

  return (
    <div className="sim-settings">
      <section>
        <h4>シミュレーション</h4>
        <label>
          時間 (s)
          <NumberField
            value={sim.duration}
            fallback={1}
            min={1}
            onCommit={(duration) => updateScenario({ simulation: { ...sim, duration } })}
          />
        </label>
        <label>
          シード
          <NumberField
            value={sim.seed}
            fallback={1}
            min={1}
            onCommit={(seed) => updateScenario({ simulation: { ...sim, seed } })}
          />
        </label>
        <label>
          スケール (px = m)
          <NumberField
            value={sim.scale}
            fallback={1}
            step="0.1"
            onCommit={(scale) => updateScenario({ simulation: { ...sim, scale } })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={sim.pcap}
            onChange={(e) => updateScenario({ simulation: { ...sim, pcap: e.target.checked } })}
          />
          pcap を書き出す
        </label>
        {stack.routing === "rpl" && (
          <label title="RPL テーブルタブに表示するスナップショットの間隔。0 で実行終了時の 1 回だけ">
            RPL テーブル取得間隔 (s)
            <NumberField
              value={sim.rplTableInterval}
              fallback={0}
              min={0}
              step="1"
              onCommit={(rplTableInterval) =>
                updateScenario({ simulation: { ...sim, rplTableInterval } })
              }
            />
          </label>
        )}
        <label>
          ログ (カンマ区切り)
          <input
            placeholder="RplRoutingProtocol, Ping"
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
        </label>
      </section>

      <section>
        <h4>スタック</h4>
        <label>
          IP
          <select
            value={stack.ip}
            onChange={(e) =>
              updateScenario({ stack: { ...stack, ip: e.target.value as "ipv4" | "ipv6" } })
            }
          >
            <option value="ipv4">IPv4</option>
            <option value="ipv6">IPv6</option>
          </select>
        </label>
        <label>
          ルーティング
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
        </label>
        {stack.routing === "rpl" && (
          <>
            <label>
              DODAG root
              <select
                value={stack.rpl.root}
                onChange={(e) =>
                  updateScenario({ stack: { ...stack, rpl: { ...stack.rpl, root: e.target.value } } })
                }
              >
                <option value="">(未選択)</option>
                {nodeOptions}
              </select>
            </label>
            <label>
              Objective Function
              <select
                value={stack.rpl.ocp}
                onChange={(e) =>
                  updateScenario({
                    stack: { ...stack, rpl: { ...stack.rpl, ocp: e.target.value as "of0" | "mrhof" } },
                  })
                }
              >
                <option value="of0">OF0 (ホップ数)</option>
                <option value="mrhof">MRHOF (ETX)</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={stack.rpl.enableLql}
                onChange={(e) =>
                  updateScenario({
                    stack: { ...stack, rpl: { ...stack.rpl, enableLql: e.target.checked } },
                  })
                }
              />
              LQL (RSSI 由来) を advertise
            </label>
          </>
        )}
      </section>

      <section className="apps-section">
        <h4>アプリケーション</h4>
        <div className="app-add">
          <button
            onClick={() =>
              addApp({
                type: "ping",
                id: freshAppId(),
                from: scenario.nodes[0]?.id ?? "",
                to: scenario.nodes[1]?.id ?? scenario.nodes[0]?.id ?? "",
                start: 1,
                stop: null,
                count: 5,
                interval: 1,
              })
            }
          >
            + Ping
          </button>
          <button
            onClick={() =>
              addApp({
                type: "udpEcho",
                id: freshAppId(),
                server: scenario.nodes[0]?.id ?? "",
                client: scenario.nodes[1]?.id ?? scenario.nodes[0]?.id ?? "",
                port: 9,
                start: 1,
                stop: null,
                maxPackets: 10,
                interval: 1,
                packetSize: 64,
              })
            }
          >
            + UDP Echo
          </button>
          <button
            onClick={() =>
              addApp({
                type: "onoff",
                id: freshAppId(),
                from: scenario.nodes[0]?.id ?? "",
                to: scenario.nodes[1]?.id ?? scenario.nodes[0]?.id ?? "",
                port: 9000,
                start: 1,
                stop: null,
                dataRate: "500kbps",
                packetSize: 512,
              })
            }
          >
            + OnOff
          </button>
        </div>
        {scenario.apps.map((app) => (
          <AppRow key={app.id} app={app} onChange={updateApp} onRemove={removeApp} />
        ))}
      </section>
    </div>
  );
}

function AppRow({
  app,
  onChange,
  onRemove,
}: {
  app: App;
  onChange: (id: string, patch: Partial<App>) => void;
  onRemove: (id: string) => void;
}) {
  const nodes = useEditor((s) => s.scenario.nodes);
  const nodeSelect = (value: string, onSel: (v: string) => void) => (
    <select value={value} onChange={(e) => onSel(e.target.value)}>
      {nodes.map((n) => (
        <option key={n.id} value={n.id}>
          {n.name || n.id}
        </option>
      ))}
    </select>
  );

  return (
    <div className="app-row">
      <span className="app-kind">{app.type}</span>
      {(app.type === "ping" || app.type === "onoff") && (
        <>
          {nodeSelect(app.from, (v) => onChange(app.id, { from: v } as Partial<App>))}
          <span>から</span>
          {nodeSelect(app.to, (v) => onChange(app.id, { to: v } as Partial<App>))}
          <span>へ</span>
        </>
      )}
      {app.type === "udpEcho" && (
        <>
          {nodeSelect(app.client, (v) => onChange(app.id, { client: v } as Partial<App>))}
          <span>から</span>
          {nodeSelect(app.server, (v) => onChange(app.id, { server: v } as Partial<App>))}
          <span>へ (port {app.port})</span>
        </>
      )}
      <label>
        開始
        <NumberField
          value={app.start}
          fallback={0}
          min={0}
          onCommit={(start) => onChange(app.id, { start })}
        />
      </label>
      {app.type === "ping" && (
        <label>
          回数
          <NumberField
            value={app.count}
            fallback={1}
            min={1}
            onCommit={(count) => onChange(app.id, { count } as Partial<App>)}
          />
        </label>
      )}
      <button className="tiny danger" onClick={() => onRemove(app.id)}>
        削除
      </button>
    </div>
  );
}
