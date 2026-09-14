/**
 * AI Chat ke 3D, exercised end to end without a browser.
 *
 * Three things are worth testing here and they are not the obvious one.
 *
 *   The reading. A sentence a drawing office would actually type must come
 *   back with the right numbers in the right fields. Most of the checks below
 *   are that, because a planner that mis-reads "denah 9 m kali 7 m" as a
 *   nine-metre-square building is worse than one that refuses.
 *
 *   The output. Every recipe must produce features the rest of the
 *   application accepts: real catalogue types, parameters the sanitiser
 *   keeps, inputs that point at features that exist, and expressions that
 *   evaluate against the parameters the recipe declares. So the suite builds
 *   every recipe and rebuilds it through the real engine.
 *
 *   The refusal. Outside the vocabulary it must say so rather than guess.
 */
import 'three';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.structuredClone ??= (o) => JSON.parse(JSON.stringify(o));

const { newDocument, migrate, CATALOG, uid } = await import('../../src/core/doc.js');
const { rebuild, invalidateCache } = await import('../../src/core/rebuild.js');
const { buildScope, tryEval } = await import('../../src/core/expr.js');
const R = await import('../../src/ai/resep.js');
const K = await import('../../src/ai/klik.js');
const L = await import('../../src/ai/lex.js');
const C = await import('../../src/ai/chat3d.js');

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  - ' + extra : ''}`);
};
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

/* ================================================== 1. the Indonesian lexer */

ok('spelled numbers fold to digits', L.angkaKata('dua ratus lima puluh') === '250');
ok('and the thousands group multiplies the groups before it', L.angkaKata('dua ribu tiga ratus') === '2300');
ok('and the teens are not a multiplication', L.angkaKata('lima belas') === '15');
ok('and a half is a half', L.angkaKata('dua setengah') === '2.5');
ok('and an ordinary word is left alone', L.angkaKata('delapan lantai') === '8 lantai');

ok('a dimension run reads in the order written',
  JSON.stringify(L.dimensi('400 x 300 x 150')) === '[400,300,150]');
ok('and converts per-number units', JSON.stringify(L.dimensi('9 meter kali 7 meter')) === '[9000,7000]');
ok('and "kali" is the same separator as x', JSON.stringify(L.dimensi('120 kali 80')) === '[120,80]');
ok('a run with no second number is not a run', L.dimensi('pelat 120 tebal 8') === null);

ok('a named length reads its unit', L.nilai('tebal', 'pelat tebal 1,2 cm') === 12);
ok('a single-letter keyword does not match inside a word',
  L.nilai('d', 'lubang gland 20') === null, String(L.nilai('d', 'lubang gland 20')));
ok('a count may have a counter noun in between', L.jumlah('gland', 'dengan 6 lubang gland 20') === 6);
ok('a bolt callout is read as a size', L.baut('baut M12 delapan buah') === 12);
ok('a pair with a conjunction gives both values',
  JSON.stringify(L.pasangan('sayap', 'sayap 150 dan 100')) === '[150,100]');
ok('a quantity before its unit is read too', L.satuanNilai('rpm', 'putar 120 rpm') === 120);
ok('clauses split on the connectives', L.pecah('buat pelat, lalu bor 6 lubang').length === 2);

/* ==================================================== 2. every recipe builds */

const doc0 = newDocument('resep');

for (const id of R.RESEP_IDS) {
  const built = R.bangun(id);
  const names = new Set(built.features.map(f => f.id));

  ok(`${id} produces features`, built.features.length >= 3, `${built.features.length}`);
  ok(`${id} only uses catalogue types`,
    built.features.every(f => CATALOG[f.type]),
    built.features.filter(f => !CATALOG[f.type]).map(f => f.type).join(', '));
  ok(`${id} points every input at a feature it also created`,
    built.features.every(f => (f.inputs || []).every(i => names.has(i))));
  ok(`${id} declares the parameters its expressions reference`, (() => {
    const declared = new Set(built.params.map(p => p.name));
    const { scope } = buildScope(built.params.map(p => ({ id: uid('p'), ...p })));
    const numeric = (type, key) => {
      const field = (CATALOG[type]?.fields || []).find(x => x.key === key);
      return !field || ['len', 'num', 'int', 'ang'].includes(field.kind);
    };
    for (const f of built.features) {
      for (const [key, v] of Object.entries(f.params || {})) {
        if (typeof v !== 'string' || !numeric(f.type, key)) continue;
        const r = tryEval(v, scope);
        if (!r.ok) return false;
        // Also assert the names in the expression are ones the recipe owns.
        for (const m of v.matchAll(/[a-z_][a-z0-9_]*/gi)) {
          const name = m[0];
          if (['min', 'max', 'sqrt', 'abs', 'cbrt', 'sin', 'cos', 'tan', 'round', 'floor', 'ceil', 'pow', 'pi'].includes(name)) continue;
          if (!declared.has(name)) return false;
        }
      }
    }
    return true;
  })());
  ok(`${id} explains what it assumed`, built.notes.length >= 1, `${built.notes.length} notes`);
  ok(`${id} has a name and a summary in Indonesian`,
    !!built.nama && !!built.ringkas && !/\b(the|and|with|a)\b/.test(built.ringkas));
}

