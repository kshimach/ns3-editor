// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useEditor } from "../store";
import { Issue, Scenario } from "../types";

/** True for a network/node id, false for an app id or a stack-level (null) issue. */
function isCanvasElement(scenario: Scenario, id: string) {
  return scenario.nodes.some((n) => n.id === id) || scenario.networks.some((n) => n.id === id);
}

export function IssuesPanel() {
  const issues = useEditor((s) => s.issues);
  const scenario = useEditor((s) => s.scenario);
  const select = useEditor((s) => s.select);
  const setRightTab = useEditor((s) => s.setRightTab);

  const goTo = (issue: Issue) => {
    if (issue.elementId === null) {
      // Stack-level problem (e.g. "RPL は IPv6 専用です"): nothing on the
      // canvas to select, but the fix lives in the スタック settings.
      setRightTab("settings");
      return;
    }
    if (isCanvasElement(scenario, issue.elementId)) {
      const isNode = scenario.nodes.some((n) => n.id === issue.elementId);
      select({ kind: isNode ? "node" : "network", id: issue.elementId });
    } else {
      // An app id: apps live on the 設定 tab with no canvas presence.
      select({ kind: "app", id: issue.elementId });
      setRightTab("settings");
    }
  };

  const label = (issue: Issue): string => {
    if (issue.elementId === null) return "";
    const node = scenario.nodes.find((n) => n.id === issue.elementId);
    if (node) return node.name || node.id;
    const net = scenario.networks.find((n) => n.id === issue.elementId);
    if (net) return net.id;
    const app = scenario.apps.find((a) => a.id === issue.elementId);
    if (app) return `${app.type} アプリ`;
    return issue.elementId;
  };

  if (issues.length === 0) {
    return <div className="issues-panel empty hint">問題はありません</div>;
  }

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  return (
    <div className="issues-panel">
      <ul className="issues">
        {[...errors, ...warnings].map((issue, i) => (
          <li key={i} className={issue.level}>
            <button className="issue-row" onClick={() => goTo(issue)}>
              <span className={`issue-badge ${issue.level}`}>
                {issue.level === "error" ? "エラー" : "警告"}
              </span>
              {issue.elementId && <span className="issue-target">{label(issue)}</span>}
              <span className="issue-message">{issue.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
