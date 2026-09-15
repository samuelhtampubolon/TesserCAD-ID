/**
 * Right panel: context-sensitive properties for the current workspace and
 * selection. Numeric fields accept expressions, so every property in the
 * model can be driven by a named document parameter.
 */
import { el, clear, section, field, checkbox, select, segmented, kv, promptDialog, icon, emptyState, scrubNumber, verb } from './shell.js';
import { store, catalogOf, MATERIALS, UNITS, uid, toDisplay, fromDisplay } from '../core/doc.js';
import { tryEval } from '../core/expr.js';
import { massProperties } from '../core/rebuild.js';
import { ANIM_PROPS, EASINGS, SCHEDULE_MODES, MOTOR_TYPES } from '../sim/sim.js';
import { fmt } from '../draft/entity.js';
import { severityLabel } from '../intel/doctor.js';
import { PROCESSES } from '../intel/process.js';
import { standards, setStandard } from '../intel/standards.js';
import { isi } from '../core/teks.js';

export function renderRightPanel(app) {
  const host = clear(document.getElementById('rightBody'));
  const title = document.getElementById('rightTitle');

  if (app.workspace === 'draft') { title.textContent = ('Drafting'); renderDraft(app, host); return; }
  if (app.workspace === 'sim') { title.textContent = ('Simulasi'); renderSim(app, host); return; }
  title.textContent = ('Properti');
  renderModel(app, host);
}

/* ==================================================================
   Shared: expression-aware numeric input
   ================================================================== */

function exprInput(value, scope, onCommit, { unit = null, hint = true } = {}) {
  const wrap = el('div');
  const input = el('input', { type: 'text', class: 'expr', value: String(value ?? ''), spellcheck: 'false' });
  const note = el('div', { class: 'param-val' });

  const check = () => {
    const r = tryEval(input.value, scope);
    input.classList.toggle('bad', !r.ok);
    if (!hint) { note.textContent = ''; return r; }
    if (!r.ok) note.textContent = r.error;
    else if (unit === 'len') {
      const u = store.doc.meta.units;
      note.textContent = u === 'mm' ? `= ${fmt(r.value)} mm` : `= ${fmt(toDisplay(r.value, u))} ${u}  (${fmt(r.value)} mm)`;
    } else if (unit === 'ang') note.textContent = `= ${fmt(r.value)}°`;
    else note.textContent = typeof value === 'string' ? `= ${fmt(r.value)}` : '';
    return r;
  };

  input.addEventListener('input', check);
  const commit = () => {
    const r = check();
    if (!r.ok) return;
    const raw = input.value.trim();
    const asNum = Number(raw);
    onCommit(Number.isFinite(asNum) && String(asNum) === raw ? asNum : raw);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); input.blur(); } });
  check();
  wrap.append(input, note);
  return wrap;
}

function vecRow(label, values, scope, onCommit, unit) {
  const box = el('div', { class: 'triplet-axis' });
  ['X', 'Y', 'Z'].forEach((ax, i) => {
    const w = exprInput(values[i], scope, (v) => { const next = [...values]; next[i] = v; onCommit(next); }, { unit, hint: false });
    w.firstChild.title = isi('{label} {ax} - menerima ekspresi', { label, ax });
    box.appendChild(el('div', { class: 'axis-field' }, [
      el('span', { class: 'axis-label', dataset: { axis: ax }, text: ax }),
      w,
    ]));
  });
  return field(label, box);
}

/* ==================================================================
   Model workspace
   ================================================================== */

