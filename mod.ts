const HEAD_TAP_MESSAGE = 'onGeekSlotHeadTap'

type DistributableApplication = {
  behavior?: {
    onGeekSlotReachChanged?: (application: unknown, active: boolean) => void
  }
  distribute?: (message: string, event: unknown) => void
}

type HeadTouchEvent = {
  gesture: 'press' | 'release' | 'forwardSwipe' | 'backwardSwipe'
  ticks: number
  tap?: unknown
}

type SlotContext = {
  lighting?: {
    lightOn(name: string, r: number, g: number, b: number): void
    lightOff(name: string): void
  }
  audio?: {
    say(text: string): Promise<{ success: boolean; reason?: string }>
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
    if (application?.behavior) {
      let active = false
      application.behavior.onGeekSlotReachChanged = (_application, reach) => {
        if (active === reach) return
        active = reach
        try {
          if (reach) context.lighting?.lightOn('head', 24, 18, 0)
          else context.lighting?.lightOff('head')
        } catch (error) {
          trace(`[slot] reach LED failed: ${String(error)}\n`)
        }
        if (!reach) return
        try {
          void context.audio?.say('リーチ').then((result) => {
            if (!result.success) trace(`[slot] reach speech failed: ${result.reason}\n`)
          }).catch((error) => {
            trace(`[slot] reach speech failed: ${String(error)}\n`)
          })
        } catch (error) {
          trace(`[slot] reach speech failed: ${String(error)}\n`)
        }
      }
    } else {
      trace('[slot] reach effect event handler is unavailable\n')
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
