import { AppElement } from 'socle/core/app-element.js';
import { t } from 'socle/core/strings.js';

// Shared across the bladencode fencing apps. Full-screen card picker: one
// page per card,
// swiped horizontally, the whole screen flooded in that card's colour so
// the referee can hold the phone up and show it from across the piste.
//
// Gives cards; it does not take them back. Withdrawing one belongs with the
// other corrections in the bout log, and a remove button that appeared only
// for held cards changed the footer's height from card to card — the same
// layout instability the main screen is built to avoid.
// Mirrors the pattern in doc 10's App2 reference (full-bleed colour +
// swipe-to-change + explicit apply), which is the one interaction in that
// app that clearly beat ours.
//
// Paging uses CSS scroll-snap rather than hand-rolled gesture code: it
// gives real momentum, rubber-banding and keyboard/AT scrolling for free,
// and the Gestures module's swipe is a discrete fire-once event with no
// notion of a settled page.
const CARD_TYPES = ['yellow', 'red', 'black'];
// Yellow is a warning that exists once, and black is exclusion — both are
// held or not held. Reds accumulate, so they have no ceiling here.
const CARD_MAX = { yellow: 1, black: 1 };
const CARD_INK = { yellow: '#1A1A1A', red: '#FFFFFF', black: '#FFFFFF' };
const CARD_BG = { yellow: '#E8B923', red: '#E5382F', black: '#15181B' };
// Resolved through t() at render time, not at module load: a locale change
// must reach text already on screen, and these are read on every render.
const cardName   = type => t(`card.${type}.name`);
const cardInline = type => t(`card.${type}.inline`);
const cardNote   = type => t(`card.${type}.note`);

