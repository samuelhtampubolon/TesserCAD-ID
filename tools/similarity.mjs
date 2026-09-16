/**
 * Similarity measurement, the way a code-similarity detector does it.
 *
 * `tools/parity.mjs` already answers "how many lines here are identical to
 * upstream", which is the right question for the brief this edition was built
 * to. It is the wrong question for an integrity check, and a reader who knows
 * what JPlag, MOSS, SIM, Dolos, Plaggie or Sherlock do will spot the gap
 * immediately: a line-for-line diff is defeated by renaming a variable,
 * reflowing a comment or reordering two statements. Every one of those tools
 * exists because that is exactly what a copy looks like in practice.
 *
 * So this measures what they measure:
 *
 *   1. **Tokenised k-gram fingerprints, winnowed.** Source is reduced to a
 *      token stream that discards comments, string contents, whitespace and
 *      every identifier name, so `for (const feature of features)` and
 *      `for (const f of fs)` produce the same tokens. Overlapping k-grams are
 *      hashed and the minimum hash in each sliding window is kept, which is
 *      the winnowing scheme MOSS is built on: it keeps a fixed density of
 *      fingerprints and guarantees that any shared passage longer than the
 *      window is detected wherever it sits in the file.
 *
 *   2. **Internal duplication.** The same fingerprints, compared within this
 *      repository, which is how a marker finds two files that were one file.
 *
 * The number this prints is deliberately higher than parity.mjs's. That is the
 * point: a structural measure of a declared derivative work *should* read
 * higher than a textual one, and if it read lower something would be wrong
 * with it. Neither number is a verdict. This repository is an acknowledged
 * derivative of TesserCAD, which PROVENANCE.md and COMPARISON.md state before
 * any tool is run, and a detector's job is to surface similarity, not to
 * decide whether it was disclosed.
 *
 *   node tools/similarity.mjs ../tessercad ../tessercadina
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative as nodeRelative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const relative = (from, to) => nodeRelative(from, to).split(sep).join('/');
const root = fileURLToPath(new URL('..', import.meta.url));

/* ------------------------------------------------------------ tokenising */

/**
 * A JavaScript source reduced to structure.
 *
 * Every identifier becomes `N`, every number `0`, every string `S`, and
 * comments vanish. What survives is punctuation, keywords and shape, which is
 * what a rename cannot change. This is a lexer, not a parser: it has to be
 * right about where a string or a comment or a regex ends, because getting
 * that wrong silently shifts every token after it.
 */
const KEYWORDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return',
  'static', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'yield', 'true', 'false', 'null', 'undefined',
]);

export function tokenise(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  // Whether a `/` here starts a regex or is a division: decided by what the
  // previous token was, which is the standard trick and good enough for a
  // fingerprint even in the cases it gets wrong.
  let prev = '';
  const isWord = (c) => /[A-Za-z0-9_$]/.test(c);

  while (i < n) {
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }

    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++;
      out.push('S'); prev = 'S';
      continue;
    }

    if (c === '`') {
      // A template literal can contain `${ ... }` holding real code, so its
      // expressions are tokenised and its text is not.
      i++;
      out.push('S'); prev = 'S';
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          let depth = 1;
          i += 2;
          const start = i;
          while (i < n && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            if (depth > 0) i++;
          }
          out.push(...tokenise(src.slice(start, i)));
          i++;
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    if (c === '/' && !['N', '0', 'S', ')', ']'].includes(prev)) {
      // A regex literal. Character classes may contain an unescaped `/`.
      i++;
      let inClass = false;
      while (i < n) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        else if (d === '\n') break;
        i++;
      }
      i++;
      while (i < n && /[a-z]/.test(src[i])) i++;
      out.push('R'); prev = 'R';
      continue;
    }

    if (/[0-9]/.test(c)) {
      while (i < n && /[0-9a-fA-FxXoObBeE._+-]/.test(src[i])) {
        // A `+`/`-` only continues a number as an exponent sign.
        if ((src[i] === '+' || src[i] === '-') && !/[eE]/.test(src[i - 1])) break;
        i++;
      }
      out.push('0'); prev = '0';
      continue;
    }

    if (isWord(c)) {
      const start = i;
      while (i < n && isWord(src[i])) i++;
      const word = src.slice(start, i);
      const tok = KEYWORDS.has(word) ? word : 'N';
      out.push(tok); prev = tok;
      continue;
    }

    // Punctuation, longest match first, so `===` is one token and not three.
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (['===', '!==', '**=', '...', '>>>', '&&=', '||=', '??='].includes(three)) {
      out.push(three); prev = three; i += 3; continue;
    }
    if (['==', '!=', '<=', '>=', '&&', '||', '??', '?.', '=>', '++', '--',
      '+=', '-=', '*=', '/=', '%=', '**', '<<', '>>', '|=', '&=', '^='].includes(two)) {
      out.push(two); prev = two; i += 2; continue;
    }
    out.push(c); prev = c; i++;
  }
  return out;
}

/* ---------------------------------------------------------- fingerprints */

const K = 9;          // k-gram length, in tokens
const W = 5;          // winnowing window, in k-grams

