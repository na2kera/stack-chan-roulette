import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

function load(file, globals = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const code = stripTypeScriptTypes(source).replace("import 'piu/MC'", '').replace('export default ', 'globalThis.result = ')
  const sandbox = { trace() {}, ...globals }
  vm.runInNewContext(code, sandbox)
  return sandbox.result
}

function setup({ lightingError = false, speech = () => Promise.resolve({ success: true }), touch = false } = {}) {
  const calls = []
  const logs = []
  let listener
  const application = {
    behavior: {},
    delegate(message, value) { return this.behavior[message]?.(this, value) },
    distribute(message, value) { port.behavior[message]?.(port, value) },
  }
  const mod = load('mod.ts', { trace: (message) => logs.push(message) })
  mod.onContextCreated({
    input: touch ? { touchPanel: { subscribe(fn) { listener = fn } } } : {},
    ui: { application },
    lighting: {
      lightOn(...args) { calls.push(['on', ...args]); if (lightingError) throw Error('LED error') },
      lightOff(...args) { calls.push(['off', ...args]) },
    },
    audio: { say(text) { calls.push(['say', text]); return speech() } },
  })
  class Node {
    constructor(_data, options) {
      Object.assign(this, options)
      if (options.Behavior) this.behavior = new options.Behavior()
    }
  }
  const [definition] = load('miniapp.ts', {
    Behavior: class {}, Container: Node, Port: Node, Skin: class {}, Style: class {},
  })
  const port = definition.create().contents[0]
  Object.assign(port, { application, width: 320, height: 196, invalidate() {}, start() {}, stop() {} })
  const behavior = port.behavior
  behavior.onDisplaying(port)
  return {
    calls, logs,
    start(ticks = 49) { behavior.onTouchBegan(port, 0, 10, 0, ticks) },
    stop(index) { behavior.onTouchBegan(port, 0, (index + 0.5) * 320 / 3, 0) },
    frames(count = 30) { for (let i = 0; i < count; i++) behavior.onTimeChanged(port) },
    close() { behavior.onUndisplaying(port) },
    head(event) { listener(event) },
  }
}

// ticks=49は3リール同柄、ticks=1は全て異なる初期配置になる操作時刻のfixture。
for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
  test(`停止順 ${order.join('→')}: 確定した2リールで一度だけリーチ、最後の停止で消灯`, () => {
    const game = setup()
    game.start()
    game.stop(order[0])
    game.stop(order[1])
    assert.deepEqual(game.calls, [])
    game.frames(1)
    assert.deepEqual(game.calls, []) // 停止ボタンを押しただけでは未確定
    game.frames()
    assert.deepEqual(game.calls, [['on', 'head', 24, 18, 0], ['say', 'リーチ']])
    game.stop(order[0]) // 停止済みを連打しても重複しない
    game.frames()
    assert.equal(game.calls.length, 2)
    game.stop(order[2])
    game.frames()
    assert.deepEqual(game.calls.at(-1), ['off', 'head'])
    assert.equal(game.calls.length, 3)
  })
}

test('1リールだけの停止、2リールの不一致では演出しない', () => {
  const game = setup()
  game.start(1)
  game.stop(0)
  game.frames()
  assert.deepEqual(game.calls, [])
  game.stop(1)
  game.frames()
  assert.deepEqual(game.calls, [])
})

test('同一フレームで全停止した場合はリーチを挟まない', () => {
  const game = setup()
  game.start()
  for (let i = 0; i < 3; i++) game.stop(i)
  game.frames()
  assert.deepEqual(game.calls, [])
})

test('リーチ中に閉じると一度だけ消灯する', () => {
  const game = setup()
  game.start()
  game.stop(0)
  game.stop(1)
  game.frames()
  game.close()
  assert.deepEqual(game.calls.at(-1), ['off', 'head'])
  game.close()
  assert.equal(game.calls.length, 3)
})

test('LED失敗でも発話し、ゲームの停止まで進める', () => {
  const game = setup({ lightingError: true })
  game.start()
  game.stop(0)
  game.stop(1)
  game.frames()
  assert.equal(game.calls[1][0], 'say')
  game.stop(2)
  game.frames()
  assert.deepEqual(game.calls.at(-1), ['off', 'head'])
  assert.ok(game.logs.some((line) => line.includes('reach LED failed')))
})

for (const speech of [() => { throw Error('sync') }, () => Promise.reject(Error('async')), () => Promise.resolve({ success: false, reason: 'busy' })]) {
  test('音声エラーを記録し、LEDの消灯とゲーム進行を維持する', async () => {
    const game = setup({ speech })
    game.start()
    game.stop(0)
    game.stop(1)
    game.frames()
    await new Promise((resolve) => setImmediate(resolve))
    assert.ok(game.logs.some((line) => line.includes('reach speech failed')))
    game.stop(2)
    game.frames()
    assert.deepEqual(game.calls.at(-1), ['off', 'head'])
  })
}

test('頭部タップで開始でき、リーチ中の頭部タップは再開始しない', () => {
  const game = setup({ touch: true })
  game.head({ gesture: 'release', tap: true, ticks: 49 })
  game.stop(0)
  game.stop(1)
  game.frames()
  game.head({ gesture: 'release', tap: true, ticks: 99 })
  assert.equal(game.calls.length, 2)
  game.stop(2)
  game.frames()
  assert.deepEqual(game.calls.at(-1), ['off', 'head'])
})
