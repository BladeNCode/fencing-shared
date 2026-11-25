import { AppElement } from 'socle/core/app-element.js';
import { t } from 'socle/core/strings.js';
import { Gestures } from 'socle/modules/gestures/gestures.js';
import { playClockStart, playClockStop, playWarning, playPeriodEnd } from './sound.js';
import { buzz, BUZZ_CLOCK, BUZZ_PERIOD_END } from './haptics.js';

const DEFAULT_PERIOD_SECONDS = 180; // 3:00, standard FIE period length
const DEFAULT_PERIOD_COUNT = 3;

function format(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const r = String(s % 60).padStart(2, '0');
  return `${m}:${r}`;
}

// Shared across the bladencode fencing apps (doc 09/10): the *match* clock —
// counts down
// against the bout's period length and tracks the period number.
// Deliberately separate from a capture source's own video-offset timer
// (which counts up and is specific to video capture). Ticks are UI-local,
// not dispatched/persisted, consistent with how doc 09 treats
// `activeCaptureUI`.
//
// This is the dominant control on the Capture screen, and it owns the
// cheapest gesture on it: a plain tap starts/stops. That's the whole point
// of the layout — the observed failure is referees forgetting to halt the
// clock, so halting must cost nothing.
//
// Correcting a mistimed clock is deliberately NOT implemented yet — the
// hold-and-drag scrub that lived here didn't work well in the hand and was
// pulled rather than left half-working. Nothing replaces it for now.
class MatchTimer extends Gestures(AppElement) {
  template() {
    return `
      <style>
        /* Layout lives on #surface rather than on the host.
           ORIGINALLY a workaround: AppElement's base sheet is applied via
           adoptedStyleSheets, which the cascade orders after this style
           element, so a display declaration on a bare host lost to base's
           display:block at equal specificity. Socle 1.4.2 fixed that —
           base now uses :where(:host) at zero specificity, so a host
           display declaration WOULD win today.
           RETAINED anyway, for a reason of its own: the 40dvh cap below
           has to sit on the host so the border counts toward it (see that
           comment), and splitting sizing from layout across the two
           elements is what makes that work. Collapsing them means
           re-deriving which declarations belong where on a component whose
           sizing took measurement to settle, with no computed-layout test
           coverage to catch a mistake. Not worth it for one DOM node. */
        :host {
          background: linear-gradient(180deg, var(--color-clock-field, #2B3238), var(--color-clock-field-end, #181C1F));
          /* No top border: the deck's handle already separates this from
             the fencers, and a line directly under it read as clutter. */
          /* Hard cap: the clock can never take more than 40% of the
             screen. Lives on the host, not #surface, so the border counts
             toward it (base.js sets border-box) — capping the inner
             element let the band measure 41%. */
          max-block-size: 40dvh;
          /* Band and halves become one field while running, so the seam
             between them fades out too. */
          color: var(--color-field-ink, #fff);
          font-family: var(--font-family);
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
          touch-action: manipulation;
        }
        :host(:focus-visible) { outline: 3px solid var(--color-field-ink, #fff); outline-offset: -5px; }


        /* The clock band is where the running colour comes from, so it
           takes the flood immediately while the fencer halves wipe up into
           it. Overlay rather than a background swap: gradient-to-gradient
           transitions don't interpolate. */
        #surface::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, var(--color-clock-active, #2A3F52), var(--color-clock-active-end, #1E2E3C));
          opacity: 0;
          pointer-events: none;
        }
        :host([data-running]) #surface::before { opacity: 1; }
        #meta, #time, #toggle, #action, #action-start { position: relative; z-index: 1; }

        @media (prefers-reduced-motion: no-preference) {
          /* In: immediately, as the source of the colour.
             Out: held back one step so the log clears first — see the
             sequencing note in capture-page. */
          #surface::before { transition: opacity 150ms linear 150ms; }
          :host([data-running]) #surface::before { transition-delay: 0ms; }
        }

        #surface {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          /* Sized just above its content (~175px) rather than generously —
             the slack is worth more to the scores above, which are the
             other thing being read at a glance.
             Hard-capped at 40% of the viewport so the clock can never
             dominate a short screen: on a landscape phone a fixed 195px
             would eat half the height. */
          /* The page can compress the band (see the expandable deck in
             capture-page) by overriding --band-min and --clock-size. */
          min-block-size: min(var(--band-min, 195px), 38dvh);
          padding-block-start: var(--band-pad-top, var(--space-4));
          padding-block-end: calc(var(--space-4) + var(--safe-area-bottom, 0px));
          position: relative;
        }

        #meta {
          font-size: var(--font-size-caption);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.6;
        }
        #time {
          font-size: var(--clock-size, 5.75rem);
          font-weight: var(--font-weight-bold);
          line-height: 1;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
        }
        /* Status, not a control. The whole band is already the tap target,
           so button chrome (a filled circle) wrongly implied this specific
           spot had to be hit. Muted on purpose — the clock and the flood
           carry the state; this just names it. */
        #toggle {
          border: none;
          background: none;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        #toggle svg {
          inline-size: 15px;
          block-size: 15px;
          fill: var(--color-field-ink, #fff);
          opacity: 0.45;
        }

        /* Landscape phones — keyed to height, not orientation, so
           landscape tablets/desktops keep the full-size clock. Values are
           chosen so content (~111px) stays comfortably inside the 40dvh
           cap rather than being clipped by it. */
        @media (max-height: 600px) {
          #surface { padding-block: var(--space-2); gap: var(--space-1); }
          #surface { padding-block-end: calc(var(--space-2) + var(--safe-area-bottom, 0px)); }
          #time { font-size: 3.25rem; }
          #toggle svg { inline-size: 12px; block-size: 12px; }
        }

        /* Both period controls stack in one column on the left. Keeping
           them together makes that corner read as "the period area"
           rather than two unrelated arrows flanking the clock — and period
           changes are infrequent enough not to warrant prime real estate
           on both sides. */
        #action-start {
          position: absolute;
          inset-inline-start: var(--space-3);
          inset-block-start: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-1);
        }
        #action { position: absolute; inset-inline-end: var(--space-4); inset-block-start: 50%; transform: translateY(-50%); }

      </style>
      <div id="surface">
        <span id="meta"></span>
        <span id="time">00:00</span>
        <button type="button" id="toggle" tabindex="-1" aria-hidden="true">
          <svg id="icon" viewBox="0 0 24 24"></svg>
        </button>
        <span id="action-start"><slot name="action-start"></slot></span>
        <span id="action"><slot name="action"></slot></span>
      </div>
    `;
  }

