import Timer from 'timer'

const HEAD_TAP_MESSAGE = 'onGeekSlotHeadTap'
const START_LIGHT_MS = 1200
const LED_NAME = 'head'

type DistributableApplication = {
  distribute?: (message: string, event: unknown) => void
  behavior?: {
    onGeekSlotStart?: (application: unknown, setStop: (stop: () => void) => void) => boolean
  }
}

type HeadTouchEvent = {
  gesture: 'press' | 'release' | 'forwardSwipe' | 'backwardSwipe'
  ticks: number
  tap?: unknown
}

type SlotContext = {
  audio: {
    say(text: string): Promise<{ success: true; value: string } | { success: false; reason?: string }>
  }
  lighting: {
    led: Record<string, unknown>
    lightRainbow(name: string): void
    lightOff(name: string): void
  }
  input: {
    touchPanel?: {
      subscribe(listener: (event: HeadTouchEvent) => void): () => void
    }
  }
  ui: {
    application?: unknown
  }
}

const behavior = Object.freeze({
  onContextCreated(context: SlotContext): void {
    const touchPanel = context.input.touchPanel
    const application = context.ui.application as DistributableApplication | undefined
    // miniappは別Compartmentで動くため、Piuのbubbleでホスト側の演出へつなぐ。
    // 頭部センサの有無にかかわらず、画面タップからも利用する。
    if (application?.behavior) {
      let lightTimer: ReturnType<typeof Timer.set> | undefined
      let lighting = false
      let speaking = false
      const stopLight = (): void => {
        if (lightTimer !== undefined) {
          Timer.clear(lightTimer)
          lightTimer = undefined
        }
        if (!lighting) return
        lighting = false
        try {
          context.lighting.lightOff(LED_NAME)
        } catch (error) {
          trace(`[slot] start light off failed: ${String(error)}\n`)
        }
      }

      application.behavior.onGeekSlotStart = (_application, setStop) => {
        stopLight()
        setStop(stopLight)
        try {
          if (context.lighting.led[LED_NAME]) {
            lighting = true
            context.lighting.lightRainbow(LED_NAME)
            lightTimer = Timer.set(stopLight, START_LIGHT_MS)
          }
        } catch (error) {
          stopLight()
          trace(`[slot] start light failed: ${String(error)}\n`)
        }
        // 発話完了を待たずに回転を続け、短時間の再プレイで音声を重ねない。
        if (!speaking) {
          speaking = true
          const sayStart = async (): Promise<void> => {
            try {
              const result = await context.audio.say('スタート')
              if (!result.success) trace(`[slot] start speech failed: ${result.reason}\n`)
            } catch (error) {
              trace(`[slot] start speech failed: ${String(error)}\n`)
            } finally {
              speaking = false
            }
          }
          void sayStart()
        }
        return true
      }
    } else {
      trace('[slot] start effects event bridge is unavailable\n')
    }
    if (!touchPanel) {
      trace('[slot] head touch panel is unavailable\n')
      return
    }
    if (!application?.distribute) {
      trace('[slot] application event distribution is unavailable\n')
      return
    }

    touchPanel.subscribe((event) => {
      if (event.gesture !== 'release' || !event.tap) return
      trace('[slot] head tap\n')
      application.distribute?.(HEAD_TAP_MESSAGE, event)
    })
    trace('[slot] head tap ready\n')
  },
})

export default behavior
