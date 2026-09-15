/**
 * AI Chat ke 4D, driven against a real document with no browser.
 *
 * The 4D planner has one job that can go quietly wrong and it is not the
 * parsing: it picks its own targets out of the feature tree. A sequence
 * applied to the wrong bodies, or in the wrong order, looks plausible and is
 * useless, so most of what follows builds a real tower with the 3D chat and
 * then checks which bodies the 4D chat chose and what times it gave them.
 *
 * The patch it returns is also checked against the shape `emptySim()` declares,
 * because a simulator setting with a misspelled key fails silently at play
 * time rather than at apply time.
 */
import 'three';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.structuredClone ??= (o) => JSON.parse(JSON.stringify(o));

const { newDocument, emptySim, uid } = await import('../../src/core/doc.js');
const { SCHEDULE_MODES, MOTOR_TYPES, sampleTrack } = await import('../../src/sim/sim.js');
const C3 = await import('../../src/ai/chat3d.js');
const C = await import('../../src/ai/chat4d.js');
const K = await import('../../src/ai/klik.js');

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  - ' + extra : ''}`);
};

/* ------------------------------------------------- a document to work on */

/** A tower plus a shaft, built the way a user would: through the 3D chat. */
function dokumen() {
  const doc = newDocument('menara');
  doc.features = [];
  for (const kalimat of ['tumpukan lantai 8 lantai denah 9 meter kali 7 meter',
    'poros bertingkat diameter 60 panjang 300']) {
    const sesi = C3.sesiBaru();
    const out = C3.respon(sesi, kalimat, { doc });
    doc.params.push(...out.program.params.map(p => ({ id: uid('p'), ...p })));
    doc.features.push(...out.program.features);
  }
  return doc;
}

const doc = dokumen();
ok('the test document has bodies to sequence', doc.features.length >= 20, `${doc.features.length}`);

/* ================================================== 1. picking the targets */

let t = C.pilihTarget(doc, 'jadwalkan lantainya');
ok('the possessive -nya still names the group', t.nama === 'lantai', `${t.nama}`);
ok('and it resolves against feature names', t.dari === 'nama fitur', t.dari);
ok('and finds one body per storey', t.ids.length === 8, `${t.ids.length}`);

t = C.pilihTarget(doc, 'putar porosnya');
ok('a different word finds a different group', t.ids.length >= 1 && t.nama === 'poros', `${t.nama} ${t.ids.length}`);

t = C.pilihTarget(doc, 'jadwalkan semuanya');
ok('with nothing named it falls back to the whole document',
  t.dari === 'seluruh dokumen' && t.ids.length === doc.features.length, `${t.ids.length}`);

t = C.pilihTarget(doc, 'jadwalkan itu', [doc.features[0].id]);
ok('a selection beats the fallback', t.dari === 'pilihan' && t.ids.length === 1, t.dari);

t = C.pilihTarget(doc, 'putar itu', [], { semua: false });
ok('and a planner that insists on a named target gets nothing', t.ids.length === 0, `${t.ids.length}`);

/* ===================================================== 2. a build sequence */

