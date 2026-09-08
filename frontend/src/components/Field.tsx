// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { ReactNode } from "react";

/**
 * A labeled form control with an optional unit suffix, a hover/focus help
 * tooltip, and a "changed from default" indicator with a one-click reset.
 *
 * `NumberField` and the other raw inputs stay dumb; this is the layer that
 * makes a parameter self-documenting without every call site repeating the
 * same markup for "is this non-default, and how do I get back".
 */
export function Field({
  label,
  unit,
  help,
  isDefault,
  onReset,
  children,
}: {
  label: string;
  unit?: string;
  /** Short explanation shown via a `?` affordance -- keep it to a sentence or two. */
  help?: string;
  /** When false, shows a dot and a "既定に戻す" button next to the label. */
  isDefault?: boolean;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label-row">
        <span className="field-label">
          {label}
          {unit && <span className="field-unit"> ({unit})</span>}
        </span>
        {help && (
          <span className="field-help" tabIndex={0}>
            <span className="field-help-icon">?</span>
            <span className="field-help-tip" role="tooltip">
              {help}
            </span>
          </span>
        )}
        {isDefault === false && (
          <span className="field-changed">
            <span className="field-changed-dot" title="既定値から変更されています" />
            {onReset && (
              <button type="button" className="field-reset" onClick={onReset}>
                既定に戻す
              </button>
            )}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
