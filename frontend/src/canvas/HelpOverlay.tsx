// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useEffect } from "react";

const OPERATIONS: { title: string; body: string }[] = [
  {
    title: "ノード・セグメントを追加",
    body: "左のパレットのボタンから追加。セグメントを追加すると、未所属のノードは自動でそこに参加する。以降に追加したノードも、セグメントが 1 つだけならそこに参加する",
  },
  {
    title: "P2P リンクを作る",
    body: "ノード下端の丸いハンドルから別のノードへドラッグ。セグメントとは別物で、キャンバス上に線として描画される",
  },
  {
    title: "セグメントに参加・離脱",
    body: "ノードやセグメントを右クリック、またはノード下端のハンドルからセグメントへドラッグ",
  },
  {
    title: "PHY/MAC 設定を開く",
    body: "セグメントをクリックして右パネルの「要素」タブ、またはノードの右クリックメニューから",
  },
  {
    title: "DODAG root にする",
    body: "RPL ルーティングのとき、ノードの右クリックメニューから指定できる",
  },
  {
    title: "削除",
    body: "要素を選択して Delete / Backspace キー、または右クリックメニュー・右パネルの削除ボタン",
  },
  {
    title: "座標について",
    body: "キャンバス座標がそのままシミュレーションの位置になる (px x スケール = m)",
  },
];

const SHORTCUTS: { keys: string; body: string }[] = [
  { keys: "Delete / Backspace", body: "選択中の要素を削除" },
  { keys: "Escape", body: "選択解除・メニューを閉じる" },
  { keys: "⌘S / Ctrl+S", body: "保存" },
  { keys: "⌘Z / Ctrl+Z", body: "元に戻す" },
  { keys: "⌘⇧Z / Ctrl+Shift+Z", body: "やり直す" },
  { keys: "⌘Enter / Ctrl+Enter", body: "実行" },
  { keys: "?", body: "このヘルプを開く" },
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>操作ガイド</h3>
          <button className="tiny" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className="modal-body">
          <h4>キャンバス操作</h4>
          <dl className="help-list">
            {OPERATIONS.map((op) => (
              <div key={op.title} className="help-item">
                <dt>{op.title}</dt>
                <dd>{op.body}</dd>
              </div>
            ))}
          </dl>
          <h4>キーボードショートカット</h4>
          <dl className="help-list">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="help-item">
                <dt className="mono">{s.keys}</dt>
                <dd>{s.body}</dd>
              </div>
            ))}
          </dl>
          <p className="hint">
            さらに詳しい説明は <code>docs/MANUAL.md</code> を参照。
          </p>
        </div>
      </div>
    </div>
  );
}
