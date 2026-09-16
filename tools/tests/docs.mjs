/**
 * The numbers in the documentation are the numbers the suites produce.
 *
 * Every document in this repository quotes counts - how many checks run, how
 * many suites there are, how many security checks attack rather than assert.
 * Those numbers were corrected by hand five times while this project was being
 * written, and were wrong in at least three documents on three separate
 * occasions, because a number in prose has nothing holding it to the thing it
 * describes.
 *
 * That matters more here than it would elsewhere. The whole argument this
 * repository makes is that its claims are checkable; a README that overstates
 * its own test count by forty is a small lie that costs the large claim its
 * credibility. So the counts are derived by running the suites and compared
 * against what the documents say.
 *
 * Deliberately tolerant in one direction and strict in another: a document may
 * quote a *rounded* figure ("about four seconds"), but an exact integer that
 * claims to be a check count has to be one. The tolerance below is zero for
 * counts; time is not checked at all, because it is a property of the machine.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  - ' + extra : ''}`);
};

/* ------------------------------------------------- what is actually true */

/** Run one suite and count its `ok` lines. Cheap: these are all sub-second. */
function countChecks(suite) {
  try {
    const out = execFileSync(process.execPath, [join(root, 'tools/tests', suite)], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return (out.match(/^ok {2}/gm) || []).length;
  } catch (err) {
    // A failing suite still prints its lines; count them rather than reporting
    // zero, which would look like a documentation error instead of a test one.
    return ((err.stdout || '').match(/^ok {2}/gm) || []).length;
  }
}

const securityChecks = countChecks('security.mjs');

// The headless total comes from the runner itself, which is the same number a
// contributor sees, rather than from re-adding the suites here.
let headlessTotal = 0;
let headlessSuites = 0;
try {
  const out = execFileSync(process.execPath, [join(root, 'tools/run-tests.mjs')], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  const m = /(\d+) checks across (\d+) suites/.exec(out);
  if (m) { headlessTotal = Number(m[1]); headlessSuites = Number(m[2]); }
} catch (err) {
  const m = /(\d+) checks across (\d+) suites/.exec(err.stdout || '');
  if (m) { headlessTotal = Number(m[1]); headlessSuites = Number(m[2]); }
}

ok('the headless runner reports a total at all', headlessTotal > 0, String(headlessTotal));
ok('and the security suite reports its own', securityChecks > 0, String(securityChecks));
console.log(`     headless: ${headlessTotal} checks / ${headlessSuites} suites · security: ${securityChecks}`);

/* ------------------------------------------ what the documents claim it is */

// dist/README.md belongs here rather than being remembered at each call site.
// It was reachable from two of the four checks below and from neither of the
// other two, and the one that would have caught it was the one it was missing
// from: it promised a download of "sekitar 80 MB" for a commit after every
// other page had been corrected to the measured figure. A document a reader
// lands on is a document the suite reads.
const DOCS = ['README.md', 'SECURITY.md', 'ARCHITECTURE.md', 'COMPARISON.md',
  'ATTRIBUTION.md', 'PROVENANCE.md', 'CHANGELOG.md', 'dist/README.md'];

/**
 * Any integer adjacent to the word "headless", or to this suite's own suite
 * count, is a claim about the headless total.
 *
 * The suite count is interpolated rather than written in, which is what keeps
 * this narrow: "383 across 10 browser suites" is a different claim and must not
 * match, and it does not, because 10 is not 16. An earlier version spelled the
 * alternatives out by hand ("16 suites|sixteen suites|\d+ suites") and the last
 * of those matched the browser total, which would have failed the build the
 * first time the two numbers legitimately differed.
 */
const HEADLESS_CLAIM = new RegExp(
  String.raw`(\d{3,5})\s*(?:headless\b|checks?[,]?\s*(?:across|in)?\s*${headlessSuites}\s+suites`
  + String.raw`|(?:across|in)\s+${headlessSuites}\s+suites)`,
  'gi',
);

const wrong = [];
for (const doc of DOCS) {
  const path = join(root, doc);
  if (!existsSync(path)) continue;
  const body = readFileSync(path, 'utf8');
  for (const m of body.matchAll(HEADLESS_CLAIM)) {
    const claimed = Number(m[1]);
    if (claimed !== headlessTotal) {
      wrong.push(`${doc}: claims ${claimed}, actual ${headlessTotal}`);
    }
  }
}
/**
 * A `npm test` line that states its own counts, wherever it appears.
 *
 * The check above is narrow on purpose: it looks for "headless" or for a suite
 * count that matches this runner's, so that the browser total's "407 across 11
 * browser suites" cannot accidentally be held to the headless number. The cost
 * of that narrowness showed up here. SECURITY.md carried `npm test # 944
 * checks, 17 suites, ~4 seconds` and ATTRIBUTION.md `# 944 checks`, both
 * inherited from TesserCADIna and both stale by 140 checks and a whole suite.
 * Neither matched, because "17 suites" is not this runner's 16 - the very
 * mismatch that makes a claim wrong was what let it through.
 *
 * Anchoring on the command instead closes that: a line that invites the reader
 * to run `npm test` and tells them what to expect is claiming this runner's
 * numbers by construction, whatever suite count it names. Both numbers are
 * checked where both are given, since a stale suite count is how the first one
 * hid.
 */
const npmClaim = [];
const NPM_TEST_CLAIM = /npm test[^\n#]*#\s*(?:about\s*)?([\d,]{3,6})\s*(?:checks?|pemeriksaan)([^\n]*)/gi;
for (const doc of DOCS) {
  const path = join(root, doc);
  if (!existsSync(path)) continue;
  for (const m of readFileSync(path, 'utf8').matchAll(NPM_TEST_CLAIM)) {
    const claimed = Number(m[1].replace(/,/g, ''));
    if (claimed !== headlessTotal) npmClaim.push(`${doc}: "npm test # ${claimed} checks" but the runner reports ${headlessTotal}`);
    const suites = m[2].match(/(\d+)\s*suites?/);
    if (suites && Number(suites[1]) !== headlessSuites) {
      npmClaim.push(`${doc}: names ${suites[1]} suites, the runner has ${headlessSuites}`);
    }
  }
}
ok('every `npm test` line that quotes its own counts quotes this runner\'s',
  npmClaim.length === 0, npmClaim.join(' | '));
ok('and at least two documents carry such a line, or the check above reads nothing',
  DOCS.filter(d => existsSync(join(root, d))
    && /npm test[^\n#]*#\s*(?:about\s*)?[\d,]{3,6}\s*(?:checks?|pemeriksaan)/i.test(readFileSync(join(root, d), 'utf8'))).length >= 2);

ok('every documented headless check count matches the runner',
  wrong.length === 0, wrong.join(' | '));

// The security count is quoted in exactly one place, so it is matched exactly.
const comparison = existsSync(join(root, 'COMPARISON.md'))
  ? readFileSync(join(root, 'COMPARISON.md'), 'utf8') : '';
const securityClaim = /(\d+) security checks run attacks/.exec(comparison);
ok('the documented security check count matches the suite',
  !securityClaim || Number(securityClaim[1]) === securityChecks,
  securityClaim ? `claims ${securityClaim[1]}, actual ${securityChecks}` : 'not quoted');

/* ------------------------------------ claims that went stale once already */

// The command count is deliberately *not* checked here. The registry is
// assembled by buildCommands() at runtime, so no amount of pattern matching
// over commands.js can count it - a first attempt read 6 against an actual
// 202. tools/browser/ui.mjs asserts the real number in a real browser, which
// is where the question can actually be answered. A static check that cannot
// be made correct is worse than no static check, because it either fails
// forever or gets loosened until it means nothing.
const readme = readFileSync(join(root, 'README.md'), 'utf8');
ok('the README still carries a command badge for the browser suite to check',
  /commands-\d+-/.test(readme));

// The desktop build's Electron major, quoted in SECURITY.md if at all.
const desktopPkg = JSON.parse(readFileSync(join(root, 'desktop/package.json'), 'utf8'));
const electronRange = desktopPkg.devDependencies.electron;
ok('the desktop build pins a supported Electron major',
  Number(/(\d+)/.exec(electronRange)[1]) >= 38,
  `${electronRange} - Electron drops support for all but the newest majors`);

/* --------------------------------- every link points at this repository */

// The repository was renamed from Portofolio_Tutorial to TesserCAD, and the
// name appeared in twenty places: prose links, clone instructions, the two
// `gh attestation verify --repo` examples, the desktop manifest, and three
// Help menu items that open a browser from inside the application.
//
// GitHub redirects an old repository URL to the new one, so a stale link keeps
// working and nothing tells you it is stale. That is the problem: it decays
// quietly, and it stops working the day the old name is claimed by someone
// else. GitHub Pages does not redirect at all, so a stale live-app link is
// simply dead.
//
// The manifest's `repository` field is the single source of truth, because
// electron-builder already reads it and a wrong value there breaks the build
// loudly. Every link under this owner is compared against it. Links to other
// owners are third-party - the thirteen prior-art projects - and are left
// alone.
const repoUrl = JSON.parse(readFileSync(join(root, 'desktop/package.json'), 'utf8')).repository.url;
const [, owner, repoName] = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(repoUrl);

const LINKED = [...DOCS, 'src/ui/commands.js', 'src/main.js'];

/**
 * The two editions this one is measured against.
 *
 * A link to either is not a stale link: the README quotes measured
 * percentages against both and COMPARISON.md explains every command this
 * edition does not carry. Everything else under this owner still has to be
 * this repository, which is what this check is for.
 */
const SIBLINGS = new Set(['TesserCAD', 'TesserCADIna']);

// One exemption, as narrow as it can be made.
//
// A build-provenance attestation records the repository URL at the moment it
// was signed, so the v1.0.4 artefacts name the old repository for ever, and
// `gh attestation verify --repo <new name>` will not match them. The documents
// have to say so, which means they have to write the old name down.
//
// Permitted only inside the blockquote that carries that caveat, identified by
// the sentence it opens with, and only for this one name.
//
// The first attempt exempted any blockquote line, which was wrong and was
// caught by testing it: the README's download callout is a blockquote too, so
// a stale Releases link in the most prominent place on the page would have
// passed. Scoped to the block, not the line.
//
// Everything else still fails: a stale link on an ordinary line, any other
// wrong name even inside this block, and any stale Pages path anywhere, since
// Pages has no redirect and there is no historical reason to name the old one.
const HISTORICAL_NAME = 'Portofolio_Tutorial';
const EXEMPT_BLOCK_MARKER = 'before the repository was renamed';

/** Character ranges of blockquote blocks that carry the rename caveat. */
function exemptRanges(body) {
  const ranges = [];
  let start = null, offset = 0;
  const flush = (end) => {
    if (start === null) return;
    if (body.slice(start, end).includes(EXEMPT_BLOCK_MARKER)) ranges.push([start, end]);
    start = null;
  };
  for (const line of body.split('\n')) {
    const isQuote = line.trimStart().startsWith('>');
    if (isQuote && start === null) start = offset;
    if (!isQuote) flush(offset);
    offset += line.length + 1;
  }
  flush(offset);
  return ranges;
}

const badLinks = [];
for (const doc of LINKED) {
  const path = join(root, doc);
  if (!existsSync(path)) continue;
  const body = readFileSync(path, 'utf8');
  const exempt = exemptRanges(body);
  const isHistoricalNote = (index, named) =>
    named === HISTORICAL_NAME && exempt.some(([a, b]) => index >= a && index < b);

  // github.com/<this owner>/<anything> must be this repository.
  for (const m of body.matchAll(new RegExp(`github\\.com/${owner}/([A-Za-z0-9_.-]+)`, 'g'))) {
    const named = m[1].replace(/\.git$/, '');
    if (named === repoName || SIBLINGS.has(named)) continue;
    if (isHistoricalNote(m.index, named)) continue;
    badLinks.push(`${doc}: github.com/${owner}/${named}`);
  }
  // <owner>.github.io/<path> is the Pages site, whose path is the repo name.
  for (const m of body.matchAll(new RegExp(`${owner}\\.github\\.io/([A-Za-z0-9_.-]+)`, 'g'))) {
    // Pages has no redirect, so a stale live-app link is simply dead. No
    // exemption here: there is no historical reason to name the old path.
    if (m[1] !== repoName) badLinks.push(`${doc}: ${owner}.github.io/${m[1]}`);
  }
  // `--repo owner/name` in the attestation examples.
  for (const m of body.matchAll(new RegExp(`--repo ${owner}/([A-Za-z0-9_.-]+)`, 'g'))) {
    if (m[1] === repoName || SIBLINGS.has(m[1])) continue;
    if (isHistoricalNote(m.index, m[1])) continue;
    badLinks.push(`${doc}: --repo ${owner}/${m[1]}`);
  }
}
ok(`every link under ${owner}/ points at ${repoName}, the repository the manifest names`,
  badLinks.length === 0, badLinks.join(' | '));

/* ------------------------------------------- the licence GitHub can read */

// GitHub reported this repository's licence as NOASSERTION, meaning its
// detector could not match LICENSE to any known one, so the sidebar showed no
// licence at all. The text was verbatim MIT; what defeated the match was a
// two-line note appended after a rule, explaining that three.js is bundled.
//
// That matters more here than it would elsewhere. This project's licence story
// is a substantive claim - MIT, with ten GPL-family projects deliberately kept
// out of it - and a repository whose stated licence is "unrecognised" argues
// against that claim on its own front page.
//
// The note moved to NOTICE, where bundled-component attribution belongs, and
// where ATTRIBUTION.md, PROVENANCE.md and vendor/THREE-LICENSE.txt already
// carried the same information. LICENSE is now nothing but the MIT text.
//
// Checked by normalising whitespace and comparing against the MIT body, so
// this cannot regress by someone appending a helpful paragraph again.
const MIT_BODY = [
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'of this software and associated documentation files (the "Software"), to deal',
  'in the Software without restriction, including without limitation the rights',
  'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
  'copies of the Software, and to permit persons to whom the Software is',
  'furnished to do so, subject to the following conditions:',
].join(' ');

const licence = readFileSync(join(root, 'LICENSE'), 'utf8');
const flat = licence.replace(/\s+/g, ' ').trim();
ok('LICENSE opens with the MIT title and a copyright line',
  /^MIT License Copyright \(c\) \d{4} \S/.test(flat), flat.slice(0, 46));
ok('and contains the MIT grant verbatim', flat.includes(MIT_BODY));
const endsClean = /OTHER DEALINGS IN THE SOFTWARE\.$/.test(flat);
ok('and ends on the MIT warranty clause, with nothing appended', endsClean,
  endsClean ? '' : 'text after it makes GitHub report the licence as NOASSERTION; put it in NOTICE');
ok('and the bundled-component notice exists, so nothing was lost in moving it',
  existsSync(join(root, 'NOTICE')) && /three\.js/.test(readFileSync(join(root, 'NOTICE'), 'utf8')));

/* ------------------------------------------------ the size of the thing */

// PROVENANCE and COMPARISON both state how large this codebase is, and they
// disagreed with each other and with the tree: 23,138 against 23,115 against an
// actual 23,147. For a document whose purpose is to be handed to someone
// assessing the work formally, a figure that is merely close is worse than no
// figure, because it invites the question of what else is approximate.
//
// Counted the obvious way - every .js line under src/ - and the method is
// stated here so the number can be reproduced rather than trusted:
//
//   find src -name '*.js' | wc -l        # modules
//   cat $(find src -name '*.js') | wc -l # lines
function countTree(dir, exts) {
  let files = 0, lines = 0;
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.some(e => entry.name.endsWith(e))) {
        files++;
        lines += readFileSync(full, 'utf8').split('\n').length - 1;
      }
    }
  };
  walk(join(root, dir));
  return { files, lines };
}

const src = countTree('src', ['.js']);
const tooling = {
  files: countTree('tools', ['.js', '.mjs', '.cjs']).files + countTree('desktop', ['.js', '.mjs', '.cjs']).files,
  lines: countTree('tools', ['.js', '.mjs', '.cjs']).lines + countTree('desktop', ['.js', '.mjs', '.cjs']).lines,
};
const group = (n) => n.toLocaleString('en-US');
console.log(`     src: ${group(src.lines)} lines across ${src.files} modules`
  + ` · tooling: ${group(tooling.lines)} lines across ${tooling.files} files`);

// "modules" means src/, "files" means the tooling. Two different trees, so the
// noun is what tells them apart, and each document has to use the right one.
const sizeWrong = [];
const SIZE_CLAIM = /([\d,]{4,8}) lines across (\d+) (modules|files)/g;
for (const doc of ['PROVENANCE.md', 'COMPARISON.md', 'ARCHITECTURE.md', 'README.md']) {
  const path = join(root, doc);
  if (!existsSync(path)) continue;
  for (const m of readFileSync(path, 'utf8').matchAll(SIZE_CLAIM)) {
    const lines = Number(m[1].replace(/,/g, ''));
    const count = Number(m[2]);
    const want = m[3] === 'modules' ? src : tooling;
    if (lines !== want.lines || count !== want.files) {
      sizeWrong.push(`${doc}: "${m[0]}" but the tree is ${group(want.lines)} lines across ${want.files} ${m[3]}`);
    }
  }
}
/**
 * Every module a document names in backticks either exists, or is one this
 * edition is on record as having removed.
 *
 * This is the staleness the check above cannot see. A count that drifts is
 * obvious once measured; a document that still credits `src/intel/merge.js`
 * for a three-way merge is claiming a capability the tree does not have, and
 * nothing measures that. Four such references were inherited from
 * TesserCADIna's documents and survived the whole build: PROVENANCE.md and
 * ATTRIBUTION.md both listed the merge as an original contribution of this
 * codebase, and ATTRIBUTION.md credited MeshLab's influence to a deviation
 * module that is not here.
 *
 * REMOVED is the exception list, and it earns its keep twice: a document may
 * name one of those paths, because explaining a removal requires naming what
 * was removed, and the suite also asserts each one is genuinely absent. So a
 * path cannot sit on the list after coming back, and a new deletion cannot be
 * papered over by adding it here without the file actually being gone.
 */
const REMOVED = [
  'src/intel/merge.js',
  'src/intel/deviation.js',
  'vendor/GLTFExporter.js',
  'src/core/i18n.js',
];
for (const gone of REMOVED) {
  ok(`${gone} really is absent, as the documents say it is`, !existsSync(join(root, gone)));
}
const ghosts = [];
const PATH_MENTION = /`((?:src|tools|desktop|vendor|styles)\/[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|css|yml|json|txt))`/g;
for (const doc of DOCS.concat(['ATTRIBUTION.md', 'docs/PANDUAN.md'])) {
  const path = join(root, doc);
  if (!existsSync(path)) continue;
  for (const m of readFileSync(path, 'utf8').matchAll(PATH_MENTION)) {
    const named = m[1];
    if (existsSync(join(root, named)) || REMOVED.includes(named)) continue;
    ghosts.push(`${doc}: ${named}`);
  }
}
ok('no document names a module that is neither present nor on record as removed',
  ghosts.length === 0, [...new Set(ghosts)].join(' | '));
ok('and the check reads enough paths to be meaningful', (() => {
  let n = 0;
  for (const doc of DOCS.concat(['ATTRIBUTION.md'])) {
    const path = join(root, doc);
    if (!existsSync(path)) continue;
    n += [...readFileSync(path, 'utf8').matchAll(PATH_MENTION)].length;
  }
  return n > 40;
})());

/**
 * The changelog's newest entry is the version the manifest declares.
 *
 * A changelog exists to answer one question - which fixes do I have - and it
 * answers it wrongly the moment the version moves without it. So the top
 * entry is compared against `desktop/package.json`, which is also what the
 * tag has to match, which makes the three agree by construction.
 *
 * The previous version has to still be there too. A changelog rewritten in
 * place rather than added to is not a changelog, and that failure looks
 * exactly like a correct one from the top.
 */
{
  const log = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const heads = [...log.matchAll(/^##\s+v(\d+\.\d+\.\d+)\s*$/gm)].map(m => m[1]);
  ok('the changelog leads with the version the manifest declares',
    heads[0] === desktopPkg.version, `changelog says ${heads[0]}, manifest says ${desktopPkg.version}`);
  ok('and it keeps the releases before it, so it is a log rather than a banner',
    heads.length >= 2, heads.join(', '));
  ok('its entries run newest first', (() => {
    const key = (v) => v.split('.').map(Number);
    for (let i = 1; i < heads.length; i++) {
      const a = key(heads[i - 1]), b = key(heads[i]);
      for (let k = 0; k < 3; k++) {
        if (a[k] !== b[k]) { if (a[k] < b[k]) return false; break; }
      }
    }
    return true;
  })(), heads.join(' > '));
  ok('and the README points a reader at it',
    /CHANGELOG\.md/.test(readFileSync(join(root, 'README.md'), 'utf8')));
}

/**
 * The download figures the documents quote, measured here.
 *
 * These drifted twice in one session, both times the same way: measured with
 * `tools/parity.mjs`, written into the documents, and then `src/` was edited
 * again before the commit landed. 0.542 became 0.543 became 0.547, and the
 * percentage against TesserCAD moved with it, while the pages kept the first
 * reading.
 *
 * The similarity percentages cannot be checked here, because computing them
 * needs TesserCAD and TesserCADIna checked out beside this repository and CI
 * has neither. These two can: the gzipped payload a browser fetches, and the
 * `ai` layer's share of it, are properties of this tree alone. The same
 * gzip level and the same file list as parity.mjs, or the numbers would
 * disagree for a reason that has nothing to do with the documents.
 *
 * Tolerance is a rounding step in the unit each figure is quoted in, not a
 * margin for being wrong: 0.001 MB and 0.1 KB.
 */
{
  const gzipOf = (f) => gzipSync(readFileSync(f), { level: 9 }).length;
  const walkExt = (dir, ext) => {
    const out = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...walkExt(full, ext));
      else if (name.endsWith(ext)) out.push(full);
    }
    return out;
  };
  const payloadFiles = [
    ...walkExt(join(root, 'src'), '.js'),
    ...walkExt(join(root, 'vendor'), '.js'),
    ...walkExt(join(root, 'styles'), '.css'),
    join(root, 'index.html'),
  ].filter(existsSync);
  const aiDir = join(root, 'src', 'ai') + sep;
  let gz = 0, gzAi = 0;
  for (const f of payloadFiles) {
    const n = gzipOf(f);
    gz += n;
    // Compared against a real path rather than against a relative string.
    // Taking a repository-relative path and testing whether it begins with a
    // forward-slashed prefix is banned by the architecture suite, because on
    // Windows that path comes back with backslashes and the test matches
    // nothing: the check would pass while reading none of what it claims to.
    // That suite caught this line in exactly that state.
    if (f.startsWith(aiDir)) gzAi += n;
  }
  const mb = gz / 1048576;
  const aiKb = gzAi / 1024;

  // Written with a comma in the Indonesian pages and a point in the English
  // ones, so both spellings are read.
  const claims = [];
  for (const doc of DOCS) {
    const path = join(root, doc);
    if (!existsSync(path)) continue;
    const body = readFileSync(path, 'utf8');
    // Only this edition's own figures. The comparisons quote TesserCAD's
    // 0.532 and TesserCADIna's 0.596 in the same sentence, and those are
    // their numbers, not this tree's: the shape "X vs Y" is what tells them
    // apart, since this edition is always the first of the pair.
    for (const m of body.matchAll(/(\d[.,]\d{3})\s+vs\s/g)) {
      const v = Number(m[1].replace(',', '.'));
      if (Math.abs(v - mb) > 0.0005) claims.push(`${doc}: quotes ${m[1]} MB against this tree's ${mb.toFixed(3)}`);
    }
    for (const m of body.matchAll(/lapisan AI (\d+[.,]\d) KB/g)) {
      const v = Number(m[1].replace(',', '.'));
      if (Math.abs(v - aiKb) > 0.05) claims.push(`${doc}: quotes an ai layer of ${m[1]} KB, measured ${aiKb.toFixed(1)}`);
    }
    // And the payload with the ai layer taken out, which the README quotes to
    // support the "lighter on the same features" claim.
    for (const m of body.matchAll(/payload-nya (\d[.,]\d{3}) MB/g)) {
      const v = Number(m[1].replace(',', '.'));
      const want = (gz - gzAi) / 1048576;
      if (Math.abs(v - want) > 0.0005) claims.push(`${doc}: quotes ${m[1]} MB without the ai layer, measured ${want.toFixed(3)}`);
    }
  }
  console.log(`     payload: ${mb.toFixed(3)} MB gzipped across ${payloadFiles.length} files · ai layer ${aiKb.toFixed(1)} KB`);
  ok('every documented gzipped payload figure matches this tree',
    claims.length === 0, [...new Set(claims)].join(' | '));
  ok('and the measurement is not vacuous',
    payloadFiles.length > 50 && mb > 0.3, `${payloadFiles.length} files, ${mb.toFixed(3)} MB`);
}

ok('every documented source size matches the tree', sizeWrong.length === 0, sizeWrong.join(' | '));

// A commit count in a document can never be right, because the commit that
// corrects it changes it. PROVENANCE said 44 against an actual 51. Rather than
// check an uncheckable number, the document is required not to state one and
// to give the command instead - which is both always accurate and more use to
// someone verifying the record than a figure they would have to trust.
const provenance = existsSync(join(root, 'PROVENANCE.md'))
  ? readFileSync(join(root, 'PROVENANCE.md'), 'utf8') : '';
const pinsCommitCount = /\|\s*\*\*Commits\*\*\s*\|\s*\d+\s*\|/.test(provenance);
ok('PROVENANCE does not pin a commit count that goes stale on the next commit',
  !pinsCommitCount,
  pinsCommitCount
    ? 'it quotes a number; name the command that counts them instead'
    : 'it names the command instead');

/* --------------------------- the version, and the platforms actually built */

// Every artefact filename in the prose carries the version, and electron-builder
// takes that version from desktop/package.json rather than from the git tag.
// Three releases in a row shipped files whose names disagreed with something:
// v1.0.1 built TesserCAD-1.0.0-*, and the documents then quoted 1.0.3 against a
// manifest that had moved on. The workflow already refuses a tag that disagrees
// with the manifest; this refuses a *document* that does.
const version = JSON.parse(readFileSync(join(root, 'desktop/package.json'), 'utf8')).version;
const FILENAME = /TesserCAD-ID-(\d+\.\d+\.\d+)-/g;
const misnamed = [];
for (const doc of DOCS) {
  const path = join(root, doc);
  if (!existsSync(path)) continue;
  for (const m of readFileSync(path, 'utf8').matchAll(FILENAME)) {
    if (m[1] !== version) misnamed.push(`${doc}: ${m[0]} but the manifest says ${version}`);
  }
}
ok('every artefact filename in the documents carries the manifest version',
  misnamed.length === 0, misnamed.join(' | '));

// A platform is only downloadable if the workflow matrix runs a job for it.
// electron-builder.yml configures a mac target, which reads like macOS builds
// exist; no runner ever produces one, and the README said they were "there
// too". A promise of a download that is not built is the worst kind of
// documentation error, because the reader only finds out after looking.
//
// Asserted as a *positive* requirement - while no macOS job exists, the README
// has to carry the disclaimer - rather than by hunting the README for words
// that sound like an offer. The first version of this check did the latter,
// searching for ".dmg", and failed on the sentence explaining that there is no
// macOS build. That is the fourth time in this repository that a check written
// as a keyword search has matched its own documentation, so it is written the
// other way round here: the thing that must be true is stated, not the thing
// that must be absent.
const workflow = readFileSync(join(root, '.github/workflows/desktop.yml'), 'utf8');
const buildsMac = /os:\s*macos-/.test(workflow);
// Matched in either language: this edition's front page is Bahasa Indonesia,
// and "Tidak ada build macOS" is the same promise as "There is no macOS build".
const readmeDisclaimsMac = /no macOS\s+.{0,12}build/i.test(readme)
  || /tidak ada build macOS/i.test(readme);
ok('the README states plainly that macOS is not built, while it is not built',
  buildsMac || readmeDisclaimsMac,
  buildsMac ? 'a macOS job exists, so the disclaimer is no longer required'
    : readmeDisclaimsMac
      ? 'no macOS job in the matrix; the README says so'
      : 'no macOS job in the matrix, and the README does not say so - add a macOS'
        + ' runner to desktop.yml, or say plainly that there is no macOS build');

/* ------------------------------------------- no document promises the past */

/**
 * Phrases that describe a build this repository no longer produces.
 *
 * The list inverted once already and that is the point of keeping it: it used
 * to forbid offering a portable .exe, because TesserCAD ships a deflate zip
 * and no self-extractor. This edition ships the portable and no zip - the size
 * promise on its front page cannot be met by deflate - so the stale offer is
 * now the zip, and a document that still points at one fails here.
 */
const STALE_PHRASES = [
  ['a Windows zip, which this edition does not build', /\bzip\b Windows|`\.zip` Windows|windows-x64\.zip/i],
  ['a loopback server in the desktop build', /serves? the application (over|from) a loopback/i],
];
const stale = [];
for (const doc of DOCS) {
  const path = join(root, doc);
  if (!existsSync(path)) continue;
  const body = readFileSync(path, 'utf8');
  for (const [label, re] of STALE_PHRASES) if (re.test(body)) stale.push(`${doc}: ${label}`);
}
ok('no document still offers something the build no longer produces',
  stale.length === 0, stale.join(' | '));

/**
 * Every download a document offers must be one the release step attaches.
 *
 * This is the same failure as the stale-phrase list above, caught from the
 * other end, and it has already happened once: the `zip` Windows target was
 * replaced by `portable` and `7z` to meet the size promise, and the release
 * step's glob list was never updated. The build produced a `.7z`, the size
 * gate measured it, and then nothing hashed it, attested it or attached it -
 * while two pages offered it as a download. The first release shipped seven
 * files and a documented eighth that did not exist.
 *
 * Checked by extension rather than by filename, because the artefact names
 * carry a version and the globs do not. What has to hold is narrow and exact:
 * if a document names `TesserCAD-ID-<version>-something.EXT`, the release step
 * must carry a glob that would pick a `.EXT` up.
 */
const RELEASE_STEP = /- name: Attach to the release[\s\S]*?files:\s*\|([\s\S]*?)\n\s{10}\w/
  .exec(readFileSync(join(root, '.github/workflows/desktop.yml'), 'utf8'));
const attached = new Set(
  [...(RELEASE_STEP?.[1] || '').matchAll(/dist-desktop\/\*+\.?([A-Za-z0-9]+)/g)].map(m => m[1].toLowerCase()),
);
ok('the release step attaches something at all', attached.size > 0, [...attached].join(', '));

const unattached = [];
for (const doc of DOCS) {
  const path = join(root, doc);
  if (!existsSync(path)) continue;
  for (const m of readFileSync(path, 'utf8').matchAll(/TesserCAD-ID-\d+\.\d+\.\d+-[A-Za-z0-9_.-]*?\.([A-Za-z0-9]{2,7})\b/g)) {
    const ext = m[1].toLowerCase();
    if (ext === 'sha256') continue;                 // published beside each file
    if (!attached.has(ext)) unattached.push(`${doc}: ${m[0]} but the release attaches only ${[...attached].join(', ')}`);
  }
}
ok('every download the documents offer is one the release step attaches',
  unattached.length === 0, [...new Set(unattached)].join(' | '));

console.log(fails ? `\n${fails} FAILURES` : '\nALL DOCUMENTATION CHECKS PASS');
process.exit(fails ? 1 : 0);
