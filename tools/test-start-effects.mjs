// MODビルドが生成したJSを、音声・LED・Piuのスタブで検証する。
// node tools/test-start-effects.mjs <ビルド出力のtscディレクトリ>
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'

const buildDirectory = process.argv[2]
if (!buildDirectory) throw new Error('MODビルド出力のtscディレクトリを指定してください')

function findFile(directory, filename) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(path, filename)
      if (found) return found
    } else if (entry.name === filename) return path
  }
}

function load(name, globals) {
  const path = findFile(join(buildDirectory, name), `${name}.js`)
  const source = readFileSync(path, 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/export default (\w+);?/, 'globalThis.result = $1;')
  const sandbox = vm.createContext({ trace() {}, ...globals })
  vm.runInContext(source, sandbox, { filename: path })
  return sandbox.result
}

function setup({ head = true, led = true, say, rainbow } = {}) {
  const calls = []
  const timers = new Map()
  const logs = []
  let nextTimer = 0
  let listener
  let port
  const application = {
    behavior: {},
    delegate(message, ...args) { return this.behavior[message]?.(this, ...args) },
    distribute(message, event) { port?.delegate(message, event) },
  }
  const mod = load('mod', {
    trace(message) { logs.push(message) },
    Timer: {
      set(callback, ms) { const id = nextTimer++; timers.set(id, { callback, ms }); return id },
      clear(id) { timers.delete(id) },
    },
  })
  mod.onContextCreated({
    ui: { application },
    input: head ? { touchPanel: { subscribe(callback) { listener = callback } } } : {},
    audio: { say(text) { calls.push(['say', text]); return say?.() ?? Promise.resolve({ success: true, value: text }) } },
    lighting: {
      led: led ? { head: {} } : {},
      lightRainbow(name) { calls.push(['rainbow', name]); rainbow?.() },
      lightOn(...args) { calls.push(['on', ...args]) },
      lightOff(name) { calls.push(['off', name]) },
    },
  })
  class Content {
    constructor(_data, options) {
      Object.assign(this, options)
      this.width = 320
      this.application = application
      this.behavior = options?.Behavior ? new options.Behavior() : undefined
    }
    delegate(message, ...args) { return this.behavior?.[message]?.(this, ...args) }
    bubble(message, ...args) { return application.behavior[message]?.(application, ...args) }
    invalidate() {}
    start() { this.running = true }
    stop() { this.running = false }
  }
  const definitions = load('miniapp', {
    Behavior: class {}, Port: Content, Container: Content, Skin: class {}, Style: class {},
  })
  const instance = definitions[0].create()
  port = instance.content.contents[0]
  port.delegate('onDisplaying')
  return {
    calls, timers, logs, port, instance,
    touch(x = 50, ticks = 100) { port.delegate('onTouchBegan', 0, x, 20, ticks) },
    head(event = { gesture: 'release', tap: true, ticks: 200 }) { listener?.(event) },
    finish() {
      for (const x of [50, 160, 270]) port.delegate('onTouchBegan', 0, x, 20, 300)
      for (let i = 0; i < 40 && port.running; i++) port.delegate('onTimeChanged')
      assert.equal(port.running, false)
    },
  }
}

test('画面から開始し、停止操作や回転中の頭部タップで演出を重複しない', () => {
  const s = setup()
  assert.equal(s.calls.length, 0)
  s.touch()
  assert.equal(s.port.running, true)
  assert.deepEqual(s.calls, [['rainbow', 'head'], ['say', 'スタート']])
  assert.equal([...s.timers.values()][0].ms, 1200)
  s.head()
  s.finish()
  assert.deepEqual(s.calls.at(-1), ['off', 'head'])
  assert.equal(s.calls.filter(([kind]) => kind === 'say').length, 1)
  assert.equal(s.timers.size, 0)
})

test('頭部の短いタップだけで開始し、時間経過で消灯する', () => {
  const s = setup()
  s.head({ gesture: 'press', tap: true, ticks: 1 })
  s.head({ gesture: 'release', tap: false, ticks: 2 })
  s.head({ gesture: 'forwardSwipe', tap: true, ticks: 3 })
  assert.equal(s.calls.length, 0)
  s.head()
  assert.equal(s.port.running, true)
  ;[...s.timers.values()][0].callback()
  assert.deepEqual(s.calls.at(-1), ['off', 'head'])
  assert.equal(s.timers.size, 0)
})

test('表示ツリーから外した後のdisposeでも消灯・タイマー解放する', () => {
  const s = setup()
  s.touch()
  s.port.bubble = () => { throw new Error('detached') }
  s.instance.dispose()
  s.instance.dispose()
  assert.equal(s.port.running, false)
  assert.equal(s.timers.size, 0)
  assert.equal(s.calls.filter(([kind]) => kind === 'off').length, 1)
})

test('頭部センサ・LEDがなくても画面から開始・発話できる', () => {
  const s = setup({ head: false, led: false })
  s.touch()
  assert.equal(s.port.running, true)
  assert.deepEqual(s.calls, [['say', 'スタート']])
  assert.equal(s.timers.size, 0)
})

test('発話中の再プレイでは重複せず、完了後は再び発話する', async () => {
  let resolve
  const s = setup({ say: () => new Promise((done) => { resolve = done }) })
  s.touch()
  s.finish()
  s.touch()
  assert.equal(s.calls.filter(([kind]) => kind === 'say').length, 1)
  resolve({ success: true, value: 'スタート' })
  await new Promise(setImmediate)
  s.finish()
  s.head()
  assert.equal(s.calls.filter(([kind]) => kind === 'say').length, 2)
})

test('音声・LEDの例外でも回転と次回の発話を妨げない', async () => {
  for (const say of [
    () => { throw new Error('sync speech failure') },
    () => Promise.reject(new Error('async speech failure')),
    () => Promise.resolve({ success: false, reason: 'TTS unavailable' }),
  ]) {
    const s = setup({ say, rainbow: () => { throw new Error('LED unavailable') } })
    s.touch()
    await new Promise(setImmediate)
    assert.equal(s.port.running, true)
    assert.equal(s.timers.size, 0)
    assert.ok(s.logs.some((message) => message.includes('start speech failed:')))
    assert.ok(s.logs.some((message) => message.includes('start light failed:')))
    s.finish()
    s.touch()
    await new Promise(setImmediate)
    assert.equal(s.calls.filter(([kind]) => kind === 'say').length, 2)
  }
})

test('開始演出中のリーチは黄色を優先し、開始タイマーを解除して終了時に消灯する', () => {
  for (const close of [false, true]) {
    const s = setup()
    s.touch(50, 49)
    assert.equal(s.timers.size, 1)
    s.touch(50)
    s.touch(160)
    for (let i = 0; i < 30; i++) s.port.delegate('onTimeChanged')
    assert.equal(s.timers.size, 0)
    assert.deepEqual(s.calls, [
      ['rainbow', 'head'], ['say', 'スタート'], ['off', 'head'],
      ['on', 'head', 24, 18, 0], ['say', 'リーチ'],
    ])
    if (close) {
      s.port.application = undefined
      s.port.bubble = () => { throw new Error('detached') }
      s.instance.dispose()
    } else s.finish()
    assert.deepEqual(s.calls.at(-1), ['off', 'head'])
    assert.equal(s.calls.length, 6)
  }
})
