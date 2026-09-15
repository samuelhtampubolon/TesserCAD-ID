/**
 * TesserCAD - application controller.
 *
 * Owns the three workspaces, the command registry, the chrome (menu bar,
 * ribbon, panels, status bar) and the keyboard map. Everything the user can
 * do is a command; the chrome is generated from those commands so a new
 * feature appears in the menus, the ribbon, the palette and the keyboard map
 * at the same time.
 */
import * as THREE from 'three';
import { bus, T } from './core/bus.js';
import {
  store, newDocument, makeFeature, makeLayer, catalogOf, CATALOG, MATERIALS, UNITS,
  saveLocal, loadLocal, clearLocal, APP_NAME, APP_VERSION, FILE_EXT, toDisplay, uid,
} from './core/doc.js';
import { rebuild, rebuildAsync, invalidateCache, massProperties } from './core/rebuild.js';
import { pool as csgPool } from './core/csg-pool.js';
import { evalSafe, EXPR_HELP } from './core/expr.js';
import { Viewport } from './view/viewport.js';
import { Draft2D, DRAW_TOOLS } from './draft/draft.js';
import { fmt, rotateEntity, scaleEntity, mirrorEntity, entityBBox } from './draft/entity.js';
import { Simulator } from './sim/sim.js';
import { recordTimeline, recordingSupported } from './sim/recorder.js';
import * as IO from './io/io.js';
import {
  el, $, $$, clear, toast, status, modal, closeModal, isModalOpen, confirmDialog, promptDialog,
  dropdown, closeDropdown, isDropdownOpen, contextMenu, commandPalette, quickMenu, closeQuickMenu,
  isQuickMenuOpen, field, checkbox, select, segmented, section, kv, scrubNumber, emptyState, icon,
} from './ui/shell.js';
import { buildCommands, TEMPLATES, registerFeatureFactory, ICON_FOR } from './ui/commands.js';
import { menuDefs, ribbonDefs, quickDefaults, viewportContextMenu, SHORT_LABEL, MENU_ICON } from './ui/menus.js';
import { OperatorHost } from './ui/operators.js';
import { MobileShell, isPhone, isTablet, attachLongPress } from './ui/mobile.js';
import { diagnose, severityLabel } from './intel/doctor.js';
import { PROCESSES, processOf } from './intel/process.js';
import { partsFrom, costDocument, compare, crossovers, levers, QUANTITIES } from './intel/cost.js';
import { releasePackage, exportIntent } from './intel/release.js';
import { MacroRecorder } from './intel/macros.js';
import * as Studio from './intel/standards.js';
import { ARCHETYPES, ARCHETYPE_IDS, synthesise, briefNotes, STRENGTH } from './intel/brief.js';
import { nextLesson, dismissLesson, allLessons, progress as whyProgress, resetSeen as resetWhy } from './intel/why.js';
import { findClashes, clearance } from './intel/interfere.js';
import { sectionAt, checkSection, standardPlanes, LOAD_CASES } from './intel/section.js';
import * as Cfg from './intel/configs.js';
import * as VCS from './intel/history.js';
import { recognise, cutterFor } from './intel/recognise.js';
import { QUALITY, retessellate, cleanMesh, segmentsFor, unitSanity } from './intel/tessellate.js';
import { buildSheet, sheetToSVG, sheetToDraw, scaleLabel, SHEETS, VIEWS, PROJECTIONS } from './intel/drawing.js';
import * as Tol from './intel/tolerance.js';
import * as Spec from './intel/spec.js';
import * as Intent from './intel/intent.js';
import * as Speak from './intel/speak.js';
import * as Chat3D from './ai/chat3d.js';
import * as Chat4D from './ai/chat4d.js';
import * as Fast from './intel/fasteners.js';
import * as Hygiene from './intel/hygiene.js';
import * as Offline from './intel/offline.js';
import { toDXF } from './draft/dxf.js';
import { renderLeftPanel } from './ui/tree.js';
import { renderRightPanel } from './ui/inspector.js';
import { TimelineUI } from './ui/timelineui.js';
import { isi } from './core/teks.js';

registerFeatureFactory(makeFeature);

const PREFS_KEY = 'tessercad-id.prefs.v1';
const DEFAULT_PREFS = {
  theme: 'dark',
  gizmoSize: 0.85,
  snapStep: 5,
  autosaveSec: 20,
  showLearn: true,
  confirmDelete: false,
  edgeAngle: 24,
  dock: 'right',
  learnDone: [],
};

const WS_META = {
  model: { label: 'Model', icon: 'cube3d', hint: 'Model - tambah solid, gabungkan, dan kendalikan setiap dimensi dari parameter.' },
  draft: { label: 'Draft', icon: 'sketch', hint: 'Draft - gambar profil 2D, lalu extrude atau revolve ke dalam model.' },
  sim: { label: 'Simulasi', icon: 'timeline', hint: 'Simulasi - geser timeline, kunci pose, urutkan pembangunan, atau jalankan fisika.' },
};

class App {
  constructor() {
    this.workspace = 'model';
    this.selection = new Set();
    this.build = null;
    this.defaultEase = 'smooth';
    this.gizmoMode = null;
    this.isolated = null;
    this._rebuildTimer = 0;
    this.prefs = this.loadPrefs();
  }

  /* ================================================================ boot */