function renderModel(app, host) {
  const scope = app.build?.scope || {};
  const ids = [...app.selection];

  if (ids.length > 1) {
    host.appendChild(section('Pilihan', [
      el('p', { class: 'hint', text: `${ids.length} fitur dipilih.` }),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn primary', text: 'Union', onclick: () => app.addBoolean('union') }),
        el('button', { class: 'btn', text: 'Subtract', onclick: () => app.addBoolean('subtract') }),
        el('button', { class: 'btn', text: 'Intersect', onclick: () => app.addBoolean('intersect') }),
      ]),
      el('div', { class: 'hint', text: 'Subtract memotong setiap body berikutnya dari body pertama yang dipilih.' }),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn', text: 'Warna grup…', onclick: () => pickGroupColour(app, ids) }),
        el('button', { class: 'btn danger', text: 'Hapus', onclick: () => app.deleteSelection() }),
      ]),
    ]));
  }

  const f = ids.length === 1 ? store.feature(ids[0]) : null;

  if (f) {
    const cat = catalogOf(f.type);
    const res = app.build?.results.get(f.id);

    if (res?.error) host.appendChild(el('div', { class: 'banner err', text: res.error }));

    host.appendChild(section('Fitur', [
      field('Nama', (() => {
        const i = el('input', { type: 'text', value: f.name });
        i.addEventListener('change', () => {
          store.edit('Ganti nama fitur', () => { store.feature(f.id).name = i.value || cat.label; }, { rebuild: false });
          app.refreshUI();
        });
        return i;
      })()),
      field('Jenis', el('span', { class: 'pill', text: cat.label })),
      checkbox('Suppress (lewati fitur ini)', f.suppressed, (v) => {
        store.edit('Suppress feature', () => { store.feature(f.id).suppressed = v; });
      }),
    ], true, { icon: 'doc-props' }));

    if (cat.fields.length) {
      host.appendChild(section('Parameter', cat.fields.map(fld => paramField(app, f, fld, scope)), true, { icon: 'settings' }));
    }

    if (f.type === 'extrude' || f.type === 'revolve') {
      host.appendChild(section('Profil sketsa', [
        el('div', {
          class: f.profile?.length ? 'banner info' : 'banner warn',
          text: f.profile?.length
            ? `${f.profile.length} drawing object${f.profile.length > 1 ? 's' : ''} linked.`
            : 'Belum ada profil yang tertaut.',
        }),
        el('div', { class: 'btn-row' }, [
          el('button', {
            class: 'btn', text: 'Tautkan pilihan draft',
            onclick: () => app.linkProfile(f.id),
          }),
          el('button', { class: 'btn', text: 'Tampilkan di Draft', onclick: () => app.showProfile(f.id) }),
        ]),
        el('div', { class: 'hint', text: 'Pilih geometri tertutup di workspace Draft, lalu tautkan di sini. Menyunting gambar membangun ulang solid.' }),
      ], true, { icon: 'profile-link' }));
    }

    host.appendChild(section('Transform', [
      vecRow('Position', f.transform.pos, scope, (v) => setTransform(app, f.id, 'pos', v), 'len'),
      vecRow('Rotation', f.transform.rot, scope, (v) => setTransform(app, f.id, 'rot', v), 'ang'),
      vecRow('Scale', f.transform.scale, scope, (v) => setTransform(app, f.id, 'scale', v), 'num'),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn sm', text: 'Reset', onclick: () => {
          store.edit('Reset transform', () => {
            const t = store.feature(f.id).transform;
            t.pos = [0, 0, 0]; t.rot = [0, 0, 0]; t.scale = [1, 1, 1];
          });
        } }),
        el('button', { class: 'btn sm', text: 'Jatuhkan ke lantai', onclick: () => app.dropSelection() }),
        el('button', { class: 'btn sm', text: 'Pusatkan di origin', onclick: () => app.centreSelection() }),
      ]),
    ], true, { icon: 'move' }));

    host.appendChild(section('Tampilan', [
      field('Material', select(f.material, Object.entries(MATERIALS).map(([k, m]) => [k, m.name]), (v) => {
        store.edit('Ganti material', () => {
          const t = store.feature(f.id);
          t.material = v;
          const m = MATERIALS[v];
          t.appearance.color = m.color;
          t.appearance.metalness = m.metal;
          t.appearance.roughness = m.rough;
        }, { rebuild: false });
        app.refreshBodies();
      })),
      field('Warna', (() => {
        const c = el('input', { type: 'color', value: f.appearance.color });
        c.addEventListener('input', () => {
          store.quiet(() => { store.feature(f.id).appearance.color = c.value; });
          app.vp.refreshMaterials();
        });
        return c;
      })()),
      sliderRow('Opasitas', f.appearance.opacity ?? 1, 0, 1, 0.01, (v) => {
        store.quiet(() => { store.feature(f.id).appearance.opacity = v; });
        app.vp.refreshMaterials();
      }),
      sliderRow('Metalness', f.appearance.metalness ?? 0.4, 0, 1, 0.01, (v) => {
        store.quiet(() => { store.feature(f.id).appearance.metalness = v; });
        app.vp.refreshMaterials();
      }),
      sliderRow('Roughness', f.appearance.roughness ?? 0.5, 0, 1, 0.01, (v) => {
        store.quiet(() => { store.feature(f.id).appearance.roughness = v; });
        app.vp.refreshMaterials();
      }),
    ], false, { icon: 'palette' }));

    if (res && !res.error && res.instances.length) {
      host.appendChild(section('Properti massa', [massPanel(f, res)], false, { icon: 'mass' }));
    }

    host.appendChild(el('div', { class: 'btn-row', style: { marginBottom: '12px' } }, [
      el('button', { class: 'btn', text: 'Duplikat', onclick: () => app.duplicateSelection() }),
      el('button', { class: 'btn danger', text: 'Hapus', onclick: () => app.deleteSelection() }),
    ]));
  } else if (!ids.length) {
    host.appendChild(emptyState('Tidak ada pilihan', verb(
      'Klik sebuah body di viewport atau baris di pohon fitur. Tekan <kbd>Ctrl K</kbd> untuk semua perintah.',
      'Ketuk sebuah body di viewport, atau buka <b>Panel → Kerangka</b>. <b>Lainnya</b> berisi semua perintah.',
    ), 'target'));
  }

  if (app.report) host.appendChild(doctorSection(app));
  host.appendChild(paramsSection(app, scope));
  host.appendChild(documentSection(app));
  host.appendChild(viewSection(app));
  if (app.build) host.appendChild(statsSection(app));
}

/**
 * The Design Doctor's findings, in the panel rather than behind a menu.
 *
 * Validation that lives in a dialog is validation you run once, at the end,
 * when the cost of what it finds is highest. Keeping it beside the properties
 * means it is answering continuously, which is the entire point.
 */