/* ------------------------------ and the engine accepts what they produce --- */

for (const id of R.RESEP_IDS) {
  const built = R.bangun(id);
  const doc = migrate({
    ...structuredClone(doc0),
    params: built.params.map(p => ({ id: uid('p'), ...p })),
    features: structuredClone(built.features),
  });
  invalidateCache();
  const run = rebuild(doc);
  const errors = [...run.results.values()].filter(r => r.error);
  ok(`${id} rebuilds through the real engine`, errors.length === 0,
    errors.slice(0, 2).map(e => e.error).join(' | '));
  ok(`${id} leaves at least one body behind`, run.stats.bodies >= 1, `${run.stats.bodies} bodies`);
}

/* ================================================== 3. the click estimator */

ok('an empty program costs nothing', K.klikProgram({}) === 0);
ok('a single primitive with three fields is the documented arithmetic',
  K.klikProgram({ features: [{ type: 'box', params: { w: 1, d: 2, h: 3 } }] })
  === K.BIAYA.fitur + 3 * K.BIAYA.param);
ok('an expression costs more to type than a number',
  K.BIAYA.ekspresi > K.BIAYA.param);
ok('the sentence rounds rather than claiming precision',
  /sekitar 480/.test(K.klikKalimat(479)), K.klikKalimat(479));
ok('and says so plainly when nothing was built', /Belum ada/.test(K.klikKalimat(0)));

const biggest = Math.max(...R.RESEP_IDS.map(id => K.klikProgram(R.bangun(id))));
ok('the heaviest single recipe is worth hundreds of clicks', biggest >= 400, `${biggest}`);
const menara = K.klikProgram(R.bangun('menara-lantai', { lantai: 12 }));
ok('and a twelve-storey sequence reaches the 700-900 band the README claims',
  menara >= 700 && menara <= 900, `${menara}`);

/* ==================================================== 4. reading a sentence */

const baca = (text) => {
  const id = R.cocok(text);
  return { id, values: id ? { ...R.bawaan(id), ...C.bacaNilai(id, text) } : null };
};

let r = baca('buatkan kotak panel 400 x 300 x 150 tebal 3 dengan 6 lubang gland 20');
ok('a panel enclosure is recognised over a plain box', r.id === 'kotak-panel', String(r.id));
ok('and its three inner dimensions come from the run',
  r.values.w === 400 && r.values.d === 300 && r.values.h === 150,
  JSON.stringify([r.values.w, r.values.d, r.values.h]));
ok('and the wall thickness from the named field', r.values.t === 3, String(r.values.t));
ok('and the gland count from the counted noun', r.values.gland === 6, String(r.values.gland));

r = baca('pelat baut 250 kali 150 tebal 12, baut M12, 8 lubang');
ok('a bolted plate reads its bolt size from the callout', r.values.baut === 12, String(r.values.baut));
ok('and the hole count counts the bolts', r.values.n === 8, String(r.values.n));

r = baca('braket L sayap 150 dan 100, lebar 90, tebal 10, baut M10');
ok('a conjunction fills both wing lengths',
  r.values.a === 150 && r.values.b === 100, JSON.stringify([r.values.a, r.values.b]));

r = baca('tumpukan lantai 12 lantai, denah 9 meter kali 7 meter, tinggi lantai 3,6 meter');
ok('a floor stack reads its storey count', r.values.lantai === 12, String(r.values.lantai));
ok('and metres convert to millimetres',
  r.values.w === 9000 && r.values.d === 7000, JSON.stringify([r.values.w, r.values.d]));
ok('and a comma decimal is a decimal', near(r.values.tinggi, 3600), String(r.values.tinggi));

r = baca('saluran u lebar 400 tinggi 400, empat segmen 1200');
ok('a count stated before its noun is a count, not a length',
  r.values.segmen === 4, String(r.values.segmen));
ok('while the segment length stays the named one',
  r.values.panjang === 1200, String(r.values.panjang));

r = baca('kotak panel 300 x 200 x 100 tanpa ventilasi');
ok('"tanpa" turns a flag off', r.values.ventilasi === false, String(r.values.ventilasi));

r = baca('pelat baut 200 kali 100 dari aluminium');
ok('a material word reaches the recipe', r.values.material === 'aluminium', String(r.values.material));

ok('every documented example is understood', (() => {
  const doc = newDocument('contoh');
  const bad = [];
  for (const ex of C.CONTOH) {
    const sesi = C.sesiBaru();
    const out = C.respon(sesi, ex, { doc, stats: { mass: 1, volume: 1, bodies: 1 } });
    if (out.aksi === 'tolak') bad.push(ex);
  }
  return bad.length === 0 || (console.log('     ' + bad.join(' | ')), false);
})());

/* ===================================================== 5. the conversation */