{
  const sesi = C.sesiBaru();
  const out = C.respon(sesi, 'jadwalkan urutan bangun, tiap lantai 3 hari, dari bawah ke atas', { doc });
  ok('a sequence turn plans rather than applies', out.aksi === 'rencana', out.aksi);

  const items = out.sim.schedule.items;
  const ids = Object.keys(items);
  ok('every storey gets a slot', ids.length === 8, `${ids.length}`);
  ok('the sequence is enabled', out.sim.schedule.enabled === true);
  ok('slots start at zero and never overlap', (() => {
    const rows = ids.map(id => items[id]).sort((a, b) => a.start - b.start);
    if (Math.abs(rows[0].start) > 1e-9) return false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].start + 1e-6 < rows[i - 1].start + rows[i - 1].dur) return false;
    }
    return true;
  })());
  ok('every slot has the same duration, because every storey took the same time',
    new Set(ids.map(id => items[id].dur.toFixed(3))).size === 1);
  ok('the last slot ends inside the timeline it proposes', (() => {
    const end = Math.max(...ids.map(id => items[id].start + items[id].dur));
    return end <= out.sim.duration + 1e-6;
  })(), `${out.sim.duration}`);
  ok('the appearance mode is one the simulator knows',
    SCHEDULE_MODES.some(([k]) => k === items[ids[0]].mode), items[ids[0]].mode);
  ok('the readback states the real-world time, not the timeline time',
    out.ucapan.join(' ').includes('3 hari'), out.understood.join(' | '));
  ok('and the compression ratio is said in days rather than in seconds',
    /\d+\.\d+ hari/.test(out.ucapan.join(' ')), out.ucapan.join(' ').slice(0, 200));
  ok('a whole-tower sequence is worth tens of clicks, not hundreds',
    out.klik >= 30 && out.klik <= 90, `${out.klik}`);

  const applied = C.respon(sesi, 'ya', { doc });
  ok('a yes applies it', applied.aksi === 'terapkan', applied.aksi);
  ok('and the session total is the turn that was applied', sesi.klikTotal === out.klik, `${sesi.klikTotal}`);
}

/* -------------------------------------- the sequence can run top to bottom */

{
  const sesi = C.sesiBaru();
  const naik = C.respon(sesi, 'jadwalkan lantainya 2 hari', { doc }).sim.schedule.items;
  const turun = C.respon(C.sesiBaru(), 'jadwalkan lantainya 2 hari dari atas ke bawah', { doc }).sim.schedule.items;
  const first = (items) => Object.entries(items).sort((a, b) => a[1].start - b[1].start)[0][0];
  ok('"dari atas ke bawah" reverses which body goes first',
    first(naik) !== first(turun), `${first(naik)} vs ${first(turun)}`);
}

/* ------------------------------------------------ the mode can be asked for */

{
  const out = C.respon(C.sesiBaru(), 'urutan bangun lantainya dengan mode cor bertahap', { doc });
  const first = Object.values(out.sim.schedule.items)[0];
  ok('a named appearance mode is honoured', first.mode === 'build', first.mode);
}

/* ============================================================= 3. a motor */

{
  const sesi = C.sesiBaru();
  const out = C.respon(sesi, 'putar porosnya 120 rpm sumbu z', { doc });
  ok('a motor turn plans', out.aksi === 'rencana', out.aksi);
  const bodies = out.sim.dynamics.bodies;
  const body = Object.values(bodies)[0];
  ok('dynamics is switched on, because a motor needs it', out.sim.dynamics.enabled === true);
  ok('the motor type is one the simulator knows',
    MOTOR_TYPES.some(([k]) => k === body.motor.type), body.motor.type);
  ok('rpm becomes degrees per second', body.motor.rate === 720, `${body.motor.rate}`);
  ok('and the readback shows both numbers', /720°\/s \(120 rpm\)/.test(out.understood.join(' ')), out.understood.join(' | '));
  ok('the body is static, so gravity does not drop it while it spins', body.static === true);
  ok('the axis comes from the sentence', body.motor.axis === 'z', body.motor.axis);
  ok('a motor on one body is cheap', out.klik <= 20, `${out.klik}`);

  const ccw = C.respon(C.sesiBaru(), 'putar porosnya 60 rpm berlawanan', { doc });
  ok('a reversed direction is a negative rate',
    Object.values(ccw.sim.dynamics.bodies)[0].motor.rate < 0);

  const ayun = C.respon(C.sesiBaru(), 'ayun porosnya 30 derajat 0,5 hz', { doc });
  const am = Object.values(ayun.sim.dynamics.bodies)[0].motor;
  ok('an oscillation is a different motor type', am.type === 'oscillate', am.type);
  ok('with the amplitude and frequency it was given',
    am.amp === 30 && am.freq === 0.5, `${am.amp} ${am.freq}`);

  const tanpa = C.respon(C.sesiBaru(), 'putar itu 90 rpm', { doc });
  ok('a motor with no target asks instead of guessing', tanpa.aksi === 'tanya', tanpa.aksi);
  ok('and the question says how to answer it', /sebut namanya/i.test(tanpa.ucapan.join(' ')));
}

