# fencing-shared

Shared module set for the bladencode fencing apps (Point Capture,
Pret Compet, Allez Train). Vendored like Socle's own `core/`/`modules/` —
symlinked into each app, not an npm package. See
`planning/08-build-strategy.md` in the workspace for the rationale and
`09-point-capture-detailed-design.md` §5 for what is shared-shaped vs app-local.

## The boundary that actually matters

The folder names describe *subject*. They do not describe **dependency
profile**, which is the real boundary and the one that breaks things when it
is crossed. `boundaries.test.js` enforces it:

| Folder | Imports | Why
|---|---|---|
| `vocabulary/` | **nothing at all** | The wire contract. Must load anywhere — a reducer, a build script, an import validator, a Node process folding logs with no DOM. |
| `schema/` | `vocabulary/` only, **never Socle** | Pure folds. Keeps `applyBoutEvent` usable by consumers that are not components. |
| `capture/` | `socle/...` | Components. The only folder allowed to need `AppElement`. |

Two folders therefore look similar and are not: **`vocabulary/` is the
protocol, `schema/` is the behaviour.** Only the protocol carries the
additive-only rule below. Nothing here is IDB schema — that lives in Socle's
`core/idb/`.

## Structure

- **`vocabulary/events.js`** — the event-type contract. Zero imports.
  **Changes are additive only.** Never rename or repurpose a type: the log is
  replayed in full on every boot, so a rename does not rename past events, it
  orphans them, and repurposing one reinterprets history silently with no
  error and no way to tell which records were affected. Add a new type and
  keep the old handler forever.
- **`schema/bout.js`** — `applyBoutEvent(aggregate, event)`, the pure fold of
  one bout's `{ bout, touches, officiating, clock }` from its events. Store-
  free, DOM-free, and with no opinion about where the result lives. Returns
  the *identical* object when an event changes nothing.
- **`schema/reducer.js`** — ⚠ **Point Capture's state shape, not shared API.**
  The flat `boutId`-keyed placement. A second app should import
  `applyBoutEvent` and write its own ~20 lines, because this shape does not
  serve pools, DE brackets or training sessions. If a second consumer needs
  it, this file *moves into Point Capture* — it does not grow a path parameter
  or a placement config, which would rebuild the coupling the fold removed.
- **`capture/`** — capture-UI primitives: `touch-target`, `match-timer`,
  `card-rack`, `card-picker`, plus `sound.js` and `haptics.js`. The cue
  vocabulary is expected to diverge per app; when it does, the constants move
  into the app and the mechanism stays here.
- **`visualization/`** — not yet built (Point Capture Phase 3).
- **`sharing/`** — download/export/share-sheet helpers, not yet built
  (Phase 4). **Not** device-to-device transport; that is `planning/07`, which
  defers to Socle's P2P module. Read the Web Share constraints in doc 07
  before building this — `navigator.share({files})` cannot carry an archive,
  and `canShare()` returns true anyway.

## Consuming this from an app

Requires **Socle 1.4.0+**, which ships the `socle/` specifier.

```bash
ln -s ../../fencing-shared <app>/app/shared
```

Note `app/shared`, **not** `_lib/fencing`. `socle update` replaces `_lib/` and
`utils/build.js` without warning, so app code there is guaranteed eventual
data loss; `app/` is never touched.

Then in the app's `vitest.config.js` — app-owned, so no update refreshes it
and each app adds this by hand, as `socle update` instructs:

```js
resolve: { alias: { socle: fileURLToPath(new URL('./_lib', import.meta.url)) } },
test:    { include: [..., 'app/shared/**/*.test.js'] },
```

`jsconfig.json` needs nothing: the scaffold ships one with `socle/*` already
mapped, so new apps get editor resolution free. Only apps scaffolded before
the alias existed (Socle < 1.4.0) have to add it.

**Do not set `preserveSymlinks`.** It used to be required and no longer is —
the `socle/` alias resolves to an absolute path, so it stops mattering that
the resolver sees a symlink's real path. Earlier versions of this file told
you to set it in two places; both are wrong now.

### ⚠ `socle remove` and `socle manage` are unguarded against shared code

Those commands warn before deleting a module `app/` still imports. **That
warning cannot see this repo**, for two independent reasons Socle confirmed:
the scan greps for the literal string `_lib/modules/<name>/`, which
alias-form imports like `socle/modules/gestures/gestures.js` never match; and
`fs.readdirSync(recursive: true)` does not descend symlinked directories, so
nothing under `app/shared` is scanned at all.

So removing `gestures` while `capture/` depends on it prints no warning and
produces a broken bundle at the next build. Until the library fix ships,
**check shared imports by hand before running either command.** Migrating to
a submodule fixes the second cause for free — a real directory gets
descended — but the specifier match needs the library fix regardless.

## Tests

**Split by layer, because only one layer needs an app.**

| Runs | What | Role |
|---|---|---|
| here (`npm test`) | `vocabulary/`, `schema/`, `boundaries.test.js` | the merge gate |
| each consuming app | `capture/` | post-merge canary |

`vocabulary/` imports nothing and `schema/` imports only `vocabulary/` — which
is what `boundaries.test.js` enforces — so those layers run standalone with
`vitest` as the only devDependency. We first assumed the whole suite could only
run inside an app, because `socle/...` has nothing to resolve to here. That is
true of `capture/` and false of everything else, and it left the pure-fold
tests unverified until an app picked them up, for no reason at all.

`capture/` runs at the consumers via their `app/shared/**/*.test.js` glob, so
component tests execute against *that app's* Socle version — which is how
library drift gets caught where it matters. `vitest.config.js` here excludes
`capture/` explicitly rather than by omission, so a component test added in the
wrong place fails loudly instead of silently never running.

**No Socle dependency here, not even a dev one.** A `file:` path to an app's
`_lib/` would pin shared code to one app's library copy and destroy the drift
signal the whole arrangement exists to produce.

If a `schema/` test ever needs `boot()` or a DOM, the domain logic has regrown
a dependency on an app's state shape — fix the code, don't move the test.

### When a shared test fails in one consumer only

Identical bytes, divergent result — so by construction the fault is in the
consumer, not here. Check in this order before suspecting shared code:

1. **Different Socle version** — compare `_lib/lib-version.json`. Make every
   CI job print it, so "failed in app B only" reads as version skew on sight
   rather than becoming an investigation.
2. **Different store flavour.** `setState` survives reload in Socle's simple
   store and does not in the event-log store. If the three apps don't all pick
   event-log, `schema/` must not assume one. (Ours is pure folds with no store
   at all, so it currently cannot — keep it that way.)
3. Missing `defineStrings` registration in that app's `app/strings.js`.
4. Missing `setPointerCapture` / `releasePointerCapture` no-op mocks —
   required per test file for any gesture-mixin component, deliberately not
   global.
5. Different `@vitest-environment happy-dom` annotations.

This is a **diagnostic, not a stability gate.** "Not stable until two
consumers are green" would make shared velocity hostage to the slowest app
and hand you a three-way matrix to interpret.

**Known gap:** V8 coverage cannot see any of this code through the symlink —
it attributes the files to a real path outside the consuming app's root and
drops them, so the app's coverage figure silently excludes everything here.
Not fixable by configuration (`allowExternal` and include globs for both the
symlink and real paths were all tried). It is fixed by moving to a git
submodule, which CI will force anyway since a committed symlink dangles in a
single-app checkout.

## Licence

[Mozilla Public License 2.0](LICENSE). Per-file copyleft: modifications to
these files stay open, while combining them with other code does not oblige
you to open that.
