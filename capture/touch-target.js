import { AppElement } from 'socle/core/app-element.js';
import { t } from 'socle/core/strings.js';
import { Gestures } from 'socle/modules/gestures/gestures.js';
import { buzz, BUZZ_SCORE } from './haptics.js';

// Shared across the trifecta (doc 09 §5: Pret Compet's device model needs the
// same capture UI). Reaches the library through the depth-independent 'socle/'
// specifier, so this file does not know or care where it is mounted — see this
// repo's README. It used to be symlinked inside _lib/ with relative '../../'
// imports, which is exactly what tied it to one mount point and put app code
// in the folder `socle update` overwrites.
//
// UI tier. One fencer's full-bleed half of the Capture screen: name, score,
// card marks. Uses the Gestures MIXIN rather than Gestures.attach(), because
// the mixin listens on the host element itself (see
// Gestures(Base).connectedCallback). Socle 1.6.0 gave attach() tap and
// long-press parity, so the capability gap that originally forced this choice
// is gone — but the mixin is still the right form for a component that *is*
// the gesture surface, rather than one that attaches to a sub-element.
//
// Gesture split is deliberate and the inverse of the obvious mapping: a
// plain tap does NOT score. The failure mode this screen is designed around
// is a referee forgetting to stop the clock, so a tap anywhere is spent on
// halting it; scoring has to resist stray contact, so it takes a
// long-press. Both gestures are reported and the page decides what they
// mean, since only the page knows the clock's state.
//
// Layout note, and the constraint behind it NO LONGER APPLIES — read this
// before copying the pattern into a new component.
//
// AppElement applies its base sheet through `adoptedStyleSheets`, which the
// cascade orders *after* this <style> element, so a bare
// `:host { display: flex }` used to lose silently to base's
// `:host { display: block }` at equal specificity. That is why everything
// needing to lay out lives on #surface here.
//
// Socle 1.4.2 changed base to `:where(:host)`, at zero specificity, so a
// host display declaration wins now. A NEW component should simply put
// layout on :host. This one keeps #surface because collapsing it is a
// non-mechanical CSS change to a component whose geometry took iteration,
// and nothing in the suite verifies computed layout — happy-dom does not
// implement it. Retained on cost/benefit, not because it is required.
class TouchTarget extends Gestures(AppElement) {
  template() {
    return `
      <style>
        :host {
          --field: var(--color-accent);
          --field-end: var(--color-accent-dark);
          background: linear-gradient(165deg, var(--field), var(--field-end));
          color: var(--color-field-ink, #fff);
          font-family: var(--font-family);
          cursor: pointer;
          /* The whole half is one gesture surface — browser text selection
             and the native long-press callout would both fight the
             long-press-to-score gesture. */
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
          touch-action: manipulation;
        }
        :host([side="A"]) {
          --field: var(--color-side-a-field, var(--color-side-a, var(--color-accent)));
          --field-end: var(--color-side-a-field-end, var(--color-side-a, var(--color-accent-dark)));
        }
        :host([side="B"]) {
          --field: var(--color-side-b-field, var(--color-side-b, var(--color-accent)));
          --field-end: var(--color-side-b-field-end, var(--color-side-b, var(--color-accent-dark)));
        }
        :host(:focus-visible) { outline: 3px solid var(--color-field-ink, #fff); outline-offset: -5px; }

        /* Momentary confirmation that the long-press registered — the score
           itself updates a store round-trip later, which is too slow to feel
           like a response to the gesture. */
        :host([data-flash]) { filter: brightness(1.35); }

        #surface {
          block-size: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          position: relative;
        }

        /* Clock-running flood. The colour wipes up from the bottom edge —
           the side nearest the clock band — so it reads as the clock's
           colour taking over the screen rather than a plain crossfade.
           An overlay (not a background swap) because gradient-to-gradient
           transitions don't interpolate in CSS; clip-path does. */
        #surface::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, var(--color-clock-active, #2A3F52), var(--color-clock-active-end, #1E2E3C));
          clip-path: inset(100% 0 0 0);
          pointer-events: none;
        }
        :host([running]) #surface::before { clip-path: inset(0 0 0 0); }
        /* Content sits above the flood. */
        #name, #score { position: relative; z-index: 1; }

        @media (prefers-reduced-motion: no-preference) {
          /* In: with the clock band, immediately.
             Out: one step behind the log, which clears first. */
          #surface::before { transition: clip-path 150ms linear 150ms; }
          :host([running]) #surface::before { transition-delay: 0ms; }
        }

        /* Identity survives the flood: the fencer's own colour moves to the
           name label, so left/right is still readable as A/B when both
           halves are one colour. Uses the -on-active variants, not the
           normal side colours — the standard red fails contrast against
           the flood at this text size. */
        :host([running]) #name { opacity: 1; font-weight: var(--font-weight-bold); }
        :host([running][side="A"]) #name { color: var(--color-side-a-on-active, #3DD68C); }
        :host([running][side="B"]) #name { color: var(--color-side-b-on-active, #FFB3AD); }

        /* While the clock runs, time is the thing being read — the score is
           context, not the subject. The score takes its own side's colour,
           which does double duty: it recedes from the white clock (8.5:1 →
           ~4.9:1) *and* it makes left/right unmistakable when both halves
           are one colour. Full white returns the moment the clock halts,
           which is when scoring becomes the active task.
           Deliberately no opacity on top of this — alpha-blending these
           tints into the violet would drop them to ~2.4:1, below the 3:1
           large-text floor. The colour alone is the dimming. */
        :host([running][side="A"]) #score { color: var(--color-side-a-score-active, #63B391); }
        :host([running][side="B"]) #score { color: var(--color-side-b-score-active, #FFB3AD); }
        @media (prefers-reduced-motion: no-preference) {
          #score, #name { transition: opacity 240ms linear, color 240ms linear; }
        }

        #name {
          font-size: var(--font-size-caption);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.78;
        }
        #score {
          font-size: var(--score-size, 4.5rem);
          font-weight: var(--font-weight-bold);
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }

        /* Landscape phones. Targeted by viewport height rather than
           orientation, so a landscape tablet or desktop — which has plenty
           of height — keeps the full-size type. */
        @media (max-height: 600px) {
          :host { --score-size: 3.25rem; }
        }
        /* Compact variant: same hold-to-score surface, pill-shaped, label
           only. Used for épée's DOUBLE control, which belongs to neither
           half — so it keeps the identical gesture contract rather than
           becoming a tap-to-score exception sitting between two
           hold-to-score fields. */
        :host([compact]) {
          /* Flex on the host, not #surface: the host's height comes from
             min-block-size, so a percentage height on the child never
             resolved and the label stayed pinned to the top. This selector
             is (0,2,0) and so does beat base's display:block — a bare
             :host would not. */
          display: flex;
          align-items: center;
          justify-content: center;
          /* Outline only. A filled pill read as a panel sitting on top of
             the field rather than a control drawn on it, and competed with
             the scores for attention — it's a rare action, so it should be
             legible but quiet. */
          background: none;
          border: 1.5px solid rgba(255,255,255,0.3);
          border-radius: var(--radius-full);
          padding: var(--space-2) var(--space-5);
          /* Twice the default height. A double touch is a committed call
             and the pill sits between two huge targets — it needs mass to
             be hit confidently, without the label shouting. */
          min-block-size: 76px;
        }
        :host([compact]) #surface { block-size: auto; }
        :host([compact]) #surface::before { display: none; }
        :host([compact]) #score { display: none; }
        :host([compact]) #name {
          color: rgba(255,255,255,0.68);
          opacity: 1;
          font-weight: var(--font-weight-bold);
          letter-spacing: 0.08em;
        }
        /* Stays quiet during the flood too — the tint rules below are for
           the fencer halves, not this. */
        :host([compact][running]) #name { color: rgba(255,255,255,0.6); }

        @media (prefers-reduced-motion: no-preference) {
          :host { transition: filter 0.12s ease; }
        }
      </style>
      <div id="surface">
        <span id="name"></span>
        <span id="score">0</span>
      </div>
    `;
  }

