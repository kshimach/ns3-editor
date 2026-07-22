import { useState } from "react";

import { api } from "../api";
import { useEditor } from "../store";
import { Issue } from "../types";

export function CodeView() {
  const scenario = useEditor((s) => s.scenario);
  const setIssues = useEditor((s) => s.setIssues);
  const [code, setCode] = useState<string | null>(null);
  const [issues, setLocalIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.generate(scenario);
      setCode(res.code);
      setLocalIssues(res.issues);
      setIssues(res.issues);
    } catch (e) {
      setCode(null);
      setLocalIssues([{ level: "error", elementId: null, message: String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="code-view">
      <div className="code-toolbar">
        <button onClick={generate} disabled={busy}>
          {busy ? "生成中..." : "コード生成"}
        </button>
        {code && (
          <button onClick={() => navigator.clipboard.writeText(code)}>コピー</button>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((i, k) => (
            <li key={k} className={i.level}>
              [{i.level === "error" ? "エラー" : "警告"}]
              {i.elementId ? ` ${i.elementId}: ` : " "}
              {i.message}
            </li>
          ))}
        </ul>
      )}
      {code ? (
        <pre className="code">{code}</pre>
      ) : (
        <div className="hint">「コード生成」を押すと生成された C++ が表示されます</div>
      )}
    </div>
  );
}
