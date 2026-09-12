const HEAD_TAP_MESSAGE = 'onGeekSlotHeadTap'

type DistributableApplication = {
  distribute?: (message: string, event: unknown) => void
}

type HeadTouchEvent = {
  gesture: 'press' | 'release' | 'forwardSwipe' | 'backwardSwipe'
  ticks: number
  tap?: unknown
}

type SlotContext = {
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
