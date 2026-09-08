# 技育スロット

M5StackChan CoreS3 のｽﾀｯｸﾁｬﾝファームウェア上で動くスロット MOD（ミニアプリ）。
技育展・技育祭・技育博・技育CAMP の 4 つのロゴが 3 リールで回り、タップで 1 つずつ止める。
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

## アセットの再生成

`assets/reel.png` は 1 シンボル 60x60 を 4 つ縦に連結した 60x240 のスプライトシート。
`assets/src/*.svg` から生成する。

```console
./tools/build-assets.sh
```

`rsvg-convert`（librsvg）と ImageMagick が必要。

## ホストファームウェアの注意点（頭部タッチセンサ）

手元の M5StackChan では頭部タッチセンサ（Si12T、I2C 0x68）が応答せず、
upstream のホストが `new TouchPanel()` で `write failed` を投げて起動を中断する
（顔は出るが `app behaviors ready` に到達せず、MOD が登録されない）。

回避策として、`config.TouchPanel = false` を与えるホストマニフェストを用意している。
`compose.ts` の `config.TouchPanel ?? device.sensor.TouchPanel` が falsy になり、
Si12T の生成自体をスキップする。**頭部タッチ（撫でる操作）は無効になる**。

このファイルはフォントの `characterFiles` が `host/app/` 基準の相対パスで
書かれている都合で、**upstream の `host/app/` 直下に置かないと解決できない**。
roulette 側を正本にし、コピーして使う。

```console
cp host-manifest-no-touchpanel.json \
  ../stack-chan/firmware/host/app/manifest_m5stackchan_cores3_no_touchpanel.json
cd ../stack-chan/firmware
npm run flash:m5stackchan_cores3 -- \
  --manifest host/app/manifest_m5stackchan_cores3_no_touchpanel.json \
  --port /dev/cu.usbmodem101
```

upstream 側には未追跡ファイルが 1 つ増えるだけで、`git pull` は妨げない。
本来は upstream の堅牢性の問題（任意センサの失敗で起動全体が止まる）なので、
issue として報告する価値がある。

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
