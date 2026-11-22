import { AppElement } from 'socle/core/app-element.js';
import { t } from 'socle/core/strings.js';

// Shared across the trifecta. One fencer's penalty rack: a button that both
// *shows* the cards they've been given and opens the picker to give another.
//
// Deliberately a sibling of touch-target rather than a child of it, even
// though it sits visually inside that fencer's half. touch-target's host is
// role="button" (hold to score), and ARIA treats a button's descendants as
// presentational — a nested button would be flattened and unreachable for
// assistive tech, and its pointer events would bubble into the scoring
// gestures. Keeping them siblings avoids both.
class CardRack extends AppElement {
  template() {
    return `
      <style>
        :host { display: block; }
        button {
          display: flex;
          gap: var(--space-1);
          padding: var(--space-2);
          margin: calc(var(--space-2) * -1);
          background: none;
          border: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-family: var(--font-family);
        }
        button:focus-visible { outline: 2px solid var(--color-field-ink, #fff); outline-offset: 0; }

        .card {
          inline-size: 14px;
          block-size: 19px;
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: var(--font-weight-bold);
          line-height: 1;
          /* Empty slots are near-invisible on purpose. Any heavier and they
             read as awarded cards at a glance, which is the one thing a
             penalty rack must never do. */
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.14);
          color: transparent;
        }
        .card.on { border-color: transparent; color: #fff; }
        .card.yellow.on { background: #E8B923; }
        .card.red.on { background: #E5382F; }
        .card.black.on { background: #15181B; border-color: rgba(255,255,255,0.5); }

        @media (max-height: 600px) {
          .card { inline-size: 11px; block-size: 15px; font-size: 9px; }
        }
      </style>
      <button type="button" id="btn"></button>
    `;
  }

  static get observedAttributes() { return ['cards', 'label']; }

  attributeChangedCallback() {
    if (this.shadowRoot) this._render();
  }

  subscribe() {
    this.listen(this.shadowRoot.querySelector('#btn'), 'click', () => {
      this.dispatchEvent(new CustomEvent('rack-open', {
        bubbles: true,
        composed: true,
        detail: { side: this.getAttribute('side') },
      }));
    });
    this._render();
  }

  // Counts as [yellow, red, black] — always numbers, never interpolated text.
  get counts() {
    const [yellow = 0, red = 0, black = 0] =
      (this.getAttribute('cards') ?? '').split(',').map(n => Number(n) || 0);
    return { yellow, red, black };
  }

  _render() {
    const { yellow, red, black } = this.counts;

    // Two fixed slots — yellow then red — so the rack never changes width
    // as a bout goes on, which would shift what sits beside it. Reds carry
    // a number from the second onward (a lone red needs no "1" to read).
    // Black is rare and terminal, so it earns a slot only once shown.
    const slot = (kind, on, text = '') => `<span class="card ${kind}${on ? ' on' : ''}">${text}</span>`;
    const marks = [
      slot('yellow', yellow > 0),
      slot('red', red > 0, red > 1 ? String(red) : ''),
    ];
    if (black > 0) marks.push(slot('black', true, black > 1 ? String(black) : ''));

    const btn = this.shadowRoot.querySelector('#btn');
    btn.innerHTML = marks.join('');

    const label = this.getAttribute('label') || this.getAttribute('side') || '';
    // Only `red` can exceed one, so only it needs a plural pair. This is
    // deliberately not a general plural rule: English needs two forms and
    // other languages need up to six, and inventing a half-rule here would
    // read as working while being wrong in most locales. If a second card
    // type ever becomes repeatable, use Intl.PluralRules rather than
    // extending this.
    const given = [
      yellow > 0 && t('card-rack.yellow'),
      red > 0 && (red > 1 ? t('card-rack.red.other', { count: red }) : t('card-rack.red.one')),
      black > 0 && t('card-rack.black'),
    ].filter(Boolean).join(', ');
    btn.setAttribute('aria-label', t('card-rack.label', {
      fencer: label,
      given: given || t('card-rack.none'),
    }));
  }
}

customElements.define('card-rack', CardRack);
