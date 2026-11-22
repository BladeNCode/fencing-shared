// Shared across the trifecta. The capture screen is operated by feel —
// often with the phone held low while the referee watches the piste — so
// the pulse lengths carry meaning and have to agree everywhere. They were
// previously redeclared in three files, which is exactly how two of them
// end up drifting apart.
//
// SUPPORT — read this before relying on any of it. Corrected Nov 2026 after
// Socle checked it; the earlier note here said Firefox "removed support in
// v129", which understated the problem considerably:
//   - Works:     Chromium-based Android only — Chrome / Edge / Opera /
//                Samsung Internet.
//   - Does NOT:  Firefox for Android, where `navigator.vibrate` has been a
//                SILENT NO-OP since v79 (2020). It is not a recent
//                regression and it was never briefly working: the method
//                exists and resolves, and nothing happens. Firefox is one of
//                this app's two target browsers.
//   - Does NOT:  iOS Safari — never implemented, not pending.
//   - Does NOT:  desktop, which has no vibration hardware regardless.
//
// So of our two target browsers, exactly one vibrates. Treat a pulse as
// decoration for a minority of users, never as information.
// A long-press on Android also triggers the OS's own touch feedback, which
// feels like a buzz but is not ours — so "it vibrates when I score" can be
// true on Firefox even though nothing here ran.
//
// Treat haptics as a bonus on Chromium-Android only. Never let anything
// depend on them: every cue they reinforce must also be carried by sound or
// by something on screen. Socle makes this a documented requirement in
// docs/gestures.md — a pulse may not be an interaction's activation signal.
//
// Audited Nov 2026, and all three hold:
//   BUZZ_CLOCK      — the running-state flood floods or drains every surface,
//                     plus a rising/falling tone.
//   BUZZ_SCORE      — the score digits change, the flood drains, and a row
//                     appears in the log.
//   BUZZ_PERIOD_END — three long tones, and the clock reads 0:00.
// Re-check this list when adding a pulse, not when a bug report arrives from
// someone holding a Firefox phone.
//
// Sticky user activation is required — the user must have interacted with
// the page at least once. Calls still need to follow an interaction, so
// fire them in the handler rather than after awaiting async work.

// Short: something about the clock changed.
export const BUZZ_CLOCK = 30;

// Long: a point went on the board. Deliberately distinguishable from the
// clock pulse by length alone, so the two are told apart in the hand.
export const BUZZ_SCORE = 120;

// Three pulses, matching the three blasts of the end-of-period sound.
export const BUZZ_PERIOD_END = [300, 150, 300, 150, 300];

export function buzz(pattern) {
  navigator.vibrate?.(pattern);
}
