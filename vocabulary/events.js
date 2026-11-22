// The event vocabulary shared by the trifecta. ZERO imports, deliberately —
// not even Socle. This is the contract three independently-deployed apps agree
// on, so it must be loadable by anything: a reducer, a build script, a test, a
// future import/export validator.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE RULE: CHANGES ARE ADDITIVE ONLY.
//
// Never rename a type. Never repurpose one. Never delete a handler for one.
//
// The event log is append-only and replayed in full on every boot, so a type
// is not a message that gets delivered and forgotten — it is a permanent part
// of how history is interpreted. Renaming `touch:scored` does not rename past
// events; it orphans every one of them, and they stop counting toward scores
// that were correct yesterday. Repurposing one is worse: old events are then
// reinterpreted under new rules, silently, with no error anywhere and no way
// to tell which records were affected.
//
// To change the meaning of something, add a new type and keep handling the old
// one forever. The cost of a permanently-retained handler is a few lines. The
// cost of a rename is unrecoverable data corruption discovered months later.
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY THESE NAMES ARE A PROTOCOL
//
// The three apps exchange slices of each other's event logs, and they ship
// independently — no lockstep releases. That works because an app stores and
// re-shares events it cannot interpret, and reinterprets them retroactively if
// it later learns how (see schema/reducer.test.js, which pins this). So an app
// receiving `training:drillLogged` keeps it intact even though it means nothing
// to it. That only holds while the names are stable.

// ── Bout lifecycle ──────────────────────────────────────────────────────────
// `bout:deleted` is a soft delete carrying `targetId` rather than `boutId`:
// the row stays in the log and is marked, because the log is append-only and
// "this bout was discarded" is itself a fact worth keeping.
export const BOUT_CREATED   = 'bout:created';
export const BOUT_COMPLETED = 'bout:completed';
export const BOUT_DELETED   = 'bout:deleted';

// ── Scoring ─────────────────────────────────────────────────────────────────
// `touch:scored` carries `scoreAfter` from the capturing device rather than
// having it derived, so a corrected score survives a replay. It is therefore
// untrusted input and sanitised at the reducer boundary.
//
// Touches sharing a `pairId` landed simultaneously (an épée double) and are
// scored atomically — both carry the score after both counted, so neither
// reads as having arrived first.
//
// `touch:voided` is a compensating event, never a deletion, so "a touch was
// awarded then withdrawn" stays readable.
export const TOUCH_SCORED = 'touch:scored';
export const TOUCH_VOIDED = 'touch:voided';

// ── Officiating ─────────────────────────────────────────────────────────────
// Cards carry a caller-supplied `cardId`. The store's event id does not exist
// yet at dispatch time, so an event cannot use it to point at something it is
// creating in the same breath — a red card and the point it awards, say. And
// matching on shape (side + card type) is ambiguous the moment a fencer holds
// two of the same thing, which is exactly how withdrawing one red card came to
// strike the wrong rows.
export const CARD_ISSUED   = 'card:issued';
export const CARD_REVOKED  = 'card:revoked';
export const TIMEOUT_CALLED = 'timeout:called';

// Overtime / sudden-death tie-break assignment only — not a per-touch
// right-of-way call.
export const PRIORITY_ASSIGNED = 'priority:assigned';

// ── Clock ───────────────────────────────────────────────────────────────────
// The match clock is UI-local while it ticks — dispatching every tick would be
// absurd — but its transitions are persisted, so a reload or a bout resumed
// from the list comes back where it was left.
export const CLOCK_UPDATED = 'clock:updated';

// Every shared type, for tests and tooling that need to enumerate them.
// An app's own types are deliberately absent: this is the shared contract, and
// an app-local type that appears here has stopped being app-local.
export const SHARED_EVENT_TYPES = Object.freeze([
  BOUT_CREATED,
  BOUT_COMPLETED,
  BOUT_DELETED,
  TOUCH_SCORED,
  TOUCH_VOIDED,
  CARD_ISSUED,
  CARD_REVOKED,
  TIMEOUT_CALLED,
  PRIORITY_ASSIGNED,
  CLOCK_UPDATED,
]);
