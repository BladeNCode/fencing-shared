// Enforces the dependency profile of this repo, which is the property the
// folder names do NOT advertise. `capture/` holding components and `schema/`
// holding pure folds reads as an arbitrary split until you notice that only
// one of them is allowed to import Socle — that is the real boundary, and it
// is a file-level property no directory name can protect.
//
// Modelled on Socle's own library_tests/lib-boundary.test.js: the same check
// with a different root.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

function sourcesIn(folder) {
  let entries;
  try {
    entries = readdirSync(join(root, folder));
  } catch {
    return []; // folder not created yet — nothing to enforce
  }
  return entries
    .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map(f => ({ file: `${folder}/${f}`, src: readFileSync(join(root, folder, f), 'utf8') }));
}

const importsOf = src => [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);

describe('vocabulary/ is the wire contract and depends on nothing', () => {
  it('imports nothing at all, not even Socle', () => {
    // Three independently-deployed apps agree on these names, so anything must
    // be able to load them: a reducer, a build script, an import validator, a
    // Node process aggregating logs with no DOM in sight. One import is enough
    // to make that untrue.
    for (const { file, src } of sourcesIn('vocabulary')) {
      expect(importsOf(src), `${file} should import nothing`).toEqual([]);
    }
  });

  it('has something to enforce — the folder is not empty', () => {
    // Guards the check above from passing vacuously if the folder is renamed
    // or emptied.
    expect(sourcesIn('vocabulary').length).toBeGreaterThan(0);
  });
});

describe('schema/ holds pure folds and must stay runnable without a DOM', () => {
  const forbidden = /^socle\/|^\.\.\/\.\.\/_lib\/|_lib\//;

  it('never imports Socle', () => {
    // This is what keeps applyBoutEvent usable by a consumer that is not a
    // component — a hub folding logs in Node, a validator, a migration script.
    // Importing AppElement here would couple the domain logic to a browser.
    for (const { file, src } of sourcesIn('schema')) {
      const offending = importsOf(src).filter(s => forbidden.test(s));
      expect(offending, `${file} must not import Socle`).toEqual([]);
    }
  });

  it('never reaches upward into a consuming app', () => {
    // Shared code depending on an app inverts the dependency and makes the
    // repo unusable by the other two.
    for (const { file, src } of sourcesIn('schema')) {
      const offending = importsOf(src).filter(s => s.includes('/app/') || s.startsWith('../../'));
      expect(offending, `${file} must not import from an app`).toEqual([]);
    }
  });

  it('has something to enforce', () => {
    expect(sourcesIn('schema').length).toBeGreaterThan(0);
  });
});

describe('capture/ is the only folder allowed to be component code', () => {
  it('reaches Socle through the depth-independent specifier, never a relative path', () => {
    // '../../core/app-element.js' only resolved while this repo was symlinked
    // two levels inside _lib/ — the folder `socle update` overwrites. That
    // coupling is why shared code lived there, and 'socle/...' is what removed
    // it. A relative _lib path creeping back reintroduces it.
    for (const { file, src } of sourcesIn('capture')) {
      const bad = importsOf(src).filter(s => s.includes('_lib/') || /\.\.\/\.\.\/(core|modules)\//.test(s));
      expect(bad, `${file} should import 'socle/...' instead`).toEqual([]);
    }
  });
});