function doctorSection(app) {
  const r = app.report;
  const rows = [];
  const proc = store.doc.studio?.process || standards().process;

  rows.push(field('Dibuat dengan', select(proc, Object.entries(PROCESSES).map(([k, v]) => [k, v.label]), (v) => {
    store.quiet((d) => { d.studio = { ...(d.studio || {}), process: v }; });
    setStandard('process', v);
    app.runDoctor();
    app.refreshUI();
  })));
  rows.push(el('div', { class: 'hint', text: PROCESSES[proc]?.note || '' }));

  if (!r.issues.length) {
    rows.push(el('div', { class: 'banner ok', text: isi('Semua {n} pemeriksaan lolos untuk {process}.', { n: r.checked, process: PROCESSES[proc]?.label }) }));
  } else {
    for (const issue of r.issues.slice(0, 12)) {
      const sev = issue.severity === 3 ? 'err' : issue.severity === 2 ? 'warn' : 'info';
      const body = [
        el('div', { class: 'dx-head' }, [
          el('span', { class: `dx-sev ${sev}`, text: severityLabel(issue.severity) }),
          el('span', { class: 'dx-title', text: issue.title }),
        ]),
        issue.detail ? el('div', { class: 'dx-detail', text: issue.detail }) : null,
        issue.why ? el('div', { class: 'dx-why', text: issue.why }) : null,
      ].filter(Boolean);

      const acts = el('div', { class: 'btn-row' });
      if (issue.featureId) {
        acts.appendChild(el('button', {
          class: 'btn sm', text: 'Tunjukkan',
          onclick: () => { app.select([issue.featureId]); app.vp.frameSelection(); },
        }));
      }
      if (issue.fix) {
        acts.appendChild(el('button', {
          class: 'btn sm primary', text: issue.fix.label,
          onclick: () => app.applyFix(issue),
        }));
      }
      if (acts.children.length) body.push(acts);
      rows.push(el('div', { class: `dx-item ${sev}` }, body));
    }
    if (r.issues.length > 12) {
      rows.push(el('div', { class: 'hint', text: isi('{n} temuan lagi. Buka laporan lengkap untuk semuanya.', { n: r.issues.length - 12 }) }));
    }
  }

  rows.push(el('div', { class: 'btn-row' }, [
    el('button', { class: 'btn sm', onclick: () => app.showCostReport() }, [icon('gauge', { size: 13 }), 'Biaya']),
    el('button', { class: 'btn sm', onclick: () => app.run('release.package') }, [icon('download', { size: 13 }), 'Release…']),
  ]));

  const badge = r.counts.block ? `${r.counts.block} blocking` : r.issues.length ? String(r.issues.length) : 'OK';
  return section('Design doctor', rows, r.counts.block > 0 || r.counts.warn > 0, { icon: 'probe', badge });
}

function paramField(app, f, fld, scope) {
  const value = f.params[fld.key];
  const set = (v) => store.edit(`Edit ${fld.label}`, () => { store.feature(f.id).params[fld.key] = v; });

  if (fld.kind === 'bool') return checkbox(fld.label, !!value, set);
  if (fld.kind === 'select') return field(fld.label, select(value, fld.options, set));
  if (fld.kind === 'int') {
    const i = el('input', { type: 'number', value, step: 1, min: fld.min ?? 1, max: fld.max ?? 1000 });
    i.addEventListener('change', () => {
      const v = Math.round(parseFloat(i.value));
      if (Number.isFinite(v)) set(Math.max(fld.min ?? 1, Math.min(fld.max ?? 1e6, v)));
    });
    return field(fld.label, i);
  }
  return field(fld.label, exprInput(value, scope, set, { unit: fld.kind === 'len' ? 'len' : fld.kind === 'ang' ? 'ang' : 'num' }));
}

function sliderRow(label, value, min, max, step, onChange) {
  const r = el('input', { type: 'range', min, max, step, value });
  const out = el('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--txt-3)' }, text: String(value) });
  r.addEventListener('input', () => { out.textContent = r.value; onChange(parseFloat(r.value)); });
  return field(label, el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [r, out]));
}

function setTransform(app, id, key, values) {
  store.edit('Edit transform', () => { store.feature(id).transform[key] = values; });
}

function pickGroupColour(app, ids) {
  const input = el('input', { type: 'color', value: '#4da3ff' });
  input.addEventListener('change', () => {
    store.edit('Atur warna', () => { for (const id of ids) { const f = store.feature(id); if (f) f.appearance.color = input.value; } }, { rebuild: false });
    app.refreshBodies();
  });
  input.click();
}

function massPanel(f, res) {
  const doc = store.doc;
  const u = doc.meta.units;
  const dens = (MATERIALS[f.material] || MATERIALS.steel).density;
  let vol = 0, area = 0;
  const mp0 = massProperties(res.instances[0].geometry, res.instances[0].matrix);
  for (const inst of res.instances) {
    const mp = massProperties(inst.geometry, inst.matrix);
    vol += mp.volume; area += mp.area;
  }
  const s = mp0.size;
  return kv([
    ['Badan', String(res.instances.length)],
    ['Volume', `${fmt(vol)} mm³`],
    ['Surface area', `${fmt(area)} mm²`],
    ['Massa', `${fmt(vol * dens, 4)} kg`],
    ['Bounding box', `${fmt(toDisplay(s.x, u))} × ${fmt(toDisplay(s.y, u))} × ${fmt(toDisplay(s.z, u))} ${u}`],
    ['Centroid', `${fmt(mp0.centroid.x)}, ${fmt(mp0.centroid.y)}, ${fmt(mp0.centroid.z)}`],
    ['Watertight', mp0.closed ? 'yes' : 'no'],
  ]);
}

/* ------------------------------------------------------- doc parameters */

