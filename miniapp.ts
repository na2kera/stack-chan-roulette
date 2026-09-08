import type { MiniAppDefinition } from 'capabilities'
import 'piu/MC'
import type { Port as PiuPort, Texture as PiuTexture } from 'piu/MC'

const FRAME_INTERVAL_MS = 33

// reel.pngは1シンボル60x60を4つ縦に連結した60x240のスプライトシート。
const SYMBOL_SIZE = 60
const SYMBOL_COUNT = 4
const STRIP_HEIGHT = SYMBOL_SIZE * SYMBOL_COUNT
const VISIBLE_ROWS = 3
const WINDOW_HEIGHT = SYMBOL_SIZE * VISIBLE_ROWS

// ミニアプリに与えられる領域は320x196。
const REEL_COUNT = 3
const REEL_TOP = 4
const REEL_X = Object.freeze([60, 130, 200])

const PAYLINE_TOP = REEL_TOP + SYMBOL_SIZE
const PAYLINE_BOTTOM = PAYLINE_TOP + SYMBOL_SIZE
const PAYLINE_LEFT = 48
const PAYLINE_WIDTH = 224

const STATUS_TOP = REEL_TOP + WINDOW_HEIGHT
const STATUS_HEIGHT = 12

const SPIN_SPEED = 13
const STOP_SLIP = 30
const STOP_MIN_SPEED = 3
const STOP_EASING = 0.32

const COLOR_BACKGROUND = '#12121a'
const COLOR_FRAME = '#5a5a70'
const COLOR_FRAME_ACTIVE = '#9a9ab8'
const COLOR_PAYLINE = '#8a7a3a'
const COLOR_TEXT = '#c8c8d8'
const COLOR_WIN = '#ffcc33'

const SYMBOL_NAMES = Object.freeze(['技育展', '技育祭', '技育博', '技育CAMP'])

const background = new Skin({ fill: COLOR_BACKGROUND })
const statusStyle = new Style({ font: 'k8x12-12', horizontal: 'center', vertical: 'middle' })

let reelTexture: PiuTexture | undefined

function getReelTexture(): PiuTexture {
  reelTexture ??= new Texture('reel.png')
  return reelTexture
}

/** スクロール位置をシート内([0, STRIP_HEIGHT))へ丸める。 */
function normalize(position: number): number {
  const wrapped = position % STRIP_HEIGHT
  return wrapped < 0 ? wrapped + STRIP_HEIGHT : wrapped
}

/**
 * ペイライン（中央の行）に表示されているシンボル番号を返す。
 * スクロール位置pのときシート座標pが窓の最上端に来るため、中央行の先頭はp+SYMBOL_SIZE。
 */
function paylineSymbol(position: number): number {
  return (Math.round(normalize(position) / SYMBOL_SIZE) + 1) % SYMBOL_COUNT
}

type ReelPhase = 'spinning' | 'stopping' | 'stopped'

class Reel {
  position = 0
  phase: ReelPhase = 'stopped'
  target = 0

  start(): void {
    this.position = Math.floor(Math.random() * SYMBOL_COUNT) * SYMBOL_SIZE
    this.phase = 'spinning'
    this.target = 0
  }

  /** 停止を指示する。最低STOP_SLIPだけ滑ってから次の区切りで止まる。 */
  requestStop(): void {
    if (this.phase !== 'spinning') return
    this.target = Math.ceil((this.position + STOP_SLIP) / SYMBOL_SIZE) * SYMBOL_SIZE
    this.phase = 'stopping'
  }

  update(): void {
    if (this.phase === 'spinning') {
      this.position = normalize(this.position + SPIN_SPEED)
      return
    }
    if (this.phase !== 'stopping') return
    const remaining = this.target - this.position
    const step = Math.max(STOP_MIN_SPEED, Math.min(SPIN_SPEED, remaining * STOP_EASING))
    if (remaining <= step) {
      this.position = normalize(this.target)
      this.phase = 'stopped'
      return
    }
    this.position += step
  }
}

type GamePhase = 'ready' | 'spinning' | 'result'

class GeekSlotBehavior extends Behavior {
  #reels = [new Reel(), new Reel(), new Reel()]
  #phase: GamePhase = 'ready'
  #win = false

  onDisplaying(port: PiuPort): void {
    port.interval = FRAME_INTERVAL_MS
    // 初期表示で3リールが同じ絵柄にならないようずらしておく。
    for (let index = 0; index < REEL_COUNT; index++) {
      this.#reels[index].position = index * SYMBOL_SIZE
    }
    port.invalidate()
  }