  boot() {
    document.documentElement.setAttribute('data-theme', this.prefs.theme);
    // Which panel the tablet dock shows. Harmless on the other two tiers: no
    // rule outside the tablet breakpoint reads it.
    document.documentElement.dataset.dock = this.prefs.dock === 'left' ? 'left' : 'right';

    this.vp = new Viewport($('#viewport3d'));
    this.vp.edgeAngle = this.prefs.edgeAngle;
    this.vp.gizmo.setSize(this.prefs.gizmoSize);
    this.draft = new Draft2D($('#viewport2d'));
    this.sim = new Simulator(this.vp);
    this.timeline = new TimelineUI(this);
    this.ops = new OperatorHost(this, $('#opHud'));

    this.vp.onSelect = (id, additive) => this.select(id ? [id] : [], additive);
    this.vp.onTransformEnd = () => this.commitGizmo();
    this.vp.onTransformDrag = () => this.previewGizmo();
    this.vp.onContext = (e, hit) => this.showViewportMenu(e, hit);
    attachLongPress(this.vp.renderer.domElement, (e) => {
      this.vp._updatePointer(e);
      this.showViewportMenu(e, this.vp.pick());
    });
    attachLongPress($('#viewport2d'), (e) => this.showDraftMenu(e));
    this.vp.onPointerMove = () => { if (this.ops.running) this.ops.onPointerMove(); };
    this.draft.onStatus = (s) => this.draftStatus(s);
    this.draft.onEntityAdded = () => { this.markLearn('draw'); this.refreshUI(); };
    this.draft.onTextRequest = (place) => promptDialog('Tambah teks', 'Teks', '', (v) => { place(v); this.refreshUI(); },
      { placeholder: 'PELAT A', help: 'Tingginya diambil dari “Ukuran teks / dim” di panel kanan.' });

    this.macro = new MacroRecorder(this);
    this.macro.onChange = () => this.updateStatus();
    this.commands = buildCommands(this);
    this.commandMap = new Map(this.commands.map(c => [c.id, c]));
    this.mobile = new MobileShell(this);

    this.buildWorkspaceTabs();
    this.buildDocChip();
    this.buildTopActions();
    this.buildMenus();
    this.buildViewCube();
    this.bindGlobalUI();
    this.bindKeys();
    this.bindFiles();

    bus.on(T.DOC_CHANGED, () => this.onDocChanged());
    bus.on(T.DOC_TOUCHED, () => this.refreshUI());
    bus.on(T.SELECTION, (p) => { if (p.source === 'draft') this.refreshUI(); });
    bus.on('measure:result', (r) => this.showMeasure(r));

    this.restoreSession();
    this.setWorkspace('model');
    this.draft.start();
    this.draft.resize();
    this.renderLearn();
    // The first rebuild is awaited before framing: it is asynchronous now, and
    // a camera framed before the first body exists frames nothing. Two frames
    // after it, so the chrome has laid out and the canvas is its real size.
    this.rebuildNow().then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => this.vp.frameAll()));
      // The offline copy is registered after the first frame, never before:
      // caching sixty files must not compete with getting a model on screen.
      Offline.install().then((r) => { this._offline = r; });
    });

    this.startAutosave(Math.max(5, this.prefs.autosaveSec));
    addEventListener('beforeunload', (e) => {
      saveLocal();
      if (store.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    addEventListener('resize', () => { this.draft.resize(); this.vp.resize(); });

    $('#boot').classList.add('gone');
    setTimeout(() => $('#boot')?.remove(), 400);
  }

  /* ============================================================= prefs */

  loadPrefs() {
    try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')) }; }
    catch { return { ...DEFAULT_PREFS }; }
  }

  savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ }
  }

  setPref(key, value) {
    this.prefs[key] = value;
    this.savePrefs();
    if (key === 'gizmoSize') this.vp.gizmo.setSize(value);
    if (key === 'edgeAngle') { this.vp.edgeAngle = value; this.refreshBodies(true); }
  }

  /* ========================================================== documents */

  restoreSession() {
    const saved = loadLocal();
    if (saved?.doc && (saved.doc.features?.length || saved.doc.draw?.entities?.length)) {
      try {
        store.load(saved.doc, { markClean: false });
        this.flash(isi('Sesi terakhir Anda dipulihkan dari {when}', { when: new Date(saved.at).toLocaleString() }), 'ok', 5000);
        return;
      } catch (e) { console.warn('restore failed', e); }
    }
    store.load(TEMPLATES.find(t => t.id === 'plate').build());
    let seen = false;
    try { seen = localStorage.getItem('tessercad-id.seenWelcome') === '1'; } catch { /* ignore */ }
    if (!seen) {
      setTimeout(() => {
        this.showWelcome();
        try { localStorage.setItem('tessercad-id.seenWelcome', '1'); } catch { /* ignore */ }
      }, 550);
    }
  }

  newDocument() {
    this.guardUnsaved('Mulai dokumen baru?', () => {
      clearLocal();
      // Seeded, not silently rewritten: this only ever applies to a document
      // this session is creating, never to one that arrived from someone else.
      store.load(Studio.seedDocument(newDocument('Tanpa judul')));
      this.selection.clear();
      this.vp.frameAll();
    });
  }

  guardUnsaved(message, go) {
    if (!store.dirty) { go(); return; }
    confirmDialog('Perubahan belum disimpan', isi('{message} Apa pun yang belum disimpan ke berkas akan hilang.', { message }), go, { danger: true, yes: 'Buang dan lanjutkan' });
  }

  loadSample() {
    this.guardUnsaved('Muat model demo?', () => {
      store.load(TEMPLATES.find(t => t.id === 'flange').build());
      this.vp.frameAll();
    });
  }

  applyTemplate(t) {
    this.guardUnsaved(isi('Mulai dari “{name}”?', { name: t.name }), () => {
      store.load(t.build());
      this.selection.clear();
      setTimeout(() => this.vp.frameAll(), 80);
      this.flash(isi('Dimulai dari {template}', { template: t.name }), 'ok');
      closeModal();
    });
  }

  showTemplates() {
    modal({
      title: 'Baru dari templat', icon: 'template', wide: true,
      subtitle: 'Setiap templat adalah model parametrik yang bekerja - buka dan ubah parameternya.',
      body: [el('div', { class: 'card-grid' }, TEMPLATES.map(t => el('button', {
        class: 'card', onclick: () => this.applyTemplate(t),
      }, [icon(t.icon, { size: 22 }), el('b', { text: t.name }), el('span', { text: t.blurb })])))],
      actions: [{ label: 'Batal' }],
    });
  }

  saveAs() {
    promptDialog('Simpan sebagai', 'Nama berkas', store.doc.meta.name, (v) => {
      const name = String(v || '').trim();
      if (!name) return;
      store.quiet((d) => { d.meta.name = name; });
      IO.saveProject();
      this.refreshUI();
    }, { help: isi('Disimpan sebagai {FILE_EXT} - JSON polos yang bisa Anda simpan di git.', { FILE_EXT }) });
  }

  revert() {
    confirmDialog('Kembalikan', 'Undo semua perubahan sampai ke awal sesi ini?', () => {
      while (store.canUndo()) store.undo();
    }, { danger: true, yes: 'Kembalikan semuanya' });
  }

  clearAutosave() {
    confirmDialog('Hapus sesi tersimpan', 'Hapus salinan dokumen ini yang disimpan di peramban Anda? Dokumen di layar tidak tersentuh.', () => {
      clearLocal();
      this.flash('Sesi tersimpan dihapus', 'ok');
    }, { danger: true, yes: 'Hapus' });
  }

  showAutosave() {
    const saved = loadLocal();
    if (!saved?.doc) { this.flash('Tidak ada sesi tersimpan otomatis', 'warn'); return; }
    const n = saved.doc.features?.length || 0;
    confirmDialog('Pulihkan simpanan otomatis',
      isi('Pulihkan sesi yang tersimpan pada {p1} ({n} fitur)? Dokumen saat ini akan diganti.', { p1: new Date(saved.at).toLocaleString(), n }),
      () => { store.load(saved.doc, { markClean: false }); this.vp.frameAll(); }, { yes: 'Pulihkan' });
  }

  showDocProps() {
    const d = store.doc;
    const nameInput = el('input', { type: 'text', value: d.meta.name });
    const author = el('input', { type: 'text', value: d.meta.author || '', placeholder: 'Opsional' });
    const notes = el('textarea', { rows: 4, placeholder: 'Catatan revisi, toleransi, finishing…' });
    notes.value = d.meta.notes || '';
    const unitSel = select(d.meta.units, Object.keys(UNITS).map(u => [u, `${u} - ${{ mm: 'millimetres', cm: 'centimetres', m: 'metres', in: 'inches', ft: 'feet' }[u]}`]), () => {});
    modal({
      title: 'Properti dokumen', icon: 'doc-props',
      body: [
        field('Nama', nameInput),
        field('Penulis', author),
        field('Satuan tampilan', unitSel, { hint: 'Geometri selalu disimpan dalam milimeter; ini hanya mengubah yang Anda baca dan ekspor.' }),
        field('Catatan', notes, { full: true }),
        el('h3', { text: 'Statistik' }),
        kv([
          ['Fitur', String(d.features.length)],
          ['Drawing objects', String(d.draw.entities.length)],
          ['Parameter', String(d.params.length)],
          ['Created', new Date(d.meta.created).toLocaleString()],
          ['Modified', new Date(d.meta.modified).toLocaleString()],
          ['Schema', `v${d.schema}`],
        ]),
      ],
      actions: [
        { label: 'Batal' },
        { label: 'Terapkan', primary: true, run: () => {
          store.edit('Properti dokumen', (doc) => {
            doc.meta.name = nameInput.value.trim() || 'Tanpa judul';
            doc.meta.author = author.value;
            doc.meta.notes = notes.value;
            doc.meta.units = unitSel.value;
          }, { rebuild: false });
          this.refreshUI();
        } },
      ],
    });
  }

  /* ============================================================ rebuild */

  onDocChanged() {
    clearTimeout(this._rebuildTimer);
    this._rebuildTimer = setTimeout(() => this.rebuildNow(), 8);
  }

  /**
   * Rebuild, with the booleans off this thread.
   *
   * The rebuild is asynchronous because the expensive part of it now runs in
   * worker threads, which is the difference between a window that keeps
   * responding during a heavy boolean and one that does not. Two consequences
   * are handled here rather than pushed onto callers:
   *
   * A rebuild can be superseded while it is in flight. Every run takes a
   * ticket, and a run that finds a newer ticket on completion drops its own
   * result instead of drawing a model the user has already edited past.
   *
   * Everything after the await is the same work in the same order as before,
   * so nothing downstream has to know the rebuild ever yielded.
   */
  async rebuildNow() {
    const ticket = (this._buildTicket = (this._buildTicket || 0) + 1);
    const t0 = performance.now();
    let build;
    try {
      build = await rebuildAsync(store.doc);
    } catch (err) {
      console.error(err);
      if (ticket === this._buildTicket) this.flash(`Rebuild failed: ${err.message}`, 'err', 6000);
      return;
    }
    // A newer edit started its own rebuild while this one was running. That
    // one is the truth; this result is already stale, so it is discarded.
    if (ticket !== this._buildTicket) return;

    this.build = build;
    this.buildMs = performance.now() - t0;
    this.vp.syncBodies(this.build);
    this.sim.refreshPivots();
    this.sim.bakeKey = '';
    if (this.workspace === 'sim') this.sim.seek(this.sim.time); else this.sim.reset();
    this.applyView();
    this.applyIsolation();
    this.runDoctor();
    this.refreshUI();
    this.timeline.render();
  }

  /* ====================================================== design intelligence */

  /**
   * Re-run the checks against the current build.
   *
   * Deliberately synchronous and inside the rebuild: the findings have to be
   * true of the geometry on screen, and a check that lags a frame behind the
   * model is worse than no check because it is occasionally wrong.
   */
  runDoctor() {
    if (!this.build) { this.report = null; return; }
    if (!Studio.standards().autoDoctor) { this.report = null; return; }
    const process = store.doc.studio?.process || Studio.standards().process;
    try { this.report = diagnose(store.doc, this.build, { process }); }
    catch (err) { console.error(err); this.report = null; }
  }

  /** Apply one of the Doctor's repairs, saying plainly what changed. */
  applyFix(issue) {
    if (!issue.fix) return;
    try {
      issue.fix.apply(store, makeFeature);
      Studio.logDecision({
        title: issue.title,
        choice: issue.fix.label,
        why: issue.why,
        doc: store.doc.meta.name,
      });
      this.flash(isi('{repair}. Ctrl Z mengembalikannya.', { repair: issue.fix.label }), 'ok', 4200);
    } catch (err) {
      this.flash(isi('Perbaikan itu tidak bisa diterapkan: {error}', { error: err.message }), 'err', 6000);
    }
  }

  /** Everything the cost model needs, computed from the current build. */
  costInputs() {
    const s = Studio.standards();
    const rates = { ...s.rates, materialPrice: s.materialPrice };
    const batch = store.doc.studio?.batch || s.batch;
    const parts = this.build ? partsFrom(store.doc, this.build, massProperties) : [];
    return { parts, batch, rates, standards: s };
  }

  refreshBodies(hard = false) {
    if (hard) { invalidateCache(); this.rebuildNow(); return; }
    this.vp.syncBodies(this.build || rebuild(store.doc));
    this.vp.refreshMaterials();
    this.applyIsolation();
    this.refreshUI();
  }

  refreshSim() {
    this.sim.refreshPivots();
    if (this.workspace === 'sim') this.sim.seek(this.sim.time);
    this.timeline.render();
  }

  refreshUI() {
    renderLeftPanel(this);
    renderRightPanel(this);
    this.refreshRibbon();
    this.updateStatus();
    this.updateTopActions();
    this.mobile?.refresh();
    this.updateDockSwitch();
    const name = $('#docName');
    if (name && document.activeElement !== name) name.value = store.doc.meta.name;
    $('#docDirty')?.classList.toggle('on', store.dirty);
    this.renderLearn();
  }

  /** Keep the tablet dock switch labelled with whatever the panels now hold. */
  updateDockSwitch() {
    // The panel titles are written for a full-width heading ("Layers & objects")
    // and truncate to noise in a half-width tab, so the switch carries its own
    // short names instead.
    const names = {
      left: { draft: 'Layer', sim: 'Badan' }[this.workspace] || 'Outline',
      right: 'Properti',
    };
    for (const b of $$('.dock-switch .ds-btn')) {
      const which = b.dataset.dock;
      b.querySelector('.ds-label').textContent = names[which];
      const on = this.dock === which;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
  }

  markSaved() { $('#docDirty')?.classList.remove('on'); }

  /**
   * Autosave, and say so when it stops working.
   *
   * `saveLocal` returns false when the write is refused - browser storage is a
   * few megabytes and one imported mesh is larger than that, so a full quota is
   * the ordinary case rather than the exotic one. The indicator used to be
   * cleared either way, which told the user the document was safe at the moment
   * it stopped being written. The unload prompt still fires, because the
   * document stays dirty, but an indicator that lies is worse than no
   * indicator.
   *
   * Reported once per run of failures: a warning every few seconds is one the
   * user learns to dismiss, and this one is worth reading.
   */
  startAutosave(seconds) {
    clearInterval(this._autosave);
    this._autosave = setInterval(() => {
      if (!store.dirty) return;
      if (saveLocal()) {
        this.markSaved();
        this._autosaveFailed = false;
        return;
      }
      if (!this._autosaveFailed) {
        this._autosaveFailed = true;
        this.flash(('Simpan otomatis gagal menulis: penyimpanan peramban ini penuh. Simpan dokumen ke berkas - yang di layar aman, yang di penyimpanan tidak.'), 'warn', 9000);
      }
    }, Math.max(5, seconds) * 1000);
  }

  flash(msg, kind = 'info', ms = 3200) { toast(msg, kind, ms); }

  /* ========================================================= workspaces */

  setWorkspace(ws) {
    if (this.ops.running) this.ops.cancel();
    this.workspace = ws;
    for (const b of $$('.ws')) b.setAttribute('aria-selected', String(b.dataset.ws === ws));
    const is3d = ws !== 'draft';
    $('#viewport3d').style.display = is3d ? '' : 'none';
    $('#viewport2d').hidden = is3d;
    $('#viewcube').style.display = is3d ? '' : 'none';
    $('#axisHint').style.display = is3d ? '' : 'none';
    $('#hud').textContent = '';
    this.setTimelineVisible(ws === 'sim');
    if (is3d) { this.vp.resize(); this.vp.invalidate(); } else { this.draft.resize(); }
    if (ws === 'sim') { this.sim.refreshPivots(); this.sim.seek(this.sim.time); this.timeline.render(); }
    else { this.sim.pause(); this.sim.reset(); }
    this.vp.setGizmoMode(ws === 'model' ? this.gizmoMode : null);
    this.buildRibbon();
    this.mobile?.refresh();
    this.refreshUI();
    bus.emit(T.WORKSPACE, ws);
    status(WS_META[ws].hint);
  }

  setTimelineVisible(v) {
    $('#timeline').hidden = !v;
    if (v) setTimeout(() => this.timeline.layout(), 30);
    setTimeout(() => { this.vp.resize(); this.draft.resize(); }, 40);
  }

  /* ========================================================== selection */

  select(ids, additive = false) {
    if (this.workspace === 'draft') {
      if (!additive) this.draft.selection.clear();
      for (const id of ids) this.draft.selection.add(id);
      this.draft.invalidate();
      this.refreshUI();
      return;
    }
    if (!additive) this.selection.clear();
    for (const id of ids) {
      if (additive && this.selection.has(id)) this.selection.delete(id);
      else this.selection.add(id);
    }
    this.vp.setSelection([...this.selection]);
    bus.emit(T.SELECTION, { source: 'model', ids: [...this.selection] });
    if (ids.length) this.markLearn('select');
    this.refreshUI();
    this.timeline.render();
  }

  selectAll() {
    if (this.workspace === 'draft') this.draft.selectAll();
    else this.select(store.doc.features.filter(f => !store.consumedIds().has(f.id) && !f.suppressed).map(f => f.id));
    this.refreshUI();
  }

  invertSelection() {
    if (this.workspace === 'draft') {
      const all = store.doc.draw.entities.map(e => e.id);
      const cur = this.draft.selection;
      this.draft.selection = new Set(all.filter(id => !cur.has(id)));
      this.draft.invalidate();
    } else {
      const all = store.doc.features.filter(f => !store.consumedIds().has(f.id)).map(f => f.id);
      this.select(all.filter(id => !this.selection.has(id)));
    }
    this.refreshUI();
  }

  selectSameType() {
    const f = this.selected()[0];
    if (!f) return;
    this.select(store.doc.features.filter(x => x.type === f.type && !store.consumedIds().has(x.id)).map(x => x.id));
  }

  selected() { return [...this.selection].map(id => store.feature(id)).filter(Boolean); }

  renameSelected() {
    const f = this.selected()[0];
    if (!f) return;
    promptDialog('Ganti nama fitur', 'Nama', f.name, (v) => {
      const name = String(v || '').trim();
      if (!name) return;
      store.edit('Ganti nama fitur', () => { store.feature(f.id).name = name; }, { rebuild: false });
      this.refreshUI();
    });
  }

  /* ===================================================== feature editing */

  addFeature(type, extra = {}) {
    const cat = catalogOf(type);
    const f = makeFeature(type, extra);
    f.name = store.uniqueName(cat.label);
    if (cat.group === 'solid' && !extra.pos) {
      const h = f.params.h ?? f.params.pitch ?? 0;
      const r = f.params.r ?? f.params.R ?? f.params.ro ?? 0;
      f.transform.pos = [0, 0, type === 'sphere' ? r : (type === 'torus' ? (f.params.r || 0) : (h || r) / 2)];
    }
    store.edit(`Tambah ${cat.label}`, (doc) => { doc.features.push(f); });
    this.select([f.id]);
    this.markLearn('create');
    this.flash(`${f.name} ditambahkan`, 'ok', 1600);
    return f;
  }

  addBoolean(op) {
    const ids = [...this.selection];
    if (ids.length < 2) { this.flash('Pilih dua body atau lebih dulu', 'warn'); return; }
    const ordered = store.doc.features.filter(f => ids.includes(f.id)).map(f => f.id);
    const first = store.feature(ordered[0]);
    const f = makeFeature('boolean', { params: { op }, inputs: ordered, material: first?.material });
    f.name = store.uniqueName(op === 'union' ? 'Union' : op === 'subtract' ? 'Potong' : 'Common');
    if (first) f.appearance.color = first.appearance.color;
    store.edit(`Boolean ${op}`, (doc) => {
      const last = Math.max(...ordered.map(id => doc.features.findIndex(x => x.id === id)));
      doc.features.splice(last + 1, 0, f);
    });
    this.select([f.id]);
    this.markLearn('boolean');
    setTimeout(() => {
      const r = this.build?.results.get(f.id);
      if (r?.error) this.flash(r.error, 'err', 6000);
    }, 60);
  }

  addModifier(type) {
    const ids = [...this.selection];
    if (ids.length !== 1) { this.flash('Pilih tepat satu body', 'warn'); return; }
    const src = store.feature(ids[0]);
    const f = makeFeature(type, { inputs: [src.id], material: src.material });
    f.name = store.uniqueName(catalogOf(type).label);
    f.appearance.color = src.appearance.color;
    store.edit(`Tambah ${catalogOf(type).label}`, (doc) => {
      const i = doc.features.findIndex(x => x.id === src.id);
      doc.features.splice(i + 1, 0, f);
    });
    this.select([f.id]);
  }

  deleteSelection() {
    if (this.workspace === 'draft') { this.draft.deleteSelection(); this.refreshUI(); return; }
    const ids = new Set(this.selection);
    if (!ids.size) return;
    const go = () => {
      store.edit('Hapus fitur', (doc) => {
        doc.features = doc.features.filter(f => !ids.has(f.id));
        for (const f of doc.features) f.inputs = f.inputs.filter(i => !ids.has(i));
        for (const id of ids) { delete doc.sim.tracks[id]; delete doc.sim.schedule.items[id]; delete doc.sim.dynamics.bodies[id]; }
      });
      this.selection.clear();
      this.vp.setSelection([]);
      this.refreshUI();
    };
    if (this.prefs.confirmDelete) {
      confirmDialog('Hapus', `Hapus ${ids.size} fitur?`, go, { danger: true, yes: 'Hapus' });
    } else go();
  }

  duplicateSelection() {
    if (this.workspace === 'draft') { this.draft.duplicateSelection(); this.refreshUI(); return; }
    const ids = [...this.selection];
    if (!ids.length) return;
    const added = [];
    store.edit('Duplicate features', (doc) => {
      for (const id of ids) {
        const src = doc.features.find(f => f.id === id);
        if (!src) continue;
        const copy = structuredClone(src);
        copy.id = uid();
        copy.name = store.uniqueName(`${src.name} salinan`);
        copy.inputs = [];
        doc.features.push(copy);
        added.push(copy.id);
      }
    });
    this.select(added);
  }

  reorderFeature(srcId, targetId) {
    store.edit('Reorder features', (doc) => {
      const from = doc.features.findIndex(f => f.id === srcId);
      const to = doc.features.findIndex(f => f.id === targetId);
      if (from < 0 || to < 0) return;
      const [f] = doc.features.splice(from, 1);
      doc.features.splice(to, 0, f);
    });
  }

  toggleSuppress() {
    const ids = [...this.selection];
    if (!ids.length) return;
    const any = ids.some(id => !store.feature(id)?.suppressed);
    store.edit('Suppress', () => { for (const id of ids) { const f = store.feature(id); if (f) f.suppressed = any; } });
  }

  setVisible(visible, { all = false } = {}) {
    const ids = all ? store.doc.features.map(f => f.id) : [...this.selection];
    if (!ids.length) return;
    store.edit(visible ? 'Tampilkan' : 'Sembunyi', () => { for (const id of ids) { const f = store.feature(id); if (f) f.visible = visible; } }, { rebuild: false });
    if (all) this.isolated = null;
    this.refreshBodies();
  }

  isolate() {
    if (this.isolated) { this.isolated = null; this.flash('Isolasi mati', 'info', 1400); }
    else {
      if (!this.selection.size) return;
      this.isolated = new Set(this.selection);
      this.flash(isi('{n} body diisolasi - tekan / untuk keluar', { n: this.isolated.size }), 'ok');
    }
    this.applyIsolation();
    this.refreshUI();
  }

  applyIsolation() {
    for (const [id, group] of this.vp.bodies) {
      const f = store.feature(id);
      const base = f ? f.visible !== false : true;
      group.visible = this.isolated ? (base && this.isolated.has(id)) : base;
    }
    this.vp.invalidate();
  }

  setMaterial(key) {
    const ids = [...this.selection];
    if (!ids.length) { this.flash('Pilih sebuah body dulu', 'warn'); return; }
    const m = MATERIALS[key];
    store.edit('Tetapkan material', () => {
      for (const id of ids) {
        const f = store.feature(id);
        if (!f) continue;
        f.material = key;
        f.appearance.color = m.color;
        f.appearance.metalness = m.metal;
        f.appearance.roughness = m.rough;
      }
    }, { rebuild: false });
    this.refreshBodies();
    this.flash(isi('{material} diterapkan ke {n} body', { material: m.name, n: ids.length }), 'ok', 1800);
  }

  showMaterialPicker() {
    modal({
      title: 'Tetapkan material', icon: 'palette', wide: true,
      subtitle: 'Material mengatur tampilan dan densitas untuk properti massa.',
      body: [el('div', { class: 'card-grid' }, Object.entries(MATERIALS).map(([k, m]) => el('button', {
        class: 'card', onclick: () => { this.setMaterial(k); closeModal(); },
      }, [
        el('span', { style: { width: '22px', height: '22px', borderRadius: '5px', background: m.color, border: '1px solid rgba(127,127,127,.4)' } }),
        el('b', { text: m.name }),
        el('span', { text: `${(m.density * 1e6).toFixed(0)} kg/m³` }),
      ])))],
      actions: [{ label: 'Batal' }],
    });
  }

  pickColour() {
    const ids = [...this.selection];
    if (!ids.length) return;
    const input = el('input', { type: 'color', value: store.feature(ids[0])?.appearance.color || '#4c9fff' });
    input.addEventListener('change', () => {
      store.edit('Atur warna', () => { for (const id of ids) { const f = store.feature(id); if (f) f.appearance.color = input.value; } }, { rebuild: false });
      this.refreshBodies();
    });
    input.click();
  }

  /* ========================================================== transforms */

  startOperator(kind) {
    if (this.workspace === 'draft') { this.flash('Operator transform bekerja di workspace Model dan Simulasi', 'warn'); return; }
    if (this.ops.start(kind)) this.markLearn('transform');
  }

  setGizmo(mode) {
    this.gizmoMode = mode;
    this.vp.setGizmoMode(this.workspace === 'model' ? mode : null);
    this.refreshRibbon();
  }

  previewGizmo() {
    const ids = [...this.selection];
    if (ids.length !== 1) return;
    const g = this.vp.readGizmo();
    const group = this.vp.bodies.get(ids[0]);
    if (!group) return;
    const f = store.feature(ids[0]);
    const cur = f.transform.pos.map(v => evalSafe(v, this.build.scope, 0));
    group.matrixAutoUpdate = false;
    group.matrix.makeTranslation(g.pos[0] - cur[0], g.pos[1] - cur[1], g.pos[2] - cur[2]);
    group.updateMatrixWorld(true);
    this.vp.invalidate();
  }

  commitGizmo() {
    const ids = [...this.selection];
    if (ids.length !== 1) return;
    const g = this.vp.readGizmo();
    const round = (v) => Math.round(v * 1e4) / 1e4;
    store.edit('Transform body', () => {
      const f = store.feature(ids[0]);
      if (this.gizmoMode === 'translate') f.transform.pos = g.pos.map(round);
      else if (this.gizmoMode === 'rotate') f.transform.rot = g.rot.map(round);
      else f.transform.scale = g.scale.map(round);
    });
  }

  resetTransform() {
    const ids = [...this.selection];
    if (!ids.length) return;
    store.edit('Reset transform', () => {
      for (const id of ids) {
        const f = store.feature(id);
        if (!f) continue;
        f.transform.pos = [0, 0, 0]; f.transform.rot = [0, 0, 0]; f.transform.scale = [1, 1, 1];
      }
    });
  }

  dropSelection() {
    const ids = [...this.selection];
    if (!ids.length) return;
    const scope = this.build.scope;
    store.edit('Jatuhkan ke lantai', () => {
      for (const id of ids) {
        const res = this.build.results.get(id);
        const f = store.feature(id);
        if (!res || !f || !res.instances.length) continue;
        let minZ = Infinity;
        for (const inst of res.instances) minZ = Math.min(minZ, massProperties(inst.geometry, inst.matrix).box.min.z);
        if (Number.isFinite(minZ)) f.transform.pos[2] = evalSafe(f.transform.pos[2], scope, 0) - minZ;
      }
    });
  }

  centreSelection() {
    const ids = [...this.selection];
    if (!ids.length) return;
    const scope = this.build.scope;
    store.edit('Pusatkan di origin', () => {
      for (const id of ids) {
        const res = this.build.results.get(id);
        const f = store.feature(id);
        if (!res || !f || !res.instances.length) continue;
        const c = new THREE.Vector3();
        massProperties(res.instances[0].geometry, res.instances[0].matrix).box.getCenter(c);
        const p = f.transform.pos.map(v => evalSafe(v, scope, 0));
        f.transform.pos = [p[0] - c.x, p[1] - c.y, p[2] - c.z];
      }
    });
  }

  _bodyCentres() {
    const out = [];
    for (const id of this.selection) {
      const res = this.build?.results.get(id);
      if (!res || !res.instances.length) continue;
      const c = new THREE.Vector3();
      massProperties(res.instances[0].geometry, res.instances[0].matrix).box.getCenter(c);
      out.push({ id, c });
    }
    return out;
  }

  alignSelection(axis) {
    const list = this._bodyCentres();
    if (list.length < 2) return;
    const i = { x: 0, y: 1, z: 2 }[axis];
    const target = list.reduce((s, b) => s + b.c.getComponent(i), 0) / list.length;
    const scope = this.build.scope;
    store.edit(isi('Sejajarkan pada {p1}', { p1: axis.toUpperCase() }), () => {
      for (const b of list) {
        const f = store.feature(b.id);
        if (!f) continue;
        f.transform.pos[i] = evalSafe(f.transform.pos[i], scope, 0) + (target - b.c.getComponent(i));
      }
    });
    this.flash(isi('{n} body disejajarkan pada {axis}', { n: list.length, axis: axis.toUpperCase() }), 'ok', 1800);
  }

  distributeSelection() {
    const list = this._bodyCentres();
    if (list.length < 3) return;
    // spread along whichever axis the selection already spans most
    const span = ['x', 'y', 'z'].map((a, i) => {
      const vals = list.map(b => b.c.getComponent(i));
      return { a, i, d: Math.max(...vals) - Math.min(...vals) };
    }).sort((p, q) => q.d - p.d)[0];
    const sorted = [...list].sort((p, q) => p.c.getComponent(span.i) - q.c.getComponent(span.i));
    const lo = sorted[0].c.getComponent(span.i);
    const hi = sorted[sorted.length - 1].c.getComponent(span.i);
    const step = (hi - lo) / (sorted.length - 1);
    const scope = this.build.scope;
    store.edit('Sebarkan merata', () => {
      sorted.forEach((b, k) => {
        const f = store.feature(b.id);
        if (!f) return;
        const want = lo + step * k;
        f.transform.pos[span.i] = evalSafe(f.transform.pos[span.i], scope, 0) + (want - b.c.getComponent(span.i));
      });
    });
    this.flash(`Distributed along ${span.a.toUpperCase()}`, 'ok', 1800);
  }

  /* ============================================================== draft */

  setDraftTool(id) {
    if (this.workspace !== 'draft') this.setWorkspace('draft');
    this.draft.setTool(id);
    this.refreshRibbon();
    this.refreshUI();
  }

  toggleDraft(which) {
    const d = this.draft;
    if (which === 'snap') d.snap.on = !d.snap.on;
    if (which === 'grid') d.snap.grid = !d.snap.grid;
    if (which === 'ortho') { d.ortho = !d.ortho; if (d.ortho) d.polar = false; }
    if (which === 'polar') { d.polar = !d.polar; if (d.polar) d.ortho = false; }
    d.invalidate();
    this.refreshRibbon();
    this.refreshUI();
  }

  linkProfile(featureId) {
    const ids = [...this.draft.selection];
    if (!ids.length) { this.flash('Pilih geometri di workspace Draft dulu', 'warn'); return; }
    store.edit('Tautkan profil sketsa', () => { store.feature(featureId).profile = ids; });
    this.flash(`${ids.length} object${ids.length > 1 ? 's' : ''} linked`, 'ok');
  }

  showProfile(featureId) {
    const f = store.feature(featureId);
    if (!f?.profile?.length) { this.flash('Tidak ada profil yang tertaut', 'warn'); return; }
    this.setWorkspace('draft');
    this.draft.selection = new Set(f.profile);
    const boxes = f.profile.map(id => entityBBox(store.entity(id))).filter(Boolean);
    if (boxes.length) {
      const x1 = Math.min(...boxes.map(b => b[0])), y1 = Math.min(...boxes.map(b => b[1]));
      const x2 = Math.max(...boxes.map(b => b[2])), y2 = Math.max(...boxes.map(b => b[3]));
      this.draft.view.cx = (x1 + x2) / 2;
      this.draft.view.cy = (y1 + y2) / 2;
      this.draft.view.scale = Math.min(this.draft.w / Math.max(1, (x2 - x1) * 1.6), this.draft.h / Math.max(1, (y2 - y1) * 1.6));
    }
    this.draft.invalidate();
    this.refreshUI();
  }

  createFromProfile(kind) {
    const ids = [...this.draft.selection];
    if (!ids.length) { this.flash('Pilih geometri tertutup di workspace Draft dulu', 'warn'); return; }
    const f = makeFeature(kind, { material: 'abs' });
    f.profile = ids;
    f.name = store.uniqueName(kind === 'extrude' ? 'Extrusion' : 'Revolution');
    store.edit(`Create ${kind}`, (doc) => { doc.features.push(f); });
    this.setWorkspace('model');
    this.select([f.id]);
    this.markLearn('extrude');
    setTimeout(() => {
      const res = this.build?.results.get(f.id);
      if (res?.error) this.flash(res.error, 'err', 6000);
      else this.vp.frameAll();
    }, 60);
  }

  addLayer() {
    promptDialog('Layer baru', 'Nama', `Layer ${store.doc.draw.layers.length}`, (v) => {
      const name = String(v || '').trim();
      if (!name) return;
      const l = makeLayer(name, randomColour());
      store.edit('Tambah layer', (d) => { d.draw.layers.push(l); d.draw.activeLayer = l.id; });
      this.refreshUI();
    });
  }

  deleteLayer(id) {
    const draw = store.doc.draw;
    if (draw.layers.length <= 1) { this.flash('Layer terakhir tidak bisa dihapus', 'warn'); return; }
    const n = draw.entities.filter(e => e.layer === id).length;
    const go = () => {
      store.edit('Hapus layer', (d) => {
        d.draw.entities = d.draw.entities.filter(e => e.layer !== id);
        d.draw.layers = d.draw.layers.filter(l => l.id !== id);
        if (d.draw.activeLayer === id) d.draw.activeLayer = d.draw.layers[0].id;
      });
      this.refreshUI();
    };
    if (n) confirmDialog('Hapus layer', isi('Ini menghapus layer beserta {n} objek di dalamnya.', { n }), go, { danger: true, yes: 'Hapus' });
    else go();
  }

  draftSelectionCentre() {
    const boxes = [...this.draft.selection].map(id => entityBBox(store.entity(id))).filter(Boolean);
    if (!boxes.length) return [0, 0];
    const x1 = Math.min(...boxes.map(b => b[0])), y1 = Math.min(...boxes.map(b => b[1]));
    const x2 = Math.max(...boxes.map(b => b[2])), y2 = Math.max(...boxes.map(b => b[3]));
    return [(x1 + x2) / 2, (y1 + y2) / 2];
  }

  rotateDraftSelection(deg) {
    const c = this.draftSelectionCentre();
    this.draft.transformSelection(`Rotate ${deg}°`, (e) => rotateEntity(e, c[0], c[1], deg));
    this.refreshUI();
  }

  scaleDraftSelection(k) {
    const c = this.draftSelectionCentre();
    this.draft.transformSelection(`Scale ×${k}`, (e) => scaleEntity(e, c[0], c[1], k));
    this.refreshUI();
  }

  mirrorDraftSelection(axis) {
    const c = this.draftSelectionCentre();
    this.draft.transformSelection(`Mirror ${axis.toUpperCase()}`, (e) => mirrorEntity(e, axis, axis === 'x' ? c[0] : c[1]));
    this.refreshUI();
  }

  /* ========================================================== simulate */

  togglePlay() { if (this.workspace !== 'sim') this.setWorkspace('sim'); this.sim.toggle(); this.markLearn('play'); }
  toggleLoop() { store.quiet((d) => { d.sim.loop = !d.sim.loop; }); this.timeline.render(); this.refreshRibbon(); }

  toggleSchedule() {
    store.edit('Urutan bangun', (d) => { d.sim.schedule.enabled = !d.sim.schedule.enabled; }, { rebuild: false });
    this.refreshSim(); this.refreshUI();
  }

  togglePhysics() {
    store.edit('Dinamika', (d) => { d.sim.dynamics.enabled = !d.sim.dynamics.enabled; }, { rebuild: false });
    this.sim.bakeKey = '';
    this.refreshSim(); this.refreshUI();
  }

  keyPose() {
    const ids = [...this.selection];
    if (ids.length !== 1) { this.flash('Pilih satu body dulu', 'warn'); return; }
    this.sim.keyCurrentPose(ids[0]);
    this.refreshSim(); this.refreshUI();
    this.flash('Pose dikunci di playhead', 'ok', 1600);
  }

  clearKeys() {
    const ids = [...this.selection];
    if (ids.length !== 1) return;
    this.sim.clearTracks(ids[0]);
    this.refreshSim(); this.refreshUI();
  }

  autoSchedule() {
    const n = this.sim.autoSchedule({ perItem: 1, gap: 0.3, mode: 'grow' });
    this.setWorkspace('sim');
    this.refreshSim(); this.refreshUI();
    this.markLearn('sequence');
    this.flash(isi('{n} body diurutkan sepanjang timeline', { n }), 'ok');
  }

  clearSchedule() {
    store.edit('Hapus urutan bangun', (d) => { d.sim.schedule.items = {}; d.sim.schedule.enabled = false; }, { rebuild: false });
    this.refreshSim(); this.refreshUI();
  }

  addMotor() {
    const id = [...this.selection][0];
    if (!id) return;
    store.edit('Tambah motor', (d) => {
      const cur = d.sim.dynamics.bodies[id] || { mass: 1, static: true, vel: [0, 0, 0], spin: [0, 0, 0], bounce: 0.35, friction: 0.4, enabled: true };
      d.sim.dynamics.bodies[id] = { ...cur, static: true, motor: { type: 'spin', axis: 'z', rate: 90, amp: 30, freq: 0.5, phase: 0 } };
      d.sim.dynamics.enabled = true;
    }, { rebuild: false });
    this.setWorkspace('sim');
    this.sim.bakeKey = '';
    this.refreshSim(); this.refreshUI();
    this.flash('Motor putar ditambahkan - atur di panel Dinamika', 'ok');
  }

  bakeDynamics() {
    const n = this.sim.bakeToKeys(3);
    if (n) { this.refreshSim(); this.refreshUI(); this.flash(`Baked ${n} keyframes`, 'ok'); }
  }

  setupDropTest() {
    const ids = [...this.vp.bodies.keys()];
    if (!ids.length) { this.flash('Tambah sebuah body dulu', 'warn'); return; }
    store.edit('Siapkan uji jatuh', (d) => {
      d.sim.dynamics.enabled = true;
      d.sim.dynamics.ground = true;
      d.sim.dynamics.groundZ = 0;
      d.sim.schedule.enabled = false;
      ids.forEach((id, i) => {
        d.sim.dynamics.bodies[id] = {
          enabled: true, static: false, mass: 1,
          vel: [0, 0, 0], spin: [40 * (i % 3 - 1), 30, 0],
          bounce: 0.45, friction: 0.4,
          motor: { type: 'none', axis: 'z', rate: 90, amp: 30, freq: 0.5, phase: 0 },
        };
      });
      d.sim.duration = Math.max(d.sim.duration, 6);
    }, { rebuild: false });
    this.setWorkspace('sim');
    this.sim.bakeKey = '';
    this.refreshSim(); this.refreshUI();
    this.sim.seek(0);
    this.sim.play();
    this.flash('Uji jatuh berjalan - body jatuh ke bidang tanah', 'ok', 4000);
  }

  async recordVideo() {
    if (!recordingSupported()) { this.flash('Peramban ini tidak bisa merekam video canvas', 'err'); return; }
    this.setWorkspace('sim');
    const body = modal({
      title: 'Merekam timeline', icon: 'record',
      subtitle: 'Merender setiap frame dan menyandikannya dengan encoder video peramban.',
      body: [
        el('p', { text: 'Biarkan tab ini di depan sampai selesai.' }),
        el('div', { class: 'row wide' }, [el('progress', { id: 'recProg', max: '1', value: '0', style: { width: '100%' } })]),
      ],
    });
    const prog = body.querySelector('#recProg');
    try {
      await recordTimeline(this.vp, this.sim, { fps: store.doc.sim.fps || 30, onProgress: (p) => { prog.value = p; } });
      closeModal();
    } catch (e) {
      closeModal();
      this.flash(`Recording failed: ${e.message}`, 'err', 6000);
    }
  }

  /* ============================================================== view */

  applyView() {
    const v = store.doc.view;
    this.vp.setGrid(v.grid);
    this.vp.setAxes(v.axes);
    this.vp.setGround(v.ground);
    this.vp.setBackground(v.bg);
    this.vp.setOrtho(v.ortho);
    this.vp.setClipping(v.clip);
    this.draft.invalidate();
  }

  /**
   * View settings never enter the model's history.
   *
   * This is the single most bitterly reported thing about the packages this
   * one imitates: you press undo expecting your last edit back and instead the
   * grid turns on. How you are *looking* at a model is not a change to the
   * model, so it is written with `quiet` rather than `edit`. It still saves,
   * still travels in the document, and still marks the file dirty. It simply
   * is not an undo step, because it was never an edit.
   */
  toggleView(key) {
    store.quiet((d) => { d.view[key] = !d.view[key]; });
    this.applyView();
    this.refreshUI();
  }

  setShading(mode) {
    store.quiet((d) => { d.view.shading = mode; });
    this.refreshBodies(true);
  }

  cycleShading() {
    const modes = ['shaded-edges', 'shaded', 'wire', 'xray'];
    const next = modes[(modes.indexOf(store.doc.view.shading) + 1) % modes.length];
    this.setShading(next);
    this.flash(`Shading: ${next.replace('-', ' with ')}`, 'info', 1300);
  }

  setBackground(bg) {
    store.quiet((d) => { d.view.bg = bg; });
    this.applyView();
    this.refreshUI();
  }

  toggleSection() {
    store.quiet((d) => { d.view.clip.enabled = !d.view.clip.enabled; });
    this.applyView();
    this.refreshUI();
  }

  zoomFit() { if (this.workspace === 'draft') this.draft.zoomExtents(); else this.vp.frameAll(); }

  zoomBy(f) {
    if (this.workspace === 'draft') { this.draft.zoomBy(f); return; }
    const c = this.vp.controls;
    const dir = new THREE.Vector3().subVectors(this.vp.camera.position, c.target).multiplyScalar(1 / f);
    this.vp.camera.position.copy(c.target).add(dir);
    c.update();
    this.vp.invalidate();
  }

  toggleTheme() {
    const next = this.prefs.theme === 'light' ? 'dark' : 'light';
    this.prefs.theme = next;
    this.savePrefs();
    document.documentElement.setAttribute('data-theme', next);
    this.applyView();
    this.draft.invalidate();
    this.timeline.drawRuler();
    this.refreshUI();
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => this.flash('Layar penuh ditolak peramban', 'warn'));
  }

  stopMeasuring() { this.vp.setMeasureMode(null); $('#hud').textContent = ''; this.refreshRibbon(); }

  showMeasure(r) {
    if (!r) return;
    const u = store.doc.meta.units;
    if (r.kind === 'distance') {
      $('#hud').textContent = isi('jarak  {value} {unit}\nΔ  {dx}, {dy}, {dz}', { value: fmt(toDisplay(r.value, u)), unit: u, dx: fmt(toDisplay(r.delta.x, u)), dy: fmt(toDisplay(r.delta.y, u)), dz: fmt(toDisplay(r.delta.z, u)) });
      this.flash(`Jarak ${fmt(toDisplay(r.value, u))} ${u}`, 'ok', 6000);
    } else if (r.kind === 'angle') {
      $('#hud').textContent = isi('sudut  {value}°', { value: fmt(r.value) });
      this.flash(`Sudut ${fmt(r.value)}°`, 'ok', 6000);
    } else if (r.kind === 'point') {
      $('#hud').textContent = isi('titik  {x}, {y}, {z}', { x: fmt(toDisplay(r.point.x, u)), y: fmt(toDisplay(r.point.y, u)), z: fmt(toDisplay(r.point.z, u)) });
    }
    this.markLearn('measure');
  }

  /* ============================================================ panels
   *
   * Three layouts share one set of commands.
   *
   *   Desktop  two independent side panels, each collapsible on its own.
   *   Tablet   one dock column beside the stage. Both panels still exist and
   *            still render; `data-dock` on <html> decides which is on screen
   *            and `.dock-collapsed` hides the column entirely. Two 280px
   *            panels would leave about 200px of viewport on an iPad in
   *            portrait, which is not a CAD viewport.
   *   Phone    panels become bottom sheets, handled by MobileShell.
   *
   * `togglePanel` is what every surface calls (the T and N keys, the Window
   * menu, the panel-head buttons), so the branch lives there and nowhere else.
   */

  /** Which panel the tablet dock is currently showing. */
  get dock() { return document.documentElement.dataset.dock === 'left' ? 'left' : 'right'; }

  /** Show `side` in the tablet dock, opening the dock if it was collapsed. */
  setDock(side) {
    document.documentElement.dataset.dock = side;
    $('#workarea').classList.remove('dock-collapsed');
    this.prefs.dock = side;
    this.savePrefs();
    setTimeout(() => { this.vp.resize(); this.draft.resize(); }, 30);
    this.refreshUI();
  }

  /** Hide or show the whole tablet dock. Bound to the floating cluster. */
  toggleDock() {
    $('#workarea').classList.toggle('dock-collapsed');
    setTimeout(() => { this.vp.resize(); this.draft.resize(); }, 30);
    this.refreshUI();
  }

  isCollapsed(side) {
    if (isPhone()) return true;
    if (isTablet()) return this.dock !== side || $('#workarea').classList.contains('dock-collapsed');
    return $('#workarea').classList.contains(`${side}-collapsed`);
  }

  togglePanel(which) {
    if (which === 'timeline') { this.setTimelineVisible($('#timeline').hidden); this.refreshUI(); return; }
    if (isPhone()) { this.mobile.togglePanelSheet(which); return; }
    if (isTablet()) {
      // Asking for the panel that is already showing means "put it away";
      // asking for the other one swaps the dock rather than stacking them.
      if (this.isCollapsed(which)) this.setDock(which); else this.toggleDock();
      return;
    }
    $('#workarea').classList.toggle(`${which}-collapsed`);
    setTimeout(() => { this.vp.resize(); this.draft.resize(); }, 30);
    this.refreshUI();
  }

  zenMode() {
    const w = $('#workarea');
    const tablet = isTablet();
    const on = tablet
      ? !w.classList.contains('dock-collapsed')
      : !(w.classList.contains('left-collapsed') && w.classList.contains('right-collapsed'));
    if (tablet) {
      w.classList.toggle('dock-collapsed', on);
    } else {
      w.classList.toggle('left-collapsed', on);
      w.classList.toggle('right-collapsed', on);
    }
    if (on) this.setTimelineVisible(false);
    setTimeout(() => { this.vp.resize(); this.draft.resize(); }, 30);
    this.flash(on ? 'Mode zen - tekan Ctrl ⇧ Z untuk memunculkan panel lagi' : 'Panels restored', 'info', 2200);
    this.refreshUI();
  }

  resetLayout() {
    const w = $('#workarea');
    w.classList.remove('left-collapsed', 'right-collapsed', 'mobile-left', 'mobile-right', 'dock-collapsed');
    document.documentElement.dataset.dock = this.prefs.dock === 'left' ? 'left' : 'right';
    this.setTimelineVisible(this.workspace === 'sim');
    setTimeout(() => { this.vp.resize(); this.draft.resize(); }, 30);
    this.refreshUI();
  }

  /* ========================================================== chrome */

  buildWorkspaceTabs() {
    const host = clear($('#workspaces'));
    for (const [id, meta] of Object.entries(WS_META)) {
      host.appendChild(el('button', {
        class: 'ws', role: 'tab', dataset: { ws: id },
        'aria-selected': String(id === this.workspace),
        title: `${meta.label} workspace`,
        onclick: () => this.setWorkspace(id),
      }, [icon(meta.icon, { size: 15 }), el('span', { class: 'ws-label', text: meta.label })]));
    }
  }

  buildDocChip() {
    const host = clear($('#docChip'));
    const input = el('input', { id: 'docName', value: store.doc.meta.name, spellcheck: 'false', 'aria-label': 'Nama dokumen' });
    input.addEventListener('change', () => store.quiet((d) => { d.meta.name = input.value || 'Tanpa judul'; }));
    host.append(icon('doc-props', { size: 14 }), input, el('span', { class: 'doc-dirty', id: 'docDirty', title: 'Perubahan belum disimpan' }));
  }

  buildTopActions() {
    const host = clear($('#topActions'));
    const btn = (id, ic, title) => {
      const b = el('button', { class: 'icon-btn', title, 'aria-label': title, dataset: { cmd: id }, onclick: () => this.run(id) }, [icon(ic, { size: 16 })]);
      host.appendChild(b);
      return b;
    };
    btn('edit.undo', 'undo', 'Undo  (Ctrl Z)');
    btn('edit.redo', 'redo', 'Redo  (Ctrl ⇧ Z)');
    host.appendChild(el('span', { class: 'top-sep' }));
    btn('file.save', 'file-save', 'Simpan proyek  (Ctrl S)');
    btn('help.palette', 'command', 'Command palette  (Ctrl K)');
    host.appendChild(el('span', { class: 'top-sep' }));
    btn('view.theme', this.prefs.theme === 'light' ? 'sun' : 'moon', 'Tema terang / gelap');
    btn('help.shortcuts', 'help', 'Bantuan dan pintasan  (F1)');
    this.updateTopActions();
  }

  updateTopActions() {
    for (const b of $$('#topActions .icon-btn')) {
      const c = this.commandMap.get(b.dataset.cmd);
      if (c?.enabled) b.disabled = !c.enabled();
    }
  }

  /** Resolve a command id into a menu item with live checked/enabled state. */
  menuItem(id) {
    const c = this.commandMap.get(id);
    if (!c) return { label: id, disabled: true };
    return {
      label: c.label, icon: c.icon, key: c.key, danger: c.danger,
      checked: c.checked ? c.checked() : false,
      disabled: c.enabled ? !c.enabled() : false,
      run: () => this.run(id),
    };
  }

  buildMenus() {
    const bar = clear($('#menubar'));
    const defs = menuDefs(this, (id) => this.menuItem(id));
    for (const [label, itemsFn] of defs) {
      const b = el('button', { text: label });
      b.addEventListener('click', () => {
        if (b.classList.contains('open')) { closeDropdown(); return; }
        dropdown(b, itemsFn().filter(Boolean));
      });
      b.addEventListener('pointerenter', () => {
        if (isDropdownOpen() && !b.classList.contains('open')) dropdown(b, itemsFn().filter(Boolean));
      });
      bar.appendChild(b);
    }

    // Eleven menu buttons stop fitting somewhere around a tablet's width. Rather
    // than drop menus or scroll the bar, the same eleven collapse into one
    // button holding them as submenus; CSS decides which form is showing, so
    // both are always built and neither needs a resize listener.
    const compact = el('button', {
      class: 'menu-compact', title: 'Semua menu', 'aria-label': 'Semua menu', 'aria-haspopup': 'true',
    }, [icon('menu', { size: 16 }), el('span', { text: 'Menu' })]);
    compact.addEventListener('click', () => {
      if (compact.classList.contains('open')) { closeDropdown(); return; }
      dropdown(compact, defs.map(([label, itemsFn]) => ({
        label, icon: MENU_ICON[label], sub: itemsFn().filter(Boolean),
      })));
    });
    bar.appendChild(compact);
  }

  buildRibbon() {
    const bar = clear($('#ribbon'));
    for (const group of ribbonDefs(this)) {
      const items = el('div', { class: 'rb-items' });
      for (const it of group.items) {
        if (typeof it === 'string') items.appendChild(this.ribbonButton(it));
        else if (it.custom) items.appendChild(this.ribbonCustom(it.custom));
      }
      bar.appendChild(el('div', { class: 'rb-group' }, [items, el('div', { class: 'rb-label', text: group.label })]));
    }
    this.refreshRibbon();
  }

  ribbonButton(id) {
    const c = this.commandMap.get(id);
    if (!c) return el('span');
    const short = SHORT_LABEL[id] || c.label;
    return el('button', {
      class: 'tool', dataset: { cmd: id },
      title: `${c.label}${c.key ? `   ${c.key}` : ''}`,
      onclick: () => this.run(id),
    }, [icon(c.icon || 'dots', { size: 18 }), el('span', { class: 'tx', text: short })]);
  }

  ribbonCustom(kind) {
    if (kind === 'moreSolids') {
      const rest = Object.entries(CATALOG).filter(([, c]) => c.group === 'solid').slice(8);
      return el('button', {
        class: 'tool', title: 'Solid lain',
        onclick: (e) => dropdown(e.currentTarget, rest.map(([t]) => this.menuItem(`add.${t}`))),
      }, [icon('dots', { size: 18 }), el('span', { class: 'tx', text: 'Lainnya' })]);
    }
    if (kind === 'layerPicker') {
      const draw = store.doc.draw;
      const active = draw.layers.find(l => l.id === draw.activeLayer) || draw.layers[0];
      return el('button', {
        class: 'tool compact', title: 'Layer gambar aktif',
        onclick: (e) => dropdown(e.currentTarget, [
          { header: 'Active layer' },
          ...draw.layers.map(l => ({
            label: l.name, icon: 'layers', checked: l.id === draw.activeLayer,
            run: () => { store.edit('Active layer', (d) => { d.draw.activeLayer = l.id; }, { rebuild: false }); this.refreshUI(); this.buildRibbon(); },
          })),
          '-', this.menuItem('draft.addLayer'),
        ]),
      }, [
        el('span', { style: { width: '11px', height: '11px', borderRadius: '3px', background: active?.color || '#888', border: '1px solid rgba(127,127,127,.5)' } }),
        el('span', { class: 'tx', text: active?.name || '0' }),
        icon('chevron-down', { size: 12 }),
      ]);
    }
    if (kind === 'speedPicker') {
      const sp = store.doc.sim.speed || 1;
      return el('button', {
        class: 'tool compact', title: 'Kecepatan putar',
        onclick: (e) => dropdown(e.currentTarget, [0.1, 0.25, 0.5, 1, 2, 4].map(s => ({
          label: `${s}×`, checked: s === sp,
          run: () => { store.quiet((d) => { d.sim.speed = s; }); this.buildRibbon(); this.timeline.render(); },
        }))),
      }, [icon('gauge', { size: 18 }), el('span', { class: 'tx', text: `${sp}×` }), icon('chevron-down', { size: 12 })]);
    }
    return el('span');
  }

  refreshRibbon() {
    for (const b of $$('#ribbon .tool[data-cmd]')) {
      const c = this.commandMap.get(b.dataset.cmd);
      if (!c) continue;
      if (c.enabled) b.disabled = !c.enabled();
      if (c.checked) b.classList.toggle('toggled', !!c.checked());
    }
  }

  buildViewCube() {
    const host = clear($('#viewcube'));
    // Three letters each, because the cube's cells are sized for three and a
    // fourth is clipped. They are their own strings rather than the sheet's
    // view names: "ATAS" is right on a drawing and does not fit here.
    const FACE = {
      top: ['ATS', 'Tampilan atas'], front: ['DPN', 'Tampilan depan'], right: ['KAN', 'Tampilan kanan'],
      bottom: ['BWH', 'Tampilan bawah'], back: ['BLK', 'Tampilan belakang'], left: ['KIR', 'Tampilan kiri'],
      iso: ['ISO', 'Tampilan isometrik'],
    };
    const mk = (view, wide = false) => el('button', {
      class: `vc${wide ? ' wide' : ''}`, text: FACE[view][0], title: FACE[view][1],
      onclick: () => this.vp.standardView(view),
    });
    host.append(
      el('div', { class: 'vc-row' }, [mk('top'), mk('front'), mk('right')]),
      el('div', { class: 'vc-row' }, [mk('bottom'), mk('back'), mk('left')]),
      el('div', { class: 'vc-row' }, [
        mk('iso', true),
        el('button', { class: 'vc', title: 'Zoom pas  (F)', onclick: () => this.zoomFit() }, [icon('fit', { size: 13 })]),
      ]),
    );
    this.drawAxisHint();
    bus.on(T.VIEW, () => this.drawAxisHint());
  }

  drawAxisHint() {
    const host = $('#axisHint');
    if (!host) return;
    if (!this._axisSvg) {
      host.innerHTML = '<svg viewBox="-40 -40 80 80" width="72" height="72"></svg>';
      this._axisSvg = host.firstChild;
    }
    const m = new THREE.Matrix4().copy(this.vp.camera.matrixWorldInverse);
    const project = (v) => { const p = v.clone().applyMatrix4(m); return [p.x, -p.y]; };
    let svg = '';
    for (const [v, colour, label] of [
      [new THREE.Vector3(30, 0, 0), 'var(--x-axis)', 'X'],
      [new THREE.Vector3(0, 30, 0), 'var(--y-axis)', 'Y'],
      [new THREE.Vector3(0, 0, 30), 'var(--z-axis)', 'Z'],
    ]) {
      const [x, y] = project(v);
      const len = Math.hypot(x, y) || 1;
      const k = Math.min(1, 29 / len);
      svg += `<line x1="0" y1="0" x2="${(x * k).toFixed(1)}" y2="${(y * k).toFixed(1)}" stroke="${colour}" stroke-width="2.2" stroke-linecap="round"/>`;
      svg += `<circle cx="${(x * k).toFixed(1)}" cy="${(y * k).toFixed(1)}" r="6.5" fill="${colour}"/>`;
      svg += `<text x="${(x * k).toFixed(1)}" y="${(y * k + 3).toFixed(1)}" fill="#fff" font-size="8.5" text-anchor="middle" font-family="system-ui" font-weight="700">${label}</text>`;
    }
    this._axisSvg.innerHTML = svg;
  }

  /* ========================================================= status bar */

  updateStatus() {
    const s = this.build?.stats;
    const u = store.doc.meta.units;
    const units = clear($('#statusUnits'));
    units.append(icon('ruler', { size: 12 }), el('span', { text: u }));

    const sel = clear($('#statusSel'));
    const n = this.workspace === 'draft' ? this.draft.selection.size : this.selection.size;
    if (n) sel.append(icon('target', { size: 12 }), el('span', { text: `${n} dipilih` }));

    if (this.workspace === 'draft') {
      $('#statusStats').textContent = isi('{objects} objek · {layers} layer', { objects: store.doc.draw.entities.length, layers: store.doc.draw.layers.length });
    } else if (s) {
      $('#statusStats').textContent = isi('{bodies} body · {p1} segitiga · {p2} kg · {p3} ms', { bodies: s.bodies, p1: s.tris.toLocaleString(), p2: fmt(s.mass, 3), p3: Math.round(this.buildMs || 0) });
    }
    this.updateDoctorBadge();
    if (!this.ops.running) this.setStatusKeys(this.defaultKeyHints());
  }

  /**
   * The Doctor's headline in the status bar.
   *
   * A count that is always on screen is the difference between checking being
   * something you do and something that is simply true of the model. Clicking
   * it opens the full report; the colour is the worst finding, not an average.
   */
  updateDoctorBadge() {
    const btn = $('#statusDoctor');
    if (btn) {
      const r = this.report;
      if (!r || this.workspace === 'draft') {
        btn.hidden = true;
      } else {
        btn.hidden = false;
        btn.className = `sb-item sb-btn dx-${r.counts.block ? 'err' : r.counts.warn ? 'warn' : r.issues.length ? 'info' : 'ok'}`;
        btn.onclick = () => this.showDoctorReport();
        btn.title = isi('{checked} pemeriksaan dijalankan. Klik untuk laporan lengkap.', { checked: r.checked });
        clear(btn);
        btn.append(
          icon(r.counts.block ? 'warning' : r.issues.length ? 'probe' : 'check', { size: 12 }),
          el('span', { text: r.counts.block ? isi('{n} penghalang', { n: r.counts.block })
            : r.counts.warn ? isi('{n} peringatan', { n: r.counts.warn })
              : r.issues.length ? isi('{n} catatan', { n: r.issues.length }) : 'Pemeriksaan lolos' }),
        );
      }
    }

    const rec = $('#statusRec');
    if (rec) {
      if (!this.macro?.isRecording) { rec.hidden = true; } else {
        rec.hidden = false;
        clear(rec);
        rec.append(icon('record', { size: 12 }), el('span', { text: `Merekam · ${this.macro.recording.steps.length}` }));
      }
    }
  }

  defaultKeyHints() {
    if (matchMedia('(pointer: coarse)').matches) {
      if (this.workspace === 'draft') return [['tap', 'draw'], ['2 fingers', 'pan / zoom'], ['hold', 'menu']];
      return [['drag', 'orbit'], ['2 fingers', 'pan / zoom'], ['hold', 'menu']];
    }
    if (this.workspace === 'draft') return [['LMB', 'draw'], ['RMB', 'pan'], ['wheel', 'zoom'], ['F3/F8', 'snap/ortho']];
    if (this.workspace === 'sim') return [['space', 'play'], [',/.', 'step'], ['K', 'key pose']];
    return [['LMB', 'select'], ['RMB', 'menu'], ['G/R/S', 'transform'], ['Q', 'quick'], ['Ctrl K', 'commands']];
  }

  setStatusKeys(pairs) {
    const host = clear($('#statusKeys'));
    if (!pairs) return;
    for (const [k, label] of pairs) {
      host.appendChild(el('span', {}, [el('kbd', { text: k }), el('span', { text: label })]));
    }
  }

  draftStatus({ coords, prompt, snap }) {
    $('#statusCoords').textContent = coords;
    if (this.workspace === 'draft') status(prompt ? `${prompt}${snap ? `   ·   snap: ${snap}` : ''}` : 'Siap');
  }

  /* ========================================================= learn card */

  LEARN_STEPS = [
    ['create', 'Tambah solid dari grup <b>Buat</b>'],
    ['select', 'Klik di viewport'],
    ['transform', 'Tekan <b>G</b> lalu geser, kemudian ketik angka'],
    ['boolean', 'Pilih dua body lalu tekan <b>Subtract</b>'],
    ['draw', 'Pindah ke <b>Draft</b> lalu gambar sebuah bentuk'],
    ['extrude', 'Pilih lalu tekan <b>Extrude</b>'],
    ['sequence', 'Di <b>Simulasi</b>, tekan <b>Urutkan</b>'],
    ['play', 'Tekan <b>spasi</b> untuk memainkan timeline'],
  ];

  markLearn(step) {
    if (this.prefs.learnDone.includes(step)) return;
    this.prefs.learnDone.push(step);
    this.savePrefs();
    this.renderLearn();
  }

  toggleLearn() {
    this.prefs.showLearn = !this.prefs.showLearn;
    this.savePrefs();
    this.renderLearn();
  }

  /**
   * The card in the corner of the viewport.
   *
   * It starts as the eight-step tour and then becomes the why-tutor: once you
   * have done the eight things, the card keeps its place on screen but switches
   * to explaining the engineering reason behind whatever the document is
   * currently doing. That ordering matters - an explanation of draft angles is
   * noise to someone who has not yet made a box, and the single most useful
   * thing to a person who has.
   */
  renderLearn() {
    const card = $('#learnCard');
    if (!card) return;
    if (!this.prefs.showLearn) { card.hidden = true; return; }
    const done = new Set(this.prefs.learnDone);
    if (done.size >= this.LEARN_STEPS.length) { this.renderWhy(card); return; }

    card.hidden = false;
    card.classList.remove('why');
    clear(card);
    const next = this.LEARN_STEPS.findIndex(([k]) => !done.has(k));
    card.append(
      el('h4', {}, [
        icon('bulb', { size: 15 }),
        el('span', { text: isi('Belajar {app} · {done}/{total}', { app: APP_NAME, done: done.size, total: this.LEARN_STEPS.length }) }),
        el('button', { class: 'mini-btn', title: 'Sembunyikan kartu ini', onclick: () => this.toggleLearn() }, [icon('close', { size: 13 })]),
      ]),
      el('ol', {}, this.LEARN_STEPS.slice(Math.max(0, next - 1), next + 2).map(([k, html]) =>
        el('li', { class: done.has(k) ? 'done' : '', html }))),
      el('div', { class: 'learn-bar' }, [el('i', { style: { width: `${(done.size / this.LEARN_STEPS.length) * 100}%` } })]),
    );
  }

  renderWhy(card) {
    if (!this.build) { card.hidden = true; return; }
    const lesson = nextLesson(store.doc, this.build, this.report);
    if (!lesson) { card.hidden = true; return; }
    // Re-rendering the same lesson would restart its animation on every rebuild.
    if (this._whyId === lesson.id && !card.hidden) return;
    this._whyId = lesson.id;

    card.hidden = false;
    card.classList.add('why');
    clear(card);
    card.append(
      el('h4', {}, [
        icon(lesson.kind === 'finding' ? 'probe' : 'bulb', { size: 15 }),
        el('span', { text: lesson.kind === 'finding' ? 'Kenapa ini penting' : 'Worth knowing' }),
        el('button', {
          class: 'mini-btn', title: 'Mengerti',
          onclick: () => { dismissLesson(lesson.id); this._whyId = null; this.renderLearn(); },
        }, [icon('check', { size: 13 })]),
      ]),
      el('div', { class: 'why-title', text: lesson.title }),
      el('div', { class: 'why-body', text: lesson.body }),
      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn sm', text: 'Mengerti',
          onclick: () => { dismissLesson(lesson.id); this._whyId = null; this.renderLearn(); },
        }),
        el('button', { class: 'btn sm ghost', text: 'Berhenti tampilkan ini', onclick: () => this.toggleLearn() }),
      ]),
    );
  }

  /* ============================================================ dialogs */

  /**
   * The history dialog, which is where the tree earns its keep.
   *
   * Three groups: what you can go back to, where you are, and what is ahead.
   * Then a fourth that no linear undo stack can offer at all: the states you
   * undid past and then edited away from. In every other package those are
   * gone. Here they are a click away for as long as the session lasts.
   */
  showHistory() {
    const t = store.timeline();
    const body = el('div');

    const row = (entry, kind) => el('div', {
      class: `hist-item ${kind}`,
      onclick: () => {
        if (kind !== 'now') { store.gotoNode(entry.id); this.refreshUI(); }
        closeModal();
      },
    }, [
      icon(kind === 'now' ? 'target' : kind === 'future' ? 'redo' : kind === 'abandoned' ? 'merge' : 'undo', { size: 14 }),
      el('span', { class: 'hn', text: entry.label }),
      el('span', { class: 'hi', text: kind === 'now' ? 'Anda di sini' : '' }),
    ]);

    if (!t.past.length && !t.future.length && !t.abandoned.length) {
      body.appendChild(emptyState('Belum ada yang bisa di-undo', 'Setiap suntingan yang Anda buat mendarat di sini. Pengaturan tampilan tidak: mengubah grid atau shading bukan suntingan, jadi tidak pernah memakan satu langkah undo.', 'history'));
    } else {
      body.appendChild(el('div', { class: 'hist-list' }, [
        ...t.past.map(p => row(p, 'past')),
        row(t.now, 'now'),
        ...t.future.map(f => row(f, 'future')),
      ]));
      if (t.abandoned.length) {
        body.appendChild(section(isi('Cabang yang Anda tinggalkan · {count}', { count: t.abandoned.length }), [
          el('p', { class: 'hint', text: 'Ini keadaan yang sudah Anda Undo lalu disunting menjauh. Stack Undo linear membuangnya saat suntingan berikutnya; di sini masih bisa dijangkau. Klik untuk kembali, dan cabang Anda sekarang tetap terjangkau.' }),
          el('div', { class: 'hist-list' }, t.abandoned.slice(0, 40).map(a => row(a, 'abandoned'))),
        ], true, { icon: 'merge' }));
      }
    }

    modal({
      title: 'Riwayat', icon: 'history', wide: !!t.abandoned.length,
      subtitle: `${t.past.length} langkah ke belakang, ${t.future.length} ke depan` +
        (t.abandoned.length ? isi(', {count} di cabang yang Anda tinggalkan', { count: t.abandoned.length }) : ''),
      body,
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  showPrefs() {
    const p = this.prefs;
    modal({
      title: 'Preferensi', icon: 'settings',
      subtitle: 'Hanya tersimpan di peramban ini - ikut mesin, bukan dokumen.',
      body: [
        section('Tampilan', [
          field('Tema', segmented(p.theme, [['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']], (v) => {
            if (v !== p.theme) this.toggleTheme();
          })),
          field('Sudut tepi', scrubNumber(p.edgeAngle, () => {}, {
            step: 1, min: 1, max: 89, precision: 0,
            onCommit: (v) => this.setPref('edgeAngle', v),
          }), { hint: 'Muka yang bertemu pada sudut lebih dari ini mendapat garis tepi. Makin rendah, makin banyak tepi tampil.' }),
        ]),
        section('Interaksi', [
          field('Ukuran Gizmo', scrubNumber(p.gizmoSize, () => {}, {
            step: 0.05, min: 0.3, max: 2, precision: 2, onCommit: (v) => this.setPref('gizmoSize', v),
          })),
          field('Langkah snap', scrubNumber(p.snapStep, () => {}, {
            step: 1, min: 0.1, max: 100, precision: 2, onCommit: (v) => this.setPref('snapStep', v),
          }), { hint: 'Tahan Ctrl saat operator geser untuk snap ke kelipatan ini.' }),
          checkbox('Konfirmasi sebelum menghapus', p.confirmDelete, (v) => this.setPref('confirmDelete', v)),
          checkbox('Tampilkan kartu belajar', p.showLearn, (v) => { this.prefs.showLearn = v; this.savePrefs(); this.renderLearn(); }),
        ]),
        section('Sesi', [
          field('Simpan otomatis setiap', scrubNumber(p.autosaveSec, () => {}, {
            step: 5, min: 5, max: 600, precision: 0, suffix: ' s',
            onCommit: (v) => {
              this.setPref('autosaveSec', v);
              this.startAutosave(v);
            },
          }), { hint: 'Detik antar simpan otomatis ke penyimpanan peramban.' }),
          el('div', { class: 'btn-row' }, [
            el('button', { class: 'btn sm', text: 'Reset kartu belajar', onclick: () => { this.prefs.learnDone = []; this.savePrefs(); this.renderLearn(); this.flash('Kartu belajar direset', 'ok'); } }),
            el('button', { class: 'btn sm danger', text: 'Reset semua preferensi', onclick: () => {
              this.prefs = { ...DEFAULT_PREFS };
              this.savePrefs();
              document.documentElement.setAttribute('data-theme', this.prefs.theme);
              closeModal();
              this.refreshUI();
              this.flash('Preferensi direset', 'ok');
            } }),
          ]),
        ]),
      ],
      actions: [{ label: 'Selesai', primary: true }],
    });
  }

  showMassReport() {
    if (!this.build) return;
    const u = store.doc.meta.units;
    const rows = [];
    let totalV = 0, totalM = 0;
    for (const f of this.build.topLevel) {
      const r = this.build.results.get(f.id);
      if (!r || r.error) continue;
      let v = 0;
      for (const inst of r.instances) v += massProperties(inst.geometry, inst.matrix).volume;
      const m = v * (MATERIALS[f.material] || MATERIALS.steel).density;
      totalV += v; totalM += m;
      rows.push([f.name, MATERIALS[f.material]?.name || f.material, String(r.instances.length), `${fmt(v)} mm³`, `${fmt(m, 4)} kg`]);
    }
    const s = this.build.stats;
    const size = s.box.isEmpty() ? null : s.box.getSize(new THREE.Vector3());
    const table = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } });
    table.appendChild(el('tr', {}, ['Badan', 'Material', 'Jumlah', 'Volume', 'Massa'].map(h =>
      el('th', { text: h, style: { textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--line)', color: 'var(--txt-3)', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.07em' } }))));
    for (const r of rows) {
      table.appendChild(el('tr', {}, r.map((cell, i) =>
        el('td', { text: cell, style: { padding: '4px 6px', borderBottom: '1px solid var(--line-soft)', fontFamily: i >= 2 ? 'var(--mono)' : '', textAlign: i >= 2 ? 'right' : 'left' } }))));
    }
    modal({
      title: 'Properti massa', icon: 'mass', wide: true,
      subtitle: `${s.bodies} body · ${s.tris.toLocaleString()} segitiga`,
      body: [
        rows.length ? table : emptyState('Tidak ada yang bisa diukur', 'Tambah sebuah solid dulu.', 'mass'),
        el('h3', { text: 'Total' }),
        kv([
          ['Volume', `${fmt(totalV)} mm³`],
          ['Massa', `${fmt(totalM, 4)} kg`],
          ['Ukuran keseluruhan', size ? `${fmt(toDisplay(size.x, u))} × ${fmt(toDisplay(size.y, u))} × ${fmt(toDisplay(size.z, u))} ${u}` : '–'],
          ['Titik berat', s.bodies ? `${fmt(s.centroid.x)}, ${fmt(s.centroid.y)}, ${fmt(s.centroid.z)} mm` : '–'],
          ['Surface area', `${fmt(s.area)} mm²`],
        ]),
        el('p', { class: 'hint', text: 'Volume berasal dari teorema divergensi pada tiap mesh tertutup: tepat untuk body kedap, tidak bermakna untuk yang terbuka - panel fitur menandai mana yang mana.' }),
      ],
      actions: [
        { label: 'Ekspor CSV', run: () => this.exportBOM() },
        { label: 'Tutup', primary: true },
      ],
    });
  }

  exportBOM() {
    if (!this.build) return;
    const per = new Map();
    for (const f of this.build.topLevel) {
      const r = this.build.results.get(f.id);
      if (!r || r.error) continue;
      let volume = 0;
      for (const inst of r.instances) volume += massProperties(inst.geometry, inst.matrix).volume;
      per.set(f.id, { volume, mass: volume * (MATERIALS[f.material] || MATERIALS.steel).density });
    }
    IO.exportBOM({ ...this.build, perFeature: per });
  }

  /* ------------------------------------------------- the doctor, in full */

  showDoctorReport() {
    if (!this.build) return;
    this.runDoctor();
    const r = this.report;
    if (!r) { this.flash('Pemeriksaan berkelanjutan dimatikan di standar Studio.', 'warn'); return; }
    const proc = processOf(store.doc.studio?.process || Studio.standards().process);

    const body = [
      el('p', { class: 'hint', text: isi('{n} pemeriksaan dijalankan terhadap {process}. {note}', { n: r.checked, process: proc.label, note: proc.note }) }),
    ];
    if (!r.issues.length) {
      body.push(el('div', { class: 'banner ok', text: 'Semua lolos. Model siap dirilis.' }));
    } else {
      for (const issue of r.issues) {
        const sev = issue.severity === 3 ? 'err' : issue.severity === 2 ? 'warn' : 'info';
        body.push(el('div', { class: `dx-item ${sev}` }, [
          el('div', { class: 'dx-head' }, [
            el('span', { class: `dx-sev ${sev}`, text: severityLabel(issue.severity) }),
            el('span', { class: 'dx-title', text: issue.title }),
          ]),
          issue.detail ? el('div', { class: 'dx-detail', text: issue.detail }) : null,
          issue.why ? el('div', { class: 'dx-why', text: issue.why }) : null,
          issue.fix ? el('div', { class: 'btn-row' }, [
            el('button', {
              class: 'btn sm primary', text: issue.fix.label,
              onclick: (e) => { this.applyFix(issue); e.target.disabled = true; e.target.textContent = ('Diterapkan'); },
            }),
          ]) : null,
        ].filter(Boolean)));
      }
    }
    modal({
      title: 'Design doctor', icon: 'probe', wide: true,
      subtitle: r.issues.length
        ? isi('{block} penghalang · {warn} peringatan · {note} catatan', { block: r.counts.block, warn: r.counts.warn, note: r.counts.note })
        : 'Tidak ada temuan',
      body,
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  /* --------------------------------------------------- cost and release */

  showCostReport() {
    if (!this.build) return;
    const { parts, batch, rates, standards: s } = this.costInputs();
    if (!parts.length) { this.flash('Tidak ada body untuk dihitung biayanya.', 'warn'); return; }

    const est = costDocument(parts, { batch, rates });
    const body = [];

    body.push(el('div', { class: 'banner warn', text: 'Perkiraan orde-besar dari model tarif generik, bukan penawaran. Baca bentuk jawabannya - proses mana yang menang, dimensi mana yang mendorong harga - dan abaikan angka mutlak.' }));

    const qtyRow = el('div', { class: 'row wide' }, [
      el('label', { text: 'Ukuran batch' }),
      select(String(batch), QUANTITIES.map(q => [String(q), String(q)]), (v) => {
        const n = Number(v);
        store.quiet((d) => { d.studio = { ...(d.studio || {}), batch: n }; });
        Studio.setStandard('batch', n);
        closeModal();
        this.showCostReport();
      }),
    ]);
    body.push(qtyRow);

    body.push(el('div', { class: 'big-stat' }, [
      el('span', { class: 'bs-value', text: est.each.toFixed(2) }),
      el('span', { class: 'bs-unit', text: isi('{cur}per unit pada batch {n}', { cur: s.currency ? s.currency + ' ' : '', n: batch }) }),
    ]));

    for (const { part, cost } of est.rows) {
      const cmp = compare(part, { batch, rates });
      body.push(section(part.name, [
        kv([
          ['Proses termurah', cost.label],
          ['Per unit', cost.each.toFixed(2)],
          ['Material', `${cost.material.toFixed(2)}  (${(cost.materialKg * 1000).toFixed(0)} g billed)`],
          ['Waktu mesin', `${cost.machine.toFixed(2)}  (${cost.hours.toFixed(2)} h)`],
          ['Setup, per part', cost.setup.toFixed(2)],
          ['Perkakas, per part', cost.tooling.toFixed(2)],
        ]),
        el('div', { class: 'hint', text: isi('Pendorong biaya terbesar: {label}.', { label: cost.drivers[0]?.label || ('none') }) +
          (cost.removedFraction > 0.6 ? ' ' + isi('{pct}% blok stok dipotong dan dibuang.', { pct: (cost.removedFraction * 100).toFixed(0) }) : '') }),
        el('table', { class: 'mass-table' }, [
          el('thead', {}, [el('tr', {}, ['Proses', 'Per unit', 'Material', 'Mesin'].map(h => el('th', { text: h })))]),
          el('tbody', {}, cmp.rows.map(row => el('tr', { class: row.processId === cost.processId ? 'on' : '' }, [
            el('td', { text: row.label }),
            el('td', { class: 'mono', text: row.each.toFixed(2) }),
            el('td', { class: 'mono', text: row.material.toFixed(2) }),
            el('td', { class: 'mono', text: row.machine.toFixed(2) }),
          ]))),
        ]),
      ], true, { icon: 'gauge' }));
    }

    if (parts.length === 1) {
      const cross = crossovers(parts[0], { rates });
      const lev = levers(parts[0], { batch, rates });
      body.push(section('Bagaimana jumlah mengubah jawabannya', [
        el('table', { class: 'mass-table' }, [
          el('thead', {}, [el('tr', {}, ['Quantity', 'Cheapest', 'Per unit'].map(h => el('th', { text: h })))]),
          el('tbody', {}, cross.points.map(pt => el('tr', {}, [
            el('td', { class: 'mono', text: String(pt.qty) }),
            el('td', { text: pt.label || '–' }),
            el('td', { class: 'mono', text: pt.each.toFixed(2) }),
          ]))),
        ]),
        ...cross.changes.map(c => el('div', { class: 'hint', text: isi('Antara {from} dan {to} unit, {winner} menyalip {loser}.', { from: c.from.qty, to: c.to.qty, winner: c.to.label, loser: c.from.label }) })),
        cross.changes.length ? null : el('div', { class: 'hint', text: 'Satu proses menang di setiap kuantitas di sini, jadi keputusan tidak bergantung pada volume.' }),
      ].filter(Boolean), true, { icon: 'timeline' }));

      if (lev.length) {
        body.push(section('Apa yang akan membuatnya lebih murah', lev.map(l => el('div', { class: 'dx-item info' }, [
          el('div', { class: 'dx-head' }, [
            el('span', { class: 'dx-sev info', text: `−${(l.saving * 100).toFixed(0)}%` }),
            el('span', { class: 'dx-title', text: l.label }),
          ]),
          el('div', { class: 'dx-why', text: l.note }),
          el('div', { class: 'dx-detail', text: isi('{price} per unit dengan {process}.', { price: l.each.toFixed(2), process: l.process }) }),
        ])), true, { icon: 'bulb' }));
      }
    }

    modal({
      title: 'Perkiraan biaya', icon: 'gauge', wide: true,
      subtitle: isi('{count} part · batch {batch} · total {p1} kg', { count: parts.length, batch, p1: est.mass.toFixed(3) }),
      body,
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  showRelease() {
    if (!this.build) return;
    const s = Studio.standards();
    const proc = store.doc.studio?.process || s.process;
    const batch = store.doc.studio?.batch || s.batch;
    this.runDoctor();
    const r = this.report || diagnose(store.doc, this.build, { process: proc });
    const blocking = r.issues.filter(i => i.severity === 3);

    const body = [
      el('p', { class: 'hint', text: 'Satu arsip berisi geometri, gambar kerja, bill of materials, dasar biaya, sumber yang bisa disunting, dan catatan setiap pemeriksaan.' }),
      el('div', { class: 'row wide' }, [
        el('label', { text: 'Proses' }),
        select(proc, Object.entries(PROCESSES).map(([k, v]) => [k, v.label]), (v) => {
          store.quiet((d) => { d.studio = { ...(d.studio || {}), process: v }; });
          Studio.setStandard('process', v);
          closeModal(); this.showRelease();
        }),
      ]),
      el('div', { class: 'row wide' }, [
        el('label', { text: 'Ukuran batch' }),
        select(String(batch), QUANTITIES.map(q => [String(q), String(q)]), (v) => {
          store.quiet((d) => { d.studio = { ...(d.studio || {}), batch: Number(v) }; });
          Studio.setStandard('batch', Number(v));
          closeModal(); this.showRelease();
        }),
      ]),
    ];

    if (blocking.length) {
      body.push(el('div', { class: 'banner err', text: isi('{n} temuan penghalang harus dibereskan dulu. Rilis adalah saat sebuah kesalahan paling mahal, jadi yang ini bukan peringatan yang bisa Anda klik lewati.', { n: blocking.length }) }));
      for (const i of blocking) {
        body.push(el('div', { class: 'dx-item err' }, [
          el('div', { class: 'dx-head' }, [el('span', { class: 'dx-title', text: i.title })]),
          i.detail ? el('div', { class: 'dx-detail', text: i.detail }) : null,
          i.fix ? el('div', { class: 'btn-row' }, [
            el('button', {
              class: 'btn sm primary', text: i.fix.label,
              onclick: () => { this.applyFix(i); closeModal(); setTimeout(() => this.showRelease(), 60); },
            }),
          ]) : null,
        ].filter(Boolean)));
      }
    } else {
      body.push(el('div', { class: 'banner ok', text: isi('Semua {n} pemeriksaan lolos. {warnings} peringatan dan {notes} catatan akan dicatat di dalam paket.', { n: r.checked, warnings: r.counts.warn, notes: r.counts.note }) }));
    }

    modal({
      title: 'Rilis desain', icon: 'download', wide: true,
      subtitle: store.doc.meta.name,
      body,
      actions: [
        { label: 'Batal' },
        {
          label: blocking.length ? 'Release anyway' : 'Bangun paketnya',
          primary: !blocking.length, danger: !!blocking.length,
          run: () => {
            const out = releasePackage(this, { process: proc, batch, force: true });
            if (!out.ok) this.flash(out.reason || 'Release failed', 'err', 6000);
            else this.flash(`${out.name}: ${out.files.length} berkas`, 'ok', 5000);
          },
        },
      ],
    });
  }

  /* ------------------------------------------------------- design brief */

  showBrief() {
    const s = Studio.standards();
    let id = ARCHETYPE_IDS[0];
    let material = s.material;
    const values = {};

    const host = el('div');
    const preview = el('div', { class: 'brief-preview' });

    const renderPreview = () => {
      clear(preview);
      let result;
      try { result = synthesise(id, values, { material, process: s.process }); }
      catch (e) { preview.appendChild(el('div', { class: 'banner err', text: e.message })); return null; }

      preview.append(
        el('div', { class: 'msec-head', text: 'Cara ukurannya ditentukan' }),
        el('ul', { class: 'why-list' }, result.rationale.map(t => el('li', { text: t }))),
      );
      if (result.warnings.length) {
        for (const w of result.warnings) preview.appendChild(el('div', { class: 'banner warn', text: w }));
      }
      preview.append(
        el('div', { class: 'msec-head', text: `${result.params.length} parameters, ${result.features.length} features` }),
        el('div', { class: 'hint', text: result.params.map(p => p.name).join(' · ') }),
        el('div', { class: 'hint', text: 'Setiap dimensi di atas ditulis ke dalam model sebagai ekspresi, jadi mengubah bebannya mengubah partnya.' }),
      );
      return result;
    };

    const renderFields = () => {
      clear(host);
      const arch = ARCHETYPES[id];
      for (const f of arch.fields) if (values[f.key] === undefined) values[f.key] = f.def;

      host.appendChild(el('div', { class: 'card-grid' }, ARCHETYPE_IDS.map(k => el('button', {
        class: `card${k === id ? ' on' : ''}`,
        onclick: () => { id = k; for (const key of Object.keys(values)) delete values[key]; renderFields(); },
      }, [
        icon(ARCHETYPES[k].icon, { size: 20 }),
        el('b', { text: ARCHETYPES[k].label }),
        el('span', { text: ARCHETYPES[k].blurb }),
      ]))));

      // The blurb is already on the selected card; repeating it here just
      // pushed the live sizing below the fold.
      const fields = el('div', { class: 'brief-fields' });
      const grid = el('div', { class: 'brief-grid' }, [fields, preview]);

      for (const f of arch.fields) {
        let control;
        if (f.kind === 'bool') {
          fields.appendChild(checkbox(f.label, !!values[f.key], (v) => { values[f.key] = v; renderPreview(); }));
          continue;
        }
        if (f.kind === 'select') {
          control = select(values[f.key], f.options.map(o => [o, o]), (v) => { values[f.key] = v; renderPreview(); });
        } else {
          const i = el('input', { type: 'number', value: String(values[f.key]), step: 'any' });
          i.addEventListener('input', () => { values[f.key] = Number(i.value); renderPreview(); });
          control = i;
        }
        fields.appendChild(el('div', { class: 'row wide' }, [
          el('label', { text: f.unit ? `${f.label} (${f.unit})` : f.label }), control,
        ]));
      }

      fields.appendChild(el('div', { class: 'row wide' }, [
        el('label', { text: 'Material' }),
        select(material, Object.entries(MATERIALS).map(([k, m]) => [k, `${m.name}${STRENGTH[k] ? ` · ${STRENGTH[k].yield} MPa` : ''}`]), (v) => {
          material = v; renderPreview();
        }),
      ]));
      host.appendChild(grid);
      renderPreview();
    };

    renderFields();

    modal({
      title: 'Brief desain', icon: 'bulb', wide: true,
      subtitle: 'Nyatakan kebutuhan; dapatkan model parametrik yang bisa diedit beserta ukurannya.',
      body: [
        el('div', { class: 'banner warn', text: 'Perhitungan tertutup dari buku teks pada penampang ideal. Tanpa konsentrasi tegangan, kelelahan, buckling, atau syarat batas nyata. Bukan pengganti analisis atau tanda tangan insinyur.' }),
        host,
      ],
      actions: [
        { label: 'Batal' },
        {
          label: 'Bangun modelnya', primary: true,
          run: () => {
            const result = synthesise(id, values, { material, process: s.process });
            this.applyBrief(result, values);
          },
        },
      ],
    });
  }

  /** Turn a synthesised brief into a real document, in one undoable step. */
  applyBrief(result, values) {
    store.edit(`Design brief: ${result.label}`, (d) => {
      d.params = result.params.map(p => ({ id: uid('p'), name: p.name, value: p.value, note: p.note }));
      const made = [];
      for (const spec of result.features) {
        const f = makeFeature(spec.type, {
          name: spec.name,
          params: spec.params,
          material: result.material,
          pos: spec.pos,
          inputs: (spec.inputs || []).map(i => made[i]?.id).filter(Boolean),
        });
        made.push(f);
      }
      d.features = made;
      d.meta.notes = briefNotes(result, values);
    });
    Studio.logDecision({
      title: isi('{label} dari sebuah design brief', { label: result.label }),
      choice: result.rationale[0] || '',
      why: result.rationale.join(' '),
      doc: store.doc.meta.name,
    });
    this.markLearn('create');
    setTimeout(() => this.vp.frameAll(), 120);
    this.flash(isi('{label} dibangun. Perhitungan ukurannya ada di Dokumen → catatan.', { label: result.label }), 'ok', 5200);
  }

  /* ------------------------------------------------------------ macros */

  showMacros() {
    const render = () => {
      const list = this.macro.list;
      const body = [
        el('p', { class: 'hint', text: 'Makro adalah rekaman perintah. Tekan rekam, lakukan sekali, tekan stop. Memutar ulang adalah satu langkah Undo. Hanya perintah dari registry yang direkam; geser di viewport tidak.' }),
      ];

      if (this.macro.isRecording) {
        body.push(el('div', { class: 'banner warn', text: isi('Merekam “{name}” · {n} langkah sejauh ini.', { name: this.macro.recording.name, n: this.macro.recording.steps.length }) }));
      }

      if (!list.length) {
        body.push(emptyState('Belum ada makro', 'Rekam satu dari Studio → Rekam makro, atau tekan tombol rekam di bawah.', 'record'));
      } else {
        for (const m of list) {
          body.push(el('div', { class: 'dx-item info' }, [
            el('div', { class: 'dx-head' }, [
              el('span', { class: 'dx-title', text: m.name }),
              el('span', { class: 'pill', text: `${m.steps.length} langkah` }),
            ]),
            el('div', { class: 'dx-detail', text: m.steps.map(x => this.commandMap.get(x.id)?.label || x.id).join(' → ') }),
            m.needsSelection ? el('div', { class: 'dx-why', text: 'Sebagian perintahnya bekerja pada pilihan, jadi pilih sesuatu sebelum menjalankannya.' }) : null,
            el('div', { class: 'btn-row' }, [
              el('button', {
                class: 'btn sm primary', text: 'Jalankan',
                onclick: () => {
                  const out = this.macro.run(m);
                  this.flash(out.ok
                    ? isi('Menjalankan {ran} dari {total} langkah{p1}. Ctrl Z membatalkan semuanya.', { ran: out.ran, total: out.total, p1: out.failed.length ? `, ${out.failed.length} skipped` : '' })
                    : `Nothing ran: ${out.reason || out.failed[0]?.why || 'tidak ada perintah yang berlaku'}`,
                  out.ok ? 'ok' : 'warn', 5000);
                },
              }),
              el('button', {
                class: 'btn sm', text: 'Ganti nama',
                onclick: () => promptDialog('Ganti nama makro', 'Nama', m.name, (v) => {
                  if (v) { this.macro.rename(m.id, v); closeModal(); this.showMacros(); }
                }),
              }),
              el('button', {
                class: 'btn sm danger', text: 'Hapus',
                onclick: () => { this.macro.remove(m.id); closeModal(); this.showMacros(); },
              }),
            ]),
          ].filter(Boolean)));
        }
      }

      modal({
        title: 'Makro', icon: 'record', wide: true,
        subtitle: `${list.length} recorded`,
        body,
        actions: [
          this.macro.isRecording
            ? { label: 'Stop rekaman', primary: true, run: () => this.stopMacro() }
            : { label: 'Rekam makro baru', primary: true, run: () => this.startMacro() },
          { label: 'Tutup' },
        ],
      });
    };
    render();
  }

  startMacro() {
    promptDialog('Rekam makro', 'Beri nama', 'My workflow', (name) => {
      this.macro.start(name || 'Macro');
      this.flash('Merekam. Setiap perintah yang Anda jalankan direkam sampai Anda berhenti.', 'info', 5000);
      this.refreshUI();
    }, { help: 'Lakukan alur kerjanya sekali, lalu berhenti. Memutar ulang adalah satu langkah undo.' });
  }

  stopMacro() {
    const m = this.macro.stop();
    if (!m) { this.flash('Tidak ada yang bisa diputar ulang terekam.', 'warn'); this.refreshUI(); return; }
    this.flash(isi('“{name}” disimpan dengan {n} langkah.', { name: m.name, n: m.steps.length }), 'ok', 4500);
    this.refreshUI();
  }

  /* ------------------------------------------------- studio standards */

  showStudio() {
    const s = Studio.standards();
    const set = (k) => (v) => { Studio.setStandard(k, v); this.runDoctor(); this.refreshUI(); };

    const body = [
      el('p', { class: 'hint', text: 'Pengaturan yang cukup diberitahu sekali. Mereka mengisi setiap dokumen baru dan menjadi acuan Design Doctor. Semuanya tetap di peramban ini.' }),

      section('Bawaan studio', [
        field('Satuan', select(s.units, Object.keys(UNITS).map(u => [u, u]), set('units'))),
        field('Material', select(s.material, Object.entries(MATERIALS).map(([k, m]) => [k, m.name]), set('material'))),
        field('Proses', select(s.process, Object.entries(PROCESSES).map(([k, p]) => [k, p.label]), set('process'))),
        field('Ukuran batch', select(String(s.batch), QUANTITIES.map(q => [String(q), String(q)]), (v) => set('batch')(Number(v)))),
        (() => {
          const i = el('input', { type: 'text', value: s.author || '', placeholder: 'Nama pada setiap dokumen baru' });
          i.addEventListener('change', () => Studio.setStandard('author', i.value));
          return field('Penulis', i);
        })(),
      ], true, { icon: 'workspace' }),

      section('Batas manufaktur', [
        el('div', { class: 'hint', text: isi('Biarkan kosong untuk memakai bawaan proses. {process}: dinding {wall}mm, fitur {feature}mm, ±{tolerance}mm.', { process: processOf(s.process).label, wall: processOf(s.process).minWall, feature: processOf(s.process).minFeature, tolerance: processOf(s.process).tolerance }) }),
        ...[['minWall', 'Minimum wall'], ['minFeature', 'Minimum feature'], ['tolerance', 'Tolerance ±']].map(([k, label]) => {
          const i = el('input', { type: 'number', step: '0.1', value: s[k] ?? '', placeholder: 'bawaan proses' });
          i.addEventListener('change', () => Studio.setStandard(k, i.value === '' ? null : Number(i.value)));
          return field(label, i);
        }),
      ], false, { icon: 'ruler' }),

      section('Perilaku', [
        checkbox('Periksa model secara berkelanjutan', s.autoDoctor, (v) => { Studio.setStandard('autoDoctor', v); this.runDoctor(); this.refreshUI(); }),
        checkbox('Isi dokumen baru dari standar ini', s.seedNewDocuments, set('seedNewDocuments')),
      ], false, { icon: 'settings' }),

      section('Catatan keputusan', [
        el('div', { class: 'hint', text: 'Apa yang dipilih dan mengapa. Ditulis saat Anda menerima perbaikan atau membangun dari brief, dan disimpan lintas proyek, karena alasan di balik desain hidup lebih lama daripada berkasnya.' }),
        ...(() => {
          const d = Studio.decisions();
          if (!d.length) return [el('div', { class: 'hint', text: 'Belum ada catatan.' })];
          return d.slice(0, 20).map(x => el('div', { class: 'dx-item info' }, [
            el('div', { class: 'dx-head' }, [
              el('span', { class: 'dx-title', text: x.title }),
              el('span', { class: 'pill', text: new Date(x.at).toISOString().slice(0, 10) }),
            ]),
            x.choice ? el('div', { class: 'dx-detail', text: x.choice }) : null,
            x.why ? el('div', { class: 'dx-why', text: x.why }) : null,
            x.doc ? el('div', { class: 'hint', text: x.doc }) : null,
          ].filter(Boolean)));
        })(),
      ], false, { icon: 'history', badge: Studio.decisions().length }),

      section('Portabilitas', [
        el('div', { class: 'hint', text: 'Standar, keputusan, dan makro dalam satu berkas, untuk pindah mesin atau diserahkan ke rekan.' }),
        el('div', { class: 'btn-row' }, [
          el('button', { class: 'btn sm', text: 'Ekspor studio', onclick: () => IO.download('tessercad-id-studio.json', Studio.exportStudio(), 'application/json') }),
          el('button', {
            class: 'btn sm', text: 'Impor studio…',
            onclick: async () => {
              const file = await this.pickFileAsync('.json');
              if (!file) return;
              try { Studio.importStudio(await file.text()); closeModal(); this.showStudio(); this.flash('Studio diimpor.', 'ok'); }
              catch (e) { this.flash(e.message, 'err', 6000); }
            },
          }),
          el('button', {
            class: 'btn sm danger', text: 'Reset standar',
            onclick: () => confirmDialog('Reset standar', 'Kembalikan setiap bawaan studio ke setelan pabrik. Keputusan dan makro tetap disimpan.', () => {
              Studio.resetStandards(); closeModal(); this.showStudio();
            }, { danger: true, yes: 'Reset' }),
          }),
        ]),
      ], false, { icon: 'file-export' }),
    ];

    modal({ title: 'Standar studio', icon: 'workspace', wide: true, body, actions: [{ label: 'Selesai', primary: true }] });
  }

  showLessons() {
    const list = allLessons();
    const p = whyProgress();
    modal({
      title: 'Catatan teknik', icon: 'book', wide: true,
      subtitle: isi('{read} dari {total} terbaca', { read: p.read, total: p.total }),
      body: [
        el('p', { class: 'hint', text: 'Ini muncul satu per satu di viewport, di titik model benar-benar melakukan hal yang dijelaskan. Di sini semuanya sekaligus.' }),
        ...list.map(l => section(l.title, [el('p', { text: l.body })], false, { icon: l.read ? 'check' : 'bulb' })),
      ],
      actions: [
        { label: 'Tampilkan semuanya lagi', run: () => { resetWhy(); this._whyId = null; this.renderLearn(); } },
        { label: 'Tutup', primary: true },
      ],
    });
  }

  /* ============================================== section and clash analysis */

  /** Every visible body with the geometry the analysers need. */
  analysisBodies() {
    const out = [];
    if (!this.build) return out;
    for (const f of this.build.topLevel) {
      const r = this.build.results.get(f.id);
      if (!r || r.error || !r.instances.length) continue;
      r.instances.forEach((inst, i) => {
        const mp = massProperties(inst.geometry, inst.matrix);
        out.push({ feature: f, index: i, geometry: inst.geometry, matrix: inst.matrix, ...mp });
      });
    }
    return out;
  }

  showSection() {
    const id = [...this.selection][0];
    const body = this.analysisBodies().find(b => b.feature.id === id);
    if (!body) { this.flash('Pilih sebuah body dulu.', 'warn'); return; }

    const planes = standardPlanes(body.box);
    let which = 'yz';
    let load = { case: 'cantilever', force: 500, span: Math.max(10, Math.round(body.size.length())), safety: 2 };

    const host = el('div');
    const draw = () => {
      clear(host);
      // Named `sec`, not `section`: the panel helper of that name is imported
      // into this module, and shadowing it here breaks every section below.
      const sec = sectionAt(body, planes[which].plane);
      if (!sec) {
        host.appendChild(el('div', { class: 'banner warn', text: 'Bidang itu tidak memotong body ini.' }));
        return;
      }
      const r = checkSection(sec, { ...load, material: body.feature.material });

      host.append(
        el('div', { class: 'row wide' }, [
          el('label', { text: 'Potong di' }),
          segmented(which, Object.entries(planes).map(([k, v]) => [k, v.label]), (v) => { which = v; draw(); }),
        ]),
        section2D(sec),
        section('Geometri', [kv([
          ['Area', `${fmt(sec.area)} mm²`],
          ['Loops', `${sec.loops}${sec.holes ? ` (${sec.holes} internal)` : ''}`],
          ['Iₓₓ', `${fmt(sec.ixx, 0)} mm⁴`],
          ['I_yy', `${fmt(sec.iyy, 0)} mm⁴`],
          ['I₁ strong axis', `${fmt(sec.i1, 0)} mm⁴`],
          ['I₂ weak axis', `${fmt(sec.i2, 0)} mm⁴`],
          ['Principal axis', `${fmt(sec.principalAngleDeg, 2)}°`],
          ['S₁ section modulus', `${fmt(sec.s1, 0)} mm³`],
          ['r₁ radius girasi', `${fmt(sec.r1, 2)} mm`],
        ])], true, { icon: 'ruler' }),
        section('Beban', [
          field('Kasus', select(load.case, Object.entries(LOAD_CASES).map(([k, v]) => [k, v.label]), (v) => { load.case = v; draw(); })),
          el('div', { class: 'hint', text: LOAD_CASES[load.case].note }),
          numRow('Force (N)', load.force, (v) => { load.force = v; draw(); }),
          numRow('Span (mm)', load.span, (v) => { load.span = v; draw(); }),
          numRow('Faktor keamanan', load.safety, (v) => { load.safety = Math.max(1, v); draw(); }),
        ], true, { icon: 'physics' }),
        el('div', { class: `banner ${r.pass ? 'ok' : 'err'}`, text:
          `${fmt(r.total, 2)} N/mm² against ${fmt(r.allow, 1)} allowable - ${r.verdict}. ` +
          isi('{p1} pada kuat leleh {yieldMPa} MPa, faktor keamanan {safety}.', { p1: MATERIALS[body.feature.material]?.name || body.feature.material, yieldMPa: r.yieldMPa, safety: r.safety }) }),
        el('div', { class: 'banner warn', text: 'Properti penampang yang tepat, plus tegangan orde pertama. Ini perhitungan kertas sebelum memutuskan apakah part layak dianalisis. Tidak tahu konsentrasi tegangan, cara beban masuk, kelelahan, atau apa pun tiga dimensi. Bukan analisis elemen hingga.' }),
      );
      // append() stringifies null into the document, so a conditional row is
      // added rather than passed in as one.
      if (r.bucklingN) {
        host.appendChild(el('div', { class: 'hint', text: isi('Beban buckling Euler untuk panjang ini: {n} N.', { n: fmt(r.bucklingN, 0) }) }));
      }
    };
    draw();

    modal({
      title: 'Properti section', icon: 'section', wide: true,
      subtitle: `${body.feature.name} · ${MATERIALS[body.feature.material]?.name || body.feature.material}`,
      body: host,
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  showClashes() {
    const bodies = this.analysisBodies();
    if (bodies.length < 2) { this.flash('Pemeriksaan tabrakan butuh setidaknya dua body.', 'warn'); return; }
    const { clashes, tested, pairs, skipped, unchecked, ms } = findClashes(bodies, { budgetMs: 6000, maxPairs: 400 });

    const body = [
      el('p', { class: 'hint', text: isi('{pairs} pasang berbagi kotak batas; {tested} diiriskan secara persis dalam {ms} ms. Ini volume bersama terukur, bukan tebakan kotak batas.', { pairs, tested, ms: Math.round(ms) }) }),
    ];

    if (!clashes.length) {
      body.push(el('div', { class: 'banner ok', text: 'Tidak ada dua body yang menempati ruang yang sama.' }));
      // Without a clash, the useful number is how close the nearest pair comes.
      const near = nearestPair(bodies);
      if (near) {
        body.push(el('div', { class: 'hint', text: isi('Jarak terdekat: {a} dan {b}, sekitar {mm} mm. Diambil dari sampel mesh, jadi celah sebenarnya bisa sedikit lebih kecil.', { a: near.a, b: near.b, mm: fmt(near.distance, 2) }) }));
      }
    } else {
      for (const c of clashes) {
        body.push(el('div', { class: `dx-item ${c.exact ? (c.fraction > 0.02 ? 'err' : 'warn') : 'info'}` }, [
          el('div', { class: 'dx-head' }, [
            el('span', { class: `dx-sev ${c.exact ? 'err' : 'info'}`, text: c.exact ? `${fmt(c.volume)} mm³` : 'tidak diperiksa' }),
            el('span', { class: 'dx-title', text: `${c.a.feature.name} ↔ ${c.b.feature.name}` }),
          ]),
          el('div', { class: 'dx-detail', text: c.exact
            ? isi('Berpusat di {p1}, {p2}, {p3}{p4}', { p1: fmt(c.at.x), p2: fmt(c.at.y), p3: fmt(c.at.z), p4: c.fraction ? isi(' · {percent}% dari body yang lebih kecil', { percent: (c.fraction * 100).toFixed(1) }) : '' })
            : 'Terlalu banyak segitiga untuk diiriskan dalam anggaran boolean.' }),
          el('div', { class: 'btn-row' }, [
            el('button', { class: 'btn sm', text: 'Tunjukkan', onclick: () => { this.select([c.a.feature.id, c.b.feature.id]); this.vp.frameSelection(); } }),
            c.exact ? el('button', {
              class: 'btn sm primary', text: 'Union-kan',
              onclick: () => {
                store.edit('Union body yang bertabrakan', (d) => {
                  d.features.push(makeFeature('boolean', { name: 'Union', params: { op: 'union' }, inputs: [c.a.feature.id, c.b.feature.id] }));
                });
                closeModal();
              },
            }) : null,
          ].filter(Boolean)),
        ]));
      }
    }
    if (skipped) body.push(el('div', { class: 'hint', text: isi('{n} pasang dilewati karena ukuran. Jumlah segmen yang lebih kasar akan membawanya ke dalam anggaran segitiga.', { n: skipped }) }));
    if (unchecked) body.push(el('div', { class: 'banner warn', text: isi('{n} pasang kehabisan waktu dan tidak diperiksa. Kecilkan modelnya atau periksa body-body itu secara terpisah.', { n: unchecked }) }));

    modal({
      title: 'Pemeriksaan clash', icon: 'target', wide: true,
      subtitle: isi('{count} body · {p1} tabrakan nyata', { count: bodies.length, p1: clashes.filter(c => c.exact).length }),
      body,
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  /* ------------------------------------------------- imported mesh inspection */

  showInspect() {
    const meshes = store.doc.features.filter(f => f.type === 'mesh' && !f.suppressed);
    if (!meshes.length) { this.flash('Tidak ada mesh impor di dokumen ini.', 'warn'); return; }
    const f = meshes.find(m => this.selection.has(m.id)) || meshes[0];
    const r = this.build.results.get(f.id);
    if (!r || !r.instances.length) { this.flash(isi('{name} tidak punya geometri.', { name: f.name }), 'warn'); return; }

    const inst = r.instances[0];
    const found = recognise(inst.geometry, inst.matrix);

    const body = [
      el('p', { class: 'hint', text: 'Mesh impor tidak punya pohon fitur. Ini mengukur yang benar-benar ada: muka datar, dan lubang beserta sumbu, posisi, dan diameternya. Tidak ada rekonstruksi dan tidak ada tebakan.' }),
    ];

    if (found.truncated) {
      body.push(el('div', { class: 'banner warn', text: found.reason }));
    } else {
      body.push(el('div', { class: 'banner info', text:
        isi('{p1} segitiga · {patches} petak permukaan · {count} muka datar · {p2} lubang · {p3} boss', { p1: found.triangles.toLocaleString(), patches: found.patches, count: found.faces.length, p2: found.holes.length, p3: found.bosses.length }) }));

      if (found.holes.length) {
        body.push(section(`Holes (${found.holes.length})`, [
          el('table', { class: 'mass-table' }, [
            el('thead', {}, [el('tr', {}, ['Ø mm', 'Centre', 'Sumbu', 'Kedalaman', 'Round', 'Standar', ''].map(h => el('th', { text: h })))]),
            el('tbody', {}, found.holes.map(h => el('tr', {}, [
              el('td', { class: 'mono', text: h.diameter.toFixed(3) }),
              el('td', { class: 'mono', text: `${h.centre.x.toFixed(1)}, ${h.centre.y.toFixed(1)}, ${h.centre.z.toFixed(1)}` }),
              el('td', { class: 'mono', text: h.axisName || `${h.axis.x.toFixed(2)},${h.axis.y.toFixed(2)},${h.axis.z.toFixed(2)}` }),
              el('td', { class: 'mono', text: h.length.toFixed(1) }),
              el('td', { class: 'mono', text: `${(h.roundness * 100).toFixed(1)}%` }),
              el('td', { text: h.nominal?.label || '–' }),
              el('td', {}, [el('button', {
                class: 'btn sm', text: 'Buat potongan',
                onclick: () => { this.addCutterFor(h, f); closeModal(); },
              })]),
            ]))),
          ]),
          el('div', { class: 'hint', text: 'Kebulatan adalah seberapa rapat permukaan mengelompok pada radius yang dipas. Lubang bor di atas 99%; lebih rendah berarti kantung membulat yang hampir lingkaran - angkanya ditampilkan supaya bisa dibedakan.' }),
        ], true, { icon: 'circle' }));
      }

      if (found.faces.length) {
        body.push(section(`Face datar (${found.faces.length})`, [
          el('table', { class: 'mass-table' }, [
            el('thead', {}, [el('tr', {}, ['Area mm²', 'Normal', 'Centre', 'Triangles'].map(h => el('th', { text: h })))]),
            el('tbody', {}, found.faces.slice(0, 20).map(x => el('tr', {}, [
              el('td', { class: 'mono', text: x.area.toFixed(1) }),
              el('td', { class: 'mono', text: x.axis || `${x.normal.x.toFixed(2)},${x.normal.y.toFixed(2)},${x.normal.z.toFixed(2)}` }),
              el('td', { class: 'mono', text: `${x.centre.x.toFixed(1)}, ${x.centre.y.toFixed(1)}, ${x.centre.z.toFixed(1)}` }),
              el('td', { class: 'mono', text: String(x.triangles) }),
            ]))),
          ]),
          found.faces.length > 20 ? el('div', { class: 'hint', text: isi('{n} muka yang lebih kecil tidak didaftar.', { n: found.faces.length - 20 }) }) : null,
        ].filter(Boolean), false, { icon: 'plate' }));
      }

      const size = new THREE.Vector3(); inst.geometry.computeBoundingBox(); inst.geometry.boundingBox.getSize(size);
      const u = unitSanity(size);
      if (u.suspect) {
        body.push(el('div', { class: 'banner warn', text:
          isi(u.suggestion
        ? 'Dimensi terbesar terbaca {mm} mm. Kalau berkasnya dibuat dalam {unit}, ukurannya {alt} mm. Tidak ada apa pun di berkas mesh yang menyatakan satuannya, jadi ini Anda yang memutuskan.'
        : 'Dimensi terbesar terbaca {mm} mm. Itu di luar rentang yang ditempati part nyata. Tidak ada apa pun di berkas mesh yang menyatakan satuannya, jadi ini Anda yang memutuskan.',
      { mm: fmt(u.largestMm), unit: u.suggestion?.unit, alt: u.suggestion ? fmt(u.suggestion.largest) : '' }) }));
      }
    }

    modal({
      title: 'Periksa mesh impor', icon: 'probe', wide: true,
      subtitle: f.name,
      body,
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  /** Place a parametric cut on a measured hole, and subtract it from the mesh. */
  addCutterFor(hole, meshFeature) {
    const spec = cutterFor(hole);
    store.edit(`Potong ${spec.name}`, (d) => {
      const cut = makeFeature(spec.type, {
        name: spec.name, params: spec.params, pos: spec.pos, rot: spec.rot,
        material: meshFeature.material,
      });
      d.features.push(cut);
      d.features.push(makeFeature('boolean', {
        name: `${meshFeature.name} dipotong`, params: { op: 'subtract' },
        inputs: [meshFeature.id, cut.id], material: meshFeature.material,
      }));
    });
    Studio.logDecision({
      title: 'Potongan parametrik pada lubang terukur',
      choice: `Ø${hole.diameter.toFixed(2)} pada ${hole.centre.x.toFixed(1)}, ${hole.centre.y.toFixed(1)}, ${hole.centre.z.toFixed(1)}`,
      why: 'Mesh impornya tetap buram, tetapi lubangnya kini punya fitur yang bisa digeser, diubah ukurannya, dan dikendalikan parameter.',
      doc: store.doc.meta.name,
    });
    this.flash(isi('{name} ditambahkan sebagai potongan parametrik. Bisa digeser dan diubah ukurannya seperti fitur mana pun.', { name: spec.name }), 'ok', 5200);
  }

  /* ========================================================= configurations */

  showConfigs() {
    const render = () => {
      const table = Cfg.familyTable(store.doc);
      const body = [
        el('p', { class: 'hint', text: 'Konfigurasi adalah kumpulan nilai parameter bernama di dokumen ini. Geometri, pohon fitur, dan relasi dipakai bersama setiap varian, jadi perubahan desain sampai ke semua. Hanya angka yang berbeda yang disimpan.' }),
      ];

      body.push(el('table', { class: 'mass-table' }, [
        el('thead', {}, [el('tr', {}, ['Configuration', ...table.columns, ''].map(h => el('th', { text: h })))]),
        el('tbody', {}, table.rows.map(r => el('tr', { class: r.active ? 'on' : '' }, [
          el('td', {}, [
            el('b', { text: r.name }),
            r.active ? el('span', { class: 'pill', text: 'active' }) : null,
          ].filter(Boolean)),
          ...table.columns.map(k => el('td', { class: 'mono', text: String(r.values[k] ?? '') })),
          el('td', {}, [el('div', { class: 'btn-row' }, [
            r.active ? null : el('button', {
              class: 'btn sm', text: 'Pakai',
              onclick: () => { this.activateConfiguration(r.id); closeModal(); this.showConfigs(); },
            }),
            el('button', {
              class: 'btn sm', text: 'Ganti nama',
              onclick: () => promptDialog('Ganti nama konfigurasi', 'Nama', r.name, (v) => {
                if (!v) return;
                store.edit('Ganti nama konfigurasi', (d) => Cfg.renameConfig(d, r.id, v), { rebuild: false });
                closeModal(); this.showConfigs();
              }),
            }),
            r.id === Cfg.DEFAULT_ID ? null : el('button', {
              class: 'btn sm danger', text: 'Hapus',
              onclick: () => {
                store.edit('Hapus konfigurasi', (d) => Cfg.removeConfig(d, r.id));
                closeModal(); this.showConfigs();
              },
            }),
          ].filter(Boolean))]),
        ]))),
      ]));

      if (!table.columns.length) {
        body.push(el('div', { class: 'hint', text: 'Belum ada varian yang menimpa apa pun. Tambah konfigurasi, pindah ke sana, ubah parameter: perubahan tercatat hanya pada varian itu.' }));
      }

      modal({
        title: 'Konfigurasi', icon: 'template', wide: true,
        subtitle: `${table.rows.length} di ${store.doc.meta.name}`,
        body,
        actions: [
          { label: 'Tambah konfigurasi', run: () => this.newConfiguration() },
          { label: 'Ekspor keluarganya', run: () => this.exportFamily() },
          { label: 'Tutup', primary: true },
        ],
      });
    };
    render();
  }

  newConfiguration() {
    promptDialog('Konfigurasi baru', 'Nama', 'Long', (v) => {
      if (!v) return;
      let id = null;
      store.edit('Tambah konfigurasi', (d) => {
        Cfg.syncBaseline(d);
        id = Cfg.addConfig(d, v);
      }, { rebuild: false });
      if (id) this.activateConfiguration(id);
      this.flash(isi('“{name}” kini aktif. Ubah sebuah parameter dan perubahannya tercatat hanya pada varian ini.', { name: v }), 'ok', 5200);
    }, { help: 'Varian berbagi satu pohon fitur. Hanya parameter yang Anda ubah yang disimpan padanya.' });
  }

  activateConfiguration(id) {
    store.edit('Switch configuration', (d) => {
      Cfg.syncBaseline(d);
      Cfg.activate(d, id);
    });
    this.refreshUI();
  }

  cycleConfiguration(dir = 1) {
    const list = Cfg.configs(store.doc);
    if (list.length < 2) return;
    const i = list.findIndex(c => c.id === store.doc.configs.active);
    const next = list[(i + dir + list.length) % list.length];
    this.activateConfiguration(next.id);
    this.flash(`Konfigurasi: ${next.name}`, 'info', 2200);
  }

  exportFamily() {
    IO.download(`${store.doc.meta.name}-family.csv`, Cfg.familyCSV(store.doc), 'text/csv');
  }

  /* ============================================================== versions */

  commitVersion() {
    promptDialog('Simpan versi', 'Apa yang berubah?', '', (msg) => {
      const r = VCS.commitVersion(msg || 'Snapshot');
      if (!r.ok) {
        this.flash(isi('Tidak bisa menyimpan: penyimpanan lokal penuh. {n} versi lama dibuang dan tetap tidak muat.', { n: r.pruned }), 'err', 7000);
        return;
      }
      this.flash((r.pruned
      ? isi('Versi disimpan di {branch}, {n} tertua dibuang demi ruang.', { branch: VCS.currentBranch(), n: r.pruned })
      : isi('Versi disimpan di {branch}.', { branch: VCS.currentBranch() })), 'ok', 4200);
      this.refreshUI();
    }, { help: 'Versi adalah snapshot utuh yang disimpan di peramban ini. Tidak ada yang diunggah.' });
  }

  newBranch() {
    promptDialog('Cabang baru', 'Nama', 'experiment', (v) => {
      if (!v) return;
      const name = VCS.createBranch(v);
      this.flash(isi('Di cabang “{name}”. Versi yang Anda simpan sekarang tinggal di sini; batangnya tidak tersentuh.', { name }), 'ok', 5000);
      this.refreshUI();
    }, { help: 'Cabang adalah tempat mencoba alternatif tanpa mempertaruhkan yang sudah bekerja.' });
  }

  showVersions() {
    const render = () => {
      const list = VCS.versions();
      const use = VCS.usage();
      const body = [
        el('p', { class: 'hint', text: 'Versi dan cabang, di peramban ini. Tanpa akun, tanpa server, tanpa check-in. Dokumen adalah JSON polos setiap saat, itulah yang membuat diff nyata mungkin.' }),
        el('div', { class: 'row wide' }, [
          el('label', { text: 'Cabang' }),
          select(VCS.currentBranch(), VCS.branches().map(b => [b.name, `${b.name} (${b.count})`]), (v) => {
            VCS.switchBranch(v); closeModal(); this.showVersions();
          }),
        ]),
      ];

      if (!list.length) {
        body.push(emptyState('Tidak ada versi di cabang ini', 'Simpan satu dari Analisis → Simpan versi, atau tekan Ctrl ⇧ S.', 'history'));
      } else {
        for (let i = 0; i < list.length; i++) {
          const v = list[i];
          const older = list[i + 1];
          const full = VCS.getVersion(v.id);
          const against = older ? VCS.getVersion(older.id) : null;
          const d = against ? VCS.diff(against.doc, full.doc) : null;

          body.push(el('div', { class: 'dx-item info' }, [
            el('div', { class: 'dx-head' }, [
              el('span', { class: 'dx-title', text: v.message }),
              el('span', { class: 'pill', text: new Date(v.at).toLocaleString() }),
            ]),
            el('div', { class: 'dx-detail', text: `${v.summary.features} features · ${v.summary.params} parameters${v.summary.configs > 1 ? ` · ${v.summary.configs} configurations` : ''}` }),
            d ? el('div', { class: 'dx-why', text: isi('Terhadap versi di bawah: {diff}', { diff: VCS.diffLine(d) }) }) : null,
            el('div', { class: 'btn-row' }, [
              el('button', {
                class: 'btn sm', text: 'Bandingkan dengan sekarang',
                onclick: () => { closeModal(); this.showDiff(full); },
              }),
              el('button', {
                class: 'btn sm primary', text: 'Pulihkan',
                onclick: () => confirmDialog('Pulihkan versi ini?',
                  isi('Dokumen kembali ke "{message}". Simpan dulu versi posisi Anda sekarang kalau ingin kembali ke sini.', { message: v.message }),
                  () => { VCS.restore(v.id); this.flash('Dipulihkan.', 'ok'); setTimeout(() => this.vp.frameAll(), 150); },
                  { yes: 'Pulihkan' }),
              }),
              el('button', {
                class: 'btn sm danger', text: 'Hapus',
                onclick: () => { VCS.deleteVersion(v.id); closeModal(); this.showVersions(); },
              }),
            ]),
          ].filter(Boolean)));
        }
      }

      body.push(el('div', { class: 'hint', text: isi('{versions} versi di {branches} cabang, memakai {used} MB dari sekitar {limit} MB. Versi tertua dibuang otomatis saat ruangnya habis.', { versions: use.versions, branches: use.branches, used: (use.bytes / 1e6).toFixed(2), limit: (use.limit / 1e6).toFixed(1) }) }));

      modal({
        title: 'Riwayat versi', icon: 'sequence', wide: true,
        subtitle: `${VCS.currentBranch()} · ${list.length} versi`,
        body,
        actions: [
          { label: 'Simpan versi', run: () => setTimeout(() => this.commitVersion(), 60) },
          { label: 'Cabang baru', run: () => setTimeout(() => this.newBranch(), 60) },
          { label: 'Tutup', primary: true },
        ],
      });
    };
    render();
  }

  /** The structural difference between a saved version and the live document. */
  showDiff(version) {
    const d = VCS.diff(version.doc, store.doc);
    const body = [
      el('p', { class: 'hint', text: isi('Membandingkan “{message}” ({when}) dengan dokumen sebagaimana adanya sekarang.', { message: version.message, when: new Date(version.at).toLocaleString() }) }),
    ];

    if (d.empty) {
      body.push(el('div', { class: 'banner ok', text: 'Identik. Tidak ada yang berubah sejak versi itu.' }));
    } else {
      if (d.meta.length) {
        body.push(section('Dokumen', d.meta.map(m =>
          el('div', { class: 'diff-row' }, [
            el('span', { class: 'diff-key', text: m.what }),
            el('span', { class: 'diff-from', text: String(m.from || '-') }),
            el('span', { class: 'diff-arrow', text: '→' }),
            el('span', { class: 'diff-to', text: String(m.to || '-') }),
          ])), true, { icon: 'doc-props' }));
      }
      if (d.params.length) {
        body.push(section(`Parameters (${d.params.length})`, d.params.map(p =>
          el('div', { class: `diff-row ${p.kind}` }, [
            el('span', { class: 'diff-key', text: p.name }),
            el('span', { class: 'diff-from', text: p.kind === 'added' ? '-' : String(p.from) }),
            el('span', { class: 'diff-arrow', text: p.kind === 'removed' ? '✕' : '→' }),
            el('span', { class: 'diff-to', text: p.kind === 'removed' ? '-' : String(p.to) }),
          ])), true, { icon: 'book' }));
      }
      if (d.features.length) {
        body.push(section(`Features (${d.features.length})`, d.features.map(f =>
          el('div', { class: `diff-feature ${f.kind}` }, [
            el('div', { class: 'diff-head' }, [
              el('span', { class: `diff-badge ${f.kind}`, text: f.kind }),
              el('span', { class: 'diff-name', text: f.name }),
              el('span', { class: 'diff-type', text: f.type }),
            ]),
            ...f.changes.map(c => el('div', { class: 'diff-row changed' }, [
              el('span', { class: 'diff-key', text: c.what }),
              el('span', { class: 'diff-from', text: String(c.from ?? '-') }),
              el('span', { class: 'diff-arrow', text: '→' }),
              el('span', { class: 'diff-to', text: String(c.to ?? '-') }),
            ])),
          ])), true, { icon: 'workspace' }));
      }
    }

    modal({
      title: 'Apa yang berubah', icon: 'history', wide: true,
      subtitle: VCS.diffLine(d),
      body,
      actions: [
        { label: 'Kembali ke riwayat', run: () => setTimeout(() => this.showVersions(), 60) },
        { label: 'Tutup', primary: true },
      ],
    });
  }

  /* ======================================================== export quality */

  showExportQuality() {
    const s = Studio.standards();
    let quality = s.exportQuality || 'standard';
    const host = el('div');

    const draw = () => {
      clear(host);
      const q = QUALITY[quality];
      const preview = q.tol ? retessellate(store.doc, q.tol) : null;

      host.append(
        el('div', { class: 'row wide' }, [
          el('label', { text: 'Kualitas' }),
          select(quality, Object.entries(QUALITY).map(([k, v]) => [k, v.label]), (v) => { quality = v; draw(); }),
        ]),
        el('div', { class: 'hint', text: q.note }),
        q.tol
          ? el('div', { class: 'banner info', text: isi('Toleransi chord {tol} mm: tidak ada titik pada mesh terekspor yang lebih jauh dari itu terhadap permukaan yang diwakilinya. Jumlah segmen mengikuti dari situ, per fitur, jadi lubang 3mm dan flens 200mm masing-masing mendapat persis yang dibutuhkannya.', { tol: q.tol }) })
          : el('div', { class: 'banner info', text: 'Ekspor memakai jumlah segmen yang sudah dibawa fitur.' }),
      );

      if (preview) {
        const grew = preview.changes.filter(c => c.to > c.from).length;
        const cut = preview.changes.filter(c => c.to < c.from).length;
        host.append(
          el('div', { class: 'big-stat' }, [
            el('span', { class: 'bs-value', text: String(preview.after) }),
            el('span', { class: 'bs-unit', text: isi('segmen seluruhnya, dari {before}', { before: preview.before }) }),
          ]),
          el('div', { class: 'hint', text: `${grew} fitur dihaluskan, ${cut} dikasarkan, ${store.doc.features.length - preview.changes.length} unchanged.` }),
        );
        if (preview.changes.length) {
          host.appendChild(section('Per fitur', [
            el('table', { class: 'mass-table' }, [
              el('thead', {}, [el('tr', {}, ['Fitur', 'Radius', 'Segmen', ''].map(h => el('th', { text: h })))]),
              el('tbody', {}, preview.changes.slice(0, 24).map(c => el('tr', {}, [
                el('td', { text: c.name }),
                el('td', { class: 'mono', text: `${c.radius.toFixed(1)} mm` }),
                el('td', { class: 'mono', text: `${c.from} → ${c.to}` }),
                el('td', { text: c.to > c.from ? 'dihaluskan' : 'dikasarkan' }),
              ]))),
            ]),
          ], false, { icon: 'mesh' }));
        }
      }

      host.appendChild(el('div', { class: 'hint', text: 'Hanya berlaku untuk ekspor. Dokumen yang Anda sunting menyimpan jumlah segmennya sendiri, jadi toleransi untuk satu serahan tidak pernah jadi milik model.' }));
    };
    draw();

    modal({
      title: 'Kualitas ekspor', icon: 'settings', wide: true,
      subtitle: 'Pakai segitiga di permukaan yang benar-benar lengkung',
      body: host,
      actions: [
        { label: 'Batal' },
        {
          label: 'Pakai kualitas ini', primary: true,
          run: () => {
            Studio.setStandard('exportQuality', quality);
            this.flash(isi('Ekspor kini memakai {p1}.', { p1: QUALITY[quality].label }), 'ok');
          },
        },
      ],
    });
  }

  showShortcuts() {
    const groups = {};
    for (const c of this.commands) {
      if (!c.key) continue;
      (groups[c.group] ||= []).push(c);
    }
    modal({
      title: 'Pintasan papan ketik', icon: 'keyboard', wide: true,
      subtitle: 'Yang lain cukup Ctrl K.',
      body: [
        ...Object.entries(groups).flatMap(([g, list]) => [
          el('h3', { text: g }),
          el('div', { class: 'kbd-grid' }, list.map(c => el('div', {}, [el('span', { text: c.label }), el('kbd', { text: c.key })]))),
        ]),
        el('h3', { text: 'Transform modal (Model / Simulasi)' }),
        el('p', { html: 'Tekan <kbd>G</kbd>, <kbd>R</kbd>, atau <kbd>S</kbd> dan pilihan mengikuti penunjuk. Lalu: <kbd>X</kbd>/<kbd>Y</kbd>/<kbd>Z</kbd> mengunci sumbu, <kbd>⇧X</kbd> mengunci bidang tegak lurus, mengetik angka memberi nilai persis, <kbd>⇧</kbd> untuk presisi, <kbd>Ctrl</kbd> untuk snap, <kbd>⏎</kbd> mengonfirmasi, dan <kbd>esc</kbd> membatalkan.' }),
        el('h3', { text: 'Mouse' }),
        el('p', { html: '<b>3D:</b> seret kiri untuk orbit · seret kanan untuk geser · roda untuk zoom · klik untuk memilih · klik kanan membuka menu konteks · klik ganda membingkai.<br><b>Draft:</b> seret tengah atau kanan untuk geser · roda untuk zoom · seret kanan-ke-kiri untuk jendela silang.' }),
        el('h3', { text: 'Koordinat ketikan (Draft)' }),
        el('p', { html: 'Dengan sebuah alat aktif, ketik <code>50,30</code> absolut · <code>@40,0</code> relatif · <code>@60&lt;30</code> panjang dan sudut · <code>25</code> panjang searah kursor, lalu <kbd>⏎</kbd>.' }),
      ],
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  showExpressionHelp() {
    modal({
      title: 'Referensi ekspresi', icon: 'book',
      subtitle: 'Setiap field angka menerima ekspresi, bukan hanya angka.',
      body: [
        el('p', { html: 'Tentukan parameter di bagian <b>Parameter</b> pada panel kanan, lalu rujuk di mana pun: <code>width * 2</code>, <code>thick + clearance</code>, <code>sqrt(area)</code>.' }),
        el('h3', { text: 'Operator' }),
        el('p', { html: '<code>+</code> <code>-</code> <code>*</code> <code>/</code> <code>%</code> <code>^</code> dan tanda kurung. <code>^</code> bersifat asosiatif kanan, jadi <code>2^3^2</code> adalah 512.' }),
        el('h3', { text: 'Fungsi' }),
        el('p', { html: EXPR_HELP.map(f => `<code>${f}</code>`).join(' ') }),
        el('h3', { text: 'Konstanta' }),
        el('p', { html: '<code>pi</code> <code>tau</code> <code>e</code> <code>phi</code>' }),
        el('h3', { text: 'Sudut' }),
        el('p', { html: 'Fungsi trigonometri bekerja dalam radian: tulis <code>cos(rad(30))</code>, dan <code>deg(x)</code> untuk kembali.' }),
        el('h3', { text: 'Keamanan' }),
        el('p', { text: 'Ekspresi diurai oleh tokenizer dan parser recursive-descent buatan sendiri yang hanya menghasilkan angka - tanpa eval, jadi membuka proyek orang lain tidak pernah menjalankan kode.' }),
      ],
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  showWelcome() {
    modal({
      title: isi('Selamat datang di {APP_NAME}', { APP_NAME }), icon: 'bulb', wide: true,
      subtitle: 'Studio CAD parametrik yang berjalan sepenuhnya di peramban. Tidak ada yang diunggah.',
      body: [
        el('div', { class: 'card-grid' }, [
          ['cube3d', 'Model', 'Solid parametrik, boolean, pattern, dan mirror dalam pohon fitur yang bisa dibangun ulang.'],
          ['sketch', 'Draft', 'Drafting 2D dengan snap, layer, dan dimensi. Profil tertutup bisa di-extrude atau di-revolve.'],
          ['timeline', 'Simulasi', 'Dimensi keempat: keyframe, urutan bangun, dan fisika rigid-body.'],
        ].map(([ic, t, b]) => el('div', { class: 'card', style: { cursor: 'default' } }, [
          icon(ic, { size: 22 }), el('b', { text: t }), el('span', { text: b }),
        ]))),
        el('h3', { text: 'Tiga hal yang perlu diketahui' }),
        el('p', { html: '<b>Ketik ekspresi, bukan angka.</b> Setiap field menerima <code>width*2</code> dan dibangun ulang saat <code>width</code> berubah.<br><b>Tekan G, R, atau S.</b> Pilihan mengikuti pointer; X/Y/Z mengunci sumbu, atau ketik nilai tepat.<br><b>Tekan Ctrl K.</b> Semua perintah ada di satu pencarian.' }),
        el('h3', { text: 'Batas yang jujur' }),
        el('p', { html: 'Ini pemodel mesh, bukan kernel B-rep: tidak ada fillet sejati pada tepi sembarang, dan tidak ada ekspor STEP. Dinamika memakai tabrakan bounding-sphere - cocok untuk uji jatuh dan urutan bangun, bukan analisis tegangan.' }),
      ],
      actions: [
        { label: 'Jelajahi templat', run: () => setTimeout(() => this.showTemplates(), 60) },
        { label: 'Pintasan', run: () => setTimeout(() => this.showShortcuts(), 60) },
        { label: 'Mulai memodel', primary: true },
      ],
    });
  }

  showAbout() {
    modal({
      title: `${APP_NAME} ${APP_VERSION}`, icon: 'info',
      body: [
        el('p', { html: 'Studio CAD parametrik, sumber terbuka, berjalan di peramban: pemodelan solid 3D, drafting 2D, dan simulasi 4D. Tanpa instalasi, tanpa akun, tanpa server. Satuan metrik; gambar kerja sudut pertama ISO/SNI.' }),
        kv([
          ['Versi', APP_VERSION],
          ['Perintah', String(this.commands.length)],
          ['Renderer', 'three.js r169 (vendored)'],
          ['Format proyek', `${FILE_EXT} - JSON polos`],
          ['Lisensi', 'MIT'],
        ]),
        el('p', { class: 'hint', html: 'Dibangun sebagai situs statis. <a href="https://github.com/samuelhtampubolon/TesserCAD-ID" target="_blank" rel="noopener">Sumber di GitHub</a>.' }),
      ],
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  openLink(url) { window.open(url, '_blank', 'noopener'); }

  /* =========================================================== commands */

  run(id) {
    const c = this.commandMap.get(id);
    if (!c) { console.warn('unknown command', id); return; }
    if (c.enabled && !c.enabled()) { this.flash(isi('{label} tidak tersedia saat ini', { label: c.label }), 'warn', 2000); return; }
    // Every surface routes through here, so recording one function records the
    // menus, the ribbon, the palette, the quick menu and the keyboard at once.
    this.macro?.capture(id);
    c.run();
  }

  exportDesignIntent() {
    if (!this.build) return;
    exportIntent(store.doc, this.build);
  }

  openPalette() {
    commandPalette(this.commands.map(c => ({
      ...c, label: c.checked?.() ? `${c.label}  ✓` : c.label,
    })), (c) => this.run(c.id), { context: WS_META[this.workspace].label });
  }

  openQuickMenu(x, y) {
    const ids = quickDefaults(this);
    quickMenu(x, y, ids.map(id => this.commandMap.get(id)).filter(Boolean), (c) => this.run(c.id));
  }

  showDraftMenu(e) {
    const d = this.draft;
    const hit = d.hitTest(d.toWorld(e.clientX - d.cv.getBoundingClientRect().left, e.clientY - d.cv.getBoundingClientRect().top));
    if (hit && !d.selection.has(hit.id)) { d.selection = new Set([hit.id]); d.invalidate(); this.refreshUI(); }
    const sel = d.selection.size;
    contextMenu(e.clientX, e.clientY, [
      { header: sel ? `${sel} objek dipilih` : 'Gambar kerja' },
      ...(sel ? [
        this.menuItem('sketch.extrude'), this.menuItem('sketch.revolve'), '-',
        this.menuItem('edit.duplicate'), this.menuItem('draft.rotate90'), this.menuItem('draft.mirrorX'),
        '-', this.menuItem('edit.delete'),
      ] : [
        this.menuItem('draft.line'), this.menuItem('draft.rect'), this.menuItem('draft.circle'),
        '-', this.menuItem('edit.selectAll'), this.menuItem('draft.zoomExtents'), this.menuItem('draft.snap'),
      ]),
    ].filter(Boolean));
  }

  showViewportMenu(e, hit) {
    const id = hit?.object?.userData?.featureId || null;
    if (id && !this.selection.has(id)) this.select([id]);
    contextMenu(e.clientX, e.clientY, viewportContextMenu(this, (cid) => this.menuItem(cid), id).filter(Boolean));
  }

  /* ============================================================ binding */

  bindGlobalUI() {
    const mobile = () => isPhone();

    const leftActions = clear($('#leftActions'));
    leftActions.appendChild(el('button', {
      class: 'mini-btn', title: 'Ciutkan panel kerangka  (T)',
      onclick: () => (mobile() ? this.mobile.closeSheet() : this.togglePanel('left')),
    }, [icon('chevron-left', { size: 14 })]));

    const rightActions = clear($('#rightActions'));
    rightActions.appendChild(el('button', {
      class: 'mini-btn', title: 'Ciutkan panel properti  (N)',
      onclick: () => (mobile() ? this.mobile.closeSheet() : this.togglePanel('right')),
    }, [icon('chevron-right', { size: 14 })]));

    // On a tablet only one panel is docked at a time, so each head carries the
    // switch that brings the other one forward. It is built on every tier and
    // shown by CSS on one, which keeps the breakpoint in a single place.
    for (const side of ['left', 'right']) {
      const head = $(`#${side}panel .panel-head`);
      const sw = el('div', { class: 'dock-switch', role: 'tablist', 'aria-label': 'Panel tertambat' });
      for (const [which, ic] of [['left', 'workspace'], ['right', 'settings']]) {
        sw.appendChild(el('button', {
          class: 'ds-btn', role: 'tab', dataset: { dock: which },
          onclick: () => this.setDock(which),
        }, [icon(ic, { size: 14 }), el('span', { class: 'ds-label' })]));
      }
      head.insertBefore(sw, head.querySelector('.ph-actions'));
    }

    this.vp.onHover = (hit) => {
      const u = store.doc.meta.units;
      $('#viewInfo').textContent = hit
        ? `${store.feature(hit.object.userData.featureId)?.name || ''}\n${fmt(toDisplay(hit.point.x, u))}, ${fmt(toDisplay(hit.point.y, u))}, ${fmt(toDisplay(hit.point.z, u))} ${u}`
        : '';
    };
  }

  bindFiles() {
    const input = $('#fileInput');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      // A pending pickFileAsync takes the file instead of the importer, so one
      // hidden input can serve both "open a model" and "read this settings file".
      if (this._pendingPick) { const r = this._pendingPick; this._pendingPick = null; r(file || null); return; }
      if (!file) return;
      try { await IO.importAny(file); this.vp.frameAll(); }
      catch (e) { this.flash(e.message, 'err', 6000); }
    });
    const stage = $('#stage');
    stage.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    stage.addEventListener('drop', async (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      try { await IO.importAny(file); this.vp.frameAll(); }
      catch (err) { this.flash(err.message, 'err', 6000); }
    });
  }

  pickFile(accept) {
    const input = $('#fileInput');
    input.accept = accept;
    input.click();
  }

  /** Pick a file and get it back, rather than handing it to the importer. */
  pickFileAsync(accept) {
    return new Promise((resolve) => {
      const input = $('#fileInput');
      this._pendingPick = resolve;
      input.accept = accept;
      input.click();
      // A cancelled picker fires no event in most browsers, so the promise would
      // hang for the life of the page. One window focus later, give up.
      const bail = () => {
        setTimeout(() => { if (this._pendingPick === resolve) { this._pendingPick = null; resolve(null); } }, 700);
        removeEventListener('focus', bail);
      };
      setTimeout(() => addEventListener('focus', bail, { once: true }), 0);
    });
  }

  bindKeys() {
    addEventListener('keyup', (e) => { if (this.ops.running) this.ops.onKeyUp(e); });

    addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;

      // a running operator owns the keyboard
      if (this.ops.running && !typing) { if (this.ops.onKey(e)) { e.preventDefault(); return; } }

      if (e.key === 'Escape') {
        if (isQuickMenuOpen()) { closeQuickMenu(); return; }
        if (isModalOpen()) { closeModal(); return; }
        closeDropdown();
        if (this.workspace === 'draft' && this.draft.cancel()) { this.buildRibbon(); this.refreshUI(); return; }
        if (this.vp.measureMode) { this.stopMeasuring(); return; }
        if (this.isolated) { this.isolated = null; this.applyIsolation(); this.refreshUI(); return; }
        this.select([]);
        return;
      }

      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); this.openPalette(); return; }
      if (typing) return;

      if (mod) {
        const k = e.key.toLowerCase();
        const map = {
          z: () => (e.shiftKey ? this.zenModeOrRedo() : store.undo()),
          y: () => store.redo(),
          s: () => (e.shiftKey ? this.saveAs() : IO.saveProject()),
          o: () => this.pickFile('.tcad,.json'),
          n: () => this.newDocument(),
          i: () => (e.shiftKey ? this.invertSelection() : this.pickFile(IO.IMPORT_ACCEPT)),
          d: () => this.duplicateSelection(),
          a: () => this.selectAll(),
          h: () => (e.shiftKey ? this.showHistory() : null),
          l: () => (e.shiftKey ? this.toggleTheme() : null),
          ',': () => this.showPrefs(),
          '=': () => this.zoomBy(1.25),
          '+': () => this.addBoolean('union'),
          '-': () => this.addBoolean('subtract'),
        };
        if (map[k]) { e.preventDefault(); map[k](); }
        return;
      }

      if (e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'a') { e.preventDefault(); this.select([]); return; }
        if (k === 'h') { e.preventDefault(); this.setVisible(true, { all: true }); return; }
        return;
      }

      if (e.key === 'F1') { e.preventDefault(); this.showShortcuts(); return; }
      if (e.key === 'F2') { e.preventDefault(); this.renameSelected(); return; }
      if (e.key === 'F11') { e.preventDefault(); this.toggleFullscreen(); return; }
      if (e.key === 'Hapus' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelection(); return; }

      if (this.workspace === 'draft') { this.draftKey(e); return; }

      const k = e.key.toLowerCase();
      const actions = {
        ' ': () => this.togglePlay(),
        g: () => this.startOperator('move'),
        r: () => this.startOperator('rotate'),
        s: () => this.startOperator('scale'),
        w: () => this.setGizmo('translate'),
        e: () => (e.shiftKey ? this.setGizmo('rotate') : null),
        f: () => (e.shiftKey ? this.vp.frameSelection() : this.zoomFit()),
        z: () => this.cycleShading(),
        h: () => this.setVisible(false),
        d: () => this.dropSelection(),
        k: () => this.keyPose(),
        m: () => this.vp.setMeasureMode('distance'),
        q: () => this.openQuickMenu(innerWidth / 2, innerHeight / 2),
        '/': () => this.isolate(),
        n: () => this.togglePanel('right'),
        t: () => this.togglePanel('left'),
        '0': () => this.vp.standardView('iso'),
        '1': () => this.vp.standardView(e.shiftKey ? 'back' : 'front'),
        '3': () => this.vp.standardView(e.shiftKey ? 'left' : 'right'),
        '5': () => this.run('view.ortho'),
        '7': () => this.vp.standardView(e.shiftKey ? 'bottom' : 'top'),
        ',': () => this.sim.step(-1),
        '.': () => this.sim.step(1),
        '+': () => this.zoomBy(1.25),
        '=': () => this.zoomBy(1.25),
        '-': () => this.zoomBy(0.8),
      };
      if (actions[k]) { e.preventDefault(); actions[k](); return; }
      if (e.key === 'Home') { this.sim.seek(0); return; }
      if (e.key === 'End') { this.sim.seek(store.doc.sim.duration); return; }
    });
  }


  /* ============================================================ drawings */

  /**
   * A shop drawing from the model.
   *
   * The reason this matters is that the drawing is still the contract. A
   * supplier quotes from a dimensioned print with a title block, not from an
   * STL, and a package that cannot produce one leaves its user to redraw their
   * own part in something else. So the views are projected, hidden lines are
   * classified rather than guessed at, and the title block is filled from the
   * document instead of left as boxes to type into.
   */
  showDrawing() {
    const bodies = this.analysisBodies();
    if (!bodies.length) { this.flash('Belum ada yang bisa digambar.', 'warn'); return; }

    const opts = {
      sheet: this._sheetOpts?.sheet || 'a3l',
      views: this._sheetOpts?.views || ['front', 'top', 'right', 'iso'],
      hlr: this._sheetOpts?.hlr !== false,
      scale: this._sheetOpts?.scale || null,
      projection: this._sheetOpts?.projection || 'first',
    };
    const host = el('div');
    let sheet = null;

    const draw = () => {
      clear(host);
      this._sheetOpts = { ...opts };
      const t0 = performance.now();
      try {
        sheet = buildSheet(bodies, {
          doc: store.doc, build: this.build, sheet: opts.sheet,
          views: opts.views, hlr: opts.hlr, scale: opts.scale, projection: opts.projection,
        });
      } catch (err) {
        host.appendChild(el('div', { class: 'banner err', text: isi('Gambarnya tidak bisa dibangun: {error}', { error: err.message }) }));
        return;
      }
      const ms = Math.round(performance.now() - t0);

      host.append(
        el('div', { class: 'row wide' }, [
          el('label', { text: 'Kertas' }),
          segmented(opts.sheet, Object.entries(SHEETS).map(([k, v]) => [k, v.label.replace(' landscape', '')]),
            (v) => { opts.sheet = v; draw(); }),
        ]),
        el('div', { class: 'sheet-views' }, Object.keys(VIEWS).map(k =>
          checkbox(VIEWS[k].label, opts.views.includes(k), (on) => {
            opts.views = on ? [...opts.views, k] : opts.views.filter(x => x !== k);
            if (!opts.views.length) opts.views = [k];
            draw();
          }))),
        el('div', { class: 'row wide' }, [
          el('label', { text: 'Proyeksi' }),
          segmented(opts.projection, Object.entries(PROJECTIONS).map(([k, v]) => [k, v.label]),
            (v) => { opts.projection = v; draw(); }),
        ]),
        el('div', { class: 'hint', text: PROJECTIONS[opts.projection].note }),
        checkbox('Hapus garis tersembunyi', opts.hlr, (v) => { opts.hlr = v; draw(); },
          { hint: 'Mati menggambar semua tepi, yang lebih cepat dan kadang lebih jelas pada part sederhana.' }),
        el('div', { class: 'sheet-view', html: sheetToSVG(sheet, { dark: document.documentElement.dataset.theme !== 'light' }) }),
        el('div', { class: 'hint', text:
          isi('{n} tampilan pada {scale} di {w} × {h} mm, ', { n: sheet.views.length, scale: scaleLabel(sheet.scale), w: sheet.paper.w, h: sheet.paper.h }) +
          isi('{p1} tepi dan {p2} lingkaran, dibangun dalam {ms} ms.', { p1: sheet.views.reduce((n, v) => n + v.segs.length, 0), p2: sheet.views.reduce((n, v) => n + v.circles.length, 0), ms }) }),
        el('div', { class: 'banner warn', text: 'Dimensi adalah ukuran keseluruhan tiap tampilan dan diameter lubang yang dikenali - gambar awal, bukan jadi: datum, toleransi geometrik, dan kebutuhan permukaan fungsi masih Anda yang menambah.' }),
      );
    };
    draw();

    modal({
      title: 'Gambar kerja', icon: 'sheet', wide: true, size: 'tall',
      subtitle: `${store.doc.meta.name} · ${bodies.length} bod${bodies.length === 1 ? 'y' : 'ies'}`,
      body: host,
      actions: [
        { label: 'Simpan SVG', run: () => { this.exportSheet('svg', sheet); return true; } },
        { label: 'Simpan DXF', run: () => { this.exportSheet('dxf', sheet); return true; } },
        { label: 'Tutup', primary: true },
      ],
    });
  }

  /** Write the current sheet out, building one first if the dialog never ran. */
  exportSheet(kind, prebuilt = null) {
    const bodies = this.analysisBodies();
    if (!bodies.length) { this.flash('Belum ada yang bisa digambar.', 'warn'); return; }
    let sheet = prebuilt;
    if (!sheet) {
      const o = this._sheetOpts || {};
      try {
        sheet = buildSheet(bodies, {
          doc: store.doc, build: this.build,
          sheet: o.sheet || 'a3l', views: o.views || ['front', 'top', 'right', 'iso'],
          hlr: o.hlr !== false, scale: o.scale || null, projection: o.projection || 'first',
        });
      } catch (err) { this.flash(isi('Gambarnya tidak bisa dibangun: {error}', { error: err.message }), 'err'); return; }
    }
    const name = store.doc.meta.name || 'drawing';
    if (kind === 'svg') {
      IO.download(IO.safeName(`${name}-gambar`, '.svg'), sheetToSVG(sheet), 'image/svg+xml');
    } else {
      IO.download(IO.safeName(`${name}-gambar`, '.dxf'), toDXF(sheetToDraw(sheet), { units: 'mm' }), 'image/vnd.dxf');
    }
    this.flash(isi('Gambar disimpan sebagai {format} pada {scale}.', { format: kind.toUpperCase(), scale: scaleLabel(sheet.scale) }), 'ok');
  }


  /* ========================================================== tolerances */

  /**
   * Tolerance stack-up.
   *
   * The dialog shows all three answers side by side on purpose. Worst case is
   * what a drawing promises and is almost always too pessimistic to build to;
   * root sum square is what a production run actually does; Monte Carlo shows
   * whether the failures pile against one limit or spread evenly. Quoting one
   * of the three without the others is how a stack-up spreadsheet misleads.
   */
  showTolerance() {
    const bodies = this.analysisBodies();
    const limits = Studio.limits(processOf(this.processId()));
    if (!store.doc.stacks?.length) {
      store.doc.stacks = [Tol.stackFromBuild(bodies, { axis: 'x', limits, process: this.processId() })];
    }
    let which = 0;
    let target = 1.33;
    const host = el('div');

    const commit = (label) => { store.commit(label); };

    const draw = () => {
      clear(host);
      const stacks = store.doc.stacks;
      const stack = stacks[Math.min(which, stacks.length - 1)];
      const a = Tol.analyseStack(stack);
      const lv = Tol.levers(stack, { target });

      if (stacks.length > 1) {
        host.appendChild(el('div', { class: 'row wide' }, [
          el('label', { text: 'Stack' }),
          select(String(which), stacks.map((s, i) => [String(i), s.name]), (v) => { which = Number(v); draw(); }),
        ]));
      }

      /* --- the requirement --- */
      host.appendChild(section('Kebutuhannya', [
        field('Nama', (() => {
          const i = el('input', { type: 'text', value: stack.requirement });
          i.addEventListener('change', () => { stack.requirement = i.value; commit('Rename requirement'); });
          return i;
        })()),
        numRow('Lower limit (mm)', stack.lower, (v) => { stack.lower = v; commit('Stack limit'); draw(); }),
        numRow('Upper limit (mm)', stack.upper, (v) => { stack.upper = v; commit('Stack limit'); draw(); }),
        numRow('Kelonggaran geser rerata (mm)', stack.shift || 0, (v) => { stack.shift = v; commit('Stack shift'); draw(); }),
        el('div', { class: 'hint', text: 'Kelonggaran geser untuk proses yang bergeser dari pusat selama produksi. Biarkan nol kecuali ada bukti angkanya.' }),
      ], true, { icon: 'target' }));

      /* --- the chain --- */
      const rows = stack.links.map((l, i) => {
        const c = a.contributors.find(x => x.id === l.id);
        const nom = el('input', { type: 'number', step: 'any', value: String(l.nominal), class: 'stk-num' });
        nom.addEventListener('input', () => { const n = Number(nom.value); if (Number.isFinite(n)) { l.nominal = n; commit('Stack nominal'); draw(); } });
        const tol = el('input', { type: 'number', step: 'any', min: '0', value: String((Math.abs(l.plus) + Math.abs(l.minus)) / 2), class: 'stk-num' });
        tol.addEventListener('input', () => { const n = Math.abs(Number(tol.value)); if (Number.isFinite(n)) { l.plus = l.minus = n; commit('Stack tolerance'); draw(); } });
        const dirBtn = el('button', { class: 'btn tiny', text: l.dir >= 0 ? '+' : '−', title: 'Arah dimensi ini mendorong celah' });
        dirBtn.addEventListener('click', () => { l.dir = l.dir >= 0 ? -1 : 1; commit('Stack direction'); draw(); });
        const del = el('button', { class: 'btn tiny danger', text: '✕', title: 'Hapus tautan ini' });
        del.addEventListener('click', () => { stack.links = stack.links.filter(x => x.id !== l.id); commit('Hapus tautan stack'); draw(); });
        const lock = el('button', { class: `btn tiny${l.fixed ? ' on' : ''}`, text: l.fixed ? '🔒' : '🔓', title: l.fixed ? 'Tetap: part pemasok atau standar. Tidak bisa diperketat.' : 'Terbuka untuk diperketat' });
        lock.addEventListener('click', () => { l.fixed = !l.fixed; commit('Stack lock'); draw(); });

        const name = el('input', { type: 'text', value: l.label, class: 'stk-name' });
        name.addEventListener('change', () => { l.label = name.value; commit('Ganti nama tautan stack'); draw(); });

        return el('div', { class: 'stk-row' }, [
          dirBtn, name, nom,
          el('span', { class: 'stk-pm', text: '±' }), tol,
          select(l.dist, Object.entries(Tol.DISTRIBUTIONS).map(([k, v]) => [k, v.label]),
            (v) => { l.dist = v; commit('Stack distribution'); draw(); }),
          el('div', { class: 'stk-bar', title: isi('{percent}% dari total varians', { percent: ((c?.varianceShare || 0) * 100).toFixed(1) }) }, [
            el('div', { class: 'stk-fill', style: `width:${((c?.varianceShare || 0) * 100).toFixed(1)}%` }),
          ]),
          el('span', { class: 'stk-share', text: `${((c?.varianceShare || 0) * 100).toFixed(0)}%` }),
          lock, del,
        ]);
      });
      const addBtn = el('button', { class: 'btn', text: '+ Tambah tautan' });
      addBtn.addEventListener('click', () => {
        stack.links.push(Tol.makeLink({ label: `Dimension ${stack.links.length + 1}`, plus: limits.tolerance, minus: limits.tolerance }));
        commit('Tambah tautan stack'); draw();
      });
      const fromModel = el('button', { class: 'btn', text: 'Bangun ulang dari model' });
      fromModel.addEventListener('click', () => {
        const s = Tol.stackFromBuild(bodies, { axis: 'x', limits, process: this.processId() });
        stack.links = s.links; commit('Stack dari model'); draw();
      });

      host.appendChild(section(isi('Rantainya · {count} tautan', { count: stack.links.length }), [
        el('div', { class: 'stk-head' }, [
          el('span', { text: '±' }), el('span', { text: 'Dimensi' }), el('span', { text: 'Nominal' }),
          el('span', { text: '' }), el('span', { text: 'Toleransi' }), el('span', { text: 'Distribusi' }),
          el('span', { text: 'Pangsa varians' }), el('span', { text: '' }), el('span', { text: '' }), el('span', { text: '' }),
        ]),
        ...rows,
        el('div', { class: 'row' }, [addBtn, fromModel]),
        el('div', { class: 'hint', text: 'Tombol ± mengatur arah dimensi mendorong celah: panjang poros menambah stack, kedalaman bore menguranginya. Gembok menandai dimensi yang tidak bisa diubah, misalnya bearing beli jadi, supaya saran di bawah tidak pernah menyarankan mengencangkannya.' }),
      ], true, { icon: 'sequence' }));

      /* --- the three answers --- */
      const band = (min, max, fits) => el('div', { class: `stk-verdict ${fits ? 'ok' : 'bad'}` }, [
        el('strong', { text: isi('{min} sampai {max} mm', { min: fmt(min, 4), max: fmt(max, 4) }) }),
        el('span', { text: fits ? 'di dalam kebutuhan' : 'di luar kebutuhan' }),
      ]);
      host.appendChild(section('Apa yang dilakukan rantainya', [
        el('div', { class: 'stk-answers' }, [
          el('div', { class: 'stk-answer' }, [
            el('h4', { text: 'Kasus terburuk' }), band(a.worst.min, a.worst.max, a.worst.fits),
            el('div', { class: 'hint', text: isi('Memakai {percent}% dari kebutuhan. Ini aritmetika yang dijanjikan sebuah gambar, dan mengandaikan setiap part berada di batas terburuknya sekaligus.', { percent: (a.worst.used * 100).toFixed(0) }) }),
          ]),
          el('div', { class: 'stk-answer' }, [
            el('h4', { text: 'Root sum square' }), band(a.rss.min, a.rss.max, a.rss.fits),
            el('div', { class: 'hint', text: isi('σ = {sigma} mm. Apa yang benar-benar dilakukan satu batch part, kalau prosesnya terpusat dan independen.', { sigma: fmt(a.rss.sigma, 5) }) }),
          ]),
          el('div', { class: 'stk-answer' }, [
            el('h4', { text: 'Monte Carlo' }), band(a.mc.p1, a.mc.p99, a.mc.failures === 0),
            el('div', { class: 'hint', text: isi('{trials} rakitan disampel, {failures} di luar spesifikasi ({ppm} ppm). Persentil ke-1 sampai ke-99 ditampilkan.', { trials: a.mc.trials.toLocaleString(), failures: a.mc.failures, ppm: Math.round(a.mc.ppm) }) }),
          ]),
        ]),
        el('div', { class: `banner ${a.verdict.severity === 'ok' ? 'ok' : a.verdict.severity === 'warn' ? 'warn' : 'err'}`, text:
          `Cp ${a.capability.cp.toFixed(2)}, Cpk ${a.capability.cpk.toFixed(2)}. ${a.verdict.label}. ` +
          isi('Sekitar {p1} bagian per juta tidak akan terpasang.', { p1: Math.round(a.capability.ppm) }) }),
        el('div', { class: 'hint', text: a.capability.centred
          ? 'Cp dan Cpk sepakat, jadi rantainya membidik tengah kebutuhannya.'
          : 'Cp jauh di atas Cpk, artinya rantainya cukup ketat tetapi membidik melenceng dari tengah. Menggeser sebuah nominal lebih murah daripada membeli toleransi.' }),
      ], true, { icon: 'gauge' }));

      /* --- what to change --- */
      const advice = [];
      advice.push(el('div', { class: 'row wide' }, [
        el('label', { text: 'Target Cpk' }),
        segmented(String(target), [['1', '1.00'], ['1.33', '1.33'], ['1.67', '1.67'], ['2', '2.00']],
          (v) => { target = Number(v); draw(); }),
      ]));
      if (lv.met) {
        advice.push(el('div', { class: 'banner ok', text: isi('Rantainya sudah memenuhi Cpk {target}. Tidak ada yang perlu diubah.', { target }) }));
      } else if (!lv.closes) {
        // The nominals miss the requirement. Tolerance advice would be wrong
        // here, not merely unhelpful, so the dialog says what is actually wrong.
        advice.push(el('div', { class: 'banner err', text: lv.nominal.note }));
        const centreIt = el('button', { class: 'btn', text: isi('Pindahkan kebutuhannya ke {from} … {to} mm', { from: fmt(lv.nominal.mean - (a.upper - a.lower) / 2, 4), to: fmt(lv.nominal.mean + (a.upper - a.lower) / 2, 4) }) });
        centreIt.addEventListener('click', () => {
          const width = (stack.upper - stack.lower) / 2;
          stack.lower = lv.nominal.mean - width;
          stack.upper = lv.nominal.mean + width;
          commit('Pusatkan ulang kebutuhannya'); draw();
        });
        advice.push(el('div', { class: 'dx-item' }, [centreIt,
          el('div', { class: 'hint', text: 'Hanya jika kebutuhan yang salah dimasukkan. Jika kebutuhan nyata, dimensinya yang harus bergerak.' })]));
      } else {
        if (lv.centring) advice.push(el('div', { class: 'banner warn', text: isi('{note} Geser sebuah nominal sebesar {mm} mm.', { note: lv.centring.note, mm: fmt(lv.centring.move, 4) }) }));
        if (lv.uniform?.possible) {
          const apply = el('button', { class: 'btn', text: isi('Skalakan setiap toleransi terbuka dengan ×{factor}', { factor: lv.uniform.factor.toFixed(3) }) });
          apply.addEventListener('click', () => {
            for (const l of stack.links) if (!l.fixed) { l.plus *= lv.uniform.factor; l.minus *= lv.uniform.factor; }
            commit('Perketat stack-nya'); draw();
          });
          advice.push(el('div', { class: 'dx-item' }, [apply,
            el('div', { class: 'hint', text: 'Membagi biaya ke setiap operasi. Sederhana, dan biasanya opsi termahal.' })]));
        } else if (lv.uniform) {
          advice.push(el('div', { class: 'banner err', text: lv.uniform.note }));
        }
        for (const one of lv.single.filter(x => x.enough).slice(0, 3)) {
          const b = el('button', { class: 'btn', text: `${one.label}: ±${fmt(one.from, 4)} → ±${fmt(one.to, 4)}` });
          b.addEventListener('click', () => {
            const l = stack.links.find(x => x.id === one.id);
            if (l) { l.plus = l.minus = one.to; commit('Perketat satu tautan'); draw(); }
          });
          advice.push(el('div', { class: 'dx-item' }, [b,
            el('div', { class: 'hint', text: 'Satu operasi lebih ketat, bukan lima. Itu yang akan ditawarkan bengkel.' })]));
        }
        if (!lv.single.some(x => x.enough)) {
          advice.push(el('div', { class: 'banner err', text: 'Tidak ada satu tautan yang bisa menyerap kekurangan sendirian. Rantai butuh lebih sedikit tautan, bukan yang lebih ketat: itu berarti perubahan desain, misalnya mesin dua permukaan dalam satu setup agar berbagi datum.' }));
        }
        const alloc = Tol.allocate(stack, { method: 'proportional', target });
        if (alloc.some(x => x.tol != null)) {
          const b = el('button', { class: 'btn', text: 'Alokasikan mundur dari kebutuhan' });
          b.addEventListener('click', () => {
            alloc.forEach(x => { const l = stack.links.find(y => y.id === x.id); if (l && x.tol != null) l.plus = l.minus = x.tol; });
            commit('Allocate tolerances'); draw();
          });
          advice.push(el('div', { class: 'dx-item' }, [b,
            el('div', { class: 'hint', text: isi('Mengukur setiap pita dari kebutuhannya, diskalakan dengan dimensinya: {bands}.', { bands: alloc.filter(x => x.tol != null).map(x => `${x.label} ±${fmt(x.tol, 4)}`).join(', ') }) })]));
        }
      }
      host.appendChild(section('Apa yang perlu diubah', advice, true, { icon: 'bulb' }));
      host.appendChild(el('div', { class: 'banner warn', text: 'Proses independen berdistribusi normal diasumsikan kecuali tautan menyatakan lain. Permesinan nyata punya galat berkorelasi dari fixture dan operator yang sama, yang ini tidak bisa lihat. Anggap angka ppm sebagai orde-besar.' }));
    };
    draw();

    modal({
      title: 'Stack-up toleransi', icon: 'ruler', wide: true, size: 'tall',
      subtitle: store.doc.meta.name,
      body: host,
      actions: [
        { label: 'Stack baru', run: () => {
          store.doc.stacks.push(Tol.emptyStack({ name: `Stack ${store.doc.stacks.length + 1}` }));
          which = store.doc.stacks.length - 1;
          store.commit('Stack baru');
          // Reopening rebuilds the dialog around the new stack; returning falsy
          // lets the old one close underneath it.
          setTimeout(() => this.showTolerance(), 0);
        } },
        { label: 'Tutup', primary: true },
      ],
    });
  }

  /**
   * ISO 286 fits, resolved at a real size.
   *
   * A fit table is one of those references everybody looks up and nobody
   * remembers, and looking it up in a PDF gives deviations in micrometres that
   * still have to be added to a nominal by hand. Here the nominal is the one
   * the model uses, and the answer is the clearance in millimetres.
   */
  showFits() {
    let D = 25;
    const sel = [...this.selection][0];
    const holes = sel ? this.holesOf(sel) : [];
    if (holes.length) D = Number(holes[0].diameter.toFixed(3));
    const host = el('div');

    const draw = () => {
      clear(host);
      const table = Tol.fitTable(D);
      if (!table.length) {
        host.appendChild(el('div', { class: 'banner warn', text: isi('ISO 286 ditabelkan sampai 500 mm. {mm} mm ada di luarnya, jadi tidak ada jawaban standar yang bisa diberikan.', { mm: fmt(D) }) }));
        return;
      }
      host.append(
        el('div', { class: 'row wide' }, [el('label', { text: 'Ukuran nominal (mm)' }),
          (() => {
            const i = el('input', { type: 'number', step: 'any', min: '0.1', value: String(D) });
            i.addEventListener('input', () => { const n = Number(i.value); if (n > 0) { D = n; draw(); } });
            return i;
          })()]),
        el('div', { class: 'fit-table' }, [
          el('div', { class: 'fit-head' }, ['Pas', 'Untuk apa', 'Hole', 'Poros', 'Clearance'].map(t => el('span', { text: t }))),
          ...table.map(f => el('div', { class: `fit-row ${f.kind}` }, [
            el('strong', { text: f.name }),
            el('span', { class: 'fit-note' }, [
              el('b', { text: f.named?.label || f.kind }),
              el('small', { text: f.named?.note || '' }),
            ]),
            el('span', { class: 'mono', text: `${f.hole.upper >= 0 ? '+' : ''}${f.hole.upper.toFixed(3)} / ${f.hole.lower >= 0 ? '+' : ''}${f.hole.lower.toFixed(3)}` }),
            el('span', { class: 'mono', text: `${f.shaft.upper >= 0 ? '+' : ''}${f.shaft.upper.toFixed(3)} / ${f.shaft.lower >= 0 ? '+' : ''}${f.shaft.lower.toFixed(3)}` }),
            el('span', { class: 'mono', text: f.kind === 'interference'
              ? isi('{p1} sampai {p2} lebih ketat', { p1: Math.abs(f.maxClearance).toFixed(3), p2: Math.abs(f.minClearance).toFixed(3) })
              : isi('{min} sampai {max}', { min: f.minClearance.toFixed(3), max: f.maxClearance.toFixed(3) }) }),
          ])),
        ]),
        el('div', { class: 'hint', text: isi('IT6 pada ukuran ini adalah {it6} µm, IT7 {it7} µm, IT11 {it11} µm. Grade melebar seiring ukuran - itulah sebabnya sebuah fit berupa huruf dan grade, bukan sebuah angka.', { it6: fmt(Tol.itGrade(6, D) * 1000, 0), it7: fmt(Tol.itGrade(7, D) * 1000, 0), it11: fmt(Tol.itGrade(11, D) * 1000, 0) }) }),
        el('div', { class: 'banner warn', text: 'Fits dasar lubang: lubang adalah anggota H dan poros membawa deviasi, karena reamer atau bor ukurannya tetap sedangkan poros bisa dibubut. Nilai dari tabel ISO 286-1 terbit, tepat, tidak diinterpolasi.' }),
      );
      if (holes.length) {
        host.appendChild(el('div', { class: 'hint', text: isi('Body yang dipilih punya {n} lubang yang dikenali; yang terbesar {mm} mm.', { n: holes.length, mm: fmt(holes[0].diameter, 3) }) }));
      }
    };
    draw();

    modal({
      title: 'Fits dan limits', icon: 'target', wide: true,
      subtitle: 'Dasar lubang ISO 286',
      body: host,
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  /** Recognised holes on one body, or an empty list when it has none. */
  holesOf(featureId) {
    const b = this.analysisBodies().find(x => x.feature.id === featureId);
    if (!b) return [];
    try { return recognise(b.geometry, b.matrix).holes || []; } catch { return []; }
  }

  /** The process the document is being made by, matching the Doctor's choice. */
  processId() {
    return store.doc.studio?.process || Studio.standards().process;
  }


  /* ====================================================== design as code */

  /**
   * The document as editable text.
   *
   * Two things make this more than a novelty. The spec is generated from the
   * live document, so it is never stale; and applying an edit goes through a
   * review that names what would change before anything does, because text is
   * a sharp enough tool to delete half a model with one keystroke.
   */
  showSpec() {
    const current = Spec.toSpec(store.doc);
    const area = el('textarea', { class: 'spec-edit', spellcheck: 'false', rows: '22' });
    area.value = current.text;
    const statusLine = el('div', { class: 'hint' });
    const diffHost = el('div');

    const review = () => {
      const r = Spec.reviewSpec(area.value, store.doc);
      clear(diffHost);
      statusLine.textContent = '';

      if (!r.ok) {
        statusLine.textContent = r.summary;
        diffHost.appendChild(el('div', { class: 'banner err', text: isi('{n} galat. Tidak ada yang diterapkan sampai semuanya diperbaiki.', { n: r.errors.length }) }));
        for (const e of r.errors.slice(0, 12)) {
          diffHost.appendChild(el('div', { class: 'spec-err' }, [
            el('span', { class: 'spec-line', text: e.line ? isi('baris {n}', { n: e.line }) : 'document' }),
            el('span', { text: e.message }),
            e.text ? el('code', { text: e.text }) : el('span'),
          ]));
        }
        return r;
      }

      statusLine.textContent = r.summary;
      const parts = [];
      if (r.added.length) parts.push(el('div', { class: 'diff-row added', text: `Added: ${r.added.join(', ')}` }));
      if (r.removed.length) parts.push(el('div', { class: 'diff-row removed', text: `Removed: ${r.removed.join(', ')}` }));
      if (r.changed.length) parts.push(el('div', { class: 'diff-row changed', text: `Changed: ${r.changed.join(', ')}` }));
      if (!parts.length && r.diff.empty) parts.push(el('div', { class: 'hint', text: 'Belum ada perubahan. Sunting teks di atas; efeknya muncul di sini sebelum diterapkan.' }));

      for (const h of Spec.hunks(r.diff, 2)) {
        parts.push(el('div', { class: 'spec-hunk' }, h.rows.map(row =>
          el('div', { class: `spec-drow ${row.kind}` }, [
            el('span', { class: 'spec-sign', text: row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' ' }),
            el('code', { text: row.text || ' ' }),
          ]))));
      }
      for (const w of r.warnings.slice(0, 8)) {
        parts.push(el('div', { class: 'dx-item warn', text: w.line ? `Baris ${w.line}: ${w.message}` : w.message }));
      }
      clear(diffHost);
      parts.forEach(p => diffHost.appendChild(p));
      return r;
    };

    let timer = null;
    area.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(review, 220); });
    review();

    const body = el('div', {}, [
      el('p', { class: 'hint', text: 'Teks ini adalah dokumennya, bukan salinan. Menyunting model menulis ulang teks; menerapkan teks menulis ulang model. Parameter dirujuk namanya, jadi mengubah satu nilai menggerakkan semua yang bergantung padanya.' }),
      area,
      statusLine,
      section('Apa yang akan dilakukannya', [diffHost], true, { icon: 'sequence' }),
      el('div', { class: 'banner warn', text: current.lossy.length
        ? isi('{count} item tidak bisa ditulis sebagai teks dan tetap melekat pada dokumen: {p1}. Mereka selamat dalam perjalanan bolak-balik; hanya saja tidak bisa disunting di sini.', { count: current.lossy.length, p1: current.lossy.map(l => `${l.feature} (${l.what})`).join(', ') })
        : 'Semua yang ada di dokumen ini bolak-balik lewat teksnya, dan aplikasi memeriksanya alih-alih menganggapnya benar.' }),
    ]);

    modal({
      title: 'Desain sebagai kode', icon: 'code', wide: true, size: 'tall',
      subtitle: `${store.doc.meta.name} · spec v${Spec.SPEC_VERSION}`,
      body,
      actions: [
        // A truthy return keeps the dialog open, which is what the editing
        // actions want and what a rejected Apply wants.
        { label: 'Rapikan', run: () => { area.value = Spec.format(area.value); review(); return true; } },
        { label: 'Salin', run: () => { this.copyText(area.value, 'Spec disalin.'); return true; } },
        { label: 'Terapkan', primary: true, run: () => {
          const r = Spec.reviewSpec(area.value, store.doc);
          if (!r.ok) { this.flash(isi('{n} galat di spesifikasinya. Tidak ada yang diterapkan.', { n: r.errors.length }), 'err'); return true; }
          if (r.diff.empty) { this.flash('Teksnya sudah cocok dengan modelnya.', 'info'); return false; }
          store.batch('Terapkan spesifikasinya', () => {
            const d = store.doc;
            d.meta = { ...d.meta, ...r.doc.meta };
            d.params = r.doc.params;
            d.features = r.doc.features;
          });
          this.selection.clear();
          this.rebuildNow();
          this.flash(`Spec applied: ${r.summary}.`, 'ok');
          return false;
        } },
        { label: 'Batal' },
      ],
    });
  }

  copySpec() {
    this.copyText(Spec.toSpec(store.doc).text, 'Spesifikasi disalin ke papan klip.');
  }

  copyText(text, note) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => this.flash(note, 'ok')).catch(() => this.flash('Peramban menolak akses papan klip.', 'warn'));
    } else {
      this.flash('Peramban ini tidak punya API papan klip. Pilih teksnya dan salin manual.', 'warn');
    }
  }

  /* ===================================================== intent, read in */

  /** Read a design-intent JSON file back into a live parametric document. */
  pickIntent() {
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => this.showIntentImport(String(reader.result), file.name);
      reader.onerror = () => this.flash('Berkas itu tidak bisa dibaca.', 'err');
      reader.readAsText(file);
    });
    input.click();
  }

  showIntentImport(text, filename) {
    const r = Intent.importIntent(text);
    if (!r.doc) {
      modal({
        title: 'Design intent', icon: 'file-import',
        subtitle: filename,
        body: el('div', {}, [
          el('div', { class: 'banner err', text: isi('{n} masalah menghentikan impor berkas ini.', { n: r.errors.length }) }),
          ...r.errors.slice(0, 10).map(e => el('div', { class: 'dx-item', text: e })),
        ]),
        actions: [{ label: 'Tutup', primary: true }],
      });
      return;
    }

    const check = Intent.intentRoundTrip(typeof text === 'string' ? JSON.parse(text) : text);
    const body = el('div', {}, [
      el('p', { class: 'hint', text: 'Berkas design intent membawa parameter, pohon fitur, dan relasi di balik mesh. Membacanya membangun ulang dokumen parametrik hidup - itu paruh interoperabilitas yang biasanya hilang.' }),
      el('div', { class: 'merge-stats' }, [
        el('div', { class: 'big-stat' }, [el('strong', { text: String(r.doc.features.length) }), el('span', { text: 'features' })]),
        el('div', { class: 'big-stat' }, [el('strong', { text: String(r.doc.params.length) }), el('span', { text: 'parameters' })]),
        el('div', { class: 'big-stat' }, [el('strong', { text: r.doc.meta.units }), el('span', { text: 'satuan tampilan' })]),
      ]),
      el('div', { class: `banner ${check.ok ? 'ok' : 'warn'}`, text: check.ok
        ? 'Semua isi berkas kembali tanpa berubah: perjalanan bolak-baliknya nirsusut pada dokumen ini.'
        : isi('{count} hal tidak selamat persis dalam perjalanannya.', { count: check.differences.length }) }),
      ...(check.ok ? [] : check.differences.slice(0, 10).map(d => el('div', { class: 'dx-item warn', text: d }))),
      ...r.notes.slice(0, 8).map(n => el('div', { class: 'dx-item', text: n })),
      section('Fitur', [el('div', {}, r.doc.features.map(f => el('div', { class: 'diff-row' }, [
        el('span', { class: 'diff-badge', text: f.type }),
        el('span', { class: 'diff-feature', text: f.name }),
        el('small', { text: f.inputs.length ? `consumes ${f.inputs.length}` : Object.entries(f.params).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ') }),
      ])))], true, { icon: 'sequence' }),
      el('div', { class: 'banner warn', text: 'Membuka ini mengganti dokumen yang sedang terbuka. Simpan dulu jika ingin mempertahankannya.' }),
    ]);

    modal({
      title: 'Impor design intent', icon: 'file-import', wide: true,
      subtitle: `${filename} · ${r.doc.meta.name}`,
      body,
      actions: [
        { label: 'Buka', primary: true, run: () => {
          store.load(r.doc);
          this.selection.clear();
          this.rebuildNow();
          this.flash(isi('{n} fitur diimpor dari design intent.', { n: r.doc.features.length }), 'ok');
        } },
        { label: 'Batal' },
      ],
    });
  }


  /* =============================================================== AI chat */

  /**
   * The shell both AI chats share: a transcript, an input, and one apply path.
   *
   * Written once because the two features differ only in what they plan. The
   * transcript is the important part of the design: every turn shows what was
   * read, what it would do and what it assumed, and nothing reaches the
   * document until the user agrees. A studio that quietly edits your model on
   * a guess is worse than no assistant at all.
   */
  _chatShell({ title, icon, subtitle, blurb, sapaan, contoh, placeholder, kirim, terap }) {
    const log = el('div', { class: 'chat-log' });
    const input = el('input', {
      type: 'text', class: 'sp-input', spellcheck: 'false', placeholder,
    });
    const jejak = el('div', { class: 'chat-klik mono' });
    let tunggu = null;                      // a plan waiting for "ya"

    const baris = (dari, lines) => {
      const wrap = el('div', { class: `chat-row ${dari}` });
      wrap.appendChild(el('div', { class: 'chat-who', text: dari === 'pengguna' ? 'Anda' : 'Studio' }));
      const body = el('div', { class: 'chat-say' });
      for (const line of lines) {
        body.appendChild(el('div', {
          class: line.startsWith('·') ? 'chat-item' : 'chat-line',
          text: line.replace(/^·\s*/, ''),
        }));
      }
      wrap.appendChild(body);
      log.appendChild(wrap);
      log.scrollTop = log.scrollHeight;
    };

    const terapkan = (r) => {
      try {
        const label = terap(r);
        this.flash(isi('{label}. Ctrl Z mengembalikannya.', { label }), 'ok', 4200);
      } catch (e) {
        this.flash(isi('Gagal menerapkan: {error}', { error: e.message || e }), 'err');
      }
    };

    const kirimSekarang = () => {
      const teks = input.value.trim();
      if (!teks) return;
      input.value = '';
      baris('pengguna', [teks]);
      const r = kirim(teks);
      baris('studio', r.ucapan);
      if (r.aksi === 'rencana' || r.aksi === 'ubah') tunggu = r;
      if (r.aksi === 'terapkan') { terapkan(r); tunggu = null; }
      if (r.aksi === 'tolak' || r.aksi === 'jawab' || r.aksi === 'tanya') tunggu = null;
      jejak.textContent = r.klik
        ? isi('Turn ini ≈ {klik} langkah-klik', { klik: r.klik })
        : '';
      input.focus();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); kirimSekarang(); }
    });

    baris('studio', sapaan);

    const body = el('div', { class: 'chat-wrap' }, [
      el('p', { class: 'hint', text: blurb }),
      log,
      input,
      jejak,
      section('Contoh yang bisa disalin', [
        el('div', { class: 'sp-examples' }, contoh.map(ex => {
          const b = el('button', { class: 'btn tiny', text: ex });
          b.addEventListener('click', () => { input.value = ex; input.focus(); });
          return b;
        })),
      ], false, { icon: 'book' }),
    ]);

    modal({
      title, icon, wide: true, size: 'tall', subtitle, body,
      actions: [
        { label: 'Kirim', primary: true, run: () => { kirimSekarang(); return false; } },
        { label: 'Terapkan', run: () => { if (tunggu) { terapkan(tunggu); tunggu = null; } else this.flash('Belum ada rencana untuk diterapkan.', 'warn'); return false; } },
        { label: 'Tutup' },
      ],
    });
    setTimeout(() => input.focus(), 30);
  }

  /**
   * AI Chat ke 3D.
   *
   * One sentence to a whole editable assembly. The planner is in src/ai; this
   * is only the window onto it, plus the one transaction that applies a turn.
   */
  showChat3D() {
    if (!this._sesi3d) this._sesi3d = Chat3D.sesiBaru();
    const sesi = this._sesi3d;

    const konteks = () => ({
      doc: store.doc,
      selection: [...this.selection],
      target: [...this.selection][0] || null,
      stats: {
        bodies: this.build?.stats?.bodies ?? 0,
        tris: this.build?.stats?.tris ?? 0,
        mass: this.build?.stats?.mass ?? null,
        volume: this.build?.stats?.volume ?? null,
        size: this.build?.bounds
          ? [this.build.bounds.max.x - this.build.bounds.min.x,
            this.build.bounds.max.y - this.build.bounds.min.y,
            this.build.bounds.max.z - this.build.bounds.min.z]
          : null,
      },
    });

    this._chatShell({
      title: 'AI Chat ke 3D', icon: 'command',
      subtitle: 'Satu kalimat, satu rakitan parametrik',
      blurb: 'Perencana lokal, bukan model bahasa dan bukan layanan awan: ia membaca kosa kata Bahasa Indonesia untuk rakitan, bentuk, ukuran, dan suntingan, lalu menghasilkan fitur katalog yang sama seperti hasil klik. Tidak ada yang dikirim ke mana pun. Setiap turn direncanakan dulu - Anda yang bilang "ya".',
      sapaan: Chat3D.sapaan(),
      contoh: Chat3D.CONTOH,
      placeholder: 'buatkan kotak panel 400 x 300 x 150 tebal 3 dengan 6 lubang gland 20',
      kirim: (teks) => Chat3D.respon(sesi, teks, konteks()),
      terap: (r) => {
        const program = r.program;
        const edits = r.edits;
        store.batch('AI Chat ke 3D', () => {
          const d = store.doc;
          for (const p of program?.params || []) {
            if (!d.params.some(q => q.name === p.name)) d.params.push({ id: uid('p'), ...p });
          }
          for (const f of program?.features || []) d.features.push(f);
          for (const e of edits || []) {
            if (e.kind === 'param') {
              const p = d.params.find(q => q.name === e.name);
              if (p) p.value = e.value;
            } else if (e.kind === 'paramBaru') {
              if (!d.params.some(q => q.name === e.name)) d.params.push({ id: uid('p'), name: e.name, value: e.value });
            } else if (e.kind === 'material') {
              const ids = e.targets?.length ? e.targets : d.features.map(f => f.id);
              for (const id of ids) {
                const f = d.features.find(x => x.id === id);
                if (!f) continue;
                f.material = e.material;
                const m = MATERIALS[e.material];
                if (m) { f.appearance.color = m.color; f.appearance.metalness = m.metal; f.appearance.roughness = m.rough; }
              }
            } else if (e.kind === 'pattern') {
              for (const f of d.features) if (/^pattern/.test(f.type)) f.params.count = e.count;
            }
          }
        });
        this.selection.clear();
        const last = program?.features?.at(-1);
        if (last) this.selection.add(last.id);
        this.rebuildNow();
        return program?.features?.length
          ? isi('{n} fitur dibangun', { n: program.features.length })
          : isi('{n} suntingan diterapkan', { n: (edits || []).length });
      },
    });
  }

  /**
   * AI Chat ke 4D.
   *
   * The same shape, for time: a construction sequence, a motor, keyframes or
   * physics, from a sentence, against the bodies already in the document.
   */
  showChat4D() {
    if (!this._sesi4d) this._sesi4d = Chat4D.sesiBaru();
    const sesi = this._sesi4d;

    this._chatShell({
      title: 'AI Chat ke simulasi 4D', icon: 'timeline',
      subtitle: 'Urutan bangun, motor, keyframe, dan fisika dari satu kalimat',
      blurb: 'Perencana lokal untuk dimensi keempat. Ia mencari sendiri body yang Anda maksud dari nama fitur di dokumen, lalu menyusun jadwal, motor, keyframe, atau fisika rigid-body. Seperti sisi 3D-nya: direncanakan dulu, diterapkan setelah Anda setuju, dan tidak ada yang meninggalkan peramban ini.',
      sapaan: Chat4D.sapaan(),
      contoh: Chat4D.CONTOH,
      placeholder: 'jadwalkan urutan bangun, tiap lantai 3 hari, dari bawah ke atas',
      kirim: (teks) => Chat4D.respon(sesi, teks, { doc: store.doc, selection: [...this.selection] }),
      terap: (r) => {
        const sim = r.sim || {};
        store.edit('AI Chat ke 4D', (d) => {
          if (sim.duration != null) d.sim.duration = sim.duration;
          if (sim.fps != null) d.sim.fps = sim.fps;
          if (sim.schedule) {
            d.sim.schedule.enabled = sim.schedule.enabled ?? d.sim.schedule.enabled;
            if (sim.schedule.items) {
              d.sim.schedule.items = Object.keys(sim.schedule.items).length
                ? { ...d.sim.schedule.items, ...sim.schedule.items }
                : {};
            }
          }
          if (sim.tracks) {
            d.sim.tracks = Object.keys(sim.tracks).length ? { ...d.sim.tracks, ...sim.tracks } : {};
          }
          if (sim.dynamics) {
            d.sim.dynamics = {
              ...d.sim.dynamics,
              ...sim.dynamics,
              bodies: { ...d.sim.dynamics.bodies, ...(sim.dynamics.bodies || {}) },
            };
          }
          // A drop test starts from a height, which is a transform rather than
          // a simulator setting: the simulator reads where the body is.
          for (const id of sim.angkat?.ids || []) {
            const f = d.features.find(x => x.id === id);
            if (f) f.transform.pos[2] += sim.angkat.dz;
          }
        }, { rebuild: !!sim.angkat });
        this.setWorkspace('sim');
        this.refreshUI();
        return 'Timeline diperbarui';
      },
    });
  }

  /* ========================================================== typed intent */

  /**
   * Say what you want, in the vocabulary the app knows.
   *
   * The readback is the whole design of this dialog. It is not a language
   * model and it must never pretend to be one, so before anything is built it
   * shows every fact it took from the sentence, in the app's own words, and
   * lists any word it could not act on. A co-pilot that quietly does the wrong
   * thing costs more than one that says it did not follow you.
   */
  showSpeak() {
    const input = el('input', {
      type: 'text', class: 'sp-input', spellcheck: 'false',
      placeholder: 'pelat 120 kali 80 tebal 8 dari aluminium',
    });
    const out = el('div', { class: 'sp-out' });
    let current = null;

    const target = [...this.selection][0] || null;
    const targetName = target ? (store.feature(target)?.name || null) : null;

    const read = () => {
      const text = input.value.trim();
      clear(out);
      current = null;
      if (!text) {
        out.appendChild(el('div', { class: 'hint', text: 'Ketik instruksi; efeknya muncul di sini sebelum apa pun dibangun.' }));
        return;
      }
      const r = Speak.interpret(text, { doc: store.doc, target });
      if (!r.ok) {
        out.appendChild(el('div', { class: 'banner err', text: r.why }));
        return;
      }
      current = r;

      out.append(
        el('div', { class: 'sp-read' }, [
          el('h4', { text: 'Arti teks itu' }),
          el('ul', {}, r.understood.map(u => el('li', { text: u }))),
        ]),
        el('div', { class: 'sp-read' }, [
          el('h4', { text: 'Yang akan dibangun' }),
          el('ul', {}, r.features.map(f => el('li', {
            text: `${f.name} (${CATALOG[f.type].label})` +
              (f.inputs.length ? isi(' dari {count} masukan', { count: f.inputs.length }) : '') +
              `: ${Object.entries(f.params).filter(([, v]) => v !== undefined)
                .map(([k, v]) => `${k} ${v}`).join(', ')}`,
          }))),
        ]),
      );
      if (r.params.length) {
        out.appendChild(el('div', { class: 'sp-read' }, [
          el('h4', { text: 'Parameter yang akan dideklarasikan' }),
          el('ul', {}, r.params.map(p => el('li', { text: `${p.name} = ${p.value}${p.note ? `  (${p.note})` : ''}` }))),
        ]));
      }
      if (r.unknown.length) {
        out.appendChild(el('div', { class: 'banner warn', text:
          isi('Diabaikan: {words}. Ini membaca kosa kata, bukan bahasa bebas, jadi kata-kata itu tidak berpengaruh. Tidak ada yang ditebak darinya.', { words: r.unknown.join(', ') }) }));
      }
      for (const n of r.notes) out.appendChild(el('div', { class: 'dx-item', text: n }));
    };

    let timer = null;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(read, 140); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && current) { e.preventDefault(); apply(); }
    });

    const apply = () => {
      if (!current) { this.flash('Belum ada yang bisa dibangun.', 'warn'); return; }
      const r = current;
      store.batch(`Bangun: ${input.value.trim().slice(0, 40)}`, () => {
        const d = store.doc;
        for (const p of r.params) d.params.push({ id: uid('p'), ...p });
        for (const f of r.features) d.features.push(f);
      });
      this.selection.clear();
      this.selection.add(r.features.at(-1).id);
      this.rebuildNow();
      this.flash(isi('{readback}. Ctrl Z mengembalikannya.', { readback: r.understood[0] }), 'ok', 4200);
      closeModal();
    };

    read();
    const body = el('div', {}, [
      el('p', { class: 'hint', text: 'Tata bahasa, bukan model bahasa. Mengenali bentuk, angka, satuan, callout ulir, dan jumlah, dan menolak apa pun di luar kosa kata itu alih-alih menebak. Semua yang dibangun adalah fitur biasa yang bisa disunting, digeser, dan dikendalikan parameter setelahnya.' }),
      input,
      targetName
        ? el('div', { class: 'hint', text: isi('"{name}" sedang dipilih, jadi sebuah lubang akan dipotong darinya.', { name: targetName }) })
        : el('div', { class: 'hint', text: 'Tidak ada yang dipilih, jadi lubang akan datang sebagai body yang harus Anda subtract sendiri.' }),
      out,
      section('Hal-hal yang dipahaminya', [
        el('div', { class: 'sp-examples' }, Speak.EXAMPLES.map(ex => {
          const b = el('button', { class: 'btn tiny', text: ex });
          b.addEventListener('click', () => { input.value = ex; read(); input.focus(); });
          return b;
        })),
        el('div', { class: 'hint', text: 'Bentuk: box, plate, cylinder, tube, sphere, cone, torus, wedge, prism, pyramid, helix. Satuan: mm, cm, m, inci, kaki. Ulir: M1.6 sampai M36, clearance atau tap, dari ISO 273. Jumlah menjadi pattern, jadi jumlahnya masih bisa diubah kemudian.' }),
      ], false, { icon: 'book' }),
    ]);

    modal({
      title: 'Katakan yang Anda inginkan', icon: 'command', wide: true,
      subtitle: 'Intent ketikan, jadi fitur nyata',
      body,
      actions: [
        { label: 'Bangun', primary: true, run: () => { apply(); return true; } },
        { label: 'Batal' },
      ],
    });
    setTimeout(() => input.focus(), 30);
  }


  /* =========================================================== fasteners */

  /**
   * The fastener library.
   *
   * A component in CAD is normally a shape and nothing else, so the proof
   * load, the torque, the tapping drill and the purchase-order description all
   * get looked up by hand. They are all published numbers, so they are here,
   * next to the geometry, and they travel with it into the bill of materials.
   */
  showFasteners() {
    let size = 'M8';
    let cls = '8.8';
    let length = 30;
    let fit = 'medium';
    let lubricated = false;
    let load = 5000;
    let count = 4;
    let shear = false;
    const host = el('div');

    const draw = () => {
      clear(host);
      const s = Fast.spec(size, { cls, length, fit, lubricated });
      const j = Fast.checkJoint(size, { cls, load, count, shear, safety: 2, lubricated });
      const sev = j.utilisation <= 0.5 ? 'ok' : j.pass ? 'warn' : 'err';

      host.append(
        el('div', { class: 'row wide' }, [
          el('label', { text: 'Ukuran' }),
          select(size, Fast.SIZES.map(x => [x, x]), (v) => { size = v; draw(); }),
        ]),
        el('div', { class: 'row wide' }, [
          el('label', { text: 'Kelas properti' }),
          select(cls, Object.keys(Fast.CLASSES).map(x => [x, x]), (v) => { cls = v; draw(); }),
        ]),
        el('div', { class: 'hint', text: Fast.CLASSES[cls].note }),
        numRow('Length (mm)', length, (v) => { length = Math.max(2, v); draw(); }),
        el('div', { class: 'row wide' }, [
          el('label', { text: 'Clearance' }),
          segmented(fit, [['close', 'Tutup'], ['medium', 'Medium'], ['free', 'Free']], (v) => { fit = v; draw(); }),
        ]),

        section('Baut ini apa', [kv([
          ['Penandaan', `${s.designation}, ${s.standard}`],
          ['Pitch ulir', `${s.pitch} mm (kasar, ISO 724)`],
          ['Luas penampang tarik', `${s.tensileArea} mm²`],
          ['Tegangan proof', `${s.proofStress} N/mm²`],
          ['Beban proof', `${(s.proofLoadN / 1000).toFixed(1)} kN`],
          ['Lubang clearance', `⌀${s.clearanceHole} mm (${s.clearanceFit}, ISO 273)`],
          ['Bor tap', `⌀${s.tappingDrill} mm`],
          ['Kedalaman ulir minimum', `${s.minThreadEngagement} mm`],
          ['Kepala', `⌀${s.headDiameter} × ${s.headHeight} mm`],
          ['Mur', `${s.nutAcrossFlats} A/F × ${s.nutHeight} mm, ISO 4032`],
        ])], true, { icon: 'key' }),
        el('div', { class: 'hint', text: s.engagementNote }),

        section('Pengetatan', [
          checkbox('Ulir dilumasi', lubricated, (v) => { lubricated = v; draw(); }),
          el('div', { class: 'banner ok', text: isi('{torque} N·m untuk mencapai preload {preload} kN.', { torque: s.torqueNm, preload: (s.preloadN / 1000).toFixed(1) }) }),
          el('div', { class: 'hint', text: s.torqueBasis }),
        ], true, { icon: 'rotate' }),

        section('Apakah sambungannya akan bertahan?', [
          numRow('Beban total (N)', load, (v) => { load = Math.max(0, v); draw(); }),
          numRow('Jumlah baut', count, (v) => { count = Math.max(1, Math.round(v)); draw(); }),
          checkbox('Terbebani geser, bukan tarik', shear, (v) => { shear = v; draw(); }),
          el('div', { class: `banner ${sev}`, text:
            isi('{per} N per baut terhadap {allowable} N yang diizinkan pada {mode} dengan faktor keamanan {safety}. ', { per: j.per, allowable: j.allowableN, mode: j.mode, safety: j.safety }) +
            `${(j.utilisation * 100).toFixed(0)}% terpakai. ${j.verdict}.` }),
          (() => {
            const smallest = Fast.sizeFor({ load, count, cls, shear, safety: 2 });
            const b = el('button', { class: 'btn', text: smallest
              ? isi('Baut kelas {cls} terkecil yang menahan ini: {size}', { cls, size: smallest.size })
              : 'Tidak ada baut di pustaka ini yang menahan beban itu' });
            if (smallest) b.addEventListener('click', () => { size = smallest.size; draw(); });
            return b;
          })(),
        ], true, { icon: 'physics' }),
        el('div', { class: 'banner warn', text: j.caveat }),
      );
    };
    draw();

    modal({
      title: 'Fastener', icon: 'key', wide: true, size: 'tall',
      subtitle: 'Metrik ISO, dengan data yang dibutuhkan gambar kerja dan order pembelian',
      body: host,
      actions: [
        { label: 'Tambahkan ke model', run: () => {
          const made = Fast.featuresFor(size, { length, cls }, makeFeature);
          store.batch(`Tambah ${made.spec.designation}`, () => {
            store.doc.features.push(...made.features);
          });
          this.selection.clear();
          this.selection.add(made.features.at(-1).id);
          this.rebuildNow();
          this.flash(`${made.spec.designation} ditambahkan. Torsi ${made.spec.torqueNm} N·m.`, 'ok', 5000);
        } },
        { label: 'Tutup', primary: true },
      ],
    });
  }


  /* ====================================================== hygiene, offline */

  /**
   * What is making this document heavy, and what is quietly wrong with it.
   *
   * Every finding here is the kind that does not show up as a modelling error
   * and does show up as a file that crashes, draws imprecisely, or takes forty
   * megabytes to describe a bracket.
   */
  showHygiene() {
    const host = el('div');
    const draw = () => {
      clear(host);
      const r = Hygiene.inspect(store.doc, this.build);
      const w = r.weight;

      host.append(
        el('div', { class: `banner ${r.clean ? 'ok' : r.issues[0].severity === 'block' ? 'err' : 'warn'}`,
          text: Hygiene.summary(r) }),
        el('div', { class: 'merge-stats' }, [
          el('div', { class: 'big-stat' }, [el('strong', { text: String(w.features) }), el('span', { text: 'features' })]),
          el('div', { class: 'big-stat' }, [el('strong', { text: `${(w.totalBytes / 1024).toFixed(0)} kB` }), el('span', { text: 'document' })]),
          el('div', { class: 'big-stat' }, [el('strong', { text: `${(w.meshShare * 100).toFixed(0)}%` }), el('span', { text: 'mesh impor' })]),
          el('div', { class: 'big-stat' }, [el('strong', { text: String(w.drawEntities) }), el('span', { text: 'entitas draft' })]),
        ]),
      );

      if (!r.clean) {
        host.appendChild(section(`Findings · ${r.issues.length}`, r.issues.map(i => {
          const rows = [
            el('div', { class: 'dx-sev', text: i.severity === 'block' ? 'Serious' : i.severity === 'warn' ? 'Worth fixing' : 'Catatan' }),
            el('strong', { text: i.title }),
            el('div', { text: i.detail }),
            el('div', { class: 'dx-why', text: i.why }),
          ];
          if (i.fix) {
            const b = el('button', { class: 'btn', text: i.fix.label });
            b.addEventListener('click', () => {
              try {
                i.fix.apply(store);
                this.rebuildNow();
                this.flash(isi('{repair}. Ctrl Z mengembalikannya.', { repair: i.fix.label }), 'ok', 4200);
                draw();
              } catch (err) { this.flash(isi('Itu tidak bisa diterapkan: {error}', { error: err.message }), 'err'); }
            });
            rows.push(b);
          }
          return el('div', { class: `dx-item ${i.severity === 'block' ? 'err' : i.severity}` }, rows);
        }), true, { icon: 'warning' }));
      }

      host.appendChild(section('Di mana beratnya berada', [
        el('div', { class: 'fit-table' }, [
          el('div', { class: 'fit-head' }, ['Fitur', 'Jenis', 'Ukuran', '', ''].map(t => el('span', { text: t }))),
          ...w.heaviest.map(row => el('div', { class: 'fit-row' }, [
            el('strong', { text: row.name }),
            el('span', { text: CATALOG[row.type]?.label || row.type }),
            el('span', { class: 'mono', text: `${(row.bytes / 1024).toFixed(1)} kB` }),
            el('span'), el('span'),
          ])),
        ]),
        el('div', { class: 'hint', text: 'Ukuran adalah JSON tersimpan. Fitur parametrik hanya ratusan byte meski bentuknya rumit; segitiga impor membayar bobotnya - itulah sebabnya scan mendominasi dokumen begitu masuk.' }),
      ], true, { icon: 'mass' }));

      host.appendChild(el('div', { class: 'banner warn', text: 'Angka presisi adalah celah nyata antar float 32-bit pada jarak itu, bukan aturan kasar. Pada 500 km dari origin, langkah terkecil yang bisa diwakili 32 mm - itulah sebabnya geometri di koordinat survei terlihat sedikit salah tanpa penjelasan di pohon fitur.' }));
    };
    draw();

    modal({
      title: 'Kesehatan dokumen', icon: 'probe', wide: true, size: 'tall',
      subtitle: store.doc.meta.name,
      body: host,
      actions: [{ label: 'Tutup', primary: true }],
    });
  }

  /**
   * What this application keeps, and what it sends.
   *
   * The honest answer to the subscription and phone-home complaints is not a
   * promise in a licence, it is a property of the software that the user can
   * check. So this says exactly what is on the machine, offers to delete it,
   * and tells them how to verify the network claim themselves.
   */
  async showOwnership() {
    const st = await Offline.status();
    const rows = Offline.localData();
    const total = rows.reduce((n, r) => n + r.bytes, 0);
    const host = el('div');

    const draw = () => {
      clear(host);
      host.append(
        el('div', { class: `banner ${st.controlled ? 'ok' : 'warn'}`, text: st.controlled
          ? isi('Terpasang. {files} berkas, {p1} MB di mesin ini. Matikan jaringan lalu muat ulang: ia tetap terbuka.', { files: st.files, p1: (st.cachedBytes / 1024 / 1024).toFixed(1) })
          : st.supported
            ? (this._offline?.ok
              ? 'Memasang. Muat ulang sekali dan salinan offline mengambil alih; tidak ada lagi yang berubah.'
              : `Not installed: ${this._offline?.reason || 'salinan offline belum terdaftar.'}`)
            : 'Peramban ini tidak bisa menyimpan salinan offline. Semua yang lain bekerja sama saja; Anda hanya perlu halamannya termuat.' }),

        section('Apa yang dikirimnya', [
          el('ul', {}, Offline.NETWORK_FACTS.map(f => el('li', { text: f }))),
        ], true, { icon: 'info' }),

        section(isi('Apa yang disimpannya di sini · {p1} kB', { p1: (total / 1024).toFixed(0) }), [
          el('div', { class: 'fit-table' }, [
            el('div', { class: 'fit-head' }, ['Stored', 'Apa itu', 'Ukuran', '', ''].map(t => el('span', { text: t }))),
            ...rows.map(r => el('div', { class: 'fit-row' }, [
              el('strong', { text: r.present ? 'yes' : 'belum ada' }),
              el('span', { text: r.what }),
              el('span', { class: 'mono', text: r.bytes ? `${(r.bytes / 1024).toFixed(1)} kB` : '-' }),
              el('span'), el('span'),
            ])),
          ]),
          el('div', { class: 'hint', text: 'Semuanya di penyimpanan lokal peramban ini, di mesin ini, hanya Anda yang bisa baca. Tidak pernah keluar. Menghapus data peramban menghapusnya - itu sebabnya dokumen penting juga harus disimpan sebagai berkas.' }),
        ], true, { icon: 'lock' }),

        el('div', { class: 'banner warn', text: 'Lisensi MIT dan sumbernya ada di repositori, jadi ini tidak bisa diambil dari Anda: salinan berkas adalah salinan aplikasi yang bekerja. Tidak ada pemeriksaan lisensi, jadi tidak ada yang bisa menolak untuk mulai.' }),
      );
    };
    draw();

    modal({
      title: 'Offline dan kepemilikan', icon: 'lock', wide: true,
      subtitle: st.controlled ? 'Berjalan dari mesin Anda' : 'Berjalan di peramban ini, tanpa akun',
      body: host,
      actions: [
        { label: 'Lupakan semua yang tersimpan', danger: true, run: () => {
          confirmDialog('Hapus semua yang tersimpan di peramban ini?',
            'Versi tersimpan, standar, keputusan, makro, dan dokumen yang tersimpan otomatis semuanya hilang. Berkas yang sudah Anda ekspor tidak tersentuh. Ini tidak bisa dibatalkan.',
            () => {
              const gone = Offline.forgetEverything();
              this.flash(isi('{n} item tersimpan dihapus. Muat ulang untuk mulai bersih.', { n: gone.length }), 'ok', 5000);
            }, { danger: true, yes: 'Hapus semuanya' });
        } },
        { label: 'Hapus salinan offline', run: async () => {
          const r = await Offline.uninstall();
          this.flash(isi('Salinan offline dihapus ({n} cache). Aplikasi akan memuat dari jaringan lagi.', { n: r.caches }), 'ok', 5000);
          return true;
        } },
        { label: 'Tutup', primary: true },
      ],
    });
  }

  /**
   * Ctrl+Shift+Z is redo everywhere. The name records that this shortcut is
   * zen mode in some packages; here that lives on the View menu instead, so
   * the chord is free for the thing people expect it to do.
   */
  zenModeOrRedo() {
    store.redo();
  }

  draftKey(e) {
    if (e.key === 'F3') { e.preventDefault(); this.toggleDraft('snap'); return; }
    if (e.key === 'F8') { e.preventDefault(); this.toggleDraft('ortho'); return; }
    if (e.key === 'F9') { e.preventDefault(); this.toggleDraft('grid'); return; }
    if (e.key === 'F10') { e.preventDefault(); this.toggleDraft('polar'); return; }
    if (this.draft.pending.length && this.draft.typeKey(e.key)) { e.preventDefault(); return; }
    if (e.key.toLowerCase() === 'c' && this.draft.pending.length >= 3) { this.draft.closeChain(); return; }
    if (e.key.toLowerCase() === 'q') { e.preventDefault(); this.openQuickMenu(innerWidth / 2, innerHeight / 2); return; }
    const tool = DRAW_TOOLS.find(t => t.key && t.key.toLowerCase() === e.key.toLowerCase());
    if (tool) { e.preventDefault(); this.setDraftTool(tool.id); return; }
    if (e.key === 'Enter') { this.draft._finishChain(); return; }
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); this.draft.zoomExtents(); }
  }
}

function randomColour() {
  const palette = ['#4c9fff', '#46cf8b', '#ffb454', '#ff6b6b', '#b98cff', '#4fd0d8', '#f37ab5', '#a0d468'];
  return palette[Math.floor(Math.random() * palette.length)];
}

/* ------------------------------------------------------------------ go */

const app = new App();
/* ======================================================= analysis helpers */

/** A numeric row for the section dialog. */
function numRow(label, value, onChange) {
  const i = el('input', { type: 'number', step: 'any', value: String(value) });
  i.addEventListener('input', () => { const n = Number(i.value); if (Number.isFinite(n)) onChange(n); });
  return el('div', { class: 'row wide' }, [el('label', { text: label }), i]);
}

/**
 * Draw a cross-section to scale.
 *
 * A table of second moments means very little without the shape they came from,
 * and the outline is the one part of a section report that can be checked at a
 * glance: if the picture is not the section you expected, no number below it
 * matters.
 */
function section2D(sec, size = 300) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const loop of sec.outline) {
    for (const [x, y] of loop) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const w = Math.max(1e-6, maxX - minX), h = Math.max(1e-6, maxY - minY);
  const pad = Math.max(w, h) * 0.08;
  const vb = [minX - pad, minY - pad, w + pad * 2, h + pad * 2];
  const stroke = Math.max(w, h) / 240;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', vb.join(' '));
  svg.setAttribute('class', 'section-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  // An inline SVG carrying only a viewBox has no intrinsic height, and in a
  // flex column that collapses it to nothing. The size is set here rather than
  // left to the stylesheet so the drawing cannot silently disappear.
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(size));
  // SVG's y axis runs down the screen and the section's runs up it.
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('transform', `translate(0 ${2 * (minY - pad) + h + pad * 2}) scale(1 -1)`);

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', sec.outline.map(loop =>
    `M ${loop.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(' L ')} Z`).join(' '));
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('class', 'section-fill');
  path.setAttribute('stroke-width', String(stroke));
  g.appendChild(path);

  // The centroid, because every section modulus below is measured from it.
  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx', String(sec.centroid2D[0]));
  c.setAttribute('cy', String(sec.centroid2D[1]));
  c.setAttribute('r', String(Math.max(w, h) / 90));
  c.setAttribute('class', 'section-centroid');
  g.appendChild(c);

  // The principal axes, which are the directions the section is strongest and
  // weakest about, and are rarely the ones you would have guessed.
  const len = Math.max(w, h) * 0.55;
  const t = (sec.principalAngleDeg * Math.PI) / 180;
  for (const [dx, dy, cls] of [[Math.cos(t), Math.sin(t), 'strong'], [-Math.sin(t), Math.cos(t), 'weak']]) {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', String(sec.centroid2D[0] - dx * len));
    line.setAttribute('y1', String(sec.centroid2D[1] - dy * len));
    line.setAttribute('x2', String(sec.centroid2D[0] + dx * len));
    line.setAttribute('y2', String(sec.centroid2D[1] + dy * len));
    line.setAttribute('class', `section-axis ${cls}`);
    line.setAttribute('stroke-width', String(stroke));
    g.appendChild(line);
  }

  svg.appendChild(g);
  return el('div', { class: 'section-view' }, [
    svg,
    el('div', { class: 'hint', text: isi('{w} × {h} mm. Titiknya adalah centroid; garis penuh adalah sumbu utama kuat dan garis putus-putus yang lemah.', { w: fmt(w), h: fmt(h) }) }),
  ]);
}

/** The closest two bodies, sampled. Only meaningful when nothing clashes. */
function nearestPair(bodies) {
  if (bodies.length < 2) return null;
  let best = null;
  for (let i = 0; i < bodies.length && i < 12; i++) {
    for (let j = i + 1; j < bodies.length && j < 12; j++) {
      if (bodies[i].feature.id === bodies[j].feature.id) continue;
      const c = clearance(bodies[i], bodies[j], { samples: 160 });
      if (c && (!best || c.distance < best.distance)) {
        best = { distance: c.distance, a: bodies[i].feature.name, b: bodies[j].feature.name };
      }
    }
  }
  return best;
}

window.tesserCAD = app;
try {
  app.boot();
} catch (err) {
  console.error(err);
  const m = document.getElementById('bootMsg');
  if (m) { m.textContent = isi('Gagal memulai: {error}', { error: err.message }); m.style.color = '#ff6b6b'; }
}