  static get observedAttributes() { return ['label', 'score']; }

  attributeChangedCallback() {
    if (this.shadowRoot) this._render();
  }

  subscribe() {
    // Keyboard users get the direct action: Enter/Space scores. The
    // long-press requirement exists to resist *stray contact* on a large
    // touch surface, which has no keyboard equivalent, so gating the
    // keyboard path behind a held key would add friction for nothing.
    this.setAttribute('role', 'button');
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
    this.listen(this, 'keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._emitScore();
      }
    });
    this._render();
  }

  _render() {
    const sr = this.shadowRoot;
    const label = this.getAttribute('label') ?? '';
    const score = this.getAttribute('score') ?? '0';
    sr.querySelector('#name').textContent = label;
    sr.querySelector('#score').textContent = score;

    this.setAttribute('aria-label', this.hasAttribute('compact')
      ? t('touch-target.label.compact', { fencer: label })
      : t('touch-target.label', { fencer: label || this.getAttribute('side'), score }));
  }

  _emitScore() {
    // Longer than the clock's pulse so a referee can tell "point
    // registered" from "clock toggled" by feel alone, without looking down.
    buzz(BUZZ_SCORE);
    this.setAttribute('data-flash', '');
    setTimeout(() => this.removeAttribute('data-flash'), 140);
    this.dispatchEvent(new CustomEvent('touch-score', { bubbles: true, composed: true }));
  }

  onTap() {
    this.dispatchEvent(new CustomEvent('touch-tap', { bubbles: true, composed: true }));
  }

  onLongPress() {
    this._emitScore();
  }
}

customElements.define('touch-target', TouchTarget);
