/**
 * Desktop notification support for completion cues. The browser Notification
 * API is the primary channel — it carries the richest UX and is the only path
 * that can ask the user for permission. When that channel is missing or
 * blocked, completion cues fall back to a Host-side OS notifier (osascript on
 * macOS, notify-send on Linux) so notifications still land on platforms where
 * the browser path is unreliable: Safari, Linux desktops without a
 * notification daemon, non-secure contexts.
 */
import { COMPLETION_SOUND_NOTIFY_URL } from '../settings.ts'

/** The notification states we can distinguish and report back to the UI. */
export type NotificationOutcome = 'unsupported' | 'granted' | 'denied' | 'default'

/**
 * Some embedded browsers expose `Notification` but never settle the permission
 * prompt. The row still has to report a result instead of spinning forever.
 */
const PERMISSION_REQUEST_TIMEOUT_MS = 10_000

/** Whether the browser Notification API is present at all. */
function browserNotificationsAvailable(): boolean {
  return typeof Notification !== 'undefined'
}

/** Read the current browser permission, or 'unsupported' when absent. */
export function getNotificationPermission(): NotificationOutcome {
  if (!browserNotificationsAvailable()) return 'unsupported'
  return Notification.permission
}

/**
 * Send one completion notification. The constructor can throw in restricted
 * embeddings even when `permission` reads 'granted'; a missing cue must never
 * break the completion path or the test-notification promise chain.
 */
function sendNotification(title: string, body: string): boolean {
  try {
    new Notification(title, { tag: 'dsh-completion', body })
    return true
  } catch {
    return false
  }
}

/**
 * Fire a Host-side OS notification through the completion-sound notify route.
 * Resolves true when the Host reported a successful notifier launch. The route
 * 404s while the Host half is absent (e.g. not yet restarted after an update),
 * which the caller reads as unsupported.
 */
async function sendSystemNotification(title: string, body: string): Promise<boolean> {
  try {
    const res = await fetch(COMPLETION_SOUND_NOTIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body }),
    })
    if (!res.ok) return false
    const data = await res.json() as { ok?: unknown }
    return data.ok === true
  } catch {
    return false
  }
}

/**
 * Deliver a completion notification through the best available channel:
 * browser when granted, Host-side OS notifier otherwise.
 */
export async function notifyCompletion(title: string, body: string): Promise<void> {
  if (browserNotificationsAvailable() && Notification.permission === 'granted') {
    sendNotification(title, body)
    return
  }
  await sendSystemNotification(title, body)
}

/**
 * Request permission in a way that works with both the promise form and the
 * legacy callback form, and always settles within a bounded time.
 */
function requestPermissionDecision(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (permission: NotificationPermission): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      resolve(permission)
    }
    timer = setTimeout(() => finish(Notification.permission), PERMISSION_REQUEST_TIMEOUT_MS)
    try {
      const request = Notification.requestPermission as unknown as (
        callback: (permission: NotificationPermission) => void,
      ) => NotificationPermission | Promise<NotificationPermission> | void
      const result = request(finish)
      if (result instanceof Promise) {
        void result.then(finish, () => finish(Notification.permission))
      } else if (result !== undefined) {
        finish(result)
      }
    } catch {
      finish(Notification.permission)
    }
  })
}

/** Request notification permission once (no-op when already decided). */
export function requestNotificationPermission(): void {
  if (!browserNotificationsAvailable()) return
  if (Notification.permission !== 'default') return
  void requestPermissionDecision()
}

/**
 * Fire a sample notification, requesting permission first when the browser has
 * not decided yet. Resolves to the resulting permission state so the caller can
 * surface an in-app hint — the browser/OS gives no signal when it swallows the
 * toast, but "denied" and "unsupported" both look like "nothing happened".
 * Falls back to the Host-side OS notifier when the browser channel is missing
 * or blocked, so the test succeeds on every platform that can raise a toast.
 */
export async function testNotification(title: string, body: string): Promise<NotificationOutcome> {
  // No browser API: go straight to the Host-side OS notifier.
  if (!browserNotificationsAvailable()) {
    return await sendSystemNotification(title, body) ? 'granted' : 'unsupported'
  }
  try {
    if (Notification.permission === 'default') {
      const decision = await requestPermissionDecision()
      if (decision === 'granted') {
        sendNotification(title, body)
        return 'granted'
      }
      if (decision === 'denied') {
        return await sendSystemNotification(title, body) ? 'granted' : 'denied'
      }
      return decision // still undecided
    }
    if (Notification.permission === 'granted') {
      sendNotification(title, body)
      return 'granted'
    }
    // 'denied': fall back to the OS notifier.
    return await sendSystemNotification(title, body) ? 'granted' : 'denied'
  } catch {
    return getNotificationPermission()
  }
}
