/**
 * Security regressions.
 *
 * Every check here is a live attack, not an assertion about intent. The point
 * is that a later change which reopens one of these holes fails the build
 * instead of shipping, because an audit is a snapshot and a test is a ratchet.
 *
 * The threat model is specific. This application has no server and no
 * accounts, so there is nothing to authenticate and no session to steal. What
 * it does do is open files that other people wrote: a `.tcad` document, an
 * STL, a DXF, a design-intent JSON, a pasted spec. Those are the untrusted
 * inputs, and a hostile one should be refused or clamped, never allowed to
 * execute, exhaust the tab, or corrupt the objects the rest of the program
 * relies on.
 */
import 'three';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative as nodeRelative, sep } from 'node:path';
/**
 * `path.relative` that always returns forward slashes.
 *
 * On Windows it returns `src\\core\\doc.js`, and every check below compares
 * against literals like `'core/'` or splits on `/`. Without this the layering
 * checks silently match nothing and the suite passes for the wrong reason,
 * which is worse than the outright failure the root-path bug caused. One
 * wrapper fixes every call site at once.
 */
const relative = (from, to) => nodeRelative(from, to).split(sep).join('/');

import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.structuredClone ??= (o) => JSON.parse(JSON.stringify(o));

const { migrate, newDocument, makeFeature, sanitiseParams, CATALOG, MATERIALS, UNITS, SEGMENT_PRODUCT_CEILING } =
  await import('../../src/core/doc.js');
const { tryEval, buildScope } = await import('../../src/core/expr.js');
const { rebuild, invalidateCache, massProperties } = await import('../../src/core/rebuild.js');
const { fromDXF } = await import('../../src/draft/dxf.js');
const { buildSheet, sheetToSVG } = await import('../../src/intel/drawing.js');
const { buildPrimitive } = await import('../../src/core/geometry.js');
const Spec = await import('../../src/intel/spec.js');
const Dev = await import('../../src/intel/intent.js');
const { safeName } = await import('../../src/io/io.js');
const Lex = await import('../../src/ai/lex.js');
const Chat3D = await import('../../src/ai/chat3d.js');
const Chat4D = await import('../../src/ai/chat4d.js');

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  - ' + extra : ''}`);
};

// `fileURLToPath`, not `.pathname`. On Windows a file URL's pathname is
// `/D:/a/repo/...` - a leading slash before the drive letter - which is not a
// path any filesystem call accepts. Every read against it fails, which is how
// four suites came to fail on the Windows runner while passing everywhere else.
const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const sources = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (!/node_modules|\.git|vendor/.test(full)) walk(full); }
    else if (/\.m?js$/.test(name)) sources.push(full);
  }
};
walk(join(root, 'src'));
walk(join(root, 'tools'));

