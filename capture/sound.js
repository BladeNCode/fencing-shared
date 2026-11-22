// Shared across the trifecta. Short synthesised tones for the match clock.
//
// Synthesised rather than bundled audio files: two short beeps as assets
// would be bytes to cache and paths to resolve per app, and a referee's
// phone in a noisy hall wants a hard-edged tone that cuts through, which is
// exactly what a square wave is. No files, no network, no decoding delay.
//
// The AudioContext is created lazily and resumed on use, because browsers
// refuse to start one outside a user gesture — the tap that starts the
// clock is that gesture, so the first beep is also what unlocks audio.

let ctx = null;

function context() {
  const AudioCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioCtor) return null; // jsdom/happy-dom, or audio-less environments
  if (!ctx) {
    try {
      ctx = new AudioCtor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ frequency, durationMs, volume }) {
  const c = context();
  if (!c || volume <= 0) return;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency;

  // Ramp rather than switch: an instant gain change on a square wave
  // produces an audible click at both ends of the tone.
  const now = c.currentTime;
  const seconds = durationMs / 1000;
  const peak = Math.max(0.0001, Math.min(1, volume) * 0.3);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + seconds + 0.02);
}

// Rising for "on", falling for "off" — the direction is the signal, so the
// two stay distinguishable without looking at the phone.
export function playClockStart(volume = 1) {
  tone({ frequency: 880, durationMs: 110, volume });
}

export function playClockStop(volume = 1) {
  tone({ frequency: 440, durationMs: 170, volume });
}

// A single higher blip, short enough not to be mistaken for the clock
// starting. Used for the "time is running out" marks.
export function playWarning(volume = 1) {
  tone({ frequency: 1320, durationMs: 90, volume });
}

// End of period. Deliberately unlike everything else: three long blasts at
// full volume, because this has to carry across a noisy hall and is the one
// cue a referee cannot afford to miss. Volume is still respected — a muted
// phone stays muted — but it ignores the user's level setting's lower end
// by taking a floor, since a barely-audible end-of-period defeats the
// purpose.
export function playPeriodEnd(volume = 1) {
  const level = Math.max(0.6, Math.min(1, volume));
  for (let i = 0; i < 3; i += 1) {
    setTimeout(() => tone({ frequency: 660, durationMs: 420, volume: level }), i * 520);
  }
}
