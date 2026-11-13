import { createContext, useContext, useSyncExternalStore } from "react";

export type PreviewState = "idle" | "playing" | "paused";

/** What a row hands the player — enough to show it in the "now playing" bar. */
export interface PreviewTrack {
  /** Unique across the page (e.g. `system:<id>`, `asset:<id>`). */
  id: string;
  src: string;
  title: string;
  subtitle: string;
  /** System category id, for the cover art. */
  categoryId?: string;
}

/**
 * One shared <audio> for the whole sound page, so starting a sound stops the
 * previous one (like a story music picker). Rows subscribe to their own
 * state only (`usePreviewState(id)` returns a primitive), so playback changes
 * re-render the one or two rows involved, not the whole list; the "now
 * playing" bar reads the current track, and the list it was started from
 * (the queue) drives previous/next.
 */
export class PreviewPlayer {
  private audio: HTMLAudioElement | null = null;
  private current: PreviewTrack | null = null;
  private queue: PreviewTrack[] = [];
  private playing = false;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  stateOf = (id: string): PreviewState =>
    this.current?.id !== id ? "idle" : this.playing ? "playing" : "paused";

  getCurrent = (): PreviewTrack | null => this.current;

  isPlaying = (): boolean => this.playing;

  /** Seconds played and total (0 until the file's metadata has loaded). */
  time(): { current: number; duration: number } {
    const audio = this.audio;
    const duration = audio && Number.isFinite(audio.duration) ? audio.duration : 0;
    return { current: audio?.currentTime ?? 0, duration };
  }

  /** 0..1 through the current sound (read on every animation frame by progress bars). */
  progress(): number {
    const { current, duration } = this.time();
    return duration ? Math.min(1, current / duration) : 0;
  }

  /** Row tap: start this track (remembering the list it came from), or pause/resume it if it's the current one. */
  toggle(track: PreviewTrack, queue?: PreviewTrack[]): void {
    if (this.current?.id === track.id) {
      this.togglePlayback();
      return;
    }
    if (queue) this.queue = queue;
    this.start(track);
  }

  togglePlayback(): void {
    const audio = this.audio;
    if (!audio || !this.current) return;
    if (audio.paused) void audio.play().catch(() => this.set(this.current, false));
    else audio.pause();
  }

  /** The neighbour of the current track in its queue, if any. */
  neighbour(step: 1 | -1): PreviewTrack | null {
    const index = this.queue.findIndex((t) => t.id === this.current?.id);
    return index < 0 ? null : (this.queue[index + step] ?? null);
  }

  skip(step: 1 | -1): void {
    const track = this.neighbour(step);
    if (track) this.start(track);
  }

  seek(fraction: number): void {
    const audio = this.audio;
    const { duration } = this.time();
    if (audio && duration) audio.currentTime = Math.max(0, Math.min(1, fraction)) * duration;
  }

  seekBy(seconds: number): void {
    const audio = this.audio;
    const { duration } = this.time();
    if (audio && duration) audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  }

  stop(): void {
    this.audio?.pause();
    this.set(null, false);
  }

  dispose(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    this.audio = null;
    this.queue = [];
    this.set(null, false);
  }

  private start(track: PreviewTrack): void {
    const audio = this.element();
    audio.src = track.src;
    this.set(track, false);
    void audio.play().catch(() => this.set(this.current, false));
  }

  private element(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("playing", () => this.set(this.current, true));
    audio.addEventListener("pause", () => this.set(this.current, false));
    // Stay on the finished track (paused at the end) so the bar can replay it.
    audio.addEventListener("ended", () => this.set(this.current, false));
    audio.addEventListener("error", () => this.set(this.current, false));
    this.audio = audio;
    return audio;
  }

  private set(track: PreviewTrack | null, playing: boolean): void {
    if (this.current === track && this.playing === playing) return;
    this.current = track;
    this.playing = playing;
    this.listeners.forEach((listener) => listener());
  }
}

export const PreviewPlayerContext = createContext<PreviewPlayer | null>(null);

export function usePreviewPlayer(): PreviewPlayer {
  const player = useContext(PreviewPlayerContext);
  if (!player) throw new Error("usePreviewPlayer must be used inside PreviewPlayerContext");
  return player;
}

export function usePreviewState(id: string): PreviewState {
  const player = usePreviewPlayer();
  return useSyncExternalStore(player.subscribe, () => player.stateOf(id));
}

/** The current track and whether it's playing, for the "now playing" bar. */
export function useNowPlaying(): { track: PreviewTrack | null; playing: boolean } {
  const player = usePreviewPlayer();
  const track = useSyncExternalStore(player.subscribe, player.getCurrent);
  const playing = useSyncExternalStore(player.subscribe, player.isPlaying);
  return { track, playing };
}