/** Source with comments removed, so a mention in prose is not a finding. */
const codeOf = (file) => readFileSync(file, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ============================================ 1. no dynamic code execution */

const dynamic = sources.filter(f => /\beval\s*\(|\bnew\s+Function\s*\(|(^|[^.\w])Function\s*\(/.test(codeOf(f)));
ok('no file in the project executes a string as code',
  dynamic.length === 0, dynamic.map(f => relative(root, f)).join(', '));

const stringTimers = sources.filter(f => /set(Timeout|Interval)\s*\(\s*['"`]/.test(codeOf(f)));
ok('no timer is given a string body, which is eval by another name',
  stringTimers.length === 0, stringTimers.map(f => relative(root, f)).join(', '));

/* ================================================ 2. prototype pollution */

const unpolluted = () => ({}).polluted === undefined && ({}).pwned === undefined &&
  Object.prototype.polluted === undefined && Object.keys({}).length === 0;

const pollute = (label, doc) => {
  try { migrate(doc); } catch { /* refusing the document outright is also a pass */ }
  ok(label, unpolluted());
};

const withParams = (json) => {
  const d = JSON.parse(JSON.stringify(newDocument('x')));
  d.features = [{
    id: 'a', type: 'box', name: 'n', inputs: [], params: JSON.parse(json),
    transform: { pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
  }];
  return d;
};
pollute('a __proto__ key in feature params does not reach Object.prototype',
  withParams('{"__proto__":{"polluted":1},"w":10}'));
pollute('nor a constructor.prototype route',
  JSON.parse('{"schema":3,"meta":{"name":"x"},"features":[],"params":[],"constructor":{"prototype":{"pwned":1}}}'));
pollute('nor a __proto__ on the document itself',
  JSON.parse('{"schema":3,"meta":{"name":"x"},"features":[],"params":[],"__proto__":{"polluted":1}}'));
pollute('nor one inside a transform',
  JSON.parse('{"schema":3,"meta":{"name":"x"},"params":[],"features":[{"id":"a","type":"box","name":"n","inputs":[],"params":{},"transform":{"__proto__":{"polluted":1},"pos":[0,0,0]}}]}'));

/**
 * A feature id that is not usable as an object key.
 *
 * The pollution checks above ask whether a hostile document can reach
 * `Object.prototype`. This asks the quieter question next to it: whether a
 * document can carry an id that makes the application lose work without
 * saying so. It can, or could.
 *
 * Every id-keyed map in the project - `sim.tracks`, `sim.schedule.items`,
 * `sim.dynamics.bodies`, in doc.js, the inspector, the command registry and
 * both chat planners - is written as `map[feature.id] = …`. For every string
 * but one that is a key. `map['__proto__'] = value` invokes the prototype
 * setter instead, so the write does nothing and the read is undefined. The 4D
 * chat reported "1 body dijadwalkan" against a timeline holding no rows, and
 * nothing threw.
 *
 * `uid()` cannot produce it, so it arrives from a file - and a `.tcad` is
 * JSON, where `JSON.parse` creates a real own `__proto__` property that an
 * object literal would not. That is the path tested here.
 *
 * Only `__proto__` behaves this way; `constructor`, `prototype`, `toString`
 * and `__defineGetter__` all become ordinary own properties, which is why the
 * fix tests the property rather than matching a list of names.
 */
{
  const raw = JSON.parse(`{
    "schema": 3, "meta": { "name": "hostile" }, "params": [],
    "features": [
      { "id": "__proto__", "type": "box", "name": "A", "inputs": [], "params": { "w": 40, "d": 40, "h": 20 },
        "transform": { "pos": [0,0,0], "rot": [0,0,0], "scale": [1,1,1] } },
      { "id": "b", "type": "boolean", "name": "B", "inputs": ["__proto__"], "params": { "op": "union" },
        "transform": { "pos": [0,0,0], "rot": [0,0,0], "scale": [1,1,1] } }
    ],
    "sim": { "schedule": { "enabled": true, "items": { "__proto__": { "start": 5, "dur": 2, "mode": "grow", "enabled": true } } },
             "tracks": { "__proto__": { "props": { "pz": [ {"t":0,"v":0}, {"t":1,"v":50} ] } } } }
  }`);
  ok('a JSON document really can carry a __proto__ key, so this is not a hypothetical',
    Object.prototype.hasOwnProperty.call(raw.sim.schedule.items, '__proto__'));

  const safe = migrate(raw);
  const id = safe.features[0].id;
  ok('an unusable feature id is renamed rather than kept', id !== '__proto__', id);
  ok('and renamed to one that actually holds a value', (() => {
    const probe = {};
    probe[id] = 1;
    return Object.prototype.hasOwnProperty.call(probe, id);
  })());
  ok('the feature is renamed, not dropped: no geometry is lost',
    safe.features.length === 2, `${safe.features.length} features`);
  ok('and every reference to it is carried across, so the tree still builds',
    safe.features[1].inputs[0] === id, JSON.stringify(safe.features[1].inputs));
  ok('its schedule row moves with it', !!safe.sim.schedule.items[id] &&
    safe.sim.schedule.items[id].start === 5, JSON.stringify(safe.sim.schedule.items[id]));
  ok('its keyframes move with it too', !!safe.sim.tracks[id]);
  ok('and nothing is left behind under the old key',
    !Object.prototype.hasOwnProperty.call(safe.sim.schedule.items, '__proto__'));
  ok('while Object.prototype is still untouched', unpolluted());

  // The check must not be vacuous: an ordinary id has to survive unchanged,
  // or a "fix" that renames everything would pass this section.
  const plain = JSON.parse(`{ "schema": 3, "meta": { "name": "ok" }, "params": [],
    "features": [ { "id": "keepme", "type": "box", "name": "A", "inputs": [], "params": {},
      "transform": { "pos": [0,0,0], "rot": [0,0,0], "scale": [1,1,1] } } ] }`);
  ok('an ordinary feature id is left exactly as it was',
    migrate(plain).features[0].id === 'keepme');
}

const { scope } = buildScope([{ id: 'p', name: '__proto__', value: 1 }, { id: 'q', name: 'width', value: 60 }]);
ok('the expression scope has a null prototype, so a name cannot collide with it',
  Object.getPrototypeOf(scope) === null);
ok('a parameter called __proto__ therefore pollutes nothing', unpolluted());
ok('while ordinary parameters still resolve', scope.width === 60);

for (const name of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf']) {
  const r = tryEval(name, buildScope([]).scope);
  ok(`an expression cannot read Object.prototype.${name}`, r.ok === false, r.error);
}

/* ==================================== 3. resource exhaustion on opening */

const attack = (label, type, params, { maxMs = 4000, maxTris = 600000 } = {}) => {
  const d = newDocument('hostile');
  d.params = [];
  const f = makeFeature(type, { name: 'x' });
  f.params = { ...f.params, ...params };
  d.features = [f];
  const m = migrate(d);
  invalidateCache();
  const started = Date.now();
  let tris = 0, threw = null;
  try { tris = rebuild(m).stats.tris; } catch (e) { threw = e.message; }
  const ms = Date.now() - started;
  ok(label, !threw && ms < maxMs && tris <= maxTris,
    threw ? `threw: ${threw}` : `${tris} triangles in ${ms} ms`);
};

attack('a segment count of a billion is clamped, not attempted', 'cylinder', { seg: 1e9 });
attack('a negative segment count cannot invert a loop', 'cylinder', { seg: -5 });
attack('a non-finite segment count falls back to the catalogue default', 'cylinder', { seg: NaN });
attack('a torus cannot be asked for ten billion quads', 'torus', { seg: 1e5, tseg: 1e5 });
attack('a helix of a million turns is clamped', 'helix', { turns: 1e6, steps: 1e7, seg: 1e4 });
attack('a prism cannot have a hundred million sides', 'prism', { sides: 1e8 });
attack('an absurd radius does not produce absurd geometry', 'cylinder', { r: 1e308 });

ok('every clamped value lands inside the range the catalogue declares', (() => {
  for (const [type, cat] of Object.entries(CATALOG)) {
    const hostile = {};
    for (const f of cat.fields || []) if (f.kind === 'int' || f.kind === 'num') hostile[f.key] = 1e12;
    const out = sanitiseParams(type, { ...cat.params, ...hostile });
    for (const f of cat.fields || []) {
      if (typeof out[f.key] !== 'number') continue;
      if (f.max != null && out[f.key] > f.max) return false;
      if (f.min != null && out[f.key] < f.min) return false;
    }
  }
  return true;
})());

const helixClamped = sanitiseParams('helix', { R: 25, r: 4, pitch: 14, turns: 1e6, seg: 1e6, steps: 1e6 });
ok('and the product of the segment counts is held under its ceiling',
  helixClamped.seg * helixClamped.steps * helixClamped.turns <= SEGMENT_PRODUCT_CEILING * 1.001,
  JSON.stringify(helixClamped));
ok('a select field cannot be set to something outside its options',
  sanitiseParams('boolean', { op: 'rm -rf /' }).op === 'union',
  String(sanitiseParams('boolean', { op: 'rm -rf /' }).op));
ok('expressions are left alone, since a string cannot be range-checked',
  sanitiseParams('cylinder', { r: 'width * 2', seg: 48 }).r === 'width * 2');

let started = Date.now();
const deep = tryEval('('.repeat(20000) + '1' + ')'.repeat(20000), {});
ok('a deeply nested expression is refused rather than crashing the tab',
  !deep.ok && Date.now() - started < 2000, `${Date.now() - started} ms`);
ok('and its message is written for a person, not copied from the engine',
  /bersarang terlalu dalam/.test(deep.error) && !/call stack/i.test(deep.error), deep.error);

started = Date.now();
ok('a huge exponent cannot hang or yield a non-finite dimension',
  tryEval('9^9^9', {}).ok === false && Date.now() - started < 500);

started = Date.now();
const long = tryEval('1' + '+1'.repeat(200000), {});
ok('a two-hundred-thousand term expression still finishes quickly',
  long.ok && Date.now() - started < 4000, `${Date.now() - started} ms`);

/* ========================================= 4. injection through documents */

/**
 * Markup that would actually run something, as opposed to text that merely
 * mentions it.
 *
 * The distinction matters and is easy to get wrong: an escaped payload sitting
 * inside a text node still contains the characters "onerror=", so a naive
 * search for that substring reports a hole where the escaping worked. What is
 * dangerous is a tag being opened, or an event attribute appearing inside a
 * tag, so that is what these look for.
 */
const INJECTED_ELEMENT = /<\s*(script|img|iframe|object|embed|foreignObject|animate|set)\b/i;
const EVENT_ATTRIBUTE = /<[^>]*\s(on\w+)\s*=/i;
const dangerous = (markup) => INJECTED_ELEMENT.exec(markup) || EVENT_ATTRIBUTE.exec(markup);
const isInert = (markup) => !dangerous(markup);

// Prove the detector is not vacuous: it must flag real injections.
ok('the injection detector catches an unescaped element',
  !isInert('<svg><text>x</text><script>alert(1)</script></svg>'));
ok('and an unescaped event attribute',
  !isInert('<svg><image href="x" onerror="alert(1)"/></svg>'));
ok('while passing markup where the payload is escaped text',
  isInert('<svg><text>&lt;img src=x onerror=alert(1)&gt;</text></svg>'));

const NUL = String.fromCharCode(0);
const PAYLOADS = [
  '</text><script>window.x=1</' + 'script><text>',
  '"><img src=x onerror=alert(1)>',
  "'; DROP TABLE features; --",
  '${alert(1)}',
  `${NUL}<svg onload=alert(1)>`,
];

for (const payload of PAYLOADS) {
  const geo = buildPrimitive('box', { w: 40, d: 30, h: 10 });
  const mp = massProperties(geo);
  const feat = makeFeature('box', { name: payload });
  feat.material = payload;
  const doc = newDocument(payload);
  doc.meta.author = payload;
  doc.features = [feat];
  doc.params = [];
  doc.configs = { active: 'c', list: [{ id: 'c', name: payload, overrides: {} }] };
  const bodies = [{ geometry: geo, matrix: null, box: mp.box, size: mp.size, feature: feat }];
  const build = {
    scope: {},
    results: new Map([[feat.id, { error: null, instances: [{}] }]]),
    topLevel: [feat],
    stats: { volume: mp.volume, area: mp.area, mass: 0.1, tris: 12, box: mp.box, centroid: mp.centroid },
  };
  const svg = sheetToSVG(buildSheet(bodies, { doc, build, sheet: 'a3l', hlr: false }));
  ok(`a document named ${JSON.stringify(payload.slice(0, 20))} cannot inject into the drawing`,
    isInert(svg), (dangerous(svg) || []).slice(0, 1).join(''));
}

const hostileSpec = `part "x"\nparam __proto__ = 1\nfeature box "<img src=x onerror=alert(1)>"\n  w = 10\n  d = 10\n  h = 10\n`;
const parsedSpec = Spec.fromSpec(hostileSpec);
ok('a spec cannot declare a parameter named __proto__',
  !parsedSpec.doc && parsedSpec.errors.some(e => /kata cadangan/.test(e.message)),
  JSON.stringify(parsedSpec.errors.map(e => e.message)).slice(0, 90));
ok('and parsing a hostile spec pollutes nothing', unpolluted());

const nameOnly = Spec.fromSpec(`part "x"\nfeature box "<script>x</script>"\n  w = 10\n  d = 10\n  h = 10\n`);
ok('a feature name is stored as text, never interpreted',
  nameOnly.doc && nameOnly.doc.features[0].name === '<script>x</script>',
  nameOnly.doc?.features[0].name);
ok('and it round trips as text rather than becoming markup',
  Spec.toSpec(nameOnly.doc).text.includes('"<script>x</script>"'));

const imported = Dev.importIntent({
  format: 'tessercad.design-intent',
  document: { name: '<img src=x onerror=alert(1)>', units: 'mm' },
  parameters: [{ name: '__proto__', expression: 1 }],
  features: [{ name: 'a', type: 'box', parameters: { w: 1e12, seg: 1e12 }, consumes: [] }],
});
ok('an intent file cannot pollute through a parameter name', unpolluted());
ok('and its numbers are finite once the document is migrated', (() => {
  if (!imported.doc) return true;
  return migrate(imported.doc).features
    .every(f => Object.values(f.params).every(v => typeof v !== 'number' || Number.isFinite(v)));
})());

/* =============================================== 5. malformed file imports */

const dxfCases = {
  'an empty file': '',
  'a file that is not DXF at all': 'hello world',
  'a truncated entity': '0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n',
  'NaN and Infinity coordinates': '0\nSECTION\n2\nENTITIES\n0\nLINE\n10\nNaN\n20\nInfinity\n11\nabc\n21\n5\n0\nENDSEC\n0\nEOF',
  'coordinates at the float limit': '0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n1e308\n20\n1e308\n11\n-1e308\n21\n0\n0\nENDSEC\n0\nEOF',
  'a layer named __proto__': '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n__proto__\n10\n0\n20\n0\n11\n1\n21\n1\n0\nENDSEC\n0\nEOF',
};
for (const [label, src] of Object.entries(dxfCases)) {
  let out = null, threw = null;
  const t = Date.now();
  try { out = fromDXF(src); } catch (e) { threw = e.message; }
  const finite = !out || (out.entities || []).every(e => !/NaN|Infinity/.test(JSON.stringify(e)));
  ok(`the DXF importer survives ${label}`,
    !threw && finite && Date.now() - t < 2000,
    threw ? `threw: ${threw}` : `${out?.entities?.length ?? 0} entities, all finite: ${finite}`);
}
ok('importing DXF pollutes nothing', unpolluted());

/* ================================================ 6. export file naming */

ok('a filename cannot escape its directory',
  !safeName('../../etc/passwd', '.stl').includes('/') && !safeName('..\\..\\win.ini', '.stl').includes('\\'),
  `${safeName('../../etc/passwd', '.stl')} | ${safeName('..\\..\\win.ini', '.stl')}`);
ok('a filename is never empty', safeName('', '.stl').length > 4 && safeName('   ', '.stl').length > 4,
  JSON.stringify(safeName('', '.stl')));
ok('quotes, angle brackets, newlines and NUL are stripped',
  !new RegExp(`["'<>\\n${NUL}]`).test(safeName(`a"b<c>${NUL}d\ne`, '.stl')),
  safeName(`a"b<c>${NUL}d\ne`, '.stl'));
ok('the extension appears exactly once',
  safeName('part.stl', '.stl') === 'part.stl' && safeName('part', '.stl') === 'part.stl');

/* ========================================= 7. the policy in index.html */

const html = readFileSync(join(root, 'index.html'), 'utf8');
const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html) || [])[1] || '';
ok('index.html carries a Content-Security-Policy', !!csp);
ok('it denies everything by default', /default-src 'none'/.test(csp), csp.slice(0, 36));
ok('no origin other than this one may serve a script',
  /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/.test(csp) && !/script-src[^;]*(https?:|\*)/.test(csp),
  (/script-src[^;]*/.exec(csp) || [''])[0]);
ok('script-src allows neither unsafe-inline nor unsafe-eval',
  !/script-src[^;]*unsafe-(inline|eval)/.test(csp));
ok('no network origin is reachable at all',
  !/connect-src[^;]*(https?:|\*)/.test(csp), (/connect-src[^;]*/.exec(csp) || [''])[0]);
ok('objects and form submissions are denied outright',
  /object-src 'none'/.test(csp) && /form-action 'none'/.test(csp));
ok('the document cannot be re-based to another origin', /base-uri 'none'/.test(csp));

const inlineScripts = (html.match(/<script(?![^>]*\bsrc=)/g) || []).length;
ok('exactly one inline script remains, the import map', inlineScripts === 1, String(inlineScripts));

const mapBody = (/<script type="importmap">([\s\S]*?)<\/script>/.exec(html) || [])[1] || '';
ok('and the policy pins it by a hash that matches what the browser reads',
  csp.includes(`'sha256-${createHash('sha256').update(mapBody, 'utf8').digest('base64')}'`));

/* ============================================= 8. no outbound network code */

const netCalls = [];
for (const f of sources) {
  if (/tools\/tests\//.test(f)) continue;
  for (const m of codeOf(f).matchAll(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/g)) {
    netCalls.push(`${relative(root, f)}: ${m[1]}`);
  }
}
// Only runtime code counts: tools/ contains the service-worker generator,
// whose output legitimately mentions fetch, and it never ships to a browser.
// The one runtime use is the PNG export reading its own canvas snapshot, which
// is a data: URL. Anything else here needs a reason, and the policy would
// block it regardless.
const runtimeNetCalls = netCalls.filter(c => !c.startsWith('tools/'));
ok('the only network API in runtime code is the one same-origin data: read',
  runtimeNetCalls.every(c => c === 'src/io/io.js: fetch'), runtimeNetCalls.join(', ') || 'none');
ok('and the generated service worker only ever fetches same-origin requests',
  /url\.origin !== self\.location\.origin/.test(readFileSync(join(root, 'sw.js'), 'utf8')));

// Runtime code only, which here means everything except the test tooling.
// `tools/` never reaches a browser: it holds the service-worker generator,
// whose output legitimately mentions fetch, and the browser suites, one of
// which must name an external origin because its whole job is to prove the
// policy refuses one. Excluding a directory from a security check is how blind
// spots are made, so the exclusion is paid for by the assertion below it:
// the attack suite is required to still contain the attack.
const thirdParty = sources.filter((f) => {
  if (/tools[\\/]/.test(relative(root, f))) return false;
  return /https?:\/\/(?!github\.com\/samuelhtampubolon|localhost|127\.0\.0\.1|www\.w3\.org)/
    .test(codeOf(f));
});
ok('no source file references a third-party origin',
  thirdParty.length === 0, thirdParty.map(f => relative(root, f)).join(', '));

// Paying for the exclusion above: the browser suite that attacks the policy
// must still be attacking it. If someone deletes those three attacks, this
// fails rather than the project quietly losing its only external check that
// the Content-Security-Policy does anything at all.
const cspSuite = join(root, 'tools/browser/csp.mjs');
const cspSource = existsSync(cspSuite) ? readFileSync(cspSuite, 'utf8') : '';
ok('the browser suite still attacks the policy with a real external origin',
  /https:\/\/example\.com/.test(cspSource) &&
  /document\.createElement\('script'\)/.test(cspSource) &&
  /fetch\('https:/.test(cspSource),
  cspSource ? 'present' : 'tools/browser/csp.mjs is missing');

/* ===================================== 9. nothing dynamic reaches innerHTML */

/**
 * `el(tag, { html })` writes its argument into innerHTML, and most callers
 * pass a fixed sentence containing a `<code>` or a `<kbd>`. That is fine until
 * a caller passes something a user typed, which is what happened: the
 * feature-tree filter interpolated the search box's contents into the "No
 * match" message. Typing a tag there really did build the element. The policy
 * refused the script it carried, so it was never a working XSS - but an
 * injection that only a Content-Security-Policy prevents is one directive away
 * from being one, and injected markup on its own is enough to redress the
 * interface into something that asks for a password.
 *
 * So every `html:` argument must be a literal, or be named here with the
 * reason it is safe. An allowlist is the honest shape for this: the two
 * dynamic sinks that remain are real, and pretending otherwise by writing a
 * cleverer regex would only hide them.
 */
// A complete string literal after `html:` - single, double or backtick with no
// interpolation. Matching the whole literal matters: a first attempt stopped at
// the first comma and so reported every sentence containing one as dynamic.
const HTML_LITERAL = /\bhtml:\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\$]|\\.)*`)\s*[,}]/;
const HTML_ANY = /\bhtml:\s*/g;

const REVIEWED_DYNAMIC = [
  // Escapes every interpolated value through esc() before it reaches the
  // string, and is attacked with five XSS payloads earlier in this suite.
  'sheetToSVG(',
  // A module-level constant list of function names, not user input.
  'EXPR_HELP.map(',
  // shell.js's own el() and emptyState(): these *are* the sink. What matters
  // is what callers hand them, which is what the rest of this check covers.
  'html: v',
  'html: body',
];

const htmlSinks = [];
for (const f of sources) {
  const rel = relative(root, f);
  if (!rel.startsWith('src/')) continue;
  const body = codeOf(f);
  for (const m of body.matchAll(HTML_ANY)) {
    const tail = body.slice(m.index, m.index + 400);
    if (HTML_LITERAL.test(tail)) continue;                       // a fixed string
    if (REVIEWED_DYNAMIC.some(x => tail.includes(x))) continue;  // named above
    htmlSinks.push(`${rel}: ${tail.split('\n')[0].slice(0, 70)}`);
  }
}
ok('every innerHTML argument is a literal or a reviewed, escaping source',
  htmlSinks.length === 0, htmlSinks.join(' | '));

// Not vacuous: the exact shape the bug had must read as dynamic, and an
// ordinary sentence - commas and all - must read as safe.
ok('the detector reads an interpolated template as dynamic',
  !HTML_LITERAL.test('html: `Nothing called ${filterText}.`,'));
ok('and a literal containing commas and tags as safe',
  HTML_LITERAL.test("html: 'Press <kbd>G</kbd>, then <kbd>X</kbd>, then type.',"));

/**
 * The pinned hash is over bytes, so the bytes have to be the same everywhere.
 *
 * Git on Windows checks out text as CRLF by default. That changes index.html's
 * bytes, which changes the hash of the inline import map, which makes the
 * browser refuse the map and resolve no modules - the application does not
 * start at all. On the hosted copy this never showed, because the blob served
 * from the repository is LF; it showed the first time a Windows runner built
 * the desktop package, which bundles files from a Windows checkout, and would
 * have shipped an .exe that could not boot.
 *
 * .gitattributes is the fix, so .gitattributes is checked.
 */
const attributesPath = join(root, '.gitattributes');
const attributes = existsSync(attributesPath) ? readFileSync(attributesPath, 'utf8') : '';
ok('a .gitattributes exists, so checkouts do not differ by platform',
  attributes.length > 0, 'missing: a Windows clone would hash differently');
ok('and it forces LF in the working tree, which is what the pinned hash assumes',
  /^\s*\*\s+text=auto\s+eol=lf\s*$/m.test(attributes),
  'expected a line: * text=auto eol=lf');

// The hash in the policy must be the one for the bytes as committed. This is
// what tools/check-csp.mjs computes; asserted here too so the security suite
// fails on its own rather than relying on a separate script having been run.
const indexSource = readFileSync(join(root, 'index.html'), 'utf8');
const mapMatch = /<script type="importmap">([\s\S]*?)<\/script>/.exec(indexSource);
ok('the import map is present and inline, as the policy assumes', !!mapMatch);
if (mapMatch) {
  const digest = createHash('sha256').update(mapMatch[1], 'utf8').digest('base64');
  ok('and the policy pins the hash of exactly those bytes',
    indexSource.includes(`'sha256-${digest}'`), `computed sha256-${digest}`);
  const crlfDigest = createHash('sha256')
    .update(mapMatch[1].replace(/\r?\n/g, '\r\n'), 'utf8').digest('base64');
  ok('the two differ, so this check is not vacuous', digest !== crlfDigest);
  ok('and the CRLF hash is not what is pinned, which is the bug this caught',
    !indexSource.includes(`'sha256-${crlfDigest}'`));
}

/* ==================================== 9. the build is supply chain too */

/**
 * A workflow is code that runs with a token against this repository, so the
 * two properties that decide what a compromised dependency could do there are
 * asserted here rather than left to review.
 *
 * A mutable tag is the weak link. `uses: someone/action@v2` fetches whatever
 * `v2` points at on the day the job runs, and the owner can repoint it. For an
 * action in a job that holds `contents: write`, that is a write to this
 * repository by someone else's later decision. GitHub's own actions are held
 * to a softer standard here only because the same account owns the runner, the
 * token and the platform: there is no separate party to compromise.
 */
const workflowDir = join(root, '.github', 'workflows');
const workflows = existsSync(workflowDir)
  ? readdirSync(workflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
  : [];

ok('the repository has workflows to check at all', workflows.length > 0, `${workflows.length} found`);

const noPermissions = [];
const looseThirdParty = [];
for (const file of workflows) {
  const text = readFileSync(join(workflowDir, file), 'utf8');
  // A top-level `permissions:` sits at column zero; a job-level one is indented.
  if (!/^permissions:/m.test(text)) noPermissions.push(file);
  for (const m of text.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) {
    const ref = m[1];
    if (ref.startsWith('./') || ref.startsWith('docker://')) continue;
    const [name, version = ''] = ref.split('@');
    if (name.startsWith('actions/') || name.startsWith('github/')) continue;
    if (!/^[0-9a-f]{40}$/.test(version)) looseThirdParty.push(`${file}: ${ref}`);
  }
}

ok('every workflow states the token scope it needs instead of inheriting one',
  noPermissions.length === 0, noPermissions.join(', '));
ok('every third-party action is pinned to a commit, not to a tag its owner can move',
  looseThirdParty.length === 0, looseThirdParty.join(', '));

// A check that cannot fail proves nothing: make sure the pattern really does
// reject the tag form it is meant to reject.
ok('and that check would reject a tag', !/^[0-9a-f]{40}$/.test('v2'));

/**
 * Exactly one workflow may publish the site, and it must run the tests first.
 *
 * GitHub offers starter workflows for Pages, and enabling Pages invites you to
 * add one. Two of them were added here while Pages was being switched on:
 * `static.yml` and `jekyll-gh-pages.yml`, alongside the `pages.yml` this
 * repository already had. All three fired on every push to main, all three
 * declared `concurrency: group: pages`, and which one actually published was
 * then a race - the runs show two cancelled and one succeeded, with no rule
 * about which.
 *
 * Two things were wrong with that, and the second is the reason this check is
 * in the security suite rather than filed as tidiness:
 *
 *   Neither starter runs the tests. `pages.yml` gates deployment on a `test`
 *   job, so a commit that breaks the geometry engine cannot reach the public
 *   site. A starter workflow winning the race publishes it anyway. An
 *   application whose front page is its own live demo has that page as part
 *   of its integrity story.
 *
 *   The Jekyll starter is actively wrong for this repository, which carries a
 *   `.nojekyll` file precisely because it is not a Jekyll site: it is plain ES
 *   modules whose index.html pins an inline import map by SHA-256. Anything
 *   that rewrites those bytes breaks the policy and the app stops loading.
 *
 * So: one publisher, and it gates on tests. Asserted rather than remembered,
 * because the invitation to add a starter workflow comes back every time
 * someone visits the Pages settings page.
 */
const publishers = workflows.filter((file) => {
  const text = readFileSync(join(workflowDir, file), 'utf8');
  return /uses:\s*actions\/deploy-pages@/.test(text);
});
ok('exactly one workflow publishes to GitHub Pages, so which one wins is not a race',
  publishers.length === 1, publishers.join(', ') || 'none');
if (publishers.length === 1) {
  // Read as two facts rather than by carving the deploy job out of the YAML:
  // there is a job that runs `npm test`, and the deploying job declares it as
  // a dependency. A first attempt matched the job block with a regex using
  // `\Z`, which is not JavaScript and matched nothing, so the check failed on
  // a workflow that was correct. Two plain assertions cannot go wrong that way.
  const text = readFileSync(join(workflowDir, publishers[0]), 'utf8');
  ok('and it runs the test suite before it publishes anything',
    /^\s*run:\s*npm test\s*$/m.test(text) && /^\s*needs:\s*test\s*$/m.test(text),
    publishers[0]);
}
ok('no workflow hands this repository to Jekyll, which would rewrite the hashed import map',
  !workflows.some(f => /jekyll/i.test(f)
    || /uses:\s*actions\/jekyll-build-pages@/.test(readFileSync(join(workflowDir, f), 'utf8'))),
  workflows.filter(f => /jekyll/i.test(f)).join(', '));

/* ------------------------------------------------- a timeline that ends */

/**
 * A document cannot ask the simulator for infinite work.
 *
 * `migrate()` clamped every feature parameter and then merged `sim` in with a
 * bare object spread beside it, so `duration`, `gravity`, `groundZ`, schedule
 * rows and keyframe times were whatever the file said. `{"duration":1e999}` is
 * valid JSON and `JSON.parse` returns `Infinity`, which reached two loops:
 *
 *   sim.js bake()         `frames = Math.ceil(Infinity * fps) + 1` is
 *                         `Infinity`, and the loop's only exit is
 *                         `f === frames - 1`, which a finite `f` never is.
 *                         With no bodies it allocates nothing as it spins, so
 *                         it is not an out-of-memory the browser can kill.
 *
 *   timelineui drawRuler  a canvas path operation per tick, measured at 64
 *                         million iterations in three seconds and climbing.
 *
 * Reachable in one click: open the file, then the Simulasi tab, which calls
 * `sim.seek()` and `timeline.render()`. The checks below are on the boundary
 * rather than on the loops, because the boundary is what a file passes
 * through; the loops carry their own ceiling as a second line and are read
 * from the source here so that removing either one fails.
 */
{
  const hostile = (sim) => migrate(JSON.parse(`{ "schema": 3, "meta": { "name": "x", "units": "mm" },
    "params": [], "features": [], "sim": ${sim} }`));

  const inf = hostile('{"duration":1e999,"fps":30}');
  ok('an infinite duration is refused at the boundary, not passed to the simulator',
    Number.isFinite(inf.sim.duration), String(inf.sim.duration));
  ok('and the frame count it produces is finite',
    Number.isFinite(Math.ceil(inf.sim.duration * inf.sim.fps) + 1));

  ok('a duration written as a string is typed, not multiplied',
    typeof hostile('{"duration":"1e999","fps":30}').sim.duration === 'number');
  ok('a merely enormous duration is bounded too, since 1e12 hangs just as well',
    hostile('{"duration":999999999999}').sim.duration <= 36000,
    String(hostile('{"duration":999999999999}').sim.duration));
  ok('a negative duration cannot invert the timeline',
    hostile('{"duration":-5}').sim.duration > 0, String(hostile('{"duration":-5}').sim.duration));

  const dyn = hostile('{"dynamics":{"enabled":true,"gravity":1e999,"groundZ":-1e999,"airDrag":50,"substeps":1e9,"bodies":{"a":{"mass":1e999,"bounce":99,"friction":-3,"vel":[1e999,0,0]}}}}');
  ok('gravity, ground and drag are all finite after a hostile file',
    [dyn.sim.dynamics.gravity, dyn.sim.dynamics.groundZ, dyn.sim.dynamics.airDrag].every(Number.isFinite),
    JSON.stringify([dyn.sim.dynamics.gravity, dyn.sim.dynamics.groundZ, dyn.sim.dynamics.airDrag]));
  ok('substeps cannot ask for a billion integration steps per frame',
    dyn.sim.dynamics.substeps <= 16, String(dyn.sim.dynamics.substeps));
  ok('and per-body physics is clamped to its own ranges', (() => {
    const b = dyn.sim.dynamics.bodies.a;
    return Number.isFinite(b.mass) && b.bounce <= 1 && b.friction >= 0 && b.vel.every(Number.isFinite);
  })(), JSON.stringify(dyn.sim.dynamics.bodies.a));

  const sched = hostile('{"duration":10,"schedule":{"enabled":true,"items":{"a":{"start":1e999,"dur":-1e999}}},"tracks":{"a":{"props":{"pz":[{"t":1e999,"v":1e999},{"t":0,"v":0}]}}}}');
  ok('a schedule row cannot start at infinity, which would hide a body for ever',
    Number.isFinite(sched.sim.schedule.items.a.start) && Number.isFinite(sched.sim.schedule.items.a.dur),
    JSON.stringify(sched.sim.schedule.items.a));
  ok('keyframe times and values are finite, and sorted into order',
    sched.sim.tracks.a.props.pz.every(k => Number.isFinite(k.t) && Number.isFinite(k.v))
    && sched.sim.tracks.a.props.pz[0].t <= sched.sim.tracks.a.props.pz[1].t,
    JSON.stringify(sched.sim.tracks.a.props.pz));

  // Not vacuous: an ordinary simulation setup has to come through untouched.
  const fine = hostile('{"duration":12.5,"fps":24,"dynamics":{"enabled":true,"gravity":-9810,"substeps":6,"bodies":{"a":{"mass":2.5,"bounce":0.5,"friction":0.3}}},"schedule":{"enabled":true,"items":{"a":{"start":1,"dur":3}}}}');
  ok('a legitimate simulation is not altered by any of this',
    fine.sim.duration === 12.5 && fine.sim.fps === 24 && fine.sim.dynamics.substeps === 6
    && fine.sim.dynamics.bodies.a.mass === 2.5 && fine.sim.schedule.items.a.start === 1,
    JSON.stringify({ d: fine.sim.duration, f: fine.sim.fps, s: fine.sim.dynamics.substeps }));

  // And the one place in the interface that writes a duration without going
  // through any of this. Found while reading the diff rather than by the
  // audit: `type="number"` accepts a typed value of any magnitude, and this
  // handler stored it straight into the document.
  const tlSrcIn = readFileSync(join(root, 'src/ui/timelineui.js'), 'utf8');
  ok('the duration input cannot store a value the timeline cannot draw',
    /Number\.isFinite\(typed\)/.test(tlSrcIn) && /max: DURASI_MAX/.test(tlSrcIn)
    && !/Math\.max\(0\.1, parseFloat\(dur\.value\)/.test(tlSrcIn));
  ok('and the bound it uses is the same one the file boundary uses, not a second copy',
    /DURASI_MIN|DURASI_MAX/.test(tlSrcIn)
    && /export const DURASI_MAX/.test(readFileSync(join(root, 'src/core/doc.js'), 'utf8')));

  // The two loops keep their own guard, because a document built in memory
  // never passes the boundary above.
  const simSrc = readFileSync(join(root, 'src/sim/sim.js'), 'utf8');
  ok('bake() bounds its own frame count, for a document that never came from a file',
    /FRAME_CEILING/.test(simSrc) && /Number\.isFinite\(want\)/.test(simSrc));
  const tlSrc = readFileSync(join(root, 'src/ui/timelineui.js'), 'utf8');
  ok('and the ruler will not loop on a duration it cannot draw',
    /Number\.isFinite/.test(tlSrc) && !/store\.doc\.sim\.duration \* this\.pxPerSec/.test(tlSrc));
}

/**
 * A feature's placement is validated like its parameters.
 *
 * `transform` was the one part of a feature `migrate()` never looked at. A
 * `.tcad` with `"pos":[1e999,0,0]` built nothing: `rebuild()` returned
 * `bodies: 0` and `bounds: undefined` with no error, which reads as a feature
 * that silently vanished. And it corrupted on the way out, because
 * `JSON.stringify(Infinity)` is `null`: saving wrote `null`, the next load
 * read `Number(null)` as `0`, and the feature moved to the origin unasked.
 */
{
  const placed = (t) => migrate(JSON.parse(`{ "schema": 3, "meta": { "name": "x", "units": "mm" }, "params": [],
    "features": [ { "id": "a", "type": "box", "name": "A", "inputs": [], "params": {}, "transform": ${t} } ] }`));

  const wild = placed('{"pos":[1e999,0,-1e999],"rot":[1e999,0,0],"scale":[1e999,1,1]}');
  const t = wild.features[0].transform;
  ok('a non-finite position is replaced rather than carried into the scene',
    t.pos.every(Number.isFinite), JSON.stringify(t.pos));
  ok('and so are rotation and scale',
    t.rot.every(Number.isFinite) && t.scale.every(Number.isFinite),
    JSON.stringify([t.rot, t.scale]));
  ok('a missing transform still comes back complete',
    placed('{}').features[0].transform.pos.length === 3);
  ok('an ordinary placement survives exactly',
    JSON.stringify(placed('{"pos":[10,-20,30],"rot":[0,90,0],"scale":[1,1,2]}').features[0].transform.pos) === '[10,-20,30]');
  // Expressions are the documented exception, and rewriting one would break
  // every feature that places itself from a parameter.
  ok('a position written as an expression is left for the evaluator',
    placed('{"pos":["width * 2",0,0]}').features[0].transform.pos[0] === 'width * 2');
}

/* ----------------------------------------- catalogues that answer honestly */

/**
 * A lookup table must not answer for names it never declared.
 *
 * `CATALOG[f.type]`, `MATERIALS[f.material]` and `units in UNITS` all validate
 * a string that arrives from a file by indexing an object literal. A literal
 * inherits from `Object.prototype`, so all three answered truthily for
 * `constructor`, `toString`, `valueOf`, `hasOwnProperty` and `__proto__`.
 *
 * `{"type":"constructor","params":{"w":1}}` made `sanitiseParams` read
 * `Object.params.w` and throw, so the document would not open; with no params
 * the feature survived `migrate()` with a type whose `label`, `glyph` and
 * `fields` were all undefined. `units:"constructor"` passed the `in` test and
 * left every dimension rendering at `toFixed(undefined)`. The design-intent
 * importer accepted the same type with no error at all.
 *
 * The fix is one line at the tables rather than a guard at each of the forty
 * lookup sites, so the question cannot be asked anywhere.
 */
{
  const inherited = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'prototype', 'isPrototypeOf'];
  for (const [name, table] of [['CATALOG', CATALOG], ['MATERIALS', MATERIALS], ['UNITS', UNITS]]) {
    ok(`${name} has no prototype to inherit an answer from`,
      Object.getPrototypeOf(table) === null);
    ok(`so ${name} refuses every inherited name, by lookup and by \`in\``,
      inherited.every(k => table[k] === undefined && !(k in table)),
      inherited.filter(k => table[k] !== undefined || k in table).join(', '));
    ok(`while ${name} still answers for what it does declare`,
      Object.keys(table).length > 3 && Object.values(table).every(v => v && typeof v === 'object'));
  }

  const crafted = JSON.parse(`{ "schema": 3, "meta": { "name": "x", "units": "constructor" }, "params": [],
    "features": [ { "id": "aaa", "type": "constructor", "params": { "w": 1 }, "inputs": [] },
                  { "id": "bbb", "type": "toString", "params": {}, "inputs": [] } ] }`);
  let migrated = null, threw = null;
  try { migrated = migrate(crafted); } catch (e) { threw = e; }
  ok('a document whose feature type is an inherited name does not throw on open',
    !threw, threw && threw.message);
  // Optional all the way down: when the first check fails, `migrated` is null,
  // and a suite that crashes there stops reporting everything after it.
  ok('and the feature is dropped rather than built against Object',
    migrated?.features.length === 0, `${migrated?.features.length} features`);
  ok('an inherited unit name falls back to millimetres',
    migrated?.meta.units === 'mm', migrated?.meta.units);
  ok('sanitiseParams treats an inherited type as unknown instead of reading Object.params', (() => {
    try { return JSON.stringify(sanitiseParams('constructor', { w: 1 })) === '{"w":1}'; }
    catch { return false; }   // it threw here before, on `Object.params.w`
  })());
}

/**
 * And no number a chat message can produce is non-finite.
 *
 * `parseFloat` returns `Infinity` for a digit run long enough to overflow a
 * double, and "durasi 1 followed by 400 zeros detik" is a sentence someone can
 * type or paste. `ukuran()` checked for that; `nilai()`, `dimensi()`,
 * `jumlah()`, `pasangan()`, `baut()`, `satuanNilai()` and the 4D planner's own
 * `durasiDari()` did not, so a non-finite number could travel from one message
 * into `sim.duration`, a motor rate, a gravity or a parameter edit. `migrate()`
 * now bounds the document, but a plan is shown to the user for approval before
 * it is applied, and "durasi Infinity detik" is not a plan anyone can approve.
 */
{
  const big = '1' + '0'.repeat(400);
  const plans = [
    ['aktifkan fisika lalu durasi ' + big + ' detik', '4D duration'],
    ['aktifkan fisika gravitasi ' + big, '4D gravity'],
    ['putar porosnya ' + big + ' rpm', '4D motor rate'],
    ['aktifkan fisika, jatuhkan dari ' + big + ' mm', '4D drop height'],
  ];
  // With a body in it, or the 4D planner refuses on an empty document before
  // it parses any number and the check would prove nothing. Found by removing
  // the fix and watching these four still pass.
  const withBody = () => {
    const d = newDocument('T');
    d.features = [makeFeature('box', { name: 'Poros' })];
    return d;
  };
  for (const [msg, what] of plans) {
    const r = Chat4D.respon(Chat4D.sesiBaru(), msg, { doc: withBody(), selected: [] });
    const dump = JSON.stringify(r, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NON-FINITE' : v));
    ok(`${what}: an overflowing number never reaches the plan`, !dump.includes('NON-FINITE'));
  }
  for (const msg of ['buatkan pelat ' + big + ' x 200 tebal 10', 'tebalnya jadi ' + big, 'buatkan pelat 200 x 120 dengan ' + big + ' baut']) {
    const r = Chat3D.respon(Chat3D.sesiBaru(), msg, { doc: newDocument('T'), selected: [] });
    const dump = JSON.stringify(r, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NON-FINITE' : v));
    ok(`3D "${msg.slice(0, 22)}…": likewise`, !dump.includes('NON-FINITE'));
  }
  ok('the readers return null for an unusable number, rather than clamping it to a bound nobody asked for',
    Lex.nilai('tebal', 'tebal ' + big + ' mm') === null && Lex.jumlah('baut', big + ' baut') === null
    && Lex.satuanNilai('rpm', big + ' rpm') === null && Lex.baut('m' + big) === null,
    JSON.stringify([Lex.nilai('tebal', 'tebal ' + big + ' mm'), Lex.jumlah('baut', big + ' baut')]));
  ok('while an ordinary number still reads exactly',
    Lex.nilai('tebal', 'tebal 8 mm') === 8 && Lex.jumlah('baut', '6 baut') === 6
    && Lex.satuanNilai('rpm', '120 rpm') === 120 && Lex.baut('M12') === 12);
  ok('and a dimension run with one unusable number is refused whole, not half-read',
    Lex.dimensi(big + ' x 200') === null, JSON.stringify(Lex.dimensi(big + ' x 200')));
}

/**
 * The catalogue's limits apply to a parameter written as an expression too.
 *
 * `sanitiseParams` skips a string on purpose: a string is an expression and
 * cannot be range-checked without evaluating it. That left exactly one way
 * round the segment-product ceiling, which is the guard against a single
 * feature asking for an unreasonable mesh: write the counts as strings.
 * `{"turns":"200","seg":"48","steps":"96"}` on a helix passed the boundary
 * untouched and built five times the work the numeric form is scaled down to.
 *
 * `resolveParams` applies the ranges again once the expressions are numbers,
 * which is the only point where both forms can be held to the same limit.
 */
{
  const helix = (params) => migrate(JSON.parse(`{ "schema": 3, "meta": { "name": "x", "units": "mm" }, "params": [],
    "features": [ { "id": "h", "type": "helix", "name": "H", "inputs": [], "params": ${JSON.stringify(params)},
      "transform": { "pos": [0,0,0], "rot": [0,0,0], "scale": [1,1,1] } } ] }`));
  // Counted rather than timed: a triangle count is the same on every machine,
  // and a wall-clock comparison in CI is a check that fails on a busy runner.
  const tris = (doc) => { invalidateCache(); return rebuild(doc).stats.tris; };
  const asNumbers = tris(helix({ turns: 200, seg: 48, steps: 96 }));
  const asStrings = tris(helix({ turns: '200', seg: '48', steps: '96' }));
  ok('a parameter written as a string is still held to the catalogue ceiling',
    asStrings === asNumbers,
    `${asStrings} triangles as strings against ${asNumbers} as numbers`);
  ok('and that ceiling is the one the catalogue states, not a larger one',
    asNumbers <= SEGMENT_PRODUCT_CEILING * 2, `${asNumbers} triangles`);
  ok('and the string is still stored as written, so the expression is not lost',
    helix({ turns: '200', seg: '48', steps: '96' }).features[0].params.seg === '48');
}

/**
 * A dialog action that throws closes the dialog on its way out.
 *
 * The import dialogs run their validation on the click rather than on the
 * parse, so a throw from `store.load(migrate(doc))` escaped the click handler
 * before `closeModal()` could run. What was left on screen was a modal with a
 * dead button, no message, and no way past it but a reload. The refusals above
 * mean the import path no longer throws there, but the handler is the general
 * case and it is the general case that was wrong.
 */
ok('the modal click handler cannot leave a dialog on screen after a throw', (() => {
  const src = readFileSync(join(root, 'src/ui/shell.js'), 'utf8');
  const m = src.match(/onclick:\s*\(\)\s*=>\s*\{[\s\S]*?\n {6}\},/);
  return !!m && /catch/.test(m[0]) && /closeModal\(\)/.test(m[0]);
})());

console.log(fails ? `\n${fails} FAILURES` : '\nALL SECURITY CHECKS PASS');
process.exit(fails ? 1 : 0);