function paramsSection(app, scope) {
  const doc = store.doc;
  const rows = [];
  const errs = app.build?.paramErrors || {};

  for (const p of doc.params) {
    const name = el('input', { type: 'text', value: p.name, spellcheck: 'false', title: 'Nama parameter' });
    const value = el('input', { type: 'text', class: 'expr', value: String(p.value), spellcheck: 'false', title: 'Nilai atau ekspresi' });
    if (errs[p.name]) value.classList.add('bad');

    const commit = () => {
      const nm = name.value.trim().replace(/[^A-Za-z0-9_]/g, '_');
      if (!nm) { name.value = p.name; return; }
      store.edit('Edit parameter', (d) => {
        const t = d.params.find(x => x.id === p.id);
        t.name = nm;
        const asNum = Number(value.value);
        t.value = Number.isFinite(asNum) && value.value.trim() !== '' ? asNum : value.value;
      });
      app.refreshUI();
    };
    name.addEventListener('change', commit);
    value.addEventListener('change', commit);
    value.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });

    rows.push(el('div', {}, [
      el('div', { class: 'param-row' }, [
        name, value,
        el('button', {
          class: 'mini-btn', text: '✕', title: 'Hapus parameter',
          onclick: () => {
            store.edit('Hapus parameter', (d) => { d.params = d.params.filter(x => x.id !== p.id); });
            app.refreshUI();
          },
        }),
      ]),
      el('div', { class: 'param-val', text: errs[p.name] ? errs[p.name] : (scope[p.name] !== undefined ? `= ${fmt(scope[p.name], 4)}` : '') }),
    ]));
  }

  rows.push(el('button', {
    class: 'btn sm', text: '+ Tambah parameter',
    onclick: () => {
      promptDialog('Parameter baru', 'Nama', 'length', (v) => {
        const nm = String(v || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
        if (!nm) return;
        store.edit('Tambah parameter', (d) => { d.params.push({ id: uid('p'), name: nm, value: 10, note: '' }); });
        app.refreshUI();
      }, { help: 'Pakai namanya di field numerik mana pun, misalnya width*2 atau sqrt(area).' });
    },
  }));
  rows.push(el('div', { class: 'hint', html: 'Operator <code>+ - * / % ^</code> dan fungsi <code>sin cos tan sqrt abs min max round deg rad clamp lerp</code>. Sudut pada fungsi trigonometri dalam radian - pakai <code>rad(30)</code>.' }));

  return section('Parameter', rows, doc.params.length > 0, { icon: 'book', badge: doc.params.length });
}

function documentSection(app) {
  const doc = store.doc;
  return section('Dokumen', [
    field('Satuan', select(doc.meta.units, Object.keys(UNITS).map(u => [u, `${u} (${UNITS[u].label})`]), (v) => {
      store.edit('Ganti satuan', (d) => { d.meta.units = v; }, { rebuild: false });
      app.refreshUI();
    })),
    field('Penulis', (() => {
      const i = el('input', { type: 'text', value: doc.meta.author || '' });
      i.addEventListener('change', () => store.quiet((d) => { d.meta.author = i.value; }));
      return i;
    })()),
    el('div', { class: 'hint', text: 'Panjang disimpan dalam milimeter. Mengubah satuan hanya mengubah tampilan dan ekspor.' }),
  ], false, { icon: 'doc-props' });
}

function viewSection(app) {
  const v = store.doc.view;
  const set = (k, val, rebuild = false) => {
    // A view setting is not a model edit, so it never becomes an undo step.
    store.quiet((d) => { d.view[k] = val; }, { rebuild });
    app.applyView();
  };
  return section('Tampilan', [
    field('Shading', segmented(v.shading, [
      ['shaded-edges', 'Rusuk', 'shade-edges'], ['shaded', 'Solid', 'shade-solid'],
      ['wire', 'Kawat', 'shade-wire'], ['xray', 'X-ray', 'shade-xray'],
    ], (val) => app.setShading(val), { icons: true })),
    field('Latar', segmented(v.bg, [
      ['studio', 'Studio'], ['graphite', 'Grafit'], ['white', 'Kertas'], ['blueprint', 'Blue'],
    ], (val) => app.setBackground(val))),
    checkbox('Grid', v.grid, (val) => set('grid', val)),
    checkbox('Sumbu dunia', v.axes, (val) => set('axes', val)),
    checkbox('Lantai bayangan', v.ground, (val) => set('ground', val)),
    checkbox('Kamera ortografis', v.ortho, (val) => set('ortho', val)),
    el('hr', { style: { border: 0, borderTop: '1px solid var(--line-soft)' } }),
    checkbox('Tampilan section', v.clip.enabled, (val) => {
      store.quiet((d) => { d.view.clip.enabled = val; });
      app.applyView();
    }),
    field('Sumbu potongan', select(v.clip.axis, [['x', 'X'], ['y', 'Y'], ['z', 'Z']], (val) => {
      store.quiet((d) => { d.view.clip.axis = val; });
      app.applyView();
    })),
    (() => {
      const box = app.build?.stats.box;
      const lim = box && !box.isEmpty() ? Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.y), Math.abs(box.max.y), Math.abs(box.min.z), Math.abs(box.max.z)) + 10 : 200;
      const r = el('input', { type: 'range', min: -lim, max: lim, step: lim / 400, value: v.clip.pos });
      r.addEventListener('input', () => {
        store.quiet((d) => { d.view.clip.pos = parseFloat(r.value); });
        app.applyView();
      });
      return field('Potongan di', r);
    })(),
    checkbox('Balik potongan', v.clip.flip, (val) => {
      store.quiet((d) => { d.view.clip.flip = val; });
      app.applyView();
    }),
  ], false, { icon: 'camera' });
}

function statsSection(app) {
  const s = app.build.stats;
  const u = store.doc.meta.units;
  const size = s.box.isEmpty() ? null : s.box.getSize(new (s.box.max.constructor)());
  return section('Ringkasan model', [kv([
    ['Badan', String(s.bodies)],
    ['Triangles', s.tris.toLocaleString()],
    ['Total volume', `${fmt(s.volume)} mm³`],
    ['Total mass', `${fmt(s.mass, 4)} kg`],
    ['Ukuran keseluruhan', size ? `${fmt(toDisplay(size.x, u))} × ${fmt(toDisplay(size.y, u))} × ${fmt(toDisplay(size.z, u))} ${u}` : '–'],
    ['Titik berat', s.bodies ? `${fmt(s.centroid.x)}, ${fmt(s.centroid.y)}, ${fmt(s.centroid.z)}` : '–'],
  ]), el('button', { class: 'btn sm', onclick: () => app.showMassReport() }, [icon('mass', { size: 13 }), 'Full report'])],
  false, { icon: 'gauge' });
}

