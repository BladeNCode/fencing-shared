// How a bout folds from its events. Pure, store-free, and with no opinion
// about where the result lives.
//
// WHY THIS IS SEPARATE FROM reducer.js
//
// The three apps share *how* a bout is built from its events. They do not
// share *where* that bout sits in state, and assuming they do is a trap we
// walked into: this logic used to write `state.bouts[boutId]` directly, which
// silently requires every consuming app to keep bouts in one flat map keyed by
// id. That suits Point Capture, which shows a flat list — but a competition app
// holds bouts under pools and DE brackets, and a training app holds them under
// sessions. The flat map was generalised from the only app that existed.
//
// So the fold takes and returns the whole per-bout aggregate, and each app
// decides where to keep it. reducer.js is the app-agnostic placement that
// Point Capture happens to want; another app can call applyBoutEvent directly
// and put the result wherever its own state shape needs.
//
// THE AGGREGATE is everything keyed by one boutId:
//   { bout, touches, officiating, clock }
// Any field may be undefined — an event can legitimately arrive for a bout
// this app has never seen (imported logs, a peer's slice), and that must not
// throw.
//
// RETURNS THE SAME OBJECT when the event changes nothing. Callers rely on that
// identity to avoid pointless re-renders, and schema/reducer.test.js pins it
// for unknown event types.

import {
  BOUT_CREATED, BOUT_COMPLETED, BOUT_DELETED,
  TOUCH_SCORED, TOUCH_VOIDED,
  CARD_ISSUED, CARD_REVOKED, TIMEOUT_CALLED,
  PRIORITY_ASSIGNED, CLOCK_UPDATED,
} from '../vocabulary/events.js';

// IDENTITY RULE: anything that another event may later reference carries its
// own caller-supplied `id`. The store's event id is not sufficient on its own,
// because it doesn't exist yet at dispatch time — so an event cannot use it to
// point at something it is creating in the same breath. Falls back to the event
// id so older records stay addressable.
function entityId(payload, event) {
  return payload.touchId ?? payload.cardId ?? payload.timeoutId ?? event.id;
}

// Touches sharing a `pairId` landed at the same instant (a double touch in
// épée) and must not be scored one-after-the-other: both carry the score
// *after both* have counted, so neither reads as having arrived first. Without
// this a double replays as 4–3 then 4–4, which is conceptually wrong — nobody
// led.
function recomputeScores(touches) {
  let a = 0;
  let b = 0;
  const scores = new Array(touches.length);

  let i = 0;
  while (i < touches.length) {
    const group = [i];
    const { pairId } = touches[i];
    if (pairId) {
      while (group.length < touches.length - i && touches[i + group.length].pairId === pairId) {
        group.push(i + group.length);
      }
    }
    for (const k of group) {
      const t = touches[k];
      if (!t.voided && t.valid) {
        if (t.scoredBy === 'A') a += 1;
        else b += 1;
      }
    }
    for (const k of group) scores[k] = { A: a, B: b };
    i += group.length;
  }

  return {
    // A VOIDED touch keeps the score it held while it counted. The strike-through
    // row is a record of what happened and was then undone, so it has to read as
    // the board read at the time — not as the board reads now.
    //
    // Found on hardware. Overwriting every touch meant a voided row displayed the
    // score as if the touch had never been awarded — void a lone 0–1 and the row
    // read "0–0, struck through", which says nothing was ever scored and
    // contradicts the strike-through beside it.
    //
    // Note what is NOT a bug: after freezing, a voided row can read the same as
    // the row below it. Void the first of two touches by one fencer and the
    // survivor now produces the score the voided one used to show. That is the
    // correct record, and schema/bout.test.js pins it so nobody "fixes" it.
    //
    // Point Capture no longer DISPLAYS this value — a real bout showed that a
    // column of frozen scores is unreadable once voids are non-contiguous,
    // because the numbers end up ordered by void time while the rows are
    // ordered by touch time. Voided rows there now show no score at all.
    // The freeze stays regardless: it is the correct stored value for exports,
    // a peer's log slice, and any consumer that wants "the score at the moment
    // this touch counted". Recomputing it would store the score as if the
    // touch had never happened, which is true of the board and false of the
    // touch.
    //
    // A touch is already marked voided before this runs (see TOUCH_VOIDED), so
    // "keep what it has" is exactly the score from when it last counted. Replay-
    // stable: a full replay from the event log reaches the same values, because
    // each void freezes only its own row and leaves the others to be recomputed.
    touches: touches.map((t, k) => (t.voided ? t : { ...t, scoreAfter: scores[k] })),
    final: { A: a, B: b },
  };
}

function emptyCardCounts() {
  return { A: { yellow: 0, red: 0, black: 0 }, B: { yellow: 0, red: 0, black: 0 } };
}

// `touch:scored` is the one event whose score is taken on trust from the
// payload rather than derived (the capturing device computes it, so a
// corrected score survives a replay). Events also arrive from *imported bout
// files* — untrusted input, exactly like participant labels. So the trust
// boundary is here: scores become non-negative integers before they reach
// state, and every consumer downstream (score displays, touch logs, analytics,
// re-export) gets a number rather than whatever a hand-edited file claimed.
function sanitizeScore(scoreAfter) {
  const toCount = value => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return { A: toCount(scoreAfter?.A), B: toCount(scoreAfter?.B) };
}

