// No store, no IDB, no DOM, no Socle — this is the whole point of the fold
// being separate from the placement. If this file ever needs `boot()` or a
// happy-dom annotation, the domain logic has grown a dependency on one app's
// state shape again.
import { describe, it, expect } from 'vitest';
import { applyBoutEvent, boutIdFor } from './bout.js';
import {
  BOUT_CREATED, BOUT_COMPLETED, BOUT_DELETED,
  TOUCH_SCORED, TOUCH_VOIDED, CARD_ISSUED, CARD_REVOKED, CLOCK_UPDATED,
} from '../vocabulary/events.js';

let seq = 0;
const ev = (type, payload, occurredAt = 1000) => ({ id: `e${seq++}`, type, payload, occurredAt });
const empty = {};

const created = (boutId = 'b1', extra = {}) =>
  applyBoutEvent(empty, ev(BOUT_CREATED, { boutId, weapon: 'foil', participants: {}, ...extra }));

const score = (agg, side, scoreAfter, extra = {}) =>
  applyBoutEvent(agg, ev(TOUCH_SCORED, {
    boutId: 'b1', touchId: `t-${side}-${seq}`, scoredBy: side, valid: true, scoreAfter, ...extra,
  }));

describe('folding a bout from its events', () => {
  it('builds a bout that has not been seen before', () => {
    const { bout } = created();

    expect(bout).toMatchObject({ id: 'b1', weapon: 'foil', status: 'in-progress' });
    expect(bout.scoreAfter).toEqual({ A: 0, B: 0 });
  });

  it('folds an event for a bout this app has never seen, without throwing', () => {
    // Reachable from an imported file or a peer's log slice: the touch arrives
    // with no bout:created ahead of it. Dropping it would lose data the app is
    // only meant to be carrying.
    const agg = score(empty, 'A', { A: 1, B: 0 });

    expect(agg.touches).toHaveLength(1);
    expect(agg.bout.scoreAfter).toEqual({ A: 1, B: 0 });
  });

  it('records a touch and moves the score with it', () => {
    const agg = score(created(), 'A', { A: 1, B: 0 });

    expect(agg.touches).toHaveLength(1);
    expect(agg.touches[0]).toMatchObject({ scoredBy: 'A', valid: true, voided: false });
    expect(agg.bout.scoreAfter).toEqual({ A: 1, B: 0 });
  });

  it('scores a simultaneous pair atomically, so neither fencer led', () => {
    // An épée double. Scored one-after-the-other this would replay as 1–0 then
    // 1–1, which says A arrived first. Nobody did.
    const pairId = 'p1';
    let agg = created();
    agg = score(agg, 'A', { A: 1, B: 1 }, { pairId });
    agg = score(agg, 'B', { A: 1, B: 1 }, { pairId });

    const [x, y] = agg.touches;
    expect(x.scoreAfter).toEqual({ A: 1, B: 1 });
    expect(y.scoreAfter).toEqual({ A: 1, B: 1 });
  });

  it('recomputes the score when a touch is withdrawn, rather than trusting the payload', () => {
    let agg = created();
    agg = score(agg, 'A', { A: 1, B: 0 });
    agg = score(agg, 'A', { A: 2, B: 0 });
    const victim = agg.touches[0].id;

    agg = applyBoutEvent(agg, ev(TOUCH_VOIDED, { boutId: 'b1', targetId: victim, reason: 'error' }));

    expect(agg.bout.scoreAfter).toEqual({ A: 1, B: 0 });
    expect(agg.touches[0]).toMatchObject({ voided: true, voidReason: 'error' });
    // Compensating, not deleted — "awarded then withdrawn" stays readable.
    expect(agg.touches).toHaveLength(2);
  });

  describe('a voided touch keeps the score it held while it counted', () => {
    // Found on hardware. recomputeScores overwrote scoreAfter on EVERY touch,
    // so a struck-through row displayed the score as if the touch had never
    // happened — which also made it read identically to the row below it. The
    // strike-through row is a record of what happened and was then undone, so
    // it has to show the board as it read at the time.
    it('shows the score as it was, not as it is now', () => {
      let agg = created();
      agg = score(agg, 'A', { A: 1, B: 0 });
      agg = score(agg, 'A', { A: 2, B: 0 });
      const first = agg.touches[0].id;

      agg = applyBoutEvent(agg, ev(TOUCH_VOIDED, { boutId: 'b1', targetId: first }));

      expect(agg.touches[0].voided).toBe(true);
      expect(agg.touches[0].scoreAfter).toEqual({ A: 1, B: 0 }); // what it WAS
      expect(agg.touches[1].scoreAfter).toEqual({ A: 1, B: 0 }); // recomputed
      expect(agg.bout.scoreAfter).toEqual({ A: 1, B: 0 });       // the board now
    });

    it('does not collapse a sole voided touch to nil', () => {
      // The clearest form of the bug. One touch, then void it. The row has to
      // read "Red — 0–1" struck through, because that is what happened. The
      // old code recomputed it to 0–0 — the score as if it had never been
      // awarded — which says nothing was ever scored and contradicts the
      // strike-through right next to it.
      let agg = created();
      agg = score(agg, 'B', { A: 0, B: 1 });

      agg = applyBoutEvent(agg, ev(TOUCH_VOIDED, { boutId: 'b1', targetId: agg.touches[0].id }));

      expect(agg.touches[0].scoreAfter).toEqual({ A: 0, B: 1 }); // the row
      expect(agg.bout.scoreAfter).toEqual({ A: 0, B: 0 });       // the board
    });

    it('may legitimately read the same as the row below it', () => {
      // Not a bug, and worth pinning so nobody "fixes" it: void the first of
      // two touches by the same fencer and the survivor now produces the score
      // the voided one used to show. Two rows reading 0–1, one struck through,
      // is the correct record of what happened.
      let agg = created();
      agg = score(agg, 'B', { A: 0, B: 1 });
      agg = score(agg, 'B', { A: 0, B: 2 });

      agg = applyBoutEvent(agg, ev(TOUCH_VOIDED, { boutId: 'b1', targetId: agg.touches[0].id }));

      expect(agg.touches[0].scoreAfter).toEqual({ A: 0, B: 1 });
      expect(agg.touches[1].scoreAfter).toEqual({ A: 0, B: 1 });
    });

    it('leaves earlier voided rows alone when a later touch is voided', () => {
      // Each void freezes only its own row. Without that, voiding a second
      // touch would rewrite the first one's frozen score.
      let agg = created();
      agg = score(agg, 'A', { A: 1, B: 0 });
      agg = score(agg, 'A', { A: 2, B: 0 });
      agg = score(agg, 'A', { A: 3, B: 0 });

      agg = applyBoutEvent(agg, ev(TOUCH_VOIDED, { boutId: 'b1', targetId: agg.touches[0].id }));
      const frozen = agg.touches[0].scoreAfter;
      agg = applyBoutEvent(agg, ev(TOUCH_VOIDED, { boutId: 'b1', targetId: agg.touches[2].id }));

      expect(agg.touches[0].scoreAfter).toEqual(frozen);
      expect(agg.bout.scoreAfter).toEqual({ A: 1, B: 0 });
    });

    it('reaches the same values on a full replay', () => {
      // State is rebuilt by replaying the log on every boot, so freezing must
      // not depend on the order the app happened to apply things in.
      const events = [
        ev(BOUT_CREATED, { boutId: 'b1', weapon: 'foil', participants: {} }, 1),
        ev(TOUCH_SCORED, { boutId: 'b1', touchId: 'r1', scoredBy: 'A', valid: true, scoreAfter: { A: 1, B: 0 } }, 2),
        ev(TOUCH_SCORED, { boutId: 'b1', touchId: 'r2', scoredBy: 'A', valid: true, scoreAfter: { A: 2, B: 0 } }, 3),
        ev(TOUCH_VOIDED, { boutId: 'b1', targetId: 'r1' }, 4),
      ];

      const replayed = events.reduce(applyBoutEvent, {});

      expect(replayed.touches[0].scoreAfter).toEqual({ A: 1, B: 0 });
      expect(replayed.touches[1].scoreAfter).toEqual({ A: 1, B: 0 });
      expect(replayed.bout.scoreAfter).toEqual({ A: 1, B: 0 });
    });

    it('freezes both halves of a voided double', () => {
      let agg = created();
      agg = score(agg, 'A', { A: 1, B: 1 }, { pairId: 'p1' });
      agg = score(agg, 'B', { A: 1, B: 1 }, { pairId: 'p1' });
      agg = score(agg, 'A', { A: 2, B: 1 });

      agg = applyBoutEvent(agg, ev(TOUCH_VOIDED, { boutId: 'b1', targetId: agg.touches[0].id }));

      // Voiding one half of a pair voids only that half; it keeps 1–1, and the
      // surviving half is rescored without it.
      expect(agg.touches[0].scoreAfter).toEqual({ A: 1, B: 1 });
      expect(agg.bout.scoreAfter).toEqual({ A: 1, B: 1 });
    });
  });

  it('clamps a score from an untrusted payload instead of storing it', () => {
    // Imported files are hand-editable. Without the guard these reach score
    // displays, logs and re-export as-is.
    const agg = score(created(), 'A', { A: -5, B: 'nonsense' });

    expect(agg.bout.scoreAfter).toEqual({ A: 0, B: 0 });
  });

  describe('cards', () => {
    const card = (agg, extra) => applyBoutEvent(agg, ev(CARD_ISSUED, {
      boutId: 'b1', against: 'A', cardType: 'red', ...extra,
    }));

    it('counts a card against the right fencer', () => {
      const agg = card(created(), { cardId: 'c1' });

      expect(agg.bout.cardCounts.A.red).toBe(1);
      expect(agg.bout.cardCounts.B.red).toBe(0);
      expect(agg.officiating).toHaveLength(1);
    });

    it('withdraws the exact card named, not merely one of that shape', () => {
      // The bug this guards: with two reds against the same fencer, matching on
      // (side, cardType) withdrew whichever came first.
      let agg = card(created(), { cardId: 'c1' });
      agg = card(agg, { cardId: 'c2' });
      expect(agg.bout.cardCounts.A.red).toBe(2);

      agg = applyBoutEvent(agg, ev(CARD_REVOKED, {
        boutId: 'b1', against: 'A', cardType: 'red', targetCardId: 'c2',
      }));

      expect(agg.bout.cardCounts.A.red).toBe(1);
    });

    it('ignores a repeated withdrawal, so a replay or double tap cannot over-decrement', () => {
      let agg = card(created(), { cardId: 'c1' });
      const revoke = ev(CARD_REVOKED, {
        boutId: 'b1', against: 'A', cardType: 'red', targetCardId: 'c1',
      });

      agg = applyBoutEvent(agg, revoke);
      const afterFirst = agg.bout.cardCounts.A.red;
      agg = applyBoutEvent(agg, revoke);

      expect(afterFirst).toBe(0);
      expect(agg.bout.cardCounts.A.red).toBe(0);
    });
  });

  describe('activity stamping', () => {
    it('marks the bout as having moved', () => {
      const agg = applyBoutEvent(created(), ev(CLOCK_UPDATED, {
        boutId: 'b1', period: 1, remainingSeconds: 150, running: false,
      }, 5000));

      expect(agg.bout.lastActivityAt).toBe(5000);
    });

    it('does not count discarding a bout as the bout moving', () => {
      const before = applyBoutEvent(created(), ev(BOUT_COMPLETED, { boutId: 'b1' }, 3000));

      const after = applyBoutEvent(before, ev(BOUT_DELETED, { targetId: 'b1' }, 9000));

      expect(after.bout.deleted).toBe(true);
      expect(after.bout.lastActivityAt).toBe(3000);
    });
  });

  describe('events this app does not understand', () => {
    it('returns the identical aggregate, so nothing downstream re-renders', () => {
      const agg = created();

      const next = applyBoutEvent(agg, ev('training:drillLogged', { drillId: 'd1' }));

      expect(next).toBe(agg);
    });

    it('still records that something happened, when the event names a bout', () => {
      // The app cannot say what happened, but "this bout moved" is still true
      // and is what the list sorts and labels by.
      const agg = applyBoutEvent(created(), ev('competition:refereeAssigned', { boutId: 'b1' }, 7000));

      expect(agg.bout.lastActivityAt).toBe(7000);
    });

    it('survives an event with no payload at all', () => {
      expect(() => applyBoutEvent(created(), { id: 'x', type: 'nonsense', occurredAt: 1 })).not.toThrow();
    });
  });

  describe('boutIdFor', () => {
    it('reads boutId normally, and targetId for a soft delete', () => {
      expect(boutIdFor(ev(TOUCH_SCORED, { boutId: 'b9' }))).toBe('b9');
      expect(boutIdFor(ev(BOUT_DELETED, { targetId: 'b9' }))).toBe('b9');
    });

    it('returns nothing for an event that names no bout', () => {
      expect(boutIdFor(ev('training:drillLogged', { drillId: 'd1' }))).toBeUndefined();
      expect(boutIdFor({ type: 'x' })).toBeUndefined();
    });
  });
});

