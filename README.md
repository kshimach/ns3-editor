# ns3-editor

ns-3 のシナリオをブラウザで視覚的に組み立て、C++ コードを生成して `./ns3 run` まで行う GUI エディタ。

- キャンバスでノード・リンク・共有セグメント (CSMA / WiFi / LR-WPAN) をドラッグ配置
- キャンバス座標がそのまま `ConstantPositionMobilityModel` の座標 (px × スケール = m) になる
- スタック設定 (IPv4/IPv6、global / static / RPL ルーティング)、アプリ (Ping / UDP Echo / OnOff)
- 検証 → C++ 生成 (`scratch/ns3edit-<name>.cc`) → 実行 → ログを WebSocket でライブ表示
- RPL は contrib/rpl (RFC 6550 + ETX/MRHOF + LQL) のプリセットに対応

## 必要環境

- Python 3.11+ / Node 18+
- ビルド済みの ns-3 ツリー (`./ns3` ラッパが動くこと)。場所は環境変数 `NS3_DIR` で指定 (デフォルト `~/ns-3-dev`)

## セットアップ

```bash
# バックエンド
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"

# フロントエンド
cd ../frontend
npm install
```

## 起動

開発モード (ホットリロード):

```bash
# ターミナル1
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

# ターミナル2
cd frontend && npm run dev    # http://localhost:5173 を開く
```

単体モード (ビルド済みフロントを FastAPI が配信):

```bash
cd frontend && npm run build
cd ../backend && .venv/bin/uvicorn app.main:app --port 8000
# http://localhost:8000 を開く
```

## 使い方

詳しい操作方法は [docs/MANUAL.md](docs/MANUAL.md) を参照。要点:

1. 左パレットからノード・セグメントを追加 (未所属ノードは自動でセグメントに参加する)
2. 参加先の変更・PHY/MAC 設定はノードやセグメントの右クリックメニューから
3. 下部「シナリオ設定」でスタック・アプリ・シミュレーション時間を設定
4. 「生成コード」タブで検証+C++ プレビュー、「実行」タブで実行・ログ確認
5. ツールバーで保存/読込 (`scenarios/*.json`)

サンプル: `wifi-adhoc-ping` (IPv4 WiFi アドホック 2 ノード)、`rpl-line` (LR-WPAN 3 ノード直列、RPL MRHOF+LQL)、`rpl-mesh` (LR-WPAN 5 ノードのメッシュ、RPL MRHOF+LQL)。

## 注意

- デフォルト設定の WiFi は約 50m を超えると受信不可 (preamble 検出閾値 -82dBm)。ノード間隔に注意
- 6LoWPAN (lr-wpan) は IPv6 必須。セグメント追加時にスタックが自動で IPv6 に切り替わる。IPv6 のアドレスは `2001:<n>::/64` を自動割当 (`2001:db8::` は ns-3 が forward しないため不使用)
- 実行は同時 1 本 (ns-3 ビルドロック衝突回避)。成果物 (pcap 等) は `runs/<timestamp>/` に隔離

## テスト

```bash
cd backend && .venv/bin/python -m pytest
```

生成コードのコンパイル確認は ns-3 側で: `./ns3 build ns3edit-<name>`