/* ==================================================================
   Draft workspace
   ================================================================== */

function renderDraft(app, host) {
  const d = app.draft;
  const doc = store.doc;
  const sel = [...d.selection];

  host.appendChild(section('Bantuan drafting', [
    checkbox('Object snap', d.snap.on, (v) => { d.snap.on = v; d.invalidate(); }),
    checkbox('Snap ke grid', d.snap.grid, (v) => { d.snap.grid = v; d.invalidate(); }),
    checkbox('Ortho (kunci ke X/Y)', d.ortho, (v) => { d.ortho = v; if (v) d.polar = false; app.refreshUI(); }),
    checkbox('Polar tracking', d.polar, (v) => { d.polar = v; if (v) d.ortho = false; app.refreshUI(); }),
    field('Langkah polar', (() => {
      const i = el('input', { type: 'number', value: d.polarStep, min: 1, max: 90, step: 1 });
      i.addEventListener('change', () => { d.polarStep = Math.max(1, Math.min(90, parseFloat(i.value) || 15)); });
      return i;
    })()),
    el('div', { class: 'hint', text: 'Penanda snap: □ endpoint · △ midpoint · ○ centre · ◇ quadrant · ✕ intersection' }),
    el('div', {}, ['end', 'mid', 'center', 'quad', 'intersect', 'near', 'grid'].map(k =>
      checkbox(k, d.snap.kinds.has(k), (v) => { v ? d.snap.kinds.add(k) : d.snap.kinds.delete(k); d.invalidate(); }))),
  ], true, { icon: 'magnet' }));

  host.appendChild(section('Pengaturan alat', [
    field('Sisi poligon', (() => {
      const i = el('input', { type: 'number', value: d.polygonSides || 6, min: 3, max: 64 });
      i.addEventListener('change', () => { d.polygonSides = Math.max(3, Math.min(64, parseInt(i.value, 10) || 6)); });
      return i;
    })()),
    field('Ukuran teks / dim', (() => {
      const i = el('input', { type: 'number', value: d.textSize, min: 0.5, step: 0.5 });
      i.addEventListener('change', () => { d.textSize = Math.max(0.5, parseFloat(i.value) || 6); });
      return i;
    })()),
    el('div', { class: 'hint', html: 'Saat menggambar Anda bisa mengetik masukan persis: <code>50,30</code> absolut · <code>@40,0</code> relatif · <code>@60&lt;30</code> panjang &amp; sudut · <code>25</code> panjang searah kursor. Tekan Enter untuk menerapkan.' }),
  ], false, { icon: 'settings' }));

  if (sel.length) {
    host.appendChild(section(`Selection (${sel.length})`, [
      ...(sel.length === 1 ? entityFields(app, store.entity(sel[0])) : []),
      field('Pindah ke layer', select(store.entity(sel[0])?.layer || doc.draw.activeLayer,
        doc.draw.layers.map(l => [l.id, l.name]), (v) => {
          d.transformSelection('Ganti layer', (e) => { e.layer = v; });
          app.refreshUI();
        })),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn sm', text: 'Duplikat', onclick: () => d.duplicateSelection() }),
        el('button', { class: 'btn sm', text: 'Putar 90°', onclick: () => app.rotateDraftSelection(90) }),
        el('button', { class: 'btn sm', text: 'Mirror X', onclick: () => app.mirrorDraftSelection('x') }),
        el('button', { class: 'btn sm', text: 'Mirror Y', onclick: () => app.mirrorDraftSelection('y') }),
      ]),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn sm', text: 'Scale ×2', onclick: () => app.scaleDraftSelection(2) }),
        el('button', { class: 'btn sm', text: 'Scale ÷2', onclick: () => app.scaleDraftSelection(0.5) }),
        el('button', { class: 'btn sm danger', text: 'Hapus', onclick: () => { d.deleteSelection(); app.refreshUI(); } }),
      ]),
    ]));

    host.appendChild(section('Jadikan solid', [
      el('div', { class: 'hint', text: 'Ubah geometri tertutup yang dipilih menjadi fitur 3D.' }),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn primary', onclick: () => app.createFromProfile('extrude') }, [icon('extrude', { size: 14 }), 'Extrude']),
        el('button', { class: 'btn', onclick: () => app.createFromProfile('revolve') }, [icon('revolve', { size: 14 }), 'Revolve']),
      ]),
    ], true, { icon: 'cube3d' }));
  }

  host.appendChild(section('Tukar gambar', [
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn sm', text: 'Ekspor DXF', onclick: () => app.run('export.dxf') }),
      el('button', { class: 'btn sm', text: 'Ekspor SVG', onclick: () => app.run('export.svg') }),
      el('button', { class: 'btn sm', text: 'Impor DXF', onclick: () => app.run('file.import') }),
    ]),
    el('div', { class: 'hint', text: 'DXF ditulis sebagai AutoCAD R12, yang dapat dibaca setiap paket CAD dan CAM.' }),
  ], false, { icon: 'file-export' }));
}