class CardPicker extends AppElement {
  template() {
    return `
      <style>
        :host {
          position: fixed;
          inset: 0;
          z-index: 100;
          flex-direction: column;
          /* The whole screen is the card, chrome included — a referee holds
             the phone up to show it, and a dark footer strip would read as
             a black band across the card from a distance. Controls take the
             card's own ink colour instead of assuming white. */
          background: var(--card-bg, #000);
          color: var(--card-ink, #fff);
          font-family: var(--font-family);
        }
        @media (prefers-reduced-motion: no-preference) {
          :host { transition: background-color 180ms linear, color 180ms linear; }
        }
        /* These two carry their state in the selector, which is why they
           are staying as they are.
           HISTORY: a bare :host used to lose to base's display:block,
           because AppElement applies its base sheet via adoptedStyleSheets
           and the cascade orders that after this style element. Getting it
           wrong in the closed state left this fixed, full-screen, z-index
           100 overlay permanently covering the app; getting it wrong open
           laid the picker out as block instead of flex. Socle 1.4.2 moved
           base to :where(:host) at zero specificity, so that trap is gone.
           STILL CORRECT regardless: open/closed is a state, and naming the
           state in the selector reads better than toggling a display value
           from script. These are (0,2,0) and would win either way. */
        :host(:not([open])) { display: none; }
        :host([open]) { display: flex; }

        /* The scroller fills the entire screen rather than the area above
           the controls. Now that the footer is the same colour as the card
           there's no visible boundary, so a swipe that started low simply
           did nothing — the whole card has to be draggable. The controls
           float over it and only the buttons themselves take pointer
           events. */
        #pages {
          position: absolute;
          inset: 0;
          display: flex;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
        }
        #pages::-webkit-scrollbar { display: none; }

        .page {
          flex: 0 0 100%;
          scroll-snap-align: center;
          scroll-snap-stop: always;
          display: grid;
          grid-template-rows: auto 1fr auto;
          justify-items: center;
          gap: var(--space-2);
          padding: var(--space-6);
          padding-block-start: calc(var(--space-6) + var(--safe-area-top, 0px));
          /* Clear the floating controls by their real measured height plus
             a gap, rather than a fixed guess — the controls grow and shrink
             with the safe-area inset and the landscape type scale, and a
             magic number left the "already given" pill touching the
             pagination dots. */
          padding-block-end: calc(var(--controls-h, 190px) + var(--space-6));
          text-align: center;
        }
        .page .middle {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
        }
        /* Large enough to answer "who is this for?" across the piste, not
           just in the hand. */
        .page .for {
          font-size: var(--font-size-heading);
          font-weight: var(--font-weight-bold);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.85;
        }
        .page .name {
          font-size: 3.5rem;
          font-weight: var(--font-weight-bold);
          line-height: 1;
        }
        .page .note { font-size: var(--font-size-body); opacity: 0.75; max-inline-size: 22ch; }
        .page .held {
          margin-block-start: var(--space-2);
          font-size: var(--font-size-caption);
          font-weight: var(--font-weight-bold);
          padding: var(--space-1) var(--space-3);
          border-radius: var(--radius-full);
          background: rgba(0,0,0,0.18);
        }
        .page .held.none { opacity: 0.5; font-weight: var(--font-weight-regular); }

        #controls {
          position: absolute;
          inset-inline: 0;
          inset-block-end: 0;
          pointer-events: none;
        }
        /* Only the buttons are interactive; everything else lets the swipe
           through to the scroller beneath. */
        #controls button { pointer-events: auto; }

        #dots {
          display: flex;
          gap: var(--space-2);
          justify-content: center;
          padding-block: var(--space-3);
        }
        #dots span {
          inline-size: 7px;
          block-size: 7px;
          border-radius: var(--radius-full);
          background: currentColor;
          opacity: 0.3;
        }
        #dots span.current { opacity: 1; }

        footer {
          padding: var(--space-3) var(--space-4);
          padding-block-end: calc(var(--space-4) + var(--safe-area-bottom, 0px));
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        footer button {
          min-block-size: var(--touch-target-lg);
          border-radius: var(--radius-md);
          font-family: var(--font-family);
          font-size: var(--font-size-body);
          cursor: pointer;
        }
        #apply {
          border: 2px solid currentColor;
          background: none;
          color: inherit;
          font-weight: var(--font-weight-bold);
        }
        #apply:disabled { opacity: 0.4; cursor: not-allowed; }
        #cancel {
          border: none;
          background: none;
          color: inherit;
          opacity: 0.7;
          min-block-size: var(--touch-target);
        }
        button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }

        .hint {
          text-align: center;
          font-size: var(--font-size-caption);
          opacity: 0.6;
        }
        .hint[hidden] { display: none; }

        @media (max-height: 600px) {
          .page .name { font-size: 2.25rem; }
          .page .note { display: none; }
          .page {
            gap: var(--space-1);
            padding-block-start: calc(var(--space-3) + var(--safe-area-top, 0px));
          }
        }
      </style>
      <div id="pages" tabindex="-1"></div>
      <div id="controls">
        <div id="dots"></div>
        <footer>
          <p class="hint" id="hint"></p>
          <button type="button" id="apply"></button>
          <button type="button" id="cancel"></button>
        </footer>
      </div>
    `;
  }

  subscribe() {
    this._options = [];
    this._index = 0;

    const sr = this.shadowRoot;
    this.listen(sr.querySelector('#cancel'), 'click', () => this.close());
    this.listen(sr.querySelector('#apply'), 'click', () => this._apply());
    this.listen(sr.querySelector('#pages'), 'scroll', () => this._onScroll());
    this.listen(this, 'keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
  }

  // `options` are the cards this fencer can still be given (the caller
  // decides — a spent yellow drops out of the deck entirely rather than
  // sitting there disabled). `counts` is {yellow, red, black}, used only to
  // show what they already hold.
  open({ side, label, options, counts }) {
    this._side = side;
    this._label = label || side;
    this._counts = counts ?? {};
    this._options = (options ?? CARD_TYPES).filter(type => Object.hasOwn(CARD_BG, type));
    if (!this._options.length) return;
    this._index = 0;

    this._renderPages();
    this.setAttribute('open', '');
    this._syncCurrent();
    this._measureControls();
    // clientWidth is only meaningful once the host is displayed.
    const pages = this.shadowRoot.querySelector('#pages');
    pages.scrollLeft = this._index * pages.clientWidth;
    // Focus the action, not the scroller — keyboard users land on the thing
    // they came to press, and Escape still cancels from anywhere.
    this.shadowRoot.querySelector('#apply').focus();
  }

  // The controls only have a height once the host is displayed, so this
  // runs after the open attribute lands.
  _measureControls() {
    const controls = this.shadowRoot.querySelector('#controls');
    const apply = () => {
      const h = controls.offsetHeight;
      if (h > 0) this.style.setProperty('--controls-h', `${h}px`);
    };
    apply();
    requestAnimationFrame(apply); // fonts/safe-area can settle a frame late
  }

  close() {
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('picker-close', { bubbles: true, composed: true }));
  }