// The reason the fold was pulled out of the reducer: an app is free to keep
// bouts wherever its own shape needs them. This is the case the old
// `state.bouts[boutId]` version made impossible without duplicating data.
describe('an app with a different state shape', () => {
  it('can hold bouts nested under a pool, using the same domain logic', () => {
    // Roughly how a competition app would be shaped: pools own their bouts.
    const place = (state, event) => {
      const boutId = boutIdFor(event);
      if (!boutId) return state;
      const pool = state.pools.p1;
      return {
        ...state,
        pools: {
          ...state.pools,
          p1: { ...pool, bouts: { ...pool.bouts, [boutId]: applyBoutEvent(pool.bouts[boutId] ?? {}, event) } },
        },
      };
    };

    let state = { pools: { p1: { label: 'Pool 1', bouts: {} } } };
    state = place(state, ev(BOUT_CREATED, { boutId: 'b1', weapon: 'epee', participants: {} }));
    state = place(state, ev(TOUCH_SCORED, {
      boutId: 'b1', touchId: 't1', scoredBy: 'A', valid: true, scoreAfter: { A: 1, B: 0 },
    }));

    const folded = state.pools.p1.bouts.b1;
    expect(folded.bout.weapon).toBe('epee');
    expect(folded.bout.scoreAfter).toEqual({ A: 1, B: 0 });
    expect(folded.touches).toHaveLength(1);
    // Nothing leaked into a top-level `bouts` map this app never declared.
    expect(state.bouts).toBeUndefined();
  });
});
