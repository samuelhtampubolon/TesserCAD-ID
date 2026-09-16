/**
 * How close this edition is to the two it comes from, measured not asserted.
 *
 * The front page makes three claims about the relationship - 75-85% of
 * TesserCAD, 65-75% of TesserCADIna, and lighter than both - and none of them
 * is checkable from inside this repository alone. So this is a script a reader
 * runs against checkouts of the other two rather than a suite that fails the
 * build:
 *
 *   node tools/parity.mjs ../TesserCAD ../TesserCADIna
 *
 * Either path may be omitted and that comparison is skipped.
 *
 * Four things are reported, and the fourth is the one that matters most:
 *
 *   Features      the command registry and the exported API of every module,
 *                 by name. A missing command is a feature this edition does
 *                 not have, and the README says which ones and why.
 *   Source        what proportion of this edition's source is line-for-line
 *                 the same as each upstream. These are the percentage claims.
 *   Payload       what a browser downloads, raw and gzipped. "Lighter" has to
 *                 mean something measurable, and this is it.
 *   Language      how much of the interface is still English. This edition
 *                 claims to be Indonesian-only rather than Indonesian-on-top,
 *                 so the number that matters is how many user-visible
 *                 literals in the source still read as English - and, unlike
 *                 the others, this one can be checked without a second
 *                 checkout, so it always runs.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MINE = join(here, '..');

const args = process.argv.slice(2);
const lawan = [];
for (const path of args) {
  if (!existsSync(join(path, 'src', 'main.js'))) {
    console.error(`skipped ${path}: no src/main.js there`);
    continue;
  }
  const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
  lawan.push({ path, nama: pkg.name || path });
}

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const modules = (root) => walk(join(root, 'src'))
  .filter(f => f.endsWith('.js'))
  .map(f => relative(join(root, 'src'), f).split('\\').join('/'))
  .sort();

/* ------------------------------------------------------------ 1. features */

const commandIds = (root) => [...readFileSync(join(root, 'src/ui/commands.js'), 'utf8')
  .matchAll(/\badd\(\s*'([a-zA-Z0-9.]+)'/g)].map(m => m[1]).sort();

const exportsOf = (root) => modules(root)
  .flatMap(f => [...readFileSync(join(root, 'src', f), 'utf8')
    .matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .map(m => m[1]))
  .sort();

const myCommands = commandIds(MINE);
const myExports = new Set(exportsOf(MINE));

/* -------------------------------------------------------------- 2. sharing */

/** Lines of `b` that are not in `a`, by the usual longest-common-subsequence. */
function addedLines(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  // Trim the common head and tail first: these files are near-identical, and
  // the quadratic table on 1,500 lines is what makes the naive version slow.
  let head = 0;
  while (head < A.length && head < B.length && A[head] === B[head]) head++;
  let tail = 0;
  while (tail < A.length - head && tail < B.length - head
    && A[A.length - 1 - tail] === B[B.length - 1 - tail]) tail++;
  const a2 = A.slice(head, A.length - tail), b2 = B.slice(head, B.length - tail);
  if (!a2.length) return b2.length;
  if (!b2.length) return 0;
  const prev = new Array(a2.length + 1).fill(0);
  let cur = new Array(a2.length + 1).fill(0);
  for (let j = 0; j < b2.length; j++) {
    cur = new Array(a2.length + 1).fill(0);
    for (let i = 0; i < a2.length; i++) {
      cur[i + 1] = a2[i] === b2[j] ? prev[i] + 1 : Math.max(cur[i], prev[i + 1]);
    }
    prev.splice(0, prev.length, ...cur);
  }
  return b2.length - cur[a2.length];
}

function sharing(theirs) {
  let kept = 0, added = 0, shared = 0;
  for (const f of modules(MINE)) {
    const mine = readFileSync(join(MINE, 'src', f), 'utf8');
    const theirPath = join(theirs, 'src', f);
    const lines = mine.split('\n').length;
    if (!existsSync(theirPath)) { added += lines; continue; }
    shared++;
    const n = addedLines(readFileSync(theirPath, 'utf8'), mine);
    added += n;
    kept += lines - n;
  }
  return { kept, added, total: kept + added, shared };
}

/* -------------------------------------------------------------- 3. payload */

const payload = (root) => {
  const files = [
    ...walk(join(root, 'src')).filter(f => f.endsWith('.js')),
    ...walk(join(root, 'vendor')).filter(f => f.endsWith('.js')),
    ...walk(join(root, 'styles')).filter(f => f.endsWith('.css')),
    join(root, 'index.html'),
  ].filter(existsSync);
  let raw = 0, gz = 0;
  for (const f of files) {
    const buf = readFileSync(f);
    raw += buf.length;
    gz += gzipSync(buf, { level: 9 }).length;
  }
  return { raw, gz, files: files.length };
};

const mb = (n) => `${(n / 1048576).toFixed(3)} MB`;
const pc = (a, b) => `${a > b ? '+' : ''}${(100 * (a - b) / b).toFixed(1)}%`;

/* ------------------------------------------------------------- 4. language */

/**
 * User-visible literals that still read as English.
 *
 * Deliberately crude and deliberately reported rather than asserted: the
 * point is a number a reader can watch over time, not a gate. Comments are
 * stripped first, because this edition keeps its code comments in English on
 * purpose - the interface is the thing that is Indonesian, and a comment is
 * not interface. What is counted is string literals in source positions.
 */
const ENGLISH = /\b(the|this|that|and|with|from|for|are|is|was|have|does|will|would|should|could|cannot|of|to|in|on|at|by|as|but|than|then|when|while|which|what|how|each|every|any|all|more|most|less|only|also|still|already|because|unless|until|after|before|between|about|above|below|under|again|there|their|they|them|your|you|our)\b/i;

function inggris(root) {
  let hits = 0, total = 0;
  for (const f of walk(join(root, 'src')).filter(x => x.endsWith('.js'))) {
    const raw = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`\\])\/\/.*$/gm, (m, p) => p);
    for (const m of raw.matchAll(/(['"`])((?:[^'"`\\\n]|\\.){8,}?)\1/g)) {
      const s = m[2];
      // What a placeholder is called is not language the user reads. `isi()`
      // takes `{when}`, `{label}`, `{p1}`, and a template literal takes
      // `${...}`; both were being counted, and `when` is on the stopword list,
      // so "Sesi terakhir Anda dipulihkan dari {when}" was filed as English.
      const prose = s.replace(/\$\{[^}]*\}/g, ' ').replace(/\{[^}]*\}/g, ' ');
      // And a quoted run that is really code, which this regex cannot help
      // producing: it matches from any quote to the next one, so everything
      // between two unrelated string literals on one line arrives here as a
      // "sentence". `, onclick: () => this.zoomFit() }, [icon(` was one.
      if (/=>|\};|\bthis\.|\|\||\?\?|\.length|\);|;\s/.test(prose)) continue;
      // Nor is a regex, a media query or a command id something anybody reads.
      // All three were being counted: `(?:^|[^a-z])` for its `mm|cm|meter`,
      // `(min-width: 700px) and ...` for its `and`, and `help.about` for its
      // `about`. A string with no space in it is not a sentence in any
      // language, which is what the last test says.
      if (/\\[dswbn(]|\(\?[:!=]|\bmin-width:|\bmax-width:|\bpointer:/.test(prose)) continue;
      if (!/\s/.test(prose.trim())) continue;
      const words = prose.match(/[A-Za-z][A-Za-z-]{2,}/g) || [];
      if (words.length < 2) continue;                            // not a sentence
      total++;
      if (ENGLISH.test(prose)) hits++;
    }
  }
  return { hits, total };
}