  static get observedAttributes() { return ['period-length', 'period-count', 'meta']; }

  // Set by the page from the device's own preferences — not attributes,
  // because volume is a float the page owns and reflecting it would put a
  // device setting into the DOM for no benefit.
  get soundEnabled() { return this._soundEnabled ?? true; }
  set soundEnabled(v) { this._soundEnabled = Boolean(v); }
  get soundVolume() { return this._soundVolume ?? 1; }
  set soundVolume(v) { this._soundVolume = Math.min(1, Math.max(0, Number(v) || 0)); }
  // Seconds-remaining marks to beep at, e.g. [60, 30, 10].
  get warnAt() { return this._warnAt ?? []; }
  set warnAt(seconds) {
    this._warnAt = [...new Set((seconds ?? []).map(Number).filter(n => Number.isFinite(n) && n > 0))];
  }

  attributeChangedCallback(name) {
    if (!this.shadowRoot) return;
    if (name === 'meta') { this._renderMeta(); return; }
    this._periodLengthSeconds = Number(this.getAttribute('period-length')) || DEFAULT_PERIOD_SECONDS;
    this._periodCount = Number(this.getAttribute('period-count')) || DEFAULT_PERIOD_COUNT;
    // Only re-seat the clock if it hasn't been used yet, so arriving format
    // attributes don't wipe a bout already in progress.
    if (!this._running && this._remaining === this._seededFrom) {
      this._remaining = this._periodLengthSeconds;
      this._seededFrom = this._periodLengthSeconds;
    }
    this._render();
  }

