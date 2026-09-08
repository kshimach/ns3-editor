// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useEffect, useRef, useState } from "react";

import { api } from "./api";
import { Canvas } from "./canvas/Canvas";
import { SplitPane } from "./components/SplitPane";
import { CodeView } from "./codeview/CodeView";
import { useRunSocket } from "./hooks/useRunSocket";
import { IssuesPanel } from "./panels/IssuesPanel";
import { Palette } from "./panels/Palette";
import { Properties } from "./panels/Properties";
import { RplPanel } from "./panels/RplPanel";
import { SimSettings } from "./panels/SimSettings";
import { RunView } from "./runview/RunView";
import { SAMPLE_DESCRIPTIONS } from "./samples";
import { BottomTab, RightTab, useEditor } from "./store";
import { RplTables } from "./tables/RplTables";
import { defaultScenario } from "./types";

export default function App() {
  const scenario = useEditor((s) => s.scenario);
  const setScenario = useEditor((s) => s.setScenario);
  const updateScenario = useEditor((s) => s.updateScenario);
  const issues = useEditor((s) => s.issues);
  const setIssues = useEditor((s) => s.setIssues);
  const rightTab = useEditor((s) => s.rightTab);
  const setRightTab = useEditor((s) => s.setRightTab);
  const bottomTab = useEditor((s) => s.bottomTab);
  const setBottomTab = useEditor((s) => s.setBottomTab);
  const bottomCollapsed = useEditor((s) => s.bottomCollapsed);
  const toggleBottomCollapsed = useEditor((s) => s.toggleBottomCollapsed);
  const rplSnapshots = useEditor((s) => s.rplSnapshots);
  const savedSnapshot = useEditor((s) => s.savedSnapshot);
  const markSaved = useEditor((s) => s.markSaved);
  const undoCount = useEditor((s) => s.undoCount);
  const redoCount = useEditor((s) => s.redoCount);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);

  const [saved, setSaved] = useState<{ file: string; name: string }[]>([]);
  const [notice, setNotice] = useState("");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<"new" | "open" | null>(null);

  const isDirty = savedSnapshot !== JSON.stringify(scenario);

  const run = useRunSocket(scenario);

  const refreshList = () =>
    api
      .listScenarios()
      .then(setSaved)
      .catch(() => setBackendError("バックエンド (port 8000) に接続できません"));

  useEffect(() => {
    refreshList();
    api
      .health()
      .then((h) => {
        if (!h.ns3DirExists) {
          setBackendError(`ns-3 ディレクトリが見つかりません: ${h.ns3Dir}`);
        } else {
          setBackendError(null);
        }
      })
      .catch(() => setBackendError("バックエンド (port 8000) に接続できません"));
  }, []);

  // Auto-validate: every edit is checked shortly after it settles, so the
  // 問題 tab and the badge count always reflect the scenario currently on
  // screen without a manual "検証" step.
  const validateTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(validateTimer.current);
    validateTimer.current = window.setTimeout(() => {
      api
        .validate(scenario)
        .then(setIssues)
        .catch(() => {
          /* transient network hiccup -- the next edit will retry */
        });
    }, 400);
    return () => window.clearTimeout(validateTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2500);
  };

  // Close either dropdown on an outside click.
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenu]);

  // Confirm before leaving the tab with unsaved changes -- the browser's own
  // wording is used (most browsers ignore custom text here anyway).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const doSave = async () => {
    const isSampleName = scenario.name in SAMPLE_DESCRIPTIONS;
    if (isSampleName && !window.confirm(`"${scenario.name}" はサンプル名です。上書きしますか?`)) {
      return;
    }
    await api.saveScenario(scenario.name, scenario);
    markSaved();
    refreshList();
    flash("保存しました");
  };

  const doLoad = async (file: string) => {
    if (isDirty && !window.confirm("未保存の変更があります。破棄して読み込みますか?")) return;
    setScenario(await api.loadScenario(file));
    setOpenMenu(null);
    flash("読み込みました");
  };

  const doNew = (file?: string) => {
    if (isDirty && !window.confirm("未保存の変更があります。破棄して新規作成しますか?")) return;
    if (file) {
      doLoad(file);
    } else {
      setScenario(defaultScenario());
    }
    setOpenMenu(null);
  };

  const doDelete = async (file: string, name: string) => {
    if (!window.confirm(`"${name}" を削除しますか? この操作は取り消せません。`)) return;
    await api.deleteScenario(file);
    refreshList();
  };

  // Global keyboard shortcuts. Ignored while typing so ⌘Z etc. still works
  // as native undo inside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA"].includes(target.tagName);
      if (e.key === "s") {
        e.preventDefault();
        doSave();
      } else if (e.key === "Enter") {
        e.preventDefault();
        run.start();
      } else if (!typing && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, isDirty]);

  const sampleEntries = saved.filter((s) => s.file in SAMPLE_DESCRIPTIONS);
  const userEntries = saved.filter((s) => !(s.file in SAMPLE_DESCRIPTIONS));

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warnCount = issues.filter((i) => i.level === "warning").length;
  const running = run.status?.state === "running";

  const rightTabs: { key: RightTab; label: string; disabled?: boolean }[] = [
    { key: "element", label: "要素" },
    { key: "settings", label: "設定" },
    { key: "rpl", label: "RPL", disabled: scenario.stack.routing !== "rpl" },
  ];

  const bottomTabs: { key: BottomTab; label: string }[] = [
    { key: "issues", label: "問題" },
    { key: "code", label: "コード" },
    { key: "log", label: "実行ログ" },
    { key: "rpl", label: "RPL テーブル" },
  ];

  const bottomTabBadge = (key: BottomTab) => {
    if (key === "issues" && errorCount + warnCount > 0) {
      return (
        <span className={`tab-count ${errorCount > 0 ? "count-error" : "count-warn"}`}>
          {errorCount + warnCount}
        </span>
      );
    }
    if (key === "rpl" && rplSnapshots.length > 0) {
      return <span className="tab-count">{new Set(rplSnapshots.map((s) => s.time)).size}</span>;
    }
    return null;
  };

  const renderBottomTabs = () => (
    <nav className="tabs" role="tablist" aria-label="下部パネル">
      {bottomTabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={bottomTab === t.key}
          className={bottomTab === t.key ? "active" : ""}
          onClick={() => setBottomTab(t.key)}
        >
          {t.label}
          {bottomTabBadge(t.key)}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">ns3-editor</span>
        <input
          className="scenario-name"
          aria-label="シナリオ名"
          value={scenario.name}
          onChange={(e) => updateScenario({ name: e.target.value })}
        />
        {isDirty && <span className="dirty-dot" title="未保存の変更があります" />}

        <div className="dropdown" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setOpenMenu(openMenu === "new" ? null : "new")}>新規 ▾</button>
          {openMenu === "new" && (
            <div className="dropdown-panel">
              <button onClick={() => doNew()}>空のシナリオ</button>
              <div className="dropdown-section">サンプルから</div>
              {Object.entries(SAMPLE_DESCRIPTIONS).map(([file, info]) => (
                <button key={file} onClick={() => doNew(file)}>
                  {info.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dropdown" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setOpenMenu(openMenu === "open" ? null : "open")}>開く ▾</button>
          {openMenu === "open" && (
            <div className="dropdown-panel">
              <div className="dropdown-section">サンプル</div>
              {sampleEntries.map((s) => (
                <button key={s.file} onClick={() => doLoad(s.file)}>
                  {SAMPLE_DESCRIPTIONS[s.file]?.title ?? s.name}
                </button>
              ))}
              <div className="dropdown-section">保存済み</div>
              {userEntries.length === 0 && <div className="context-empty">まだありません</div>}
              {userEntries.map((s) => (
                <div key={s.file} className="dropdown-row">
                  <button onClick={() => doLoad(s.file)}>{s.name}</button>
                  <button className="tiny danger" onClick={() => doDelete(s.file, s.name)}>
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={doSave}>保存 (⌘S)</button>

        <span className="toolbar-spacer" />

        <button onClick={undo} disabled={undoCount === 0} title="元に戻す (⌘Z)">
          ↶
        </button>
        <button onClick={redo} disabled={redoCount === 0} title="やり直す (⌘⇧Z)">
          ↷
        </button>

        <button
          className={`issue-badge-btn${errorCount + warnCount > 0 ? " has-issues" : ""}`}
          onClick={() => setBottomTab("issues")}
          title="問題タブを開く"
        >
          {errorCount > 0 && <span className="tab-count count-error">✕{errorCount}</span>}
          {warnCount > 0 && <span className="tab-count count-warn">⚠{warnCount}</span>}
          {errorCount === 0 && warnCount === 0 && <span className="tab-count">✓</span>}
        </button>

        {running ? (
          <button className="run-btn stop" onClick={run.stop}>
            ■ 停止
          </button>
        ) : (
          <button className="run-btn" onClick={run.start}>
            ▶ 実行
          </button>
        )}
        {notice && <span className="notice">{notice}</span>}
      </header>

      {backendError && <div className="backend-banner">{backendError}</div>}

      <div className="main">
        <aside className="left">
          <Palette />
        </aside>
        <div className="center">
          <Canvas />
        </div>
        <SplitPane side="left" storageKey="ns3edit.rightWidth" defaultSize={320} min={240} max={520}>
          <div className="right">
            <nav className="tabs" role="tablist" aria-label="インスペクタ">
              {rightTabs.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={rightTab === t.key}
                  className={rightTab === t.key ? "active" : ""}
                  disabled={t.disabled}
                  title={t.disabled ? "ルーティングを RPL にすると使えます" : undefined}
                  onClick={() => setRightTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="tab-body">
              {rightTab === "element" && <Properties />}
              {rightTab === "settings" && <SimSettings />}
              {rightTab === "rpl" && <RplPanel />}
            </div>
          </div>
        </SplitPane>
      </div>

      {bottomCollapsed ? (
        <div className="bottom-collapsed">
          <div className="bottom-bar">
            {renderBottomTabs()}
            <button className="bottom-collapse-btn" onClick={toggleBottomCollapsed} title="展開">
              ▲
            </button>
          </div>
        </div>
      ) : (
        <SplitPane side="top" storageKey="ns3edit.bottomHeight" defaultSize={240} min={120} max={640}>
          <div className="bottom">
            <div className="bottom-bar">
              {renderBottomTabs()}
              <button className="bottom-collapse-btn" onClick={toggleBottomCollapsed} title="折りたたむ">
                ▼
              </button>
            </div>
            <div className="tab-body">
              {bottomTab === "issues" && <IssuesPanel />}
              {bottomTab === "code" && <CodeView />}
              {bottomTab === "log" && <RunView run={run} />}
              {bottomTab === "rpl" && <RplTables />}
            </div>
          </div>
        </SplitPane>
      )}
    </div>
  );
}
