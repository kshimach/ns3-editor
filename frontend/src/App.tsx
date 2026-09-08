// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useEffect, useState } from "react";

import { api } from "./api";
import { Canvas } from "./canvas/Canvas";
import { CodeView } from "./codeview/CodeView";
import { Palette } from "./panels/Palette";
import { Properties } from "./panels/Properties";
import { SimSettings } from "./panels/SimSettings";
import { RunView } from "./runview/RunView";
import { useEditor } from "./store";
import { RplTables } from "./tables/RplTables";

type Tab = "settings" | "code" | "run" | "rpl";

export default function App() {
  const scenario = useEditor((s) => s.scenario);
  const setScenario = useEditor((s) => s.setScenario);
  const updateScenario = useEditor((s) => s.updateScenario);
  const setIssues = useEditor((s) => s.setIssues);
  const [tab, setTab] = useState<Tab>("settings");
  const [saved, setSaved] = useState<{ file: string; name: string }[]>([]);
  const [notice, setNotice] = useState("");

  const refreshList = () => api.listScenarios().then(setSaved).catch(() => {});
  useEffect(() => {
    refreshList();
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2500);
  };

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">ns3-editor</span>
        <input
          className="scenario-name"
          value={scenario.name}
          onChange={(e) => updateScenario({ name: e.target.value })}
        />
        <button
          onClick={async () => {
            await api.saveScenario(scenario.name, scenario);
            refreshList();
            flash("保存しました");
          }}
        >
          保存
        </button>
        <select
          value=""
          onChange={async (e) => {
            if (!e.target.value) return;
            setScenario(await api.loadScenario(e.target.value));
            flash("読み込みました");
          }}
        >
          <option value="">読込...</option>
          {saved.map((s) => (
            <option key={s.file} value={s.file}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={async () => {
            const issues = await api.validate(scenario);
            setIssues(issues);
            flash(
              issues.length === 0
                ? "問題なし"
                : `エラー ${issues.filter((i) => i.level === "error").length} / 警告 ${issues.filter((i) => i.level === "warning").length}`,
            );
          }}
        >
          検証
        </button>
        {notice && <span className="notice">{notice}</span>}
      </header>

      <div className="main">
        <aside className="left">
          <Palette />
        </aside>
        <div className="center">
          <Canvas />
        </div>
        <aside className="right">
          <Properties />
        </aside>
      </div>

      <div className="bottom">
        <nav className="tabs">
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
            シナリオ設定
          </button>
          <button className={tab === "code" ? "active" : ""} onClick={() => setTab("code")}>
            生成コード
          </button>
          <button className={tab === "run" ? "active" : ""} onClick={() => setTab("run")}>
            実行
          </button>
          <button className={tab === "rpl" ? "active" : ""} onClick={() => setTab("rpl")}>
            RPL テーブル
          </button>
        </nav>
        <div className="tab-body">
          {/*
            RunView owns the run WebSocket, and unmounting it would close the
            socket and stop the RPL snapshots the next tab renders from
            arriving. Kept mounted and hidden instead.
          */}
          {tab === "settings" && <SimSettings />}
          {tab === "code" && <CodeView />}
          <div style={{ display: tab === "run" ? "contents" : "none" }}>
            <RunView />
          </div>
          {tab === "rpl" && <RplTables />}
        </div>
      </div>
    </div>
  );
}
