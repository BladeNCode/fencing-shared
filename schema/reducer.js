// Places a folded bout into the flat, id-keyed state shape.
//
// ⚠ THIS FILE ENCODES POINT ASSAUT'S STATE SHAPE. IT IS NOT SHARED API.
//
// It lives here only because Point Capture is currently the only consumer, and
// it will be imported by the next app simply because it exists and works —
// defaults are sticky. But the flat `boutId`-keyed shape below is precisely
// the one that does not serve pools, DE brackets or training sessions.
//
// If you are writing a second app: import `applyBoutEvent` from ./bout.js and
// write your own placement. It is about twenty lines.
//
// And the failure mode to avoid is not "the second app used this wrapper" —
// that is recoverable. It is **generalising this wrapper**: adding a path
// parameter, a placement config, a state-shape option so two apps can share
// it. That rebuilds the exact coupling the fold was extracted to remove, with
// indirection on top to disguise it. When a second consumer appears, this file
// moves into Point Capture's own app/store/. It does not grow options.
//
// All the domain logic lives in schema/bout.js as a pure fold over one bout's
// aggregate. This file is only the *placement* half: gathering a bout's four
// slices out of app state, folding, and scattering the result back.
//
// That split is the point. An app whose bouts are not a flat map — a
// competition app holding them under pools and DE brackets, a training app
// holding them under sessions — should import `applyBoutEvent` directly and
// place the result wherever its own state shape needs, instead of inheriting
// this one. Nothing here is required to use the shared domain logic.
//
// Point Capture wants exactly this shape, so it composes this reducer and then
// layers its own app-local cases on top (see point-capture/app/store/
// reducer.js). Deliberately knows nothing about app-local extensions to shared
// entities — Point Capture's `presetId` on Bout is patched on by its own layer
// after calling this one.

import { applyBoutEvent, boutIdFor } from './bout.js';

export { applyBoutEvent, boutIdFor };

// The four slices one bout occupies. Kept here rather than in bout.js because
// these names are this shape's business, not the domain's.
function gather(state, boutId) {
  return {
    bout:        state.bouts?.[boutId],
    touches:     state.touchesByBout?.[boutId],
    officiating: state.officiatingByBout?.[boutId],
    clock:       state.clockByBout?.[boutId],
  };
}

// Writes back only what the fold actually changed, so an event that touches
// nothing returns the identical state object. Subscribers key off that
// identity, and unknown event types must not invalidate state they did not
// affect.
function scatter(state, boutId, before, after) {
  let next = state;
  if (after.bout !== before.bout) {
    next = { ...next, bouts: { ...next.bouts, [boutId]: after.bout } };
  }
  if (after.touches !== before.touches) {
    next = { ...next, touchesByBout: { ...next.touchesByBout, [boutId]: after.touches } };
  }
  if (after.officiating !== before.officiating) {
    next = { ...next, officiatingByBout: { ...next.officiatingByBout, [boutId]: after.officiating } };
  }
  if (after.clock !== before.clock) {
    next = { ...next, clockByBout: { ...next.clockByBout, [boutId]: after.clock } };
  }
  return next;
}

export function sharedReducer(state, event) {
  const boutId = boutIdFor(event);
  if (!boutId) return state;

  const before = gather(state, boutId);
  const after = applyBoutEvent(before, event);
  return scatter(state, boutId, before, after);
}
