/** The notification states we can distinguish and report back to the UI. */
export type NotificationOutcome = 'unsupported' | 'granted' | 'denied' | 'default';
/** Read the current browser permission, or 'unsupported' when absent. */
export declare function getNotificationPermission(): NotificationOutcome;
/**
 * Deliver a completion notification through the best available channel:
 * browser when granted, Host-side OS notifier otherwise.
 */
export declare function notifyCompletion(title: string, body: string): Promise<void>;
/** Request notification permission once (no-op when already decided). */
export declare function requestNotificationPermission(): void;
/**
 * Fire a sample notification, requesting permission first when the browser has
 * not decided yet. Resolves to the resulting permission state so the caller can
 * surface an in-app hint — the browser/OS gives no signal when it swallows the
 * toast, but "denied" and "unsupported" both look like "nothing happened".
 * Falls back to the Host-side OS notifier when the browser channel is missing
 * or blocked, so the test succeeds on every platform that can raise a toast.
 */
export declare function testNotification(title: string, body: string): Promise<NotificationOutcome>;
//# sourceMappingURL=notify.d.ts.map