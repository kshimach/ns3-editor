// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { api } from "../api";
import { SAMPLE_DESCRIPTIONS } from "../samples";
import { useEditor } from "../store";

/**
 * Shown over the canvas when the scenario is empty (no nodes, no networks).
 * The blank dotted grid otherwise gives a first-time user nothing to go on.
 */
export function EmptyState() {
  const setScenario = useEditor((s) => s.setScenario);

  const loadSample = async (file: string) => {
    setScenario(await api.loadScenario(file));
  };

  return (
    <div className="empty-state">
      <div className="empty-state-card">
        <h3>シナリオを組み立てる</h3>
        <ol className="empty-steps">
          <li>左の「パレット」からノードとセグメントを追加</li>
          <li>右の「設定」タブでスタック・アプリを設定</li>
          <li>ツールバーの「▶ 実行」で検証・生成・実行</li>
        </ol>
        <p className="hint">またはサンプルから始める:</p>
        <div className="sample-list">
          {Object.entries(SAMPLE_DESCRIPTIONS).map(([file, info]) => (
            <button key={file} className="sample-card" onClick={() => loadSample(file)}>
              <div className="sample-card-head">
                <span className="sample-title">{info.title}</span>
                <span className={`sample-routing routing-${info.routing}`}>{info.routing}</span>
              </div>
              <p className="sample-desc">{info.description}</p>
              <span className="sample-nodes">{info.nodes} ノード</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
