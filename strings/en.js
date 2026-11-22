// English defaults for the shared fencing components. ZERO imports — same
// dependency profile as vocabulary/, and for the same reason: this is a table
// of data, and anything should be able to load it (a consuming app, a
// translation-completeness check, a build script).
//
// Registration is the APP's job, not this file's. Each app does:
//
//   import { defineStrings } from '../_lib/core/strings.js';
//   import { en as sharedEn } from './shared/strings/en.js';
//   defineStrings(sharedEn);
//
// If this file called defineStrings() itself it would import Socle, which
// would make the strings untestable outside an app and couple a data table to
// a library version for no reason.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO RULES, both learned from converting the components:
//
// 1. NEVER transform the case of a translated string. The code used to build
//    "Apply yellow to Alice" with `CARD_NAME[type].toLowerCase()`. That works
//    in English and breaks in German, which capitalises nouns, and is simply
//    wrong wherever the mid-sentence form differs from the standalone one. So
//    every card name has both a `.name` (standalone, title position) and an
//    `.inline` (mid-sentence) key. A translator sets them independently.
//
// 2. NEVER build a sentence by concatenating translated fragments. Word order
//    is not universal. Each user-visible sentence is one key with {params},
//    even when that means near-duplicate English values.
// ─────────────────────────────────────────────────────────────────────────────
//
// `t()` falls back to the key itself when a string is unregistered, so a
// missing registration shows "card-picker.cancel" on screen rather than
// crashing. That is good for resilience and bad for noticing, which is why
// strings/en.test.js asserts every key the components actually ask for.

export const en = {
  // ── Cards ────────────────────────────────────────────────────────────────
  // `.name` is the standalone form (shown large on the picker page); `.inline`
  // is the mid-sentence form. See rule 1 above.
  'card.yellow.name':   'Yellow',
  'card.yellow.inline': 'yellow',
  'card.yellow.note':   'Warning',
  'card.red.name':      'Red',
  'card.red.inline':    'red',
  'card.red.note':      'Penalty touch to the opponent',
  'card.black.name':    'Black',
  'card.black.inline':  'black',
  'card.black.note':    'Exclusion from the bout',

  // ── Card picker ──────────────────────────────────────────────────────────
  'card-picker.hint':       'Swipe to change card',
  'card-picker.cancel':     'Cancel',
  'card-picker.none-given': 'None given',
  'card-picker.held':       '{count} already given',
  // Shown on the apply button when this fencer cannot hold another of these.
  'card-picker.at-max':     '{card} already given',
  'card-picker.apply':      'Apply {card} to {fencer}',

  // ── Card rack (screen-reader label) ──────────────────────────────────────
  // Kept keyed even though this app does not target screen readers, because
  // these are the only strings in the components that name a quantity, and
  // leaving them in English would hide the plural problem rather than solve
  // it. English needs two forms; other languages need more. See
  // app/strings.js for why the app does not attempt a general plural rule.
  'card-rack.label':        'Cards for {fencer}: {given}. Give a card.',
  'card-rack.none':         'none',
  'card-rack.yellow':       'yellow card',
  'card-rack.red.one':      'red card',
  'card-rack.red.other':    '{count} red cards',
  'card-rack.black':        'black card',

  // ── Match timer (screen-reader label) ────────────────────────────────────
  // One key per whole sentence rather than a stem plus two endings, per
  // rule 2 — "Running, activate to halt" is not a suffix in every language.
  'match-timer.label.running': 'Match clock {time}, period {period} of {periods}. Running, activate to halt.',
  'match-timer.label.halted':  'Match clock {time}, period {period} of {periods}. Halted, activate to start.',

  // ── Touch target (screen-reader label) ───────────────────────────────────
  'touch-target.label':         '{fencer}: {score}. Hold to score.',
  'touch-target.label.compact': '{fencer}. Hold to score.',
};