/* ---------------------------------------------------------------- report */

console.log('PERINTAH DAN API');
console.log(`  perintah di sini      ${myCommands.length}`);
console.log(`  API terekspor         ${myExports.size}`);
for (const { path, nama } of lawan) {
  const theirs = commandIds(path);
  const hilang = theirs.filter(c => !myCommands.includes(c));
  const baru = myCommands.filter(c => !theirs.includes(c));
  const theirExports = new Set(exportsOf(path));
  const exportHilang = [...theirExports].filter(x => !myExports.has(x));
  console.log(`  vs ${nama}`);
  console.log(`    perintah upstream   ${theirs.length}`);
  console.log(`    tidak ada di sini   ${hilang.length ? hilang.join(', ') : 'tidak ada'}`);
  console.log(`    baru di sini        ${baru.length ? baru.join(', ') : 'tidak ada'}`);
  console.log(`    API hilang          ${exportHilang.length ? exportHilang.join(', ') : 'tidak ada'}`);
}

if (lawan.length) {
  console.log('\nKEMIRIPAN SUMBER  (persen baris di sini yang identik dengan upstream)');
  for (const { path, nama } of lawan) {
    const s = sharing(path);
    console.log(`  vs ${nama.padEnd(16)} ${(100 * s.kept / s.total).toFixed(1)}%  `
      + `(${s.kept.toLocaleString()} dari ${s.total.toLocaleString()} baris, `
      + `${s.shared} modul bersama)`);
  }
}

const mine = payload(MINE);
console.log('\nYANG DIUNDUH PERAMBAN');
console.log(`  di sini               mentah ${mb(mine.raw)}  gzip ${mb(mine.gz)}  (${mine.files} berkas)`);
for (const { path, nama } of lawan) {
  const p = payload(path);
  console.log(`  ${nama.padEnd(20)} mentah ${mb(p.raw)}  gzip ${mb(p.gz)}   `
    + `selisih gzip ${pc(mine.gz, p.gz)}`);
}

const lang = inggris(MINE);
console.log('\nBAHASA ANTARMUKA');
console.log(`  kalimat di sumber     ${lang.total}`);
console.log(`  masih terbaca Inggris ${lang.hits}  (${(100 * lang.hits / Math.max(1, lang.total)).toFixed(1)}%)`);
for (const { path, nama } of lawan) {
  const l = inggris(path);
  console.log(`  ${nama.padEnd(20)} ${l.hits} dari ${l.total}  (${(100 * l.hits / Math.max(1, l.total)).toFixed(1)}%)`);
}

if (!lawan.length) {
  console.log('\nTanpa argumen hanya bagian bahasa yang terukur. Untuk sisanya:');
  console.log('  node tools/parity.mjs ../TesserCAD ../TesserCADIna');
}