{
  const doc = newDocument('obrolan');
  const sesi = C.sesiBaru();

  let out = C.respon(sesi, 'buatkan kotak panel 400 x 300 x 150', { doc });
  ok('a build turn plans rather than applies', out.aksi === 'rencana', out.aksi);
  ok('and the plan is substantial', out.program.features.length >= 15, `${out.program.features.length}`);
  ok('and it reports the click equivalent', out.klik > 300, `${out.klik}`);
  ok('and nothing has reached the document yet', doc.features.length === 0);
  ok('and the transcript records both sides', sesi.turns.length === 2, `${sesi.turns.length}`);

  out = C.respon(sesi, 'ya', { doc });
  ok('a yes turns the plan into an apply', out.aksi === 'terapkan', out.aksi);
  ok('and the session total grows', sesi.klikTotal > 300, `${sesi.klikTotal}`);
  ok('and the program comes back to be applied by the caller', out.program.features.length >= 15);

  out = C.respon(sesi, 'batal', { doc });
  ok('a no with nothing pending is not an apply', out.aksi !== 'terapkan', out.aksi);

  out = C.respon(sesi, 'roket ke mars', { doc });
  ok('nonsense is refused, not guessed at', out.aksi === 'tolak' && out.ok === false);
  ok('and the refusal lists what it does know', out.ucapan.join(' ').includes('kotak panel'));

  out = C.respon(sesi, 'bantuan', { doc });
  ok('help lists the recipes and examples', out.aksi === 'jawab' && out.ucapan.length >= 5);

  out = C.respon(sesi, 'berapa massanya', { doc, stats: { mass: 2.5 } });
  ok('a question about mass is answered from the build stats',
    /2\.500 kg/.test(out.ucapan[0]), out.ucapan[0]);
  out = C.respon(sesi, 'berapa massanya', { doc, stats: {} });
  ok('and says plainly when there is nothing to weigh', /Belum ada/.test(out.ucapan[0]));

  // A build request that merely mentions a metric must still build. Without a
  // gate on the sentence being interrogative, the query grammar eats it.
  out = C.respon(sesi, 'buatkan braket L dengan massa rendah', { doc, stats: { mass: 2.5 } });
  ok('a build request that mentions a metric is still a build',
    out.aksi === 'rencana' && out.program.features.length >= 5, out.aksi);
  out = C.respon(sesi, 'massanya?', { doc, stats: { mass: 2.5 } });
  ok('while a bare metric with a question mark is a question', out.aksi === 'jawab', out.aksi);
}

/* --------------------------------------------- several clauses in one turn */

{
  const doc = newDocument('banyak');
  const sesi = C.sesiBaru();
  const out = C.respon(sesi, 'buatkan pelat baut 200 kali 120, lalu braket L, terus saluran u lebar 300', { doc });
  ok('three clauses in one message build three assemblies',
    out.program.features.length >= 20, `${out.program.features.length}`);
  ok('and each one is named in the readback', out.understood.length >= 3, `${out.understood.length}`);
  ok('and the turn is worth the sum of them', out.klik > 400, `${out.klik}`);
  ok('and the feature ids are still unique',
    new Set(out.program.features.map(f => f.id)).size === out.program.features.length);
  ok('and no parameter is declared twice',
    new Set(out.program.params.map(p => p.name)).size === out.program.params.length);
}

/* ---------------------------------------------------------- an edit turn */

{
  const doc = newDocument('sunting');
  const sesi = C.sesiBaru();
  const plan = C.respon(sesi, 'pelat baut 200 kali 120 tebal 10', { doc });
  doc.params = plan.program.params.map(p => ({ id: uid('p'), ...p }));
  doc.features = plan.program.features;
  C.respon(sesi, 'ya', { doc });

  let out = C.respon(sesi, 'tebalnya jadi 16', { doc });
  ok('an edit turn names the parameter it would change', out.aksi === 'ubah', out.aksi);
  ok('and points at the recipe’s own parameter',
    out.edits.some(e => e.kind === 'param' && /pelat_t/.test(e.name)),
    JSON.stringify(out.edits));

  out = C.respon(sesi, 'ganti materialnya jadi aluminium', { doc });
  ok('a material swap is an edit, not a rebuild',
    out.edits.some(e => e.kind === 'material' && e.material === 'aluminium'), JSON.stringify(out.edits));
}

/* ------------------------------------- a follow-up keeps the same subject */

{
  const doc = newDocument('lanjut');
  const sesi = C.sesiBaru();
  C.respon(sesi, 'kotak panel 500 x 400 x 200 tebal 4', { doc });
  C.respon(sesi, 'ya', { doc });
  ok('the session remembers which recipe it is discussing', sesi.resep === 'kotak-panel', String(sesi.resep));
  const out = C.respon(sesi, 'kotak panel dengan 8 lubang gland', { doc });
  ok('and a follow-up keeps the sizes from the turn before',
    out.program.params.find(p => p.name === 'kotak_w')?.value === 500,
    JSON.stringify(out.program.params.map(p => `${p.name}=${p.value}`)));
}

/* ---------------------------------------------------------------- report */

console.log(fails ? `\n${fails} FAILURES` : '\nALL AI CHAT 3D CHECKS PASS');
process.exit(fails ? 1 : 0);