function entityFields(app, e) {
  if (!e) return [];
  const d = app.draft;
  const u = store.doc.meta.units;
  const rows = [el('div', { class: 'row' }, [el('label', { text: 'Jenis' }), el('span', { class: 'pill', text: e.type })])];

  const num = (label, get, set, step = 1) => {
    const i = el('input', { type: 'number', value: Number(toDisplay(get(), u).toFixed(4)), step });
    i.addEventListener('change', () => {
      const v = parseFloat(i.value);
      if (!Number.isFinite(v)) return;
      store.edit('Edit object', () => { const t = store.entity(e.id); if (t) set(t, fromDisplay(v, u)); }, { rebuild: true });
      d.invalidate();
      app.refreshUI();
    });
    rows.push(field(`${label} (${u})`, i));
  };

  switch (e.type) {
    case 'line':
      num('X awal', () => e.a[0], (t, v) => { t.a[0] = v; });
      num('Y awal', () => e.a[1], (t, v) => { t.a[1] = v; });
      num('X akhir', () => e.b[0], (t, v) => { t.b[0] = v; });
      num('Y akhir', () => e.b[1], (t, v) => { t.b[1] = v; });
      rows.push(el('div', { class: 'hint', text: `Length ${fmt(toDisplay(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), u))} ${u}` }));
      break;
    case 'circle':
      num('Pusat X', () => e.c[0], (t, v) => { t.c[0] = v; });
      num('Pusat Y', () => e.c[1], (t, v) => { t.c[1] = v; });
      num('Radius', () => e.r, (t, v) => { t.r = Math.max(1e-4, v); });
      break;
    case 'rect':
      num('X1', () => e.a[0], (t, v) => { t.a[0] = v; });
      num('Y1', () => e.a[1], (t, v) => { t.a[1] = v; });
      num('X2', () => e.b[0], (t, v) => { t.b[0] = v; });
      num('Y2', () => e.b[1], (t, v) => { t.b[1] = v; });
      rows.push(el('div', { class: 'hint', text: `Ukuran ${fmt(toDisplay(Math.abs(e.b[0] - e.a[0]), u))} × ${fmt(toDisplay(Math.abs(e.b[1] - e.a[1]), u))} ${u}` }));
      break;
    case 'polygon':
      num('Pusat X', () => e.c[0], (t, v) => { t.c[0] = v; });
      num('Pusat Y', () => e.c[1], (t, v) => { t.c[1] = v; });
      num('Radius', () => e.r, (t, v) => { t.r = Math.max(1e-4, v); });
      rows.push(field('Sisi', (() => {
        const i = el('input', { type: 'number', value: e.n, min: 3, max: 64 });
        i.addEventListener('change', () => {
          store.edit('Edit polygon', () => { store.entity(e.id).n = Math.max(3, Math.min(64, parseInt(i.value, 10) || 6)); });
          app.refreshUI();
        });
        return i;
      })()));
      break;
    case 'ellipse':
      num('Pusat X', () => e.c[0], (t, v) => { t.c[0] = v; });
      num('Pusat Y', () => e.c[1], (t, v) => { t.c[1] = v; });
      num('Radius X', () => e.rx, (t, v) => { t.rx = Math.max(1e-4, v); });
      num('Radius Y', () => e.ry, (t, v) => { t.ry = Math.max(1e-4, v); });
      break;
    case 'arc':
      num('Pusat X', () => e.c[0], (t, v) => { t.c[0] = v; });
      num('Pusat Y', () => e.c[1], (t, v) => { t.c[1] = v; });
      num('Radius', () => e.r, (t, v) => { t.r = Math.max(1e-4, v); });
      break;
    case 'text':
      rows.push(field('Teks', (() => {
        const i = el('input', { type: 'text', value: e.text || '' });
        i.addEventListener('change', () => {
          store.edit('Edit text', () => { store.entity(e.id).text = i.value; });
          app.refreshUI();
        });
        return i;
      })()));
      num('Tinggi', () => e.size || 6, (t, v) => { t.size = Math.max(0.1, v); }, 0.5);
      break;
    case 'dim':
      num('Offset', () => e.off || 0, (t, v) => { t.off = v; });
      num('Ukuran teks', () => e.size || 6, (t, v) => { t.size = Math.max(0.5, v); }, 0.5);
      break;
    case 'polyline':
    case 'spline':
      rows.push(field('Titik sudut', el('span', { class: 'pill', text: String(e.pts.length) })));
      rows.push(checkbox('Tertutup', !!e.closed, (v) => {
        store.edit('Edit polyline', () => { store.entity(e.id).closed = v; });
        app.refreshUI();
      }));
      break;
    default: break;
  }
  return rows;
}

/* ==================================================================
   Simulate workspace
   ================================================================== */