/** FNV-1a over a token k-gram. Cheap, well spread, and not cryptographic. */
function hashGram(tokens, at) {
  let h = 0x811c9dc5;
  for (let i = at; i < at + K; i++) {
    const t = tokens[i];
    for (let c = 0; c < t.length; c++) {
      h ^= t.charCodeAt(c);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x2c; // k-gram separator, so ['a','bc'] and ['ab','c'] differ
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The winnowed fingerprint set of a token stream.
 *
 * In each window of W consecutive k-gram hashes the minimum is selected; the
 * rightmost minimum is taken on a tie, which is what makes the selection
 * stable under insertion elsewhere in the file. That stability is the whole
 * property: the same passage fingerprints the same way wherever it moves to.
 */
export function fingerprints(tokens) {
  const grams = [];
  for (let i = 0; i + K <= tokens.length; i++) grams.push(hashGram(tokens, i));
  const picked = new Set();
  if (grams.length === 0) return picked;
  if (grams.length < W) { picked.add(Math.min(...grams)); return picked; }
  for (let i = 0; i + W <= grams.length; i++) {
    let min = Infinity, at = i;
    for (let j = i; j < i + W; j++) if (grams[j] <= min) { min = grams[j]; at = j; }
    picked.add(grams[at]);
  }
  return picked;
}

/* ------------------------------------------------------------- gathering */

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
};

function profileOf(repoRoot) {
  const files = new Map();
  for (const f of walk(join(repoRoot, 'src'))) {
    const src = readFileSync(f, 'utf8');
    const toks = tokenise(src);
    files.set(relative(repoRoot, f), { fp: fingerprints(toks), tokens: toks.length });
  }
  return files;
}

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const h of a) if (b.has(h)) shared++;
  return shared / (a.size + b.size - shared);
};

/** Share of `a` that also appears in `b`. Asymmetric, which is the useful one. */
const contained = (a, b) => {
  if (!a.size) return 0;
  let shared = 0;
  for (const h of a) if (b.has(h)) shared++;
  return shared / a.size;
};

/* --------------------------------------------------------------- reports */

const pc = (x) => `${(100 * x).toFixed(1)}%`;

const mine = profileOf(root);
const all = new Set();
for (const { fp } of mine.values()) for (const h of fp) all.add(h);

console.log('STRUKTUR SUMBER DI SINI');
console.log(`  modul                 ${mine.size}`);
console.log(`  token                 ${[...mine.values()].reduce((n, f) => n + f.tokens, 0).toLocaleString('en-US')}`);
console.log(`  sidik jari            ${all.size.toLocaleString('en-US')}  (k-gram ${K} token, jendela ${W})`);

const others = process.argv.slice(2).filter(existsSync);
for (const other of others) {
  const theirs = profileOf(other);
  const theirAll = new Set();
  for (const { fp } of theirs.values()) for (const h of fp) theirAll.add(h);

  console.log(`\nvs ${basename(other)}`);
  console.log(`  modul di sana         ${theirs.size}`);
  console.log(`  kemiripan struktural  ${pc(jaccard(all, theirAll))}  (Jaccard, dua arah)`);
  console.log(`  bagian sini yang ada di sana  ${pc(contained(all, theirAll))}`);
  console.log(`  bagian sana yang ada di sini  ${pc(contained(theirAll, all))}`);

  // Per-module, only where a counterpart exists, and only the extremes: a
  // wall of fifty rows at 90% tells a reader nothing they did not know from
  // the total.
  const rows = [];
  for (const [name, f] of mine) {
    const t = theirs.get(name);
    if (!t) continue;
    rows.push({ name, share: contained(f.fp, t.fp) });
  }
  rows.sort((a, b) => b.share - a.share);
  const same = rows.filter(r => r.share >= 0.995).length;
  console.log(`  modul yang identik secara struktural  ${same} dari ${rows.length} yang sejodoh`);
  console.log('  paling berubah:');
  for (const r of rows.slice(-6).reverse()) console.log(`    ${r.name.padEnd(28)} ${pc(r.share)}`);
  const onlyHere = [...mine.keys()].filter(k => !theirs.has(k));
  const onlyThere = [...theirs.keys()].filter(k => !mine.has(k));
  console.log(`  hanya di sini         ${onlyHere.join(', ') || 'tidak ada'}`);
  console.log(`  hanya di sana         ${onlyThere.join(', ') || 'tidak ada'}`);
}

/* ------------------------------------------------- internal duplication */

/**
 * Two modules in this repository that fingerprint alike.
 *
 * This is the check a marker runs on a single submission, and the one that
 * finds real work: a file copied and edited rather than factored. A shared
 * shape is expected between siblings by design here, so the threshold is set
 * where a human should look rather than where a tool should complain.
 */
console.log('\nDUPLIKASI DI DALAM REPOSITORI INI');
const names = [...mine.keys()];
const pairs = [];
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = mine.get(names[i]), b = mine.get(names[j]);
    if (a.tokens < 400 || b.tokens < 400) continue;      // too small to judge
    const s = jaccard(a.fp, b.fp);
    if (s >= 0.18) pairs.push({ a: names[i], b: names[j], s });
  }
}
pairs.sort((x, y) => y.s - x.s);
if (!pairs.length) {
  console.log('  tidak ada pasangan modul di atas ambang 18%');
} else {
  for (const p of pairs.slice(0, 10)) {
    console.log(`  ${pc(p.s).padStart(6)}  ${p.a}  <->  ${p.b}`);
  }
  if (pairs.length > 10) console.log(`  (+${pairs.length - 10} pasangan lain di atas ambang)`);
}

console.log('\nCatatan: angka di atas adalah pengukuran, bukan putusan. Edisi ini');
console.log('adalah turunan TesserCAD yang dinyatakan terbuka di PROVENANCE.md dan');
console.log('COMPARISON.md, jadi kemiripan tinggi memang yang diharapkan. Yang perlu');
console.log('dijelaskan adalah kemiripan yang tidak dinyatakan, bukan yang dinyatakan.');