  onUndisplaying(port: PiuPort): void {
    port.stop()
  }

  onTouchBegan(port: PiuPort, _id: number, x: number): void {
    if (this.#phase === 'spinning') {
      const lane = Math.floor((x / port.width) * REEL_COUNT)
      this.#reels[Math.min(REEL_COUNT - 1, Math.max(0, lane))].requestStop()
      port.invalidate()
      return
    }
    this.#start(port)
  }

  onTouchEnded(): void {}

  onTimeChanged(port: PiuPort): void {
    for (const reel of this.#reels) reel.update()
    if (this.#phase === 'spinning' && this.#reels.every((reel) => reel.phase === 'stopped')) {
      this.#finish(port)
    }
    port.invalidate()
  }

  onDraw(port: PiuPort, x = 0, y = 0, width = port.width, height = port.height): void {
    port.fillColor(COLOR_BACKGROUND, x, y, width, height)
    for (let index = 0; index < REEL_COUNT; index++) this.#drawReel(port, index)
    this.#drawPayline(port)
    this.#drawStatus(port)
  }

  #start(port: PiuPort): void {
    for (const reel of this.#reels) reel.start()
    this.#phase = 'spinning'
    this.#win = false
    port.interval = FRAME_INTERVAL_MS
    port.start()
    port.invalidate()
  }

  #finish(port: PiuPort): void {
    const first = paylineSymbol(this.#reels[0].position)
    this.#win = this.#reels.every((reel) => paylineSymbol(reel.position) === first)
    this.#phase = 'result'
    port.stop()
  }

  #drawReel(port: PiuPort, index: number): void {
    const reel = this.#reels[index]
    const left = REEL_X[index]
    const offset = Math.floor(normalize(reel.position))
    const texture = getReelTexture()
    // 窓がシート末尾をまたぐ場合は先頭へ折り返して2回に分けて描く。
    const first = Math.min(WINDOW_HEIGHT, STRIP_HEIGHT - offset)
    port.drawTexture(texture, '#ffffff', left, REEL_TOP, 0, offset, SYMBOL_SIZE, first)
    if (first < WINDOW_HEIGHT) {
      port.drawTexture(texture, '#ffffff', left, REEL_TOP + first, 0, 0, SYMBOL_SIZE, WINDOW_HEIGHT - first)
    }

    const frame = reel.phase === 'stopped' ? COLOR_FRAME : COLOR_FRAME_ACTIVE
    port.fillColor(frame, left - 1, REEL_TOP - 1, SYMBOL_SIZE + 2, 1)
    port.fillColor(frame, left - 1, REEL_TOP + WINDOW_HEIGHT, SYMBOL_SIZE + 2, 1)
    port.fillColor(frame, left - 1, REEL_TOP - 1, 1, WINDOW_HEIGHT + 2)
    port.fillColor(frame, left + SYMBOL_SIZE, REEL_TOP - 1, 1, WINDOW_HEIGHT + 2)
  }

  #drawPayline(port: PiuPort): void {
    const color = this.#phase === 'result' && this.#win ? COLOR_WIN : COLOR_PAYLINE
    port.fillColor(color, PAYLINE_LEFT, PAYLINE_TOP - 1, PAYLINE_WIDTH, 2)
    port.fillColor(color, PAYLINE_LEFT, PAYLINE_BOTTOM - 1, PAYLINE_WIDTH, 2)
  }

  #drawStatus(port: PiuPort): void {
    let message = 'タップでスタート'
    let color = COLOR_TEXT
    if (this.#phase === 'spinning') {
      message = '左 / 中央 / 右 をタップして止める'
    } else if (this.#phase === 'result') {
      if (this.#win) {
        message = `${SYMBOL_NAMES[paylineSymbol(this.#reels[0].position)]} が揃った！`
        color = COLOR_WIN
      } else {
        message = 'はずれ — タップでもう一度'
      }
    }
    port.drawString(message, statusStyle, color, 0, STATUS_TOP, port.width, STATUS_HEIGHT)
  }
}

const definition: MiniAppDefinition = Object.freeze({
  id: 'geek.slot',
  title: '技育スロット',
  icon: 'play',
  create() {
    return new Container(null, {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      skin: background,
      contents: [
        new Port(null, {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          active: true,
          Behavior: GeekSlotBehavior,
        }),
      ],
    })
  },
})

const definitions: readonly MiniAppDefinition[] = Object.freeze([definition])

export default definitions