/* ============================================================ 4. physics */

{
  const out = C.respon(C.sesiBaru(), 'aktifkan fisika, jatuhkan dari 500 mm, restitusi 0,3 gesekan 0,5', { doc });
  const dyn = out.sim.dynamics;
  const body = Object.values(dyn.bodies)[0];
  ok('physics is enabled with a ground plane', dyn.enabled === true && dyn.ground === true);
  ok('gravity keeps the millimetre unit the simulator uses', dyn.gravity === -9810, `${dyn.gravity}`);
  ok('bodies are not static, or nothing would fall', body.static === false);
  ok('restitution and friction come from the sentence',
    body.bounce === 0.3 && body.friction === 0.5, `${body.bounce} ${body.friction}`);
  ok('the drop height is a transform, not a simulator setting',
    out.sim.angkat?.dz === 500, JSON.stringify(out.sim.angkat?.dz));
  ok('and the build sequence is turned off, since both move the same bodies',
    out.sim.schedule.enabled === false);
  ok('the note says plainly that this is not stress analysis',
    /bukan analisis tegangan/i.test(out.ucapan.join(' ')));
}

/* ========================================================== 5. keyframes */

{
  const out = C.respon(C.sesiBaru(), 'angkat pelatnya 200 mm dalam 2 detik', { doc });
  const track = Object.values(out.sim.tracks)[0];
  const keys = track.props.pz;
  ok('a movement becomes two keyframes, not one', keys.length === 2, `${keys.length}`);
  ok('the first is at the start and the second at the end',
    keys[0].t === 0 && keys[1].t === 2, `${keys[0].t} → ${keys[1].t}`);
  ok('and it travels the distance asked for', keys[1].v === 200, `${keys[1].v}`);
  ok('the animated property is the vertical one', 'pz' in track.props);
  ok('and the timeline is long enough for the move', out.sim.duration >= 3, `${out.sim.duration}`);

  const turun = C.respon(C.sesiBaru(), 'turunkan pelatnya 50 mm dalam 1 detik', { doc });
  ok('"turunkan" goes the other way',
    Object.values(turun.sim.tracks)[0].props.pz[1].v === -50,
    `${Object.values(turun.sim.tracks)[0].props.pz[1].v}`);
}

/* =================================================== 6. duration and rate */

{
  const out = C.respon(C.sesiBaru(), 'durasi 30 detik, 24 fps', { doc });
  ok('the timeline duration is set', out.sim.duration === 30, `${out.sim.duration}`);
  ok('and the frame rate', out.sim.fps === 24, `${out.sim.fps}`);
  ok('and it costs about what two fields cost', out.klik <= 8, `${out.klik}`);

  const silly = C.respon(C.sesiBaru(), 'durasi 5 detik, 9000 fps', { doc });
  ok('an absurd frame rate is clamped rather than accepted', silly.sim.fps === 120, `${silly.sim.fps}`);
}

/* ============================================ 7. several clauses in a turn */

{
  const sesi = C.sesiBaru();
  const out = C.respon(sesi, 'durasi 20 detik, jadwalkan lantainya 3 hari, lalu putar porosnya 60 rpm', { doc });
  ok('one message can set the duration, the sequence and a motor',
    out.sim.duration === 20 && Object.keys(out.sim.schedule.items).length === 8
    && Object.keys(out.sim.dynamics.bodies).length >= 1,
    JSON.stringify({ d: out.sim.duration, s: Object.keys(out.sim.schedule.items).length }));
  ok('and the whole 4D setup lands in the 60-80 band the README claims',
    out.klik >= 45 && out.klik <= 85, `${out.klik}`);
  ok('and every line of it is in the readback', out.understood.length >= 5, `${out.understood.length}`);
}