  get currentCard() { return this._options[this._index]; }

  _renderPages() {
    const sr = this.shadowRoot;
    // Every interpolated value below is either a hardcoded constant keyed
    // by card type or text assigned via textContent further down — the
    // fencer's label is set with textContent, never into this string.
    sr.querySelector('#pages').innerHTML = this._options.map(type => `
      <section class="page" data-type="${type}" style="background:${CARD_BG[type]};color:${CARD_INK[type]}">
        <span class="for"></span>
        <div class="middle">
          <span class="name"></span>
          <span class="note"></span>
        </div>
        <span class="held" data-type="${type}"></span>
      </section>
    `).join('');

    // Untrusted-safe: participant labels can arrive from an imported bout
    // file, so they go in as text nodes rather than markup. Translated strings
    // go in the same way — a translation file is content, and content does not
    // belong in an innerHTML template.
    for (const el of sr.querySelectorAll('.page .for')) el.textContent = this._label;
    for (const el of sr.querySelectorAll('.page')) {
      const { type } = el.dataset;
      el.querySelector('.name').textContent = cardName(type);
      el.querySelector('.note').textContent = cardNote(type);
    }

    sr.querySelector('#hint').textContent = t('card-picker.hint');
    sr.querySelector('#cancel').textContent = t('card-picker.cancel');

    // Show what this fencer already holds, so the picker doubles as the
    // record and a second yellow can't be given by accident.
    for (const el of sr.querySelectorAll('.page .held')) {
      const held = this._counts[el.dataset.type] ?? 0;
      el.textContent = held ? t('card-picker.held', { count: held }) : t('card-picker.none-given');
      el.classList.toggle('none', !held);
    }

    sr.querySelector('#dots').innerHTML = this._options.map(() => '<span></span>').join('');
    sr.querySelector('#dots').hidden = this._options.length < 2;
    sr.querySelector('#hint').hidden = this._options.length < 2;
  }

  _onScroll() {
    const pages = this.shadowRoot.querySelector('#pages');
    const width = pages.clientWidth || 1;
    const index = Math.round(pages.scrollLeft / width);
    if (index !== this._index && index >= 0 && index < this._options.length) {
      this._index = index;
      this._syncCurrent();
    }
  }

  _syncCurrent() {
    const sr = this.shadowRoot;
    [...sr.querySelectorAll('#dots span')].forEach((d, i) => d.classList.toggle('current', i === this._index));
    const type = this.currentCard;
    if (!type) return;

    // The host, not just the page, takes the card's colour — the footer and
    // dots sit on it too, so the whole phone reads as the card.
    this.style.setProperty('--card-bg', CARD_BG[type]);
    this.style.setProperty('--card-ink', CARD_INK[type]);

    const apply = sr.querySelector('#apply');
    const held = this._counts[type] ?? 0;
    const atMax = held >= (CARD_MAX[type] ?? Infinity);
    apply.disabled = atMax;
    // cardInline(), never cardName().toLowerCase() — case-transforming a
    // translated string is wrong in any language that capitalises nouns.
    apply.textContent = atMax
      ? t('card-picker.at-max', { card: cardName(type) })
      : t('card-picker.apply', { card: cardInline(type), fencer: this._label });

  }

  _apply() {
    const cardType = this.currentCard;
    if (!cardType) return;
    if ((this._counts[cardType] ?? 0) >= (CARD_MAX[cardType] ?? Infinity)) return;
    this.dispatchEvent(new CustomEvent('card-apply', {
      bubbles: true,
      composed: true,
      detail: { side: this._side, cardType },
    }));
    this.close();
  }
}

customElements.define('card-picker', CardPicker);
