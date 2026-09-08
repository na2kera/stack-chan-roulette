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
npm run mod -- ../../roulette/manifest.json
```

ビルドのみ確認する場合は `npm run mod:build -- ../../roulette/manifest.json`。

## アセットの再生成

`assets/reel.png` は 1 シンボル 60x60 を 4 つ縦に連結した 60x240 のスプライトシート。
`assets/src/*.svg` から生成する。

```console
./tools/build-assets.sh
```

`rsvg-convert`（librsvg）と ImageMagick が必要。

## 設計メモ

Piu の `Port.drawTexture` には**転送先のサイズ指定がない**。
つまり拡大縮小も回転もできないため、次の制約がある。

- 画像は表示サイズ（60x60）ちょうどにラスタライズする。SVG を実行時に描画することはできない
- 円盤が回転するルーレットは実装できないため、縦スクロールのスロット形式にしている

3 リールは 1 枚の `reel.png` を共有し、スクロール位置だけを別々に持つ。
窓（180px）がシート末尾（240px）をまたぐときは、先頭へ折り返して 2 回に分けて描画する。

シンボル番号はシートの並び順と一致する（0=技育展, 1=技育祭, 2=技育博, 3=技育CAMP）。
`tools/build-assets.sh` の `ORDER` と `miniapp.ts` の `SYMBOL_NAMES` を必ず揃えること。
# stack-chan-roulette