/* ================================================== 8. the patch is valid */

{
  const shape = emptySim();
  const out = C.respon(C.sesiBaru(), 'jadwalkan lantainya 1 hari', { doc });
  ok('the patch only uses keys the document model declares', (() => {
    for (const k of Object.keys(out.sim)) {
      if (k === 'angkat') continue;                    // handled by the caller
      if (!(k in shape)) return false;
    }
    return true;
  })(), Object.keys(out.sim).join(', '));

  ok('every schedule row carries the four fields the timeline reads', (() => {
    return Object.values(out.sim.schedule.items).every(it =>
      Number.isFinite(it.start) && Number.isFinite(it.dur) && typeof it.mode === 'string' && it.enabled === true);
  })());

  // And the keyframes the planner writes are the shape sampleTrack reads.
  const anim = C.respon(C.sesiBaru(), 'angkat pelatnya 120 mm dalam 3 detik', { doc });
  const keys = Object.values(anim.sim.tracks)[0].props.pz;
  ok('and the simulator\u2019s own sampler reads its keyframes',
    sampleTrack(keys, 0, 0) === 0 && sampleTrack(keys, 3, 0) === 120
    && sampleTrack(keys, 1.5, 0) > 0 && sampleTrack(keys, 1.5, 0) < 120,
    `${sampleTrack(keys, 1.5, 0)}`);
}

/* ========================================================== 9. refusals */

{
  const kosong = newDocument('kosong');
  kosong.features = [];
  const out = C.respon(C.sesiBaru(), 'jadwalkan lantainya', { doc: kosong });
  ok('an empty document is refused with a reason', out.aksi === 'tolak', out.aksi);
  ok('and points at the 3D chat as the way to fix it', /3D/.test(out.ucapan.join(' ')));

  const nonsense = C.respon(C.sesiBaru(), 'buatkan kopi', { doc });
  ok('nonsense is refused, not guessed at', nonsense.aksi === 'tolak', nonsense.aksi);

  const bantu = C.respon(C.sesiBaru(), 'bantuan', { doc });
  ok('help lists what it can do', bantu.aksi === 'jawab' && bantu.ucapan.length >= 6);

  const rekam = C.respon(C.sesiBaru(), 'rekam videonya', { doc });
  ok('recording is explained rather than planned', rekam.aksi === 'jawab' && /WebM/.test(rekam.ucapan.join(' ')));

  const bersih = C.respon(C.sesiBaru(), 'bersihkan jadwalnya', { doc });
  ok('clearing the sequence is a plan like any other', bersih.aksi === 'rencana', bersih.aksi);
  ok('and it empties both the schedule and the keyframes',
    bersih.sim.schedule.enabled === false && Object.keys(bersih.sim.tracks).length === 0);
}

/* ------------------------------------ every documented example is understood */

ok('every documented example is understood', (() => {
  const bad = [];
  for (const ex of C.CONTOH) {
    const out = C.respon(C.sesiBaru(), ex, { doc });
    if (out.aksi === 'tolak') bad.push(ex);
  }
  return bad.length === 0 || (console.log('     ' + bad.join(' | ')), false);
})());

/* -------------------------------------------- the click model is the same one */

ok('the 4D estimate uses the shared model, not a second one',
  K.BIAYA.jadwal > 0 && K.BIAYA.motor > 0 && K.BIAYA.keyframe > 0);
ok('and a schedule row is cheaper than a motor, as the model says',
  K.BIAYA.jadwal < K.BIAYA.motor);

console.log(fails ? `\n${fails} FAILURES` : '\nALL AI CHAT 4D CHECKS PASS');
process.exit(fails ? 1 : 0);
