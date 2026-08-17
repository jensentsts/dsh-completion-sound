/**
 * Playback-stop modal for the long-task cue: a fixed in-page overlay whose
 * click stops the cue immediately and dismisses itself. A window.alert cannot
 * do this job — it blocks the JS thread, so the WebAudio cue would keep
 * playing behind it until it ends on its own.
 */
import { createRoot } from 'react-dom/client'
import css from './stop-modal.module.css'

/** Copy and behavior for one stop-modal instance. */
export interface StopModalOptions {
  /** Heading copy. */
  title: string
  /** Explainer copy. */
  body: string
  /** Dismiss button label. */
  stopLabel: string
  /** Stops the cue; called exactly once when the user dismisses the modal. */
  onStop: () => void
}

/** The modal surface. Any click — overlay, card, or button — stops playback. */
function StopModal({ title, body, stopLabel, onStop }: StopModalOptions) {
  return (
    <div className={css.overlay} onClick={onStop}>
      <div className={css.card} onClick={onStop} role="dialog" aria-modal="true" aria-label={title}>
        <div className={css.title}>{title}</div>
        <div className={css.body}>{body}</div>
        <button type="button" className={css.stop} onClick={onStop}>{stopLabel}</button>
      </div>
    </div>
  )
}

let root: ReturnType<typeof createRoot> | null = null
let host: HTMLElement | null = null

/** Unmount and detach the current modal (no-op when none is open). */
export function closeStopModal(): void {
  if (root !== null) {
    root.unmount()
    root = null
  }
  if (host !== null) {
    host.remove()
    host = null
  }
}

/**
 * Mount the stop modal into document.body (replacing any open instance) and
 * return a closer. Clicking the modal calls {@link StopModalOptions.onStop}
 * exactly once and then closes.
 */
export function showStopModal(options: StopModalOptions): () => void {
  closeStopModal()
  if (typeof document === 'undefined') return closeStopModal
  let stopped = false
  const dismiss = (): void => {
    if (stopped) return
    stopped = true
    options.onStop()
    closeStopModal()
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  root.render(<StopModal {...options} onStop={dismiss} />)
  return closeStopModal
}
