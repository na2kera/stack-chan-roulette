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

  start(symbol: number): void {
    this.position = symbol * SYMBOL_SIZE
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

// SDKのContent.applicationは公開型に未定義のため、利用する範囲だけ補う。
type EffectsApplication = {
  delegate(message: string, active: boolean): unknown
}

type GamePhase = 'ready' | 'spinning' | 'result'

type HeadTapEvent = Readonly<{
  ticks: number
}>

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

class GeekSlotBehavior extends Behavior {
  #reels = [new Reel(), new Reel(), new Reel()]
  #phase: GamePhase = 'ready'
  #win = false
  #reach = false
  #effectsApplication: EffectsApplication | undefined
  #frame = 0
  #draws = 0
  #seed = 0x6d2b79f5

  onDisplaying(port: PiuPort): void {
    trace(`[slot] onDisplaying width=${port.width} height=${port.height}\n`)
    this.#effectsApplication = (port as PiuPort & { application?: EffectsApplication }).application
    port.interval = FRAME_INTERVAL_MS
    // 初期表示で3リールが同じ絵柄にならないようずらしておく。
    for (let index = 0; index < REEL_COUNT; index++) {
      this.#reels[index].position = index * SYMBOL_SIZE
    }
    port.invalidate()
  }

  onUndisplaying(port: PiuPort): void {
    port.stop()
    this.#setReach(false)
    this.#effectsApplication = undefined
  }

  onTouchBegan(port: PiuPort, _id: number, x: number, _y: number, ticks = 0): void {
    trace(`[slot] onTouchBegan phase=${this.#phase} x=${x}\n`)
    try {
      if (this.#phase === 'spinning') {
        const lane = Math.floor((x / port.width) * REEL_COUNT)
        this.#reels[Math.min(REEL_COUNT - 1, Math.max(0, lane))].requestStop()
        port.invalidate()
        return
      }
      this.#start(port, ticks)
    } catch (error) {
      trace(`[slot] EXC onTouchBegan: ${describeError(error)}\n`)
    }
  }

  onTouchEnded(): void {}

  onGeekSlotHeadTap(port: PiuPort, event: HeadTapEvent): void {
    trace(`[slot] head tap phase=${this.#phase}\n`)
    if (this.#phase === 'spinning') return
    try {
      this.#start(port, event.ticks)
    } catch (error) {
      trace(`[slot] EXC onGeekSlotHeadTap: ${describeError(error)}\n`)
    }
  }

  onTimeChanged(port: PiuPort): void {
    try {
      this.#frame++
      if (this.#frame <= 3 || this.#frame % 30 === 0) {
        trace(`[slot] onTimeChanged frame=${this.#frame} draws=${this.#draws} pos=${this.#reels.map((r) => Math.floor(r.position)).join(',')}\n`)
      }
      for (const reel of this.#reels) reel.update()
      if (this.#phase === 'spinning' && this.#reels.every((reel) => reel.phase === 'stopped')) {
        this.#finish(port)
      } else if (this.#phase === 'spinning') {
        const stopped = this.#reels.filter((reel) => reel.phase === 'stopped')
        this.#setReach(stopped.length === 2 && paylineSymbol(stopped[0].position) === paylineSymbol(stopped[1].position))
      }
      port.invalidate()
    } catch (error) {
      trace(`[slot] EXC onTimeChanged: ${describeError(error)}\n`)
    }
  }

  onDraw(port: PiuPort, x = 0, y = 0, width = port.width, height = port.height): void {
    this.#draws++
    if (this.#draws <= 3) trace(`[slot] onDraw #${this.#draws} phase=${this.#phase} rect=${x},${y},${width},${height}\n`)
    try {
      port.fillColor(COLOR_BACKGROUND, x, y, width, height)
      for (let index = 0; index < REEL_COUNT; index++) this.#drawReel(port, index)
      if (this.#draws <= 3) trace('[slot] onDraw: reels ok\n')
      this.#drawPayline(port)
      this.#drawStatus(port)
      if (this.#draws <= 3) trace('[slot] onDraw: done\n')
    } catch (error) {
      trace(`[slot] EXC onDraw: ${describeError(error)}\n`)
    }
  }

  #start(port: PiuPort, ticks: number): void {
    this.#setReach(false)
    trace('[slot] start\n')
    // CompartmentではMath.random()が禁止されるため、タップ時刻を混ぜたxorshift32を使う。
    this.#seed = (this.#seed ^ (ticks | 0)) || 0x6d2b79f5
    for (const reel of this.#reels) {
      this.#seed ^= this.#seed << 13
      this.#seed ^= this.#seed >>> 17
      this.#seed ^= this.#seed << 5
      reel.start(Math.floor(((this.#seed >>> 0) / 0x100000000) * SYMBOL_COUNT))
    }
    trace(`[slot] start: reels ok pos=${this.#reels.map((r) => r.position).join(',')}\n`)
    this.#phase = 'spinning'
    this.#win = false
    port.interval = FRAME_INTERVAL_MS
    trace('[slot] start: interval ok\n')
    port.start()
    trace('[slot] start: clock started\n')
    port.invalidate()
    trace('[slot] start: invalidated\n')
  }

  #setReach(active: boolean): void {
    if (this.#reach === active) return
    this.#reach = active
    // ハードウェア操作はMOD側に委譲し、演出の失敗でゲームを止めない。
    try {
      this.#effectsApplication?.delegate('onGeekSlotReachChanged', active)
    } catch (error) {
      trace(`[slot] reach effect failed: ${describeError(error)}\n`)
    }
  }

  #finish(port: PiuPort): void {
    this.#setReach(false)
    const first = paylineSymbol(this.#reels[0].position)
    this.#win = this.#reels.every((reel) => paylineSymbol(reel.position) === first)
    trace(`[slot] finish win=${this.#win} symbol=${first}\n`)
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
    let message = '画面または頭部タップでスタート'
    let color = COLOR_TEXT
    if (this.#phase === 'spinning') {
      message = '左 / 中央 / 右 をタップして止める'
    } else if (this.#phase === 'result') {
      if (this.#win) {
        message = `${SYMBOL_NAMES[paylineSymbol(this.#reels[0].position)]} が揃った！`
        color = COLOR_WIN
      } else {
        message = 'はずれ — 画面または頭部をタップ'
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
