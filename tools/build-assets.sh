#!/bin/sh
# assets/src/*.svg から assets/reel.png（60x240のリールシート）を生成する。
#
# PiuのdrawTextureは拡大縮小できないため、表示サイズちょうどにラスタライズする。
# 背景はリール色で塗り潰し、透過を持たない不透明な画像にする。
#
# 必要なもの: rsvg-convert, ImageMagick(magick)

set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC="$ROOT/assets/src"
OUT="$ROOT/assets/reel.png"

SYMBOL_SIZE=60
LOGO_SIZE=56
REEL_BG='#0d0d12'

# 並び順がシンボル番号(0..3)になる。miniapp.tsのSYMBOL_NAMESと一致させること。
ORDER='geekten geeksai geekhaku geekcamp'

command -v rsvg-convert >/dev/null || { echo "rsvg-convert が必要です (brew install librsvg)" >&2; exit 1; }
command -v magick >/dev/null || { echo "ImageMagick が必要です (brew install imagemagick)" >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

PARTS=""
for name in $ORDER; do
  [ -f "$SRC/$name.svg" ] || { echo "見つかりません: $SRC/$name.svg" >&2; exit 1; }
  rsvg-convert -w "$LOGO_SIZE" -h "$LOGO_SIZE" -a "$SRC/$name.svg" -o "$TMP/$name.png"
  magick "$TMP/$name.png" -background "$REEL_BG" -alpha remove -alpha off \
    -gravity center -extent "${SYMBOL_SIZE}x${SYMBOL_SIZE}" "$TMP/p-$name.png"
  PARTS="$PARTS $TMP/p-$name.png"
done

# shellcheck disable=SC2086
magick $PARTS -append -alpha set -channel A -evaluate set 100% +channel "PNG32:$OUT"

echo "生成しました: $OUT"
magick identify "$OUT"