// Which bout an event concerns. bout:deleted addresses its target rather than
// carrying a boutId, since it names a bout it is acting *on*.
export function boutIdFor(event) {
  return event?.payload?.boutId ?? event?.payload?.targetId;
}

function cardCountDelta(aggregate, payload, delta) {
  const existingCounts = aggregate.bout?.cardCounts ?? emptyCardCounts();
  const sideCounts = existingCounts[payload.against] ?? { yellow: 0, red: 0, black: 0 };
  return {
    ...existingCounts,
    [payload.against]: {
      ...sideCounts,
      [payload.cardType]: Math.max(0, (sideCounts[payload.cardType] ?? 0) + delta),
    },
  };
}

function appendOfficiating(aggregate, kind, payload, event) {
  return [...(aggregate.officiating ?? []), {
    eventId: event.id,
    id: entityId(payload, event),
    occurredAt: event.occurredAt,
    kind,
    ...payload,
  }];
}

export function applyBoutEvent(aggregate, event) {
  const { type, payload, occurredAt } = event;
  let next = aggregate;

  switch (type) {
    case BOUT_CREATED:
      next = {
        ...next,
        bout: {
          id: payload.boutId,
          weapon: payload.weapon,
          participants: payload.participants,
          videoRef: payload.videoRef,
          // Format is real shared schema (targetScore/timeLimit live on Bout);
          // the *presets* that populate it are app-local, the same split as
          // Capture Presets.
          format: payload.format,
          status: 'in-progress',
          scoreAfter: { A: 0, B: 0 },
          cardCounts: emptyCardCounts(),
          priority: null,
          createdAt: occurredAt,
        },
      };
      break;

    case TOUCH_SCORED: {
      const scoreAfter = sanitizeScore(payload.scoreAfter);
      next = {
        ...next,
        bout: { ...next.bout, scoreAfter },
        touches: [...(next.touches ?? []), {
          eventId: event.id,
          id: entityId(payload, event),
          occurredAt,
          ...payload,
          scoreAfter,
          voided: false,
        }],
      };
      break;
    }

    case TOUCH_VOIDED: {
      // Either identity addresses the touch: its own id, or the event id it
      // fell back to when none was supplied.
      const target = payload.targetId ?? payload.targetEventId;
      const marked = (next.touches ?? []).map(t =>
        t.id === target || t.eventId === target
          ? { ...t, voided: true, voidReason: payload.reason }
          : t
      );
      const { touches, final } = recomputeScores(marked);
      next = { ...next, bout: { ...next.bout, scoreAfter: final }, touches };
      break;
    }

    case CARD_ISSUED:
      next = {
        ...next,
        bout: { ...next.bout, cardCounts: cardCountDelta(next, payload, +1) },
        officiating: appendOfficiating(next, 'card', payload, event),
      };
      break;

    // Compensating event, never a deletion — the bout log stays append-only so
    // "a card was given then withdrawn" remains readable, the same principle as
    // touch:voided. The *point* a red awarded is undone separately by voiding
    // its touch, since that is what actually carries the score.
    case CARD_REVOKED: {
      // Withdrawing the same card twice must not decrement twice — replays and
      // double taps both produce this.
      const alreadyRevoked = payload.targetCardId
        && (next.officiating ?? []).some(e => e.kind === 'card-revoked' && e.targetCardId === payload.targetCardId);
      if (alreadyRevoked) break;

      next = {
        ...next,
        bout: { ...next.bout, cardCounts: cardCountDelta(next, payload, -1) },
        officiating: appendOfficiating(next, 'card-revoked', payload, event),
      };
      break;
    }

    case TIMEOUT_CALLED:
      next = { ...next, officiating: appendOfficiating(next, 'timeout', payload, event) };
      break;

    case CLOCK_UPDATED:
      next = {
        ...next,
        clock: {
          period: payload.period,
          remainingSeconds: payload.remainingSeconds,
          running: Boolean(payload.running),
          at: occurredAt,
        },
      };
      break;

    case PRIORITY_ASSIGNED:
      next = { ...next, bout: { ...next.bout, priority: payload.side } };
      break;

    case BOUT_COMPLETED:
      next = { ...next, bout: { ...next.bout, status: 'complete', completedAt: occurredAt } };
      break;

    case BOUT_DELETED:
      next = { ...next, bout: { ...next.bout, deleted: true } };
      break;

    default:
      // Unknown type: inert, not an error. An app must be able to store and
      // re-share events it cannot interpret — see schema/reducer.test.js.
      break;
  }

  // Every event that concerns a bout leaves a mark of when it happened, so
  // "when did this bout last move?" is answerable without scanning the touch
  // and officiating lists. It also stands in for `completedAt` on bouts
  // finished before that field existed.
  //
  // Keyed on `payload.boutId` specifically, so a soft delete (which carries
  // `targetId`) does not count as activity — discarding a bout is not the bout
  // moving. Unknown types that *do* name a bout still stamp it: something
  // happened to it, even if this app cannot say what.
  if (payload?.boutId && next.bout && next.bout.lastActivityAt !== occurredAt) {
    next = { ...next, bout: { ...next.bout, lastActivityAt: occurredAt } };
  }

  return next;
}
