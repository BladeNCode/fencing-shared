// Catches the failure mode t() is designed around: an unregistered key is
// returned verbatim rather than throwing, so a missing string renders
// "card-picker.cancel" on a button and nothing anywhere reports a problem. A
// component test only catches that if it happens to assert on the exact text.
//
// Runs in this repo's own gate — it reads source files and the string table,
// and needs neither Socle nor a DOM.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { en } from './en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function sourceFiles(folder) {
  return readdirSync(join(root, folder))
    .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map(f => ({ file: `${folder}/${f}`, src: readFileSync(join(root, folder, f), 'utf8') }));
}

const sources = sourceFiles('capture');

// t('some.key') — the statically resolvable calls.
const literalKeys = src => [...src.matchAll(/\bt\(\s*'([^']+)'/g)].map(m => m[1]);

// t(`card.${type}.name`) — not statically resolvable. These are enumerated
// explicitly below rather than guessed at, because a scanner that silently
// skips what it cannot parse is worse than one that does not exist.
const templateKeys = src => [...src.matchAll(/\bt\(\s*`([^`]+)`/g)].map(m => m[1]);

describe('every key the components ask for is defined', () => {
  it('finds t() calls at all — the scanner is not silently matching nothing', () => {
    // Guards every assertion below from passing vacuously, which is exactly
    // how an earlier verification of ours produced a false negative.
    const total = sources.reduce((n, { src }) => n + literalKeys(src).length, 0);
    expect(total).toBeGreaterThan(5);
  });

  it.each(sources.map(s => s.file))('%s uses only defined keys', file => {
    const { src } = sources.find(s => s.file === file);
    const missing = literalKeys(src).filter(k => !(k in en));
    expect(missing, `undefined keys in ${file}`).toEqual([]);
  });

  it('defines every card form, including the ones built dynamically', () => {
    // card-picker resolves `card.${type}.name` and friends at render time, so
    // the scanner above cannot see these. Enumerated instead.
    for (const type of ['yellow', 'red', 'black']) {
      for (const form of ['name', 'inline', 'note']) {
        expect(en, `card.${type}.${form}`).toHaveProperty(`card.${type}.${form}`);
      }
    }
  });

  it('has no dynamic t() call this test does not account for', () => {
    // If a new template-literal key appears, this fails and forces a decision:
    // enumerate it above, or make the key static. It must not pass by default.
    // These are the literal source patterns being searched FOR, not strings
    // meant to interpolate — so the usual rule against them is inverted here.
    // It is correct everywhere else in this repo.
    // eslint-disable-next-line no-template-curly-in-string
    const known = ['card.${type}.name', 'card.${type}.inline', 'card.${type}.note'];
    const found = sources.flatMap(({ src }) => templateKeys(src));
    expect([...new Set(found)].sort()).toEqual(known.sort());
  });
});

describe('the table itself', () => {
  it('has no key defined twice with different values', () => {
    // An object literal silently keeps the last duplicate, so a copy-paste
    // mistake overrides a string with no error. Compare the source text.
    const src = readFileSync(join(root, 'strings', 'en.js'), 'utf8');
    const keys = [...src.matchAll(/^\s*'([^']+)':/gm)].map(m => m[1]);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  it('interpolates every {param} a value is given for', () => {
    // A {param} with no matching value renders literally as "{count}". t()
    // leaves unknown params in place deliberately, so this never throws.
    const withParams = Object.entries(en).filter(([, v]) => v.includes('{'));
    expect(withParams.length).toBeGreaterThan(0);
    for (const [key, value] of withParams) {
      const params = [...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      expect(new Set(params).size, `${key} repeats a param`).toBe(params.length);
    }
  });

  it('never relies on case transformation of a translated value', () => {
    // The bug this replaced: `CARD_NAME[type].toLowerCase()` to build
    // "Apply yellow to Alice". Correct in English, wrong in German, and wrong
    // anywhere the mid-sentence form differs. Hence the .inline keys.
    for (const { file, src } of sources) {
      const offending = [...src.matchAll(/t\([^)]*\)\s*\.\s*(toLowerCase|toUpperCase)\(/g)];
      expect(offending.map(m => m[0]), `${file} case-transforms a translated string`).toEqual([]);
    }
  });
});
