/**
 * WebAudio completion cues: a soft two-note "done" ding synthesized in the
 * browser, plus the long-task ("special") sample served by the host. The
 * bundled "guan-yu" sample is decoded once and cached; a user-selected file is
 * cached per path (small LRU), while a directory selection is never cached —
 * the host serves one random audio file per request, which it marks with the
 * `x-dsh-completion-sound-random` header. A single shared AudioContext is
 * created lazily and resumed on demand so autoplay policy never blocks a cue
 * (the page has already seen a user gesture by the time a turn ends). The
 * special sample supports immediate stop so a user can silence it the moment
 * it starts.
 */
import { GUAN_YU_SOUND_URL, SPECIAL_SOUND_URL } from '../settings.ts'

let audioContext: AudioContext | null = null

/** Create (or return) the shared context, resuming it if it is suspended. */
function context(): AudioContext {
  if (audioContext === null) {
    audioContext = new AudioContext()
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume().catch(() => {})
  }
  return audioContext
}

/**
 * Prime the audio context on the first user gesture so a later completion
 * cue (which carries no gesture of its own) is allowed to play.
 */
export function unlockAudio(): void {
  context()
}

/**
 * Play the completion chime (E5 → A5, gentle attack and exponential decay).
 * @param volume - playback gain, 0..1; values ≤ 0 are silently skipped.
 */
export async function playCompletionChime(volume: number): Promise<void> {
  if (volume <= 0) return
  try {
    const ctx = context()
    if (ctx.state === 'suspended') await ctx.resume()
    const peak = Math.min(1, Math.max(0, volume))
    const start = ctx.currentTime
    const notes: readonly [frequency: number, offset: number][] = [
      [659.25, 0],
      [880, 0.15],
    ]
    for (const [frequency, offset] of notes) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      const when = start + offset
      const decay = 0.4
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.exponentialRampToValueAtTime(peak, when + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + decay)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(when)
      oscillator.stop(when + decay + 0.05)
    }
  } catch {
    // Audio unavailable (autoplay denied, no output device): degrade silently.
  }
}

/** Decoded bundled sample, cached after the first successful load. */
let bundledBuffer: AudioBuffer | null = null

/** In-flight bundled decode, deduped so concurrent completions share one fetch/decode. */
let bundledLoadPromise: Promise<AudioBuffer> | null = null

/** Fetch and decode the bundled long-task sample once, retrying on failure. */
async function loadBundled(ctx: AudioContext): Promise<AudioBuffer> {
  if (bundledBuffer !== null) return bundledBuffer
  if (bundledLoadPromise === null) {
    bundledLoadPromise = (async () => {
      const response = await fetch(GUAN_YU_SOUND_URL)
      if (!response.ok) throw new Error(`completion-sound: bundled cue HTTP ${response.status}`)
      return await ctx.decodeAudioData(await response.arrayBuffer())
    })().then((buffer) => {
      bundledBuffer = buffer
      return buffer
    })
  }
  try {
    return await bundledLoadPromise
  } catch (error) {
    bundledLoadPromise = null
    throw error
  }
}

/** Decoded user-selected samples, keyed by the setting's `specialPath` (small LRU). */
const customBufferCache = new Map<string, AudioBuffer>()

/** Maximum entries retained in {@link customBufferCache}. */
const CUSTOM_CACHE_MAX = 4

/** Whether a response was a directory-random pick (the host never reuses it). */
function isRandomPick(response: Response): boolean {
  return response.headers.get('x-dsh-completion-sound-random') === '1'
}

/**
 * Fetch and decode the special cue for one `specialPath`. Empty selects the
 * bundled sample; a file is cached per path, while a directory selection (the
 * host's per-request random pick) is decoded fresh every time.
 */
async function loadSpecial(ctx: AudioContext, specialPath: string): Promise<AudioBuffer> {
  if (specialPath === '') return loadBundled(ctx)
  const cached = customBufferCache.get(specialPath)
  if (cached !== undefined) return cached
  const response = await fetch(SPECIAL_SOUND_URL)
  if (!response.ok) throw new Error(`completion-sound: special cue HTTP ${response.status}`)
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
  if (!isRandomPick(response)) {
    customBufferCache.set(specialPath, buffer)
    if (customBufferCache.size > CUSTOM_CACHE_MAX) {
      const oldest = customBufferCache.keys().next().value as string | undefined
      if (oldest !== undefined) customBufferCache.delete(oldest)
    }
  }
  return buffer
}

/** Currently playing special-cue source (for immediate stop). */
let activeSpecial: AudioBufferSourceNode | null = null

/**
 * Monotonic playback epoch, bumped by {@link stopSpecialSound} so an in-flight
 * fetch/decode that finishes after a stop does not start a fresh source.
 */
let specialEpoch = 0

/**
 * Stop the special cue immediately (no-op when it is not playing). Also
 * cancels any in-flight load that would otherwise start after the stop.
 */
export function stopSpecialSound(): void {
  specialEpoch += 1
  if (activeSpecial !== null) {
    try {
      activeSpecial.stop()
    } catch {
      // Source already finished: the onended handler clears the slot.
    }
    activeSpecial = null
  }
}

/**
 * Play the special long-task cue at the given gain, resolving `specialPath`
 * ('' = bundled sample) through the host.
 * @param volume - playback gain, 0..1; values ≤ 0 are silently skipped.
 * @param specialPath - the durable `specialPath` setting selecting the cue source.
 * @returns true when playback actually started, false when skipped/stopped/failed.
 */
export async function playSpecialSound(volume: number, specialPath: string): Promise<boolean> {
  if (volume <= 0) return false
  const epoch = specialEpoch
  try {
    const ctx = context()
    if (ctx.state === 'suspended') await ctx.resume()
    const buffer = await loadSpecial(ctx, specialPath)
    if (epoch !== specialEpoch) return false
    if (activeSpecial !== null) {
      try { activeSpecial.stop() } catch { /* ignore */ }
    }
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = Math.min(1, Math.max(0, volume))
    source.buffer = buffer
    source.onended = () => {
      if (activeSpecial === source) activeSpecial = null
    }
    source.connect(gain)
    gain.connect(ctx.destination)
    activeSpecial = source
    source.start()
    return true
  } catch {
    // Asset missing or audio unavailable: degrade silently.
    return false
  }
}
