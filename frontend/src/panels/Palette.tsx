import { NETWORK_LABELS, NetworkType } from "../types";
import { useEditor } from "../store";

const SEGMENTS: Exclude<NetworkType, "p2p">[] = ["csma", "wifiAdhoc", "wifiInfra", "lrwpan"];

// New elements land in a loose grid so consecutive additions don't stack.
let drop = 0;

function nextSpot(): { x: number; y: number } {
  const i = drop++;
  return { x: 80 + (i % 4) * 90, y: 80 + Math.floor(i / 4) * 90 };
}

export function Palette() {
  const addNode = useEditor((s) => s.addNode);
  const addSegment = useEditor((s) => s.addSegment);

  return (
    <div className="palette">
      <h3>パレット</h3>
      <button
        onClick={() => {
          const p = nextSpot();
          addNode(p.x, p.y);
        }}
      >
        + ノード
      </button>
      <h4>セグメント</h4>
      {SEGMENTS.map((t) => (
        <button
          key={t}
          onClick={() => {
            const p = nextSpot();
            addSegment(t, p.x, p.y);
          }}
        >
          + {NETWORK_LABELS[t]}
        </button>
      ))}
      <div className="palette-hint">
        ノードの下ハンドルから別ノードへドラッグ = P2P リンク。
        セグメントへドラッグ = そのネットワークに参加。
        キャンバス座標がそのままシミュレーションの位置 (m) になります。
      </div>
    </div>
  );
}
