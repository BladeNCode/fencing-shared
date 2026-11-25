// Lives with the component it tests, and runs against whichever Socle version
// the consuming app has — which is the point: library drift gets caught at the
// consumer, where it actually matters.
import { describe, it, expect } from 'vitest';
import { sharedReducer } from './reducer.js';

// WHY THIS FILE EXISTS
//
// The three bladencode fencing apps ship independently and exchange slices of
// each
// other's event logs. That only works because of three properties, and this
// one is the fragile one:
//
//   - a reducer returns state unchanged for a type it does not know
//   - importEvents writes events verbatim, with no filtering by known type
//   - state is recomputed by full replay on boot, with no materialised views
//
// Together they mean the competition app can receive a type it has never heard
// of, store it, ignore it, and pass it on intact — and the day it ships a
// reducer that understands it, the next boot reinterprets the whole log
// retroactively. No migration, no data loss, and no lockstep releases across
// three apps.
//
// Throwing on an unknown type would break all of that, silently and
// irreversibly: the receiving app would reject data it was supposed to be
// carrying. It is also exactly the change someone makes later in good faith,
// to catch typos in event names during development. These tests exist to fail
// loudly when that happens.
describe('forward compatibility with event types this app does not know', () => {
  const bout = { bouts: { b1: { scoreAfter: { A: 3, B: 2 } } } };

  it('returns state untouched for an unknown type, rather than throwing', () => {
    const next = sharedReducer(bout, {
      id: 'e1',
      type: 'training:drill-logged',       // an Allez Train type, meaningless here
      payload: { drillId: 'd1', reps: 12 },
      occurredAt: Date.now(),
    });

    expect(next).toBe(bout); // same reference — not merely equal
  });

  it('does not throw on a type from an app version newer than this one', () => {
    expect(() => sharedReducer(bout, {
      id: 'e2',
      type: 'bout:videoSynced',
      payload: { offsetMs: 1200 },
      occurredAt: Date.now(),
    })).not.toThrow();
  });

  it('keeps earlier state intact when an unknown type arrives mid-log', () => {
    const events = [
      { id: 'e3', type: 'competition:poolAssigned', payload: { poolId: 'p1' }, occurredAt: 1 },
      { id: 'e4', type: 'training:drill-logged', payload: {}, occurredAt: 2 },
    ];

    const next = events.reduce(sharedReducer, bout);

    // An unknown type must be inert, not destructive — a reducer that reset or
    // dropped state here would lose a bout on import.
    expect(next.bouts.b1.scoreAfter).toEqual({ A: 3, B: 2 });
  });

  it('survives a malformed event without a payload', () => {
    // Imported logs are a trust boundary; a hand-edited or truncated file must
    // not take the app down on boot, when there is no UI to report it.
    expect(() => sharedReducer(bout, { id: 'e5', type: 'nonsense', occurredAt: 1 })).not.toThrow();
  });
});