function renderSim(app, host) {
  const sim = store.doc.sim;
  const s = app.sim;
  const ids = [...app.selection];
  const f = ids.length === 1 ? store.feature(ids[0]) : null;

  host.appendChild(section('Timeline', [
    field('Durasi (d)', numField(sim.duration, 0.1, 3600, 0.5, (v) => {
      store.edit('Timeline duration', (d) => { d.sim.duration = v; }, { rebuild: false });
      app.refreshUI();
    })),
    field('Laju frame', select(String(sim.fps), [['24', '24 fps'], ['30', '30 fps'], ['48', '48 fps'], ['60', '60 fps']], (v) => {
      store.edit('Laju frame', (d) => { d.sim.fps = parseInt(v, 10); }, { rebuild: false });
      app.refreshUI();
    })),
    field('Kecepatan', select(String(sim.speed), [['0.1', '0.1×'], ['0.25', '0.25×'], ['0.5', '0.5×'], ['1', '1×'], ['2', '2×'], ['4', '4×']], (v) => {
      store.quiet((d) => { d.sim.speed = parseFloat(v); });
    })),
    checkbox('Putar berulang', sim.loop, (v) => store.quiet((d) => { d.sim.loop = v; })),
  ], true, { icon: 'timeline' }));

  /* ---- construction schedule ---- */
  const schedRows = [
    checkbox('Aktifkan urutan bangun', sim.schedule.enabled, (v) => {
      store.edit('Schedule', (d) => { d.sim.schedule.enabled = v; }, { rebuild: false });
      app.refreshSim();
      app.refreshUI();
    }),
    el('div', { class: 'hint', text: 'Beri setiap body waktu mulai dan durasi - urutan konstruksi 4D klasik. Body tetap tersembunyi sampai slotnya dimulai.' }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn sm', text: 'Urutkan semua otomatis', onclick: () => app.autoSchedule() }),
      el('button', { class: 'btn sm', text: 'Hapus', onclick: () => {
        store.edit('Clear schedule', (d) => { d.sim.schedule.items = {}; }, { rebuild: false });
        app.refreshSim(); app.refreshUI();
      } }),
    ]),
  ];

  if (f) {
    const item = sim.schedule.items[f.id] || { start: 0, dur: 1, mode: 'grow', enabled: false };
    schedRows.push(el('hr', { style: { border: 0, borderTop: '1px solid var(--line-soft)' } }));
    schedRows.push(el('div', { class: 'hint', text: `Menjadwalkan “${f.name}”` }));
    schedRows.push(checkbox('Terjadwal', item.enabled !== false, (v) => setSched(app, f.id, { enabled: v })));
    schedRows.push(field('Mulai (d)', numField(item.start ?? 0, 0, 3600, 0.1, (v) => setSched(app, f.id, { start: v }))));
    schedRows.push(field('Durasi (d)', numField(item.dur ?? 1, 0.05, 3600, 0.1, (v) => setSched(app, f.id, { dur: v }))));
    schedRows.push(field('Tampil sebagai', select(item.mode || 'grow', SCHEDULE_MODES, (v) => setSched(app, f.id, { mode: v }))));
  }
  host.appendChild(section('Urutan bangun (4D)', schedRows, sim.schedule.enabled, { icon: 'sequence' }));

  /* ---- keyframes ---- */
  if (f) {
    const tr = sim.tracks[f.id] || {};
    const rows = [
      el('div', { class: 'hint', text: isi('Keyframe untuk “{name}” pada t = {t} d. Nilainya adalah offset dari posisi model.', { name: f.name, t: s.time.toFixed(2) }) }),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn sm primary', text: '◆ Keyframe', title: 'Simpan pose saat ini sebagai keyframe', onclick: () => { s.keyCurrentPose(f.id); app.refreshUI(); } }),
        el('button', { class: 'btn sm', text: 'Hapus semua', onclick: () => { s.clearTracks(f.id); app.refreshSim(); app.refreshUI(); } }),
      ]),
    ];
    for (const p of ANIM_PROPS) {
      const keys = tr[p.key] || [];
      const input = el('input', { type: 'number', step: p.unit === 'num' ? 0.05 : 1, value: currentPropValue(tr, p, s.time) });
      input.addEventListener('change', () => {
        const v = parseFloat(input.value);
        if (Number.isFinite(v)) { s.setKey(f.id, p.key, s.time, v); app.refreshSim(); app.refreshUI(); }
      });
      rows.push(el('div', { class: 'row' }, [
        el('label', { text: p.label, title: p.unit === 'len' ? 'millimetres' : p.unit === 'ang' ? 'degrees' : '' }),
        el('div', { style: { display: 'flex', gap: '4px' } }, [
          input,
          el('button', {
            class: 'mini-btn', text: '◆', title: 'Tambah keyframe di sini',
            onclick: () => { s.setKey(f.id, p.key, s.time, parseFloat(input.value) || 0); app.refreshSim(); app.refreshUI(); },
          }),
          keys.length ? el('span', { class: 'pill', text: String(keys.length) }) : null,
        ]),
      ]));
    }
    rows.push(field('Easing bawaan', select(app.defaultEase, Object.keys(EASINGS).map(k => [k, k]), (v) => { app.defaultEase = v; })));
    host.appendChild(section('Keyframe', rows));
  }

  /* ---- dynamics ---- */
  const dyn = sim.dynamics;
  const dynRows = [
    checkbox('Aktifkan dinamika rigid-body', dyn.enabled, (v) => {
      store.edit('Dinamika', (d) => { d.sim.dynamics.enabled = v; }, { rebuild: false });
      app.refreshSim(); app.refreshUI();
    }),
    field('Gravitasi (mm/d²)', numField(dyn.gravity, -100000, 100000, 100, (v) => setDyn(app, { gravity: v }))),
    checkbox('Tabrakan bidang tanah', dyn.ground, (v) => setDyn(app, { ground: v })),
    field('Z lantai', numField(dyn.groundZ, -100000, 100000, 1, (v) => setDyn(app, { groundZ: v }))),
    field('Hambatan udara', numField(dyn.airDrag, 0, 1, 0.01, (v) => setDyn(app, { airDrag: v }))),
    field('Sublangkah', numField(dyn.substeps, 1, 16, 1, (v) => setDyn(app, { substeps: Math.round(v) }))),
    el('div', { class: 'hint', text: 'Tabrakan memakai bounding-sphere tiap body - cepat, deterministik, cukup untuk uji jatuh, konveyor, dan studi packing.' }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn sm', text: 'Hitung ulang', onclick: () => { app.sim.bakeKey = ''; app.refreshSim(); } }),
      el('button', { class: 'btn sm', text: 'Bake ke keyframe', onclick: () => app.bakeDynamics() }),
    ]),
  ];

  if (f) {
    const b = dyn.bodies[f.id] || {};
    dynRows.push(el('hr', { style: { border: 0, borderTop: '1px solid var(--line-soft)' } }));
    dynRows.push(el('div', { class: 'hint', text: isi('Pengaturan body untuk “{name}”', { name: f.name }) }));
    dynRows.push(checkbox('Sertakan dalam simulasi', b.enabled !== false && !!dyn.bodies[f.id], (v) => setBody(app, f.id, { enabled: v })));
    dynRows.push(checkbox('Statis (tidak bergerak)', !!b.static, (v) => setBody(app, f.id, { static: v })));
    dynRows.push(field('Massa (kg)', numField(b.mass ?? 1, 0.001, 100000, 0.1, (v) => setBody(app, f.id, { mass: v }))));
    dynRows.push(field('Restitusi', numField(b.bounce ?? 0.35, 0, 1, 0.05, (v) => setBody(app, f.id, { bounce: v }))));
    dynRows.push(field('Gesekan', numField(b.friction ?? 0.4, 0, 1, 0.05, (v) => setBody(app, f.id, { friction: v }))));
    dynRows.push(vec3Field('Velocity (mm/s)', b.vel || [0, 0, 0], (v) => setBody(app, f.id, { vel: v })));
    dynRows.push(vec3Field('Putaran (°/s)', b.spin || [0, 0, 0], (v) => setBody(app, f.id, { spin: v })));

    const motor = b.motor || { type: 'none', axis: 'z', rate: 90, amp: 30, freq: 0.5, phase: 0, face: false };
    dynRows.push(field('Motor', select(motor.type, MOTOR_TYPES, (v) => setBody(app, f.id, { motor: { ...motor, type: v } }))));
    if (motor.type && motor.type !== 'none') {
      dynRows.push(field('Sumbu motor', select(motor.axis, [['x', 'X'], ['y', 'Y'], ['z', 'Z']], (v) => setBody(app, f.id, { motor: { ...motor, axis: v } }))));
      if (motor.type === 'spin') {
        dynRows.push(field('Laju (°/d)', numField(motor.rate ?? 90, -100000, 100000, 10, (v) => setBody(app, f.id, { motor: { ...motor, rate: v } }))));
      } else {
        dynRows.push(field('Amplitudo', numField(motor.amp ?? 30, -100000, 100000, 1, (v) => setBody(app, f.id, { motor: { ...motor, amp: v } }))));
        dynRows.push(field('Frekuensi (Hz)', numField(motor.freq ?? 0.5, 0, 100, 0.05, (v) => setBody(app, f.id, { motor: { ...motor, freq: v } }))));
        dynRows.push(field('Fase (°)', numField(motor.phase ?? 0, -360, 360, 5, (v) => setBody(app, f.id, { motor: { ...motor, phase: v } }))));
      }
      if (motor.type === 'orbit') {
        dynRows.push(checkbox('Hadapkan ke arah gerak', !!motor.face, (v) => setBody(app, f.id, { motor: { ...motor, face: v } })));
      }
      dynRows.push(el('div', { class: 'hint', text: 'Motor adalah penggerak analitik - berjalan tepat sesuai jadwal tanpa peduli gaya; itu yang diinginkan untuk mekanisme.' }));
    }
  }
  host.appendChild(section('Dinamika', dynRows, dyn.enabled, { icon: 'physics' }));

  host.appendChild(section('Ekspor simulasinya', [
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn primary', onclick: () => app.run('sim.record') }, [icon('record', { size: 14 }), 'Record video']),
      el('button', { class: 'btn', onclick: () => app.run('export.png') }, [icon('image', { size: 14 }), 'Snapshot']),
    ]),
    el('div', { class: 'hint', text: 'Rekaman memutar ulang timeline frame demi frame dan menyimpan video WebM dengan encoder peramban.' }),
  ], false, { icon: 'file-export' }));

  if (!f) {
    host.appendChild(emptyState('Pilih sebuah body', 'Pilih sebuah body untuk diberi keyframe, slot bangun, atau fisika.', 'target'));
  }
}

