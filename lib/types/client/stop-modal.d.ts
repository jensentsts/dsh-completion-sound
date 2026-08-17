/** Copy and behavior for one stop-modal instance. */
export interface StopModalOptions {
    /** Heading copy. */
    title: string;
    /** Explainer copy. */
    body: string;
    /** Dismiss button label. */
    stopLabel: string;
    /** Stops the cue; called exactly once when the user dismisses the modal. */
    onStop: () => void;
}
/** Unmount and detach the current modal (no-op when none is open). */
export declare function closeStopModal(): void;
/**
 * Mount the stop modal into document.body (replacing any open instance) and
 * return a closer. Clicking the modal calls {@link StopModalOptions.onStop}
 * exactly once and then closes.
 */
export declare function showStopModal(options: StopModalOptions): () => void;
//# sourceMappingURL=stop-modal.d.ts.map