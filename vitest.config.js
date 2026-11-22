import { defineConfig } from 'vitest/config';

// This repo gates the layers that depend on nothing — and ONLY those.
//
// We had assumed the whole suite could only run inside a consuming app,
// because `socle/...` has nothing to resolve to here. That is true of
// `capture/` and false of everything else: `vocabulary/` imports nothing at
// all and `schema/` imports only `vocabulary/`, which is exactly what
// boundaries.test.js enforces. So those layers were sitting unverified until
// an app happened to pick them up, for no reason.
//
// The split:
//   here        vocabulary/, schema/, boundaries.test.js   — the merge gate
//   consumers   capture/                                   — needs AppElement
//
// `capture/` is excluded deliberately rather than by omission: a component
// test added there must fail loudly in this config instead of being silently
// skipped, because being skipped is how it would stop running anywhere.
//
// Deliberately NO dependency on Socle, not even a dev one. A `file:` path to
// an app's _lib/ would pin shared code to that app's library copy and destroy
// the drift signal the whole arrangement exists to produce — shared code is
// meant to be verified against *each* app's Socle version, at that app.
export default defineConfig({
  test: {
    include: ['vocabulary/**/*.test.js', 'schema/**/*.test.js', 'strings/**/*.test.js', 'boundaries.test.js'],
    exclude: ['capture/**', 'visualization/**', 'sharing/**', 'node_modules/**'],
    environment: 'node', // no happy-dom: if a test here needs a DOM, it is in the wrong layer
  },
});