function currentPropValue(tr, p, t) {
  const keys = tr[p.key];
  if (!keys || !keys.length) return p.def;
  let v = keys[0].v;
  for (const k of keys) if (k.t <= t + 1e-6) v = k.v;
  return Number(v.toFixed ? v.toFixed(4) : v);
}

function numField(value, min, max, step, onChange) {
  const i = el('input', { type: 'number', value, min, max, step });
  i.addEventListener('change', () => {
    const v = parseFloat(i.value);
    if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
  });
  return i;
}

function vec3Field(label, values, onChange) {
  const box = el('div', { class: 'triplet' });
  values = values || [0, 0, 0];
  ['X', 'Y', 'Z'].forEach((ax, i) => {
    const inp = el('input', { type: 'number', value: values[i] ?? 0, step: 10, title: `${label} ${ax}` });
    inp.addEventListener('change', () => {
      const next = [...values];
      next[i] = parseFloat(inp.value) || 0;
      onChange(next);
    });
    box.appendChild(inp);
  });
  return field(label, box);
}

function setSched(app, id, patch) {
  store.edit('Item jadwal', (d) => {
    const cur = d.sim.schedule.items[id] || { start: 0, dur: 1, mode: 'grow', enabled: true };
    d.sim.schedule.items[id] = { ...cur, ...patch };
    if (patch.enabled !== false) d.sim.schedule.enabled = true;
  }, { rebuild: false });
  app.refreshSim();
  app.refreshUI();
}

function setDyn(app, patch) {
  store.edit('Dynamics setting', (d) => { Object.assign(d.sim.dynamics, patch); }, { rebuild: false });
  app.sim.bakeKey = '';
  app.refreshSim();
}

function setBody(app, id, patch) {
  store.edit('Setelan body', (d) => {
    const cur = d.sim.dynamics.bodies[id] || { mass: 1, static: false, vel: [0, 0, 0], spin: [0, 0, 0], bounce: 0.35, friction: 0.4, enabled: true };
    d.sim.dynamics.bodies[id] = { ...cur, ...patch };
    d.sim.dynamics.enabled = true;
  }, { rebuild: false });
  app.sim.bakeKey = '';
  app.refreshSim();
  app.refreshUI();
}
