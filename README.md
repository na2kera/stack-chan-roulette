# 技育スロット

M5StackChan CoreS3 のｽﾀｯｸﾁｬﾝファームウェア上で動くスロット MOD（ミニアプリ）。
技育展・技育祭・技育博・技育CAMP の 4 つのロゴが 3 リールで回り、画面または頭部タップで開始して画面タップで 1 つずつ止める。
中央のペイラインに同じロゴが 3 つ揃えば当たり。

## 必要なもの

- M5StackChan CoreS3（ｽﾀｯｸﾁｬﾝファームウェア書き込み済み）
- [stack-chan/stack-chan](https://github.com/stack-chan/stack-chan) のクローンと Moddable SDK

### ディレクトリ配置

`manifest.json` が相対パスで upstream の型定義を参照しているため、**次の位置関係を保つこと**。

```
dev/stack-chan/
├── stack-chan/   # git clone https://github.com/stack-chan/stack-chan.git
└── roulette/     # このリポジトリ
```

配置を変える場合は `manifest.json` の
`../stack-chan/firmware/host/app/manifest_typings.json` を直すこと。

## ビルドと書き込み

Moddable SDK のセットアップは upstream の
[環境構築](https://github.com/stack-chan/stack-chan/blob/develop/firmware/docs/getting-started_ja.md)
に従う。セットアップ済みなら `stack-chan/firmware` から次を実行する。

```console
# MOD の書き込みは esptool を直接呼ぶため、ESP-IDF の venv を PATH に足しておく
export PATH="$HOME/.espressif/python_env/idf6.0_py3.13_env/bin:$PATH"
npm run mod -- ../../roulette/manifest.json --port /dev/cu.usbmodem101
```

ビルドのみ確認する場合は `npm run mod:build -- ../../roulette/manifest.json`。
ポートの自動検出は環境によって失敗するので `--port` を明示する。

## ローカルテスト

Node.js 23.2 以降で `node --test tests/*.test.mjs` を実行する。
Piu とハードウェア API をスタブ化し、実装の停止操作・リーチ通知・消灯・エラー処理を検証する。
実機での発光・発話品質は別途確認する。

## アセットの再生成

`assets/reel.png` は 1 シンボル 60x60 を 4 つ縦に連結した 60x240 のスプライトシート。
`assets/src/*.svg` から生成する。

```console
./tools/build-assets.sh
```

`rsvg-convert`（librsvg）と ImageMagick が必要。

## 頭部タッチ

標準の M5StackChan CoreS3 ホストで有効な Si12T 頭部タッチセンサを使う。
スロットが待機中または結果表示中のとき、頭部を短くタップして離すとリールが回り始める。
スワイプや長押しは開始操作として扱わない。リールの停止には従来どおり画面タップを使う。

`config.TouchPanel = false` のホストマニフェストで書き込んでいる場合は、
upstream 標準の `host/app/manifest_m5stackchan_cores3.json` でホストを書き込み直す。

## スタート演出

画面または頭部タップで開始すると、ホストの音声機能で「スタート」と発話し、
頭部 LED（`head`）が約 1.2 秒間、虹色に光る。
その間にリーチになった場合は、開始演出のタイマーを解除して黄色のリーチ演出へ切り替える。
発話を待たずにリールが回り、全リール停止時やアプリを閉じたときは LED を消灯する。
発話中に再スタートした場合は音声を重ねない。

音声にはホストで設定済みの TTS を使うため、そのプロバイダの設定が必要。
LED 非搭載時や音声・LED のエラー時もゲームは継続し、エラーはシリアルログへ出力する。
実機では画面・頭部の両方で開始し、発話、発光、約 1.2 秒後の消灯、
演出中にアプリを閉じた際の消灯を確認する。

MOD ビルド後は、生成された JS を使って操作・消灯・エラー時の継続を検証できる。
次はこのリポジトリで実行する例（worktree 名に応じて `roulette` 部分を変更する）。

```console
node tools/test-start-effects.mjs ../stack-chan/firmware/dist/tmp/esp32/debug/roulette/tsc
```

このテストは音声・LED・Piu をスタブ化しており、実機の音や発光の確認は別途必要。

## リーチ演出

停止済みの2リールの中央絵柄が一致し、残りの1リールがまだ動いているとリーチ。
停止順にかかわらず、頭部 LED を黄色に点灯し、ホストに設定された音声合成で「リーチ」と一度だけ発話する。
全リール停止時とアプリを閉じたときに消灯する。同じフレームで3リールが停止した場合は結果表示に進む。
LED や音声の機能が使えない場合も、スロットの操作は継続できる。

## 設計メモ

Piu の `Port.drawTexture` には**転送先のサイズ指定がない**。
つまり拡大縮小も回転もできないため、次の制約がある。

- 画像は表示サイズ（60x60）ちょうどにラスタライズする。SVG を実行時に描画することはできない
- 円盤が回転するルーレットは実装できないため、縦スクロールのスロット形式にしている

3 リールは 1 枚の `reel.png` を共有し、スクロール位置だけを別々に持つ。
窓（180px）がシート末尾（240px）をまたぐときは、先頭へ折り返して 2 回に分けて描画する。

画像のビルド形式は、CoreS3 のホストに合わせて `manifest.json` の
`config.format` で `RGB565BE` を指定する。省略すると MOD は既定の
`RGB565LE` で変換され、ホストとのバイト順の違いで画像の色が崩れる。

シンボル番号はシートの並び順と一致する（0=技育展, 1=技育祭, 2=技育博, 3=技育CAMP）。
`tools/build-assets.sh` の `ORDER` と `miniapp.ts` の `SYMBOL_NAMES` を必ず揃えること。
# stack-chan-roulette
