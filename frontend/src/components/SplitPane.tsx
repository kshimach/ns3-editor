// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A drag-resizable divider next to one panel of a flex layout.
 *
 * Deliberately not a general split-view: it only resizes the *sibling*
 * passed in as `panel`, along the given `side`, and persists the size in
 * localStorage under `storageKey`. There is no dependency to pull in for
 * this -- the whole thing is a few dozen lines of pointer events.
 */
export function SplitPane({
  side,
  storageKey,
  defaultSize,
  min = 160,
  max = 640,
  className,
  children,
}: {
  /** Which edge of `children` the drag handle sits on. */
  side: "left" | "right" | "top";
  storageKey: string;
  defaultSize: number;
  min?: number;
  max?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [size, setSize] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      const parsed = stored ? Number(stored) : NaN;
      return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : defaultSize;
    } catch {
      return defaultSize;
    }
  });
  const dragRef = useRef<{ start: number; size: number } | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = side === "left" ? drag.start - e.clientX : e.clientX - drag.start;
      const verticalDelta = drag.start - e.clientY;
      const raw = side === "top" ? drag.size + verticalDelta : drag.size + delta;
      setSize(Math.min(max, Math.max(min, raw)));
    },
    [side, min, max],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    setSize((s) => {
      try {
        localStorage.setItem(storageKey, String(s));
      } catch {
        // Private browsing / storage disabled: the size just won't persist.
      }
      return s;
    });
  }, [onPointerMove, storageKey]);

  const startDrag = (e: React.PointerEvent) => {
    dragRef.current = { start: side === "top" ? e.clientY : e.clientX, size };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  };

  useEffect(
    () => () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
    },
    [onPointerMove, endDrag],
  );

  const style =
    side === "top" ? { height: size } : { width: size };

  return (
    <div className={`split-pane split-${side}${className ? ` ${className}` : ""}`} style={style}>
      <div
        className={`split-handle split-handle-${side}`}
        onPointerDown={startDrag}
        role="separator"
        aria-orientation={side === "top" ? "horizontal" : "vertical"}
      />
      <div className="split-content">{children}</div>
    </div>
  );
}
