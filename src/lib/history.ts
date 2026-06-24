/**
 * Undo / redo — snapshot-based history over the serialized "document".
 *
 * The undoable document is exactly `serializeSession` (the same subset autosave
 * watches): tracks/clips/notes, mixer, groups, sends/returns, devices,
 * automation, audio assets, tempo/loop. Transient rAF state (playhead, meters,
 * reel) and pure-UI state are intentionally excluded — they never produce a
 * history entry because the snapshot ignores them.
 *
 * Mechanism (mirrors autosave): a single store subscription diffs on the
 * serialized snapshot and, once edits settle, commits one entry. Rapid bursts
 * (e.g. a clip/note drag firing many `set`s) collapse into a single entry via a
 * short debounce plus explicit `beginTransaction`/`endTransaction` boundaries
 * wrapped around the drag idiom (see `timeline.ts`).
 *
 * Restoring a snapshot goes through the existing `hydrateSession`, and (when
 * hosted) re-pushes to the engine via `applySessionToEngine` — `hydrateSession`
 * alone does not touch the engine. The `applying` flag suppresses recording our
 * own hydrate as a fresh edit.
 */
import { useDawStore } from "../store/useDawStore";
import { serializeSession, type SessionUi } from "./session";
import { engineActive } from "./engine";
import { applySessionToEngine } from "./engineSync";

/** Maximum retained undo steps. */
export const HISTORY_MAX = 100;
/** Idle window after which a settled edit becomes one undo entry. */
export const COMMIT_DEBOUNCE_MS = 300;

// Snapshots are stored as serialized JSON strings: cheap to diff, trivially
// structural-cloned, and exactly what `hydrateSession` consumes when parsed.
let past: string[] = [];
let future: string[] = [];
let present = "";
let applying = false;
let txDepth = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let unsub: (() => void) | undefined;

const snapshot = (): string => JSON.stringify(serializeSession(useDawStore.getState()));

function publishDepths(): void {
  useDawStore.getState().setHistoryDepths(past.length, future.length);
}

/** Commit `next` as the new present, pushing the old present onto the undo stack
 *  and clearing the redo stack. No-op when nothing actually changed. */
function commit(next: string): void {
  if (next === present) return;
  past.push(present);
  if (past.length > HISTORY_MAX) past.shift();
  present = next;
  future = [];
  publishDepths();
}

/** Seal any pending debounced edit immediately as its own entry. */
function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  commit(snapshot());
}

function onChange(): void {
  if (applying || txDepth > 0) return;
  if (snapshot() === present) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    commit(snapshot());
  }, COMMIT_DEBOUNCE_MS);
}

function apply(json: string): void {
  applying = true;
  try {
    useDawStore.getState().hydrateSession(JSON.parse(json) as SessionUi);
    if (engineActive()) applySessionToEngine(useDawStore.getState());
  } finally {
    applying = false;
  }
}

/** Begin a coalesced edit group (a drag): defer commits and seal the prior edit
 *  so the gesture becomes exactly one entry. */
export function beginTransaction(): void {
  if (txDepth === 0) flush();
  txDepth++;
}

/** End the edit group; commit the gesture's net change as one entry. */
export function endTransaction(): void {
  if (txDepth > 0) txDepth--;
  if (txDepth === 0) commit(snapshot());
}

export function undo(): void {
  flush(); // an in-flight (un-debounced) edit becomes redoable, then is undone
  if (past.length === 0) return;
  future.push(present);
  present = past.pop() as string;
  apply(present);
  publishDepths();
}

export function redo(): void {
  if (future.length === 0) return;
  past.push(present);
  present = future.pop() as string;
  apply(present);
  publishDepths();
}

export const canUndo = (): boolean => past.length > 0;
export const canRedo = (): boolean => future.length > 0;

/** Reset history to the current state as the baseline (e.g. after loading a
 *  project / new session) so the next edit diffs against what's on screen. */
export function clearHistory(): void {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  past = [];
  future = [];
  txDepth = 0;
  present = snapshot();
  publishDepths();
}

/** Start tracking history; seeds the baseline from the current state. Returns an
 *  unsubscribe. Call after the initial session restore completes. */
export function startHistory(): () => void {
  clearHistory();
  unsub = useDawStore.subscribe(onChange);
  return () => {
    unsub?.();
    unsub = undefined;
    if (timer) clearTimeout(timer);
  };
}
