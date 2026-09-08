// Copyright (c) 2026 kawashy. All rights reserved.
// Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
// without written permission.

/** Badge on a node acting as the RPL DODAG root. */
export function CrownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8z"
        fill="#d9a441"
        stroke="#9c7220"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A node on a wired segment (CSMA / P2P). */
export function WiredIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="16" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 20h6M12 17v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A node on a wireless segment (WiFi / LR-WPAN). */
export function WirelessIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9a11 11 0 0 1 16 0M7 12.5a7 7 0 0 1 10 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="17" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** A node on no shared segment at all (isolated, or p2p-only). */
export function UnconnectedIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="3 3"
      />
    </svg>
  );
}
