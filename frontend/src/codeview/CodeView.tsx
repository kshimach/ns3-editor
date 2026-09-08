// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useState } from "react";

import { api } from "../api";
import { useEditor } from "../store";

export function CodeView() {
  const scenario = useEditor((s) => s.scenario);
  const setIssues = useEditor((s) => s.setIssues);
  const setBottomTab = useEditor((s) => s.setBottomTab);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setGenError(null);
    try {
      const res = await api.generate(scenario);
      setCode(res.code);
      setIssues(res.issues);
      if (res.code === null) {
        // Validation/codegen failed -- the detail lives in the 問題 tab, not
        // duplicated here.
        setBottomTab("issues");
      }
    } catch (e) {
      setCode(null);
      setGenError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="code-view">
      <div className="code-toolbar">
        <button onClick={generate} disabled={busy}>
          {busy ? "生成中..." : "コードを生成して表示"}
        </button>
        {code && <button onClick={() => navigator.clipboard.writeText(code)}>コピー</button>}
        {genError && <span className="run-error">{genError}</span>}
      </div>
      {code ? (
        <pre className="code">{code}</pre>
      ) : (
        <div className="hint">
          「コードを生成して表示」を押すと生成された C++ のプレビューが表示されます。エラー・警告は
          「問題」タブで確認できます。
        </div>
      )}
    </div>
  );
}