  subscribe() {
    this._periodLengthSeconds = Number(this.getAttribute('period-length')) || DEFAULT_PERIOD_SECONDS;
    this._periodCount = Number(this.getAttribute('period-count')) || DEFAULT_PERIOD_COUNT;
    this._currentPeriod = 1;
    // Each period keeps its own clock. Advancing to a period never visited
    // starts it full; stepping back returns to where that period was left,
    // because going back is a correction and the time already run is real.
    this._remainingByPeriod = new Map();
    this._remaining = this._periodLengthSeconds;
    this._seededFrom = this._periodLengthSeconds;
    this._running = false;
    this._lastTick = null;

    this.setAttribute('role', 'button');
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
    this.listen(this, 'keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        buzz(BUZZ_CLOCK);
        this.toggle();
      }
    });

    // Slotted actions (period, end bout) are light-DOM children of this
    // host, so pressing one also reaches the host's tap gesture and would
    // toggle the clock as a side effect. Record the origin at pointerdown:
    // Event.target is a live getter that retargets, and once the dispatch
    // has finished it reports the outermost shadow host instead of the
    // element pressed — so reading it later (at pointerup, inside onTap)
    // always said <app-router> and never matched.
    this.listen(this, 'pointerdown', e => {
      this._pressBeganOnAction = Boolean(e.target?.closest?.('[slot]'));
    });

    this._interval = setInterval(() => this._tick(), 200);
    this._render();
  }

  unsubscribe() {
    clearInterval(this._interval);
  }

  _tick() {
    if (!this._running) return;
    const now = Date.now();
    const before = this._remaining;
    this._remaining = Math.max(0, this._remaining - (now - this._lastTick) / 1000);
    this._lastTick = now;

    // Fire on the tick that crosses the mark, so a mark is never announced
    // twice and never missed because no tick landed exactly on it.
    if (this.soundEnabled) {
      for (const mark of this.warnAt) {
        if (before > mark && this._remaining <= mark) playWarning(this.soundVolume);
      }
    }

    if (this._remaining === 0) {
      if (this.soundEnabled) playPeriodEnd(this.soundVolume);
      // Independent of sound: a silenced phone still has to tell the
      // referee the period is over.
      buzz(BUZZ_PERIOD_END);
      this._setRunning(false);
      this.dispatchEvent(new CustomEvent('timer-expired', {
        bubbles: true,
        composed: true,
        detail: { period: this._currentPeriod, isFinalPeriod: this._currentPeriod >= this._periodCount },
      }));
    }
    this._render();
  }

  // --- public API (the page halts the clock when a touch is scored) ---

  // Single place that changes running state, so the `data-running`
  // attribute, the `timer-state` event and `_running` can never drift
  // apart — the page mirrors this onto the fencer halves to flood them.
  _setRunning(running) {
    if (this._running === running) return;
    this._running = running;
    this.toggleAttribute('data-running', running);
    if (this.soundEnabled) {
      (running ? playClockStart : playClockStop)(this.soundVolume);
    }
    this.dispatchEvent(new CustomEvent('timer-state', {
      bubbles: true, composed: true, detail: { running },
    }));
    this._render();
  }

  halt() {
    this._setRunning(false);
  }

  start() {
    if (this._remaining === 0) return;
    this._lastTick = Date.now();
    this._setRunning(true);
  }

  toggle() {
    if (this._running) this.halt();
    else this.start();
  }

  nextPeriod() {
    if (this._currentPeriod >= this._periodCount) return;
    this._goToPeriod(this._currentPeriod + 1);
  }

  previousPeriod() {
    if (this._currentPeriod <= 1) return;
    this._goToPeriod(this._currentPeriod - 1);
  }

  _goToPeriod(period) {
    this._setRunning(false);
    this._remainingByPeriod.set(this._currentPeriod, this._remaining);
    this._currentPeriod = period;
    this._remaining = this._remainingByPeriod.has(period)
      ? this._remainingByPeriod.get(period)
      : this._periodLengthSeconds;
    this._seededFrom = null;
    this._render();
  }

  // Seed from persisted state. Always comes back halted: the page was gone,
  // so the referee resumes deliberately rather than finding a clock already
  // draining.
  restore({ period, remainingSeconds }) {
    if (Number.isFinite(period)) this._currentPeriod = Math.min(this._periodCount, Math.max(1, period));
    if (Number.isFinite(remainingSeconds)) {
      this._remaining = Math.max(0, Math.min(this._periodLengthSeconds, remainingSeconds));
      this._seededFrom = null; // hand-set; a late format attribute must not reset it
    }
    this._running = false;
    this.removeAttribute('data-running');
    this._render();
  }

  get canAdvancePeriod() { return this._currentPeriod < this._periodCount; }
  get canGoBackPeriod() { return this._currentPeriod > 1; }
  get periodCount() { return this._periodCount; }
  get remainingSeconds() { return this._remaining; }
  get currentPeriod() { return this._currentPeriod; }
  get running() { return this._running; }

  // --- gestures ---

  // Buzz only on gestures the referee made *here*. halt()/start() stay
  // silent so the page can halt the clock as part of scoring without
  // doubling up on the longer scoring buzz.
  onTap() {
    if (this._pressBeganOnAction) return;
    buzz(BUZZ_CLOCK);
    this.toggle();
  }

  _renderMeta() {
    const prefix = this.getAttribute('meta') ?? '';
    // "Period 1 of 1" is noise — a one-period bout has no period to track,
    // so the line carries only the weapon.
    const period = this._periodCount > 1
      ? `Period ${this._currentPeriod} of ${this._periodCount}`
      : '';
    this.shadowRoot.querySelector('#meta').textContent =
      [prefix, period].filter(Boolean).join(' · ');
  }

  _render() {
    const sr = this.shadowRoot;
    this._renderMeta();
    this.toggleAttribute('data-final-period', this._currentPeriod >= this._periodCount);
    sr.querySelector('#time').textContent = format(this._remaining);
    // Pause bars while running, play triangle while halted — the standard
    // media convention: the icon shows what the control does next.
    sr.querySelector('#icon').innerHTML = this._running
      ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'
      : '<path d="M8 5l12 7-12 7z"/>';
    // One key per whole sentence rather than a stem plus two endings — the
    // running/halted clause is not a suffix in every language.
    this.setAttribute('aria-label', t(
      this._running ? 'match-timer.label.running' : 'match-timer.label.halted',
      { time: format(this._remaining), period: this._currentPeriod, periods: this._periodCount },
    ));
  }
}

customElements.define('match-timer', MatchTimer);
