/**
 * The command registry.
 *
 * Every action in TesserCAD is a command object, and the menus, the ribbon,
 * the command palette, the quick menu and the keyboard map are all generated
 * from this one list. Adding a feature here makes it reachable five ways at
 * once, and nothing can drift out of sync.
 *
 * Shape: { id, label, icon, group, key, run, checked?, enabled?, keywords? }
 *   checked  - a predicate; when present the command renders as a toggle
 *   enabled  - a predicate; when false the command greys out everywhere
 */
import { store, CATALOG, MATERIALS, UNITS, newDocument } from '../core/doc.js';
import * as IO from '../io/io.js';

export function buildCommands(app) {
  const C = [];
  const add = (id, label, icon, group, run, opts = {}) => {
    // The keywords are translated too, or the palette answers only English:
    // they are the words a user types to find a command by what it does.
    const kw = opts.keywords ? `${(opts.keywords)} ${(label)}` : (label);
    C.push({ id, label: (label), icon, group, run, ...opts, keywords: kw });
    return C[C.length - 1];
  };

  const hasSel = () => app.selection.size > 0;
  const oneSel = () => app.selection.size === 1;
  const multiSel = () => app.selection.size > 1;
  const in3d = () => app.workspace !== 'draft';
  const hasDraftSel = () => app.draft.selection.size > 0;
  const view = () => store.doc.view;
  // Branch count comes from the app rather than from the version store, so the
  // registry stays free of storage imports.

  /* ==================================================== File */

  add('file.new', 'Dokumen baru', 'file-new', 'Berkas', () => app.newDocument(), { key: 'Ctrl N', keywords: 'kosong baru mulai ulang' });
  add('file.template', 'Baru dari templat…', 'template', 'Berkas', () => app.showTemplates(), { keywords: 'contoh awal preset mulai starter example preset' });
  add('file.open', 'Buka proyek…', 'file-open', 'Berkas', () => app.pickFile('.tcad,.json'), { key: 'Ctrl O' });
  add('file.save', 'Simpan proyek', 'file-save', 'Berkas', () => IO.saveProject(), { key: 'Ctrl S', keywords: 'download tcad' });
  add('file.saveAs', 'Simpan sebagai…', 'file-save-as', 'Berkas', () => app.saveAs(), { key: 'Ctrl ⇧ S' });
  add('file.import', 'Impor berkas…', 'file-import', 'Berkas', () => app.pickFile(IO.IMPORT_ACCEPT), { key: 'Ctrl I', keywords: 'buka muat impor mesh stl obj dxf load open' });
  add('file.revert', 'Kembalikan ke simpanan terakhir', 'refresh', 'Berkas', () => app.revert(), { enabled: () => store.canUndo() });
  add('file.props', 'Properti dokumen…', 'doc-props', 'Berkas', () => app.showDocProps(), { keywords: 'satuan penulis catatan metadata units author notes' });
  add('file.autosave', 'Pulihkan autosave…', 'file-recent', 'Berkas', () => app.showAutosave(), { keywords: 'pulihkan cadangan gagal restore crash backup' });
  add('file.clearAutosave', 'Hapus sesi tersimpan', 'trash', 'Berkas', () => app.clearAutosave(), { danger: true });
  add('file.sample', 'Muat model demo', 'star', 'Berkas', () => app.loadSample(), { keywords: 'contoh braket demo example bracket' });

  /* ==================================================== Export */

  add('export.stl', 'STL - biner', 'cube3d', 'Ekspor', () => IO.exportSTL(app.vp, { binary: true }), { keywords: 'cetak 3d slicer mesh print' });
  add('export.stlAscii', 'STL - ASCII', 'cube3d', 'Ekspor', () => IO.exportSTL(app.vp, { binary: false }));
  add('export.obj', 'OBJ', 'mesh', 'Ekspor', () => IO.exportOBJ(app.vp), { keywords: 'wavefront' });
  add('export.ply', 'PLY', 'mesh', 'Ekspor', () => IO.exportPLY(app.vp), { keywords: 'awan titik warna vertex point cloud colour' });
  add('export.dxf', 'Gambar DXF', 'layers', 'Ekspor', () => IO.exportDXF(), { keywords: 'autocad laser cam r12' });
  add('export.svg', 'Gambar SVG', 'image', 'Ekspor', () => IO.exportSVG(), { keywords: 'vector plot' });
  add('export.png1', 'PNG viewport - 1×', 'image', 'Ekspor', () => IO.exportPNG(app.vp, 1));
  add('export.png', 'PNG viewport - 2×', 'image', 'Ekspor', () => IO.exportPNG(app.vp, 2), { keywords: 'tangkapan layar render screenshot capture' });
  add('export.png4', 'PNG viewport - 4×', 'image', 'Ekspor', () => IO.exportPNG(app.vp, 4));
  add('export.bom', 'Daftar material / BOM (CSV)', 'table', 'Ekspor', () => app.exportBOM(), { keywords: 'daftar part massa lembar kerja parts list mass spreadsheet' });
  add('export.report', 'Laporan properti massa', 'mass', 'Ekspor', () => app.showMassReport(), { keywords: 'volume berat massa centroid titik berat weight' });

  /* ==================================================== Edit */

  add('edit.undo', 'Undo', 'undo', 'Sunting', () => store.undo(), { key: 'Ctrl Z', enabled: () => store.canUndo() });
  add('edit.redo', 'Redo', 'redo', 'Sunting', () => store.redo(), { key: 'Ctrl ⇧ Z', enabled: () => store.canRedo() });
  add('edit.history', 'Riwayat Undo…', 'history', 'Sunting', () => app.showHistory(), { key: 'Ctrl ⇧ H', keywords: 'timeline langkah kembalikan steps revert' });
  add('edit.duplicate', 'Duplikat', 'duplicate', 'Sunting', () => app.duplicateSelection(), { key: 'Ctrl D', enabled: () => hasSel() || hasDraftSel() });
  add('edit.delete', 'Hapus', 'trash', 'Sunting', () => app.deleteSelection(), { key: 'Del', danger: true, enabled: () => hasSel() || hasDraftSel() });
  add('edit.rename', 'Ganti nama…', 'rename', 'Sunting', () => app.renameSelected(), { key: 'F2', enabled: oneSel });
  add('edit.selectAll', 'Pilih semua', 'select-all', 'Sunting', () => app.selectAll(), { key: 'Ctrl A' });
  add('edit.selectNone', 'Batalkan pilihan', 'select-none', 'Sunting', () => app.select([]), { key: 'Alt A', enabled: () => hasSel() || hasDraftSel() });
  add('edit.selectInvert', 'Balik pilihan', 'select-invert', 'Sunting', () => app.invertSelection(), { key: 'Ctrl ⇧ I' });
  add('edit.selectSameType', 'Pilih jenis yang sama', 'select-all', 'Sunting', () => app.selectSameType(), { enabled: oneSel });
  add('edit.prefs', 'Preferensi…', 'settings', 'Sunting', () => app.showPrefs(), { key: 'Ctrl ,', keywords: 'pengaturan opsi tema setelan settings options theme config' });

  /* ==================================================== Create */

  for (const [type, cat] of Object.entries(CATALOG)) {
    if (cat.group !== 'solid') continue;
    add(`add.${type}`, cat.label, ICON_FOR[type] || 'box', 'Buat', () => app.addFeature(type), { keywords: `primitive solid ${type}` });
  }
  add('sketch.extrude', 'Extrude gambar', 'extrude', 'Buat', () => app.createFromProfile('extrude'), { key: 'E', enabled: hasDraftSel, keywords: 'extrude profil pad sweep profile' });
  add('sketch.revolve', 'Revolve gambar', 'revolve', 'Buat', () => app.createFromProfile('revolve'), { enabled: hasDraftSel, keywords: 'bubut putar profil lathe turn profile' });
  add('add.import', 'Impor mesh…', 'file-import', 'Buat', () => app.pickFile('.stl,.obj'));

  /* ==================================================== Modify */

  add('bool.union', 'Union', 'union', 'Ubah', () => app.addBoolean('union'), { key: 'Ctrl +', enabled: multiSel, keywords: 'tambah gabung satukan las add join combine weld' });
  add('bool.subtract', 'Subtract', 'subtract', 'Ubah', () => app.addBoolean('subtract'), { key: 'Ctrl -', enabled: multiSel, keywords: 'potong selisih lubang hapus cut difference hole remove' });
  add('bool.intersect', 'Intersect', 'intersect', 'Ubah', () => app.addBoolean('intersect'), { enabled: multiSel, keywords: 'common overlap' });
  add('mod.linear', 'Linear pattern', 'pattern-linear', 'Ubah', () => app.addModifier('patternLinear'), { enabled: oneSel, keywords: 'larik kisi ulang baris array grid repeat row' });
  add('mod.circular', 'Circular pattern', 'pattern-circular', 'Ubah', () => app.addModifier('patternCircular'), { enabled: oneSel, keywords: 'larik melingkar radial ulang array polar radial repeat' });
  add('mod.mirror', 'Mirror', 'mirror', 'Ubah', () => app.addModifier('mirror'), { enabled: oneSel, keywords: 'reflect symmetry' });
  add('mod.suppress', 'Suppress / unsuppress', 'eye-off', 'Ubah', () => app.toggleSuppress(), { enabled: hasSel, keywords: 'skip disable' });
  add('mod.hide', 'Sembunyikan pilihan', 'eye-off', 'Ubah', () => app.setVisible(false), { key: 'H', enabled: hasSel });
  add('mod.showAll', 'Tampilkan semua', 'eye', 'Ubah', () => app.setVisible(true, { all: true }), { key: 'Alt H' });
  add('mod.isolate', 'Isolasi pilihan', 'target', 'Ubah', () => app.isolate(), { key: '/', enabled: hasSel, keywords: 'solo fokus saja' });
  add('mod.material', 'Tetapkan material…', 'palette', 'Ubah', () => app.showMaterialPicker(), { enabled: hasSel, keywords: 'baja aluminium plastik densitas warna steel plastic density colour' });
  add('mod.colour', 'Atur warna…', 'palette', 'Ubah', () => app.pickColour(), { enabled: hasSel });

  /* ==================================================== Transform */

  add('op.move', 'Geser', 'move', 'Transform', () => app.startOperator('move'), { key: 'G', enabled: () => hasSel() && in3d(), keywords: 'geser pindah offset translate grab' });
  add('op.rotate', 'Rotate', 'rotate', 'Transform', () => app.startOperator('rotate'), { key: 'R', enabled: () => hasSel() && in3d(), keywords: 'putar rotasi arah turn spin orient' });
  add('op.scale', 'Scale', 'scale', 'Transform', () => app.startOperator('scale'), { key: 'S', enabled: () => hasSel() && in3d(), keywords: 'ubah ukuran besarkan kecilkan resize grow shrink' });
  add('gizmo.translate', 'Gizmo geser', 'move', 'Transform', () => app.setGizmo('translate'), { key: 'W', checked: () => app.gizmoMode === 'translate' });
  add('gizmo.rotate', 'Gizmo putar', 'rotate', 'Transform', () => app.setGizmo('rotate'), { key: 'Shift E', checked: () => app.gizmoMode === 'rotate' });
  add('gizmo.scale', 'Gizmo skala', 'scale', 'Transform', () => app.setGizmo('scale'), { key: 'Shift R', checked: () => app.gizmoMode === 'scale' });
  add('gizmo.off', 'Tanpa gizmo', 'close', 'Transform', () => app.setGizmo(null), { checked: () => !app.gizmoMode });
  add('xf.reset', 'Reset transform', 'reset', 'Transform', () => app.resetTransform(), { enabled: hasSel });
  add('xf.drop', 'Jatuhkan ke lantai', 'drop', 'Transform', () => app.dropSelection(), { key: 'D', enabled: hasSel, keywords: 'turunkan ke lantai z nol ground zero' });
  add('xf.centre', 'Pusatkan di origin', 'center', 'Transform', () => app.centreSelection(), { enabled: hasSel });
  add('xf.alignX', 'Ratakan di X', 'align', 'Transform', () => app.alignSelection('x'), { enabled: multiSel });
  add('xf.alignY', 'Ratakan di Y', 'align', 'Transform', () => app.alignSelection('y'), { enabled: multiSel });
  add('xf.alignZ', 'Ratakan di Z', 'align', 'Transform', () => app.alignSelection('z'), { enabled: multiSel });
  add('xf.distribute', 'Sebarkan merata', 'pattern-linear', 'Transform', () => app.distributeSelection(), { enabled: () => app.selection.size > 2 });

  /* ==================================================== View */

  add('view.fit', 'Zoom pas', 'fit', 'Tampilan', () => app.zoomFit(), { key: 'F', keywords: 'bingkai semua batas' });
  add('view.selection', 'Zoom ke pilihan', 'zoom-sel', 'Tampilan', () => app.vp.frameSelection(), { key: '⇧ F', enabled: hasSel });
  add('view.zoomIn', 'Perbesar', 'zoom-in', 'Tampilan', () => app.zoomBy(1.25), { key: '+' });
  add('view.zoomOut', 'Perkecil', 'zoom-out', 'Tampilan', () => app.zoomBy(0.8), { key: '-' });
  // Written out rather than composed from a direction word. Upstream builds
  // these as `${label} view`, which is right in English and wrong in
  // Indonesian in two ways at once: the noun comes first, and the direction is
  // lower case after it.
  for (const [k, label, key, ic] of [
    ['iso', 'Tampilan Isometric', '0', 'view-iso'],
    ['front', 'Tampilan depan', '1', 'view-front'],
    ['back', 'Tampilan belakang', '⇧ 1', 'view-front'],
    ['right', 'Tampilan kanan', '3', 'view-right'],
    ['left', 'Tampilan kiri', '⇧ 3', 'view-right'],
    ['top', 'Tampilan atas', '7', 'view-top'],
    ['bottom', 'Tampilan bawah', '⇧ 7', 'view-top'],
  ]) add(`view.${k}`, label, ic, 'Tampilan', () => app.vp.standardView(k), { key, enabled: in3d });

  add('view.ortho', 'Kamera ortografis', 'ortho', 'Tampilan', () => app.toggleView('ortho'), { key: '5', checked: () => view().ortho, keywords: 'proyeksi paralel isometrik parallel projection isometric' });
  add('view.grid', 'Tampilkan grid', 'grid', 'Tampilan', () => app.toggleView('grid'), { checked: () => view().grid });
  add('view.axes', 'Tampilkan sumbu dunia', 'axes', 'Tampilan', () => app.toggleView('axes'), { checked: () => view().axes });
  add('view.ground', 'Tampilkan bayangan lantai', 'ground', 'Tampilan', () => app.toggleView('ground'), { checked: () => view().ground, enabled: in3d });
  for (const [mode, label, ic] of [
    ['shaded-edges', 'Shaded dengan tepi', 'shade-edges'], ['shaded', 'Shaded', 'shade-solid'],
    ['wire', 'Wireframe', 'shade-wire'], ['xray', 'X-ray', 'shade-xray'],
  ]) add(`shade.${mode}`, label, ic, 'Tampilan', () => app.setShading(mode), { checked: () => view().shading === mode, enabled: in3d });
  add('view.shadingCycle', 'Ganti mode shading', 'shade-solid', 'Tampilan', () => app.cycleShading(), { key: 'Z', enabled: in3d });
  add('view.section', 'Tampilan section', 'section', 'Tampilan', () => app.toggleSection(), { checked: () => view().clip.enabled, enabled: in3d, keywords: 'potong iris dalam clip cut slice inside' });
  for (const [bg, label] of [['studio', 'Studio'], ['graphite', 'Grafit'], ['white', 'Kertas'], ['blueprint', 'Blueprint']]) {
    add(`bg.${bg}`, label, 'image', 'Tampilan', () => app.setBackground(bg), { checked: () => view().bg === bg, enabled: in3d });
  }
  add('view.theme', 'Tema terang / gelap', 'moon', 'Tampilan', () => app.toggleTheme(), { key: 'Ctrl ⇧ L', keywords: 'gelap terang tampilan warna dark light appearance colour' });
  add('view.fullscreen', 'Layar penuh', 'fullscreen', 'Tampilan', () => app.toggleFullscreen(), { key: 'F11' });

  /* ==================================================== Measure */

  add('measure.distance', 'Ukur jarak', 'ruler', 'Ukur', () => app.vp.setMeasureMode('distance'), { key: 'M', enabled: in3d, checked: () => app.vp.measureMode === 'distance' });
  add('measure.angle', 'Ukur sudut', 'angle', 'Ukur', () => app.vp.setMeasureMode('angle'), { enabled: in3d, checked: () => app.vp.measureMode === 'angle' });
  add('measure.point', 'Probe titik', 'probe', 'Ukur', () => app.vp.setMeasureMode('point'), { enabled: in3d, checked: () => app.vp.measureMode === 'point' });
  add('measure.mass', 'Properti massa…', 'mass', 'Ukur', () => app.showMassReport(), { keywords: 'volume berat densitas titik berat weight density centroid' });
  add('measure.off', 'Hentikan pengukuran', 'close', 'Ukur', () => app.stopMeasuring(), { enabled: () => !!app.vp.measureMode });

  /* ==================================================== Draft */

  const draftTool = (id, label, ic, key, kw) => add(`draft.${id}`, label, ic, 'Draft', () => app.setDraftTool(id), {
    key, keywords: kw, checked: () => app.workspace === 'draft' && app.draft.tool === id,
  });
  draftTool('select', 'Pilih', 'target', 'Esc', 'pick arrow');
  draftTool('line', 'Baris', 'line', 'L', 'segment');
  draftTool('polyline', 'Polyline', 'polyline', 'P', 'chain path');
  draftTool('rect', 'Rectangle', 'rect', 'R', 'box square');
  draftTool('circle', 'Circle', 'circle', 'C', 'round');
  draftTool('arc', 'Arc', 'arc', 'A', 'curve');
  draftTool('ellipse', 'Ellipse', 'ellipse', 'Shift E', 'oval');
  draftTool('polygon', 'Polygon', 'polygon', 'G', 'hexagon ngon');
  draftTool('spline', 'Spline', 'spline', 'S', 'curve bezier');
  draftTool('point', 'Point', 'point', '', 'node');
  draftTool('text', 'Teks', 'text', 'X', 'label annotate');
  draftTool('dimLinear', 'Dimensi linear', 'dim-linear', 'D', 'measure annotate');
  draftTool('dimAligned', 'Dimensi aligned', 'dim-aligned', '', 'measure');
  draftTool('dimRadial', 'Dimensi radius', 'dim-radial', '', 'measure circle');
  draftTool('dimAngular', 'Dimensi sudut', 'dim-angular', '', 'measure');
  draftTool('offset', 'Offset', 'offset', 'O', 'parallel');
  draftTool('measure', 'Ukur', 'ruler', 'M', 'distance');

  add('draft.snap', 'Object snap', 'magnet', 'Draft', () => app.toggleDraft('snap'), { key: 'F3', checked: () => app.draft.snap.on });
  add('draft.ortho', 'Mode Ortho', 'ortho-lock', 'Draft', () => app.toggleDraft('ortho'), { key: 'F8', checked: () => app.draft.ortho });
  add('draft.polar', 'Polar tracking', 'polar', 'Draft', () => app.toggleDraft('polar'), { key: 'F10', checked: () => app.draft.polar });
  add('draft.gridSnap', 'Snap ke grid', 'grid', 'Draft', () => app.toggleDraft('grid'), { key: 'F9', checked: () => app.draft.snap.grid });
  add('draft.zoomExtents', 'Zoom seluruh gambar', 'fit', 'Draft', () => app.draft.zoomExtents());
  add('draft.addLayer', 'Layer baru…', 'layers', 'Draft', () => app.addLayer());
  add('draft.rotate90', 'Putar 90°', 'rotate', 'Draft', () => app.rotateDraftSelection(90), { enabled: hasDraftSel });
  add('draft.mirrorX', 'Mirror terhadap X', 'mirror', 'Draft', () => app.mirrorDraftSelection('x'), { enabled: hasDraftSel });
  add('draft.mirrorY', 'Mirror terhadap Y', 'mirror', 'Draft', () => app.mirrorDraftSelection('y'), { enabled: hasDraftSel });

  /* ==================================================== Simulate */

  add('sim.play', 'Putar / jeda', 'play', 'Simulasi', () => app.togglePlay(), { key: 'Space', checked: () => app.sim.playing });
  add('sim.stop', 'Stop dan ulang', 'stop', 'Simulasi', () => app.sim.stop());
  add('sim.rewind', 'Ke awal', 'rewind', 'Simulasi', () => app.sim.seek(0), { key: 'Home' });
  add('sim.end', 'Ke akhir', 'forward', 'Simulasi', () => app.sim.seek(store.doc.sim.duration), { key: 'Akhir' });
  add('sim.stepBack', 'Mundur satu frame', 'step-back', 'Simulasi', () => app.sim.step(-1), { key: ',' });
  add('sim.stepFwd', 'Maju satu frame', 'step-fwd', 'Simulasi', () => app.sim.step(1), { key: '.' });
  add('sim.loop', 'Putar berulang', 'refresh', 'Simulasi', () => app.toggleLoop(), { checked: () => store.doc.sim.loop });
  add('sim.key', 'Keyframe pose saat ini', 'key', 'Simulasi', () => app.keyPose(), { key: 'K', enabled: oneSel, keywords: 'keyframe animasi rekam animate record' });
  add('sim.clearKeys', 'Hapus animasi pada pilihan', 'trash', 'Simulasi', () => app.clearKeys(), { enabled: oneSel, danger: true });
  add('sim.autoSchedule', 'Urutkan bangun otomatis', 'sequence', 'Simulasi', () => app.autoSchedule(), { keywords: '4d konstruksi gantt jadwal bim construction schedule' });
  add('sim.clearSchedule', 'Hapus urutan bangun', 'trash', 'Simulasi', () => app.clearSchedule());
  add('sim.schedule', 'Urutan bangun', 'sequence', 'Simulasi', () => app.toggleSchedule(), { checked: () => store.doc.sim.schedule.enabled });
  add('sim.physics', 'Dinamika rigid-body', 'physics', 'Simulasi', () => app.togglePhysics(), { checked: () => store.doc.sim.dynamics.enabled, keywords: 'gravitasi tabrakan simulasi gravity collision simulate' });
  add('sim.dropTest', 'Siapkan uji jatuh', 'physics', 'Simulasi', () => app.setupDropTest(), { keywords: 'gravitasi jatuh fisika gravity fall physics' });
  add('sim.motor', 'Tambah motor putar', 'motor', 'Simulasi', () => app.addMotor(), { enabled: oneSel, keywords: 'mekanisme putar roda gigi mechanism rotate gear' });
  add('sim.bake', 'Bake dinamika ke keyframe', 'bake', 'Simulasi', () => app.bakeDynamics(), { enabled: () => store.doc.sim.dynamics.enabled });
  add('sim.record', 'Rekam ke video', 'record', 'Simulasi', () => app.recordVideo(), { keywords: 'webm ekspor video rekam movie capture' });

  /* ==================================================== Window */

  add('win.left', 'Panel kerangka', 'panel-left', 'Jendela', () => app.togglePanel('left'), { key: 'T', checked: () => !app.isCollapsed('left') });
  add('win.right', 'Panel properti', 'panel-right', 'Jendela', () => app.togglePanel('right'), { key: 'N', checked: () => !app.isCollapsed('right') });
  add('win.timeline', 'Timeline', 'timeline', 'Jendela', () => app.togglePanel('timeline'), { checked: () => !document.getElementById('timeline').hidden });
  add('win.zen', 'Mode zen (sembunyikan panel)', 'fullscreen', 'Jendela', () => app.zenMode(), { key: 'Ctrl ⇧ Z' });
  add('win.reset', 'Reset tata letak', 'refresh', 'Jendela', () => app.resetLayout());
  for (const [ws, label, ic] of [['model', 'Workspace Model', 'cube3d'], ['draft', 'Workspace Draft', 'sketch'], ['sim', 'Workspace Simulasi', 'timeline']]) {
    add(`ws.${ws}`, label, ic, 'Jendela', () => app.setWorkspace(ws), { checked: () => app.workspace === ws });
  }

  /* ==================================================== Help */

  add('help.palette', 'Palet perintah', 'command', 'Bantuan', () => app.openPalette(), { key: 'Ctrl K', keywords: 'cari temukan jalankan search find run' });
  add('help.quickstart', 'Mulai cepat', 'bulb', 'Bantuan', () => app.showWelcome(), { keywords: 'tutorial pengantar panduan mulai intro guide started' });
  add('help.shortcuts', 'Pintasan papan ketik', 'keyboard', 'Bantuan', () => app.showShortcuts(), { key: 'F1' });
  add('help.expressions', 'Referensi ekspresi', 'book', 'Bantuan', () => app.showExpressionHelp(), { keywords: 'parameter rumus matematika fungsi formula math functions' });
  add('help.learn', 'Tampilkan kartu belajar', 'bulb', 'Bantuan', () => app.toggleLearn(), { checked: () => !document.getElementById('learnCard').hidden });
  add('help.guide', 'Panduan pengguna (buka GitHub)', 'book', 'Bantuan', () => app.openLink('https://github.com/samuelhtampubolon/TesserCAD-ID/blob/main/docs/PANDUAN.md'));
  add('help.source', 'Kode sumber', 'github', 'Bantuan', () => app.openLink('https://github.com/samuelhtampubolon/TesserCAD-ID'));
  add('help.issue', 'Laporkan masalah', 'warning', 'Bantuan', () => app.openLink('https://github.com/samuelhtampubolon/TesserCAD-ID/issues/new'));
  add('help.about', 'Tentang TesserCAD-ID', 'info', 'Bantuan', () => app.showAbout());

  /* ---------------------------------------------------------------- studio
     The design-intelligence commands. They sit in their own group so the
     menu, the palette and the shortcut sheet all pick them up automatically:
     adding a command here is the only registration step there is. */
  const built = () => !!app.build;

  add('studio.brief', 'Baru dari brief desain…', 'bulb', 'Studio', () => app.showBrief(), {
    keywords: 'kebutuhan beban hasilkan ukuran hitung braket poros pelat intent requirements load generate size calculate bracket shaft plate',
  });
  add('studio.doctor', 'Design doctor', 'probe', 'Studio', () => app.showDoctorReport(), {
    key: 'F8', enabled: built, keywords: 'periksa validasi dfm keterbuatan tinjau masalah check validate manufacturability review problems',
  });
  add('studio.cost', 'Perkiraan biaya', 'gauge', 'Studio', () => app.showCostReport(), {
    enabled: built, keywords: 'harga biaya proses bandingkan cnc cetak cetakan ekonomi price money compare print mould economics',
  });
  add('release.package', 'Rilis desain…', 'download', 'Studio', () => app.showRelease(), {
    key: 'Ctrl ⇧ R', enabled: built, keywords: 'paket serahan zip rilis bom gambar kerja package deliverables ship handoff drawing',
  });
  add('studio.intent', 'Ekspor design intent', 'file-export', 'Studio', () => app.exportDesignIntent(), {
    enabled: built, keywords: 'json parameter serahan interoperabilitas semantik parameters handoff interoperability semantic',
  });
  add('macro.record', 'Rekam makro', 'record', 'Studio', () => app.startMacro(), {
    enabled: () => !app.macro.isRecording, keywords: 'otomatis ulang alur kerja skrip automate repeat workflow script',
  });
  add('macro.stop', 'Stop rekaman', 'stop', 'Studio', () => app.stopMacro(), {
    enabled: () => app.macro.isRecording,
  });
  add('macro.manage', 'Makro…', 'sequence', 'Studio', () => app.showMacros(), {
    keywords: 'otomasi putar ulang rekaman alur kerja automation replay recorded workflow',
  });
  add('studio.standards', 'Standar studio…', 'workspace', 'Studio', () => app.showStudio(), {
    keywords: 'bawaan studio organisasi memori tarif keputusan catatan preferensi defaults house organisation memory rates decisions preferences',
  });
  add('studio.lessons', 'Catatan teknik', 'book', 'Studio', () => app.showLessons(), {
    keywords: 'kenapa belajar tutor jelaskan prinsip',
  });

  /* ------------------------------------------------------------- analysis */

  add('studio.section', 'Properti section…', 'section', 'Analisis', () => app.showSection(), {
    key: 'Ctrl ⇧ A', enabled: () => oneSel() && built(),
    keywords: 'momen inersia penampang lentur tegangan balok kekuatan modulus',
  });
  add('studio.clash', 'Pemeriksaan clash', 'target', 'Analisis', () => app.showClashes(), {
    enabled: built, keywords: 'interferensi tabrakan tumpang tindih iris rakitan kelonggaran interference collision overlap intersect assembly clearance',
  });
  add('studio.inspect', 'Periksa mesh impor…', 'probe', 'Analisis', () => app.showInspect(), {
    enabled: () => built() && store.doc.features.some(f => f.type === 'mesh'),
    keywords: 'kenali fitur lubang muka ukur stl step solid mati rekayasa balik recognise features holes faces measure reverse',
  });

  /* -------------------------------------------------------- configurations */

  add('cfg.manage', 'Konfigurasi…', 'template', 'Configure', () => app.showConfigs(), {
    keywords: 'varian ukuran keluarga tabel katalog opsi variants sizes family table catalogue options',
  });
  add('cfg.add', 'Konfigurasi baru', 'plus', 'Configure', () => app.newConfiguration(), {
    keywords: 'varian ukuran opsi variant size option',
  });
  add('cfg.next', 'Konfigurasi berikutnya', 'chevron-right', 'Configure', () => app.cycleConfiguration(1), {
    enabled: () => (store.doc.configs?.list?.length || 1) > 1,
  });
  add('cfg.family', 'Ekspor tabel family', 'table', 'Configure', () => app.exportFamily(), {
    keywords: 'csv katalog daftar part varian parts list variants',
  });

  /* ------------------------------------------------------------- versions */

  add('vcs.commit', 'Simpan versi…', 'history', 'Versions', () => app.commitVersion(), {
    key: 'Ctrl ⇧ S', keywords: 'snapshot titik simpan tonggak revisi commit checkpoint milestone revision',
  });
  add('vcs.browse', 'Riwayat versi…', 'sequence', 'Versions', () => app.showVersions(), {
    keywords: 'revisi diff bandingkan pulihkan cabang git timeline compare restore branch',
  });
  add('vcs.branch', 'Cabang baru…', 'workspace', 'Versions', () => app.newBranch(), {
    keywords: 'eksperimen alternatif coba varian fork experiment alternative try variant',
  });

  add('export.quality', 'Kualitas ekspor…', 'settings', 'Ekspor', () => app.showExportQuality(), {
    keywords: 'toleransi teselasi segitiga chord resolusi kerapatan mesh tessellation triangles resolution density',
  });

  /* ------------------------------------------------------- shop drawings */

  add('draw.sheet', 'Gambar kerja…', 'sheet', 'Gambar kerja', () => app.showDrawing(), {
    key: 'Ctrl ⇧ D', enabled: built,
    keywords: 'tampilan ortografi cetak kop gambar dimensi garis tersembunyi sudut pertama denah tampak',
  });
  add('draw.sheetSVG', 'Gambar ke SVG', 'image', 'Gambar kerja', () => app.exportSheet('svg'), {
    enabled: built, keywords: 'cetak plot kertas a3 a4 vektor print paper vector',
  });
  add('draw.sheetDXF', 'Gambar ke DXF', 'layers', 'Gambar kerja', () => app.exportSheet('dxf'), {
    enabled: built, keywords: 'autocad cam laser plotter r12',
  });

  /* ---------------------------------------------------------- tolerances */

  add('tol.stack', 'Stack-up toleransi…', 'ruler', 'Analisis', () => app.showTolerance(), {
    enabled: built,
    keywords: 'stack rantai kasus terburuk rss monte carlo cpk kapabilitas variasi rakitan celah suaian worst case capability variation assembly gap fit',
  });
  add('tol.fits', 'Fits dan limits…', 'target', 'Analisis', () => app.showFits(), {
    keywords: 'iso 286 h7 g6 poros lubang clearance interferensi tekan geser bantalan toleransi grade shaft hole press slide bearing',
  });

  add('studio.intentIn', 'Impor design intent…', 'file-import', 'Studio', () => app.pickIntent(), {
    keywords: 'bolak-balik json parameter bangun ulang interoperabilitas baca kembali round trip rebuild interoperability',
  });

  /* ------------------------------------------------------ design as code */

  add('spec.edit', 'Desain sebagai kode…', 'code', 'Studio', () => app.showSpec(), {
    key: 'Ctrl ⇧ C',
    keywords: 'teks skrip sumber sunting parametrik openscad diff tinjau terprogram script source edit review programmatic',
  });
  add('spec.copy', 'Salin teks spesifikasi', 'copy', 'Studio', () => app.copySpec(), {
    keywords: 'papan klip bagikan tempel tinjau teks clipboard share paste review text',
  });

  /* --------------------------------------------------------- AI chat */

  add('ai.chat3d', 'AI Chat ke 3D…', 'command', 'Buat', () => app.showChat3D(), {
    key: 'Ctrl ⇧ K',
    keywords: 'ai chat obrolan rakitan otomatis satu kalimat kotak panel braket flens rangka tangga kolom balok resep asisten copilot assembly recipe',
  });
  add('ai.chat4d', 'AI Chat ke simulasi 4D…', 'timeline', 'Simulasi', () => app.showChat4D(), {
    key: 'Ctrl ⇧ M',
    keywords: 'ai chat obrolan 4d urutan bangun jadwal motor keyframe fisika simulasi waktu konstruksi sequence schedule',
  });

  /* ------------------------------------------------------- typed intent */

  add('speak.build', 'Katakan yang Anda inginkan…', 'command', 'Buat', () => app.showSpeak(), {
    key: 'Ctrl ⇧ B',
    keywords: 'bahasa alami ketik intent jelaskan perintah kalimat buat pelat lubang baut',
  });

  add('lib.fasteners', 'Fastener…', 'key', 'Buat', () => app.showFasteners(), {
    keywords: 'baut sekrup mur ulir iso metrik m6 m8 torsi proof load clearance bor tap washer pustaka pengencang screw nut thread torque tapping drill hardware library',
  });

  add('doc.health', 'Kesehatan dokumen…', 'probe', 'Analisis', () => app.showHygiene(), {
    keywords: 'kebersihan berat ukuran jauh origin koordinat presisi duplikat kosong rusak berat hygiene proxy far coordinates precision duplicate dedup empty degenerate bloat heavy',
  });
  add('app.ownership', 'Offline dan kepemilikan…', 'lock', 'Bantuan', () => app.showOwnership(), {
    keywords: 'offline pasang permanen langganan privasi telemetri akun lisensi penyimpanan lokal data install perpetual subscription privacy telemetry account licence local storage',
  });

  return C;
}

/** Per-primitive icons, so the Create menu reads as shapes rather than words. */
export const ICON_FOR = {
  box: 'box', cylinder: 'cylinder', sphere: 'sphere', cone: 'cone', torus: 'torus',
  tube: 'tube', wedge: 'wedge', prism: 'prism', pyramid: 'pyramid', plate: 'plate',
  helix: 'helix', mesh: 'mesh', extrude: 'extrude', revolve: 'revolve',
  boolean: 'union', patternLinear: 'pattern-linear', patternCircular: 'pattern-circular', mirror: 'mirror',
};

/* ------------------------------------------------------------ templates */

/** Starter documents - every one is a real, buildable model. */
export const TEMPLATES = [
  {
    id: 'blank', name: ('Dokumen kosong'), icon: 'file-new',
    blurb: ('Model kosong dalam milimeter, dengan satu parameter contoh.'),
    build: () => newDocument(('Tanpa judul')),
  },
  {
    id: 'plate', name: ('Pelat baut'), icon: 'plate',
    blurb: ('Pelat sudut bulat dengan pola baut parametrik - cocok untuk braket.'),
    build: () => app_plate(),
  },
  {
    id: 'flange', name: ('Pipa flens'), icon: 'tube',
    blurb: ('Dua flens pada tabung dengan cincin lubang baut.'),
    build: () => app_flange(),
  },
  {
    id: 'enclosure', name: ('Cangkang enclosure'), icon: 'box',
    blurb: ('Kotak berongga dengan bibir tutup - awal kotak elektronika.'),
    build: () => app_enclosure(),
  },
  {
    id: 'shaft', name: ('Poros bertingkat'), icon: 'cylinder',
    blurb: ('Tiga diameter konsentris, dikendalikan satu parameter panjang.'),
    build: () => app_shaft(),
  },
  {
    id: 'tower', name: ('Urutan bangun 4D'), icon: 'sequence',
    blurb: ('Tumpukan lantai yang sudah diurutkan di timeline - tekan putar.'),
    build: () => app_tower(),
  },
];

/* The template builders live here rather than in main.js so the catalogue and
   its contents stay in one file. Each returns a complete document. */

function baseDoc(name, params) {
  const doc = newDocument((name));
  doc.params = params.map((p, i) => ({ id: `p${i}${Math.random().toString(36).slice(2, 6)}`, name: p[0], value: p[1], note: (p[2] || '') }));
  return doc;
}

function mk(type, over) {
  const { makeFeature } = mkDeps;
  if (over?.name) over = { ...over, name: (over.name) };
  return makeFeature(type, over);
}
const mkDeps = {};
export function registerFeatureFactory(makeFeature) { mkDeps.makeFeature = makeFeature; }

function app_plate() {
  const doc = baseDoc('Pelat baut', [['plate_w', 140, 'Lebar keseluruhan'], ['plate_d', 90, 'Kedalaman keseluruhan'], ['thick', 10, 'Tebal'], ['bolt_r', 5.5, 'Radius lubang baut'], ['inset', 16, 'Inset lubang dari tepi']]);
  const plate = mk('plate', { name: 'Pelat', material: 'aluminium', params: { w: 'plate_w', d: 'plate_d', h: 'thick', fillet: 14, hole: 0, seg: 12 }, pos: [0, 0, 'thick/2'] });
  const hole = mk('cylinder', { name: 'Lubang baut', params: { r: 'bolt_r', h: 'thick*3', seg: 32, arc: 360 }, pos: ['plate_w/2 - inset', 'plate_d/2 - inset', 'thick/2'] });
  const pat = mk('patternLinear', { name: 'Pola baut', params: { dx: '-(plate_w - inset*2)', dy: 0, dz: 0, count: 2, dx2: 0, dy2: '-(plate_d - inset*2)', dz2: 0, count2: 2 }, inputs: [hole.id] });
  const cut = mk('boolean', { name: 'Pelat baut', material: 'aluminium', params: { op: 'subtract' }, inputs: [plate.id, pat.id] });
  doc.features = [plate, hole, pat, cut];
  return doc;
}

function app_flange() {
  const doc = baseDoc('Pipa flens', [['bore', 32, 'Diameter dalam/2'], ['wall', 6, 'Dinding pipa'], ['len', 190, 'Panjang keseluruhan'], ['flange_r', 58, 'Radius flens'], ['bolts', 6, 'Jumlah baut']]);
  const pipe = mk('tube', { name: 'Pipa', material: 'stainless', params: { ro: 'bore + wall', ri: 'bore', h: 'len', seg: 40 }, pos: [0, 0, 'len/2'] });
  const f1 = mk('cylinder', { name: 'Flens bawah', material: 'stainless', params: { r: 'flange_r', h: 12, seg: 40, arc: 360 }, pos: [0, 0, 6] });
  const f2 = mk('cylinder', { name: 'Flens atas', material: 'stainless', params: { r: 'flange_r', h: 12, seg: 40, arc: 360 }, pos: [0, 0, 'len - 6'] });
  const join = mk('boolean', { name: 'Badan', material: 'stainless', params: { op: 'union' }, inputs: [pipe.id, f1.id, f2.id] });
  const drill = mk('cylinder', { name: 'Bore', params: { r: 'bore', h: 'len*1.2', seg: 40, arc: 360 }, pos: [0, 0, 'len/2'] });
  const bolt = mk('cylinder', { name: 'Lubang baut', params: { r: 5, h: 40, seg: 16, arc: 360 }, pos: ['flange_r - 14', 0, 6] });
  const ring = mk('patternCircular', { name: 'Cincin baut', params: { axis: 'z', cx: 0, cy: 0, cz: 0, count: 'bolts', angle: 360, rotate: true }, inputs: [bolt.id] });
  const bolt2 = mk('cylinder', { name: 'Lubang baut atas', params: { r: 5, h: 40, seg: 16, arc: 360 }, pos: ['flange_r - 14', 0, 'len - 6'] });
  const ring2 = mk('patternCircular', { name: 'Cincin baut atas', params: { axis: 'z', cx: 0, cy: 0, cz: 0, count: 'bolts', angle: 360, rotate: true }, inputs: [bolt2.id] });
  const cut = mk('boolean', { name: 'Pipa flens', material: 'stainless', params: { op: 'subtract' }, inputs: [join.id, drill.id, ring.id, ring2.id] });
  doc.features = [pipe, f1, f2, join, drill, bolt, ring, bolt2, ring2, cut];
  return doc;
}

function app_enclosure() {
  const doc = baseDoc('Cangkang enclosure', [['w', 120, 'Lebar'], ['d', 80, 'Kedalaman'], ['h', 45, 'Tinggi'], ['wall', 2.5, 'Tebal dinding']]);
  const outer = mk('plate', { name: 'Luar', material: 'abs', params: { w: 'w', d: 'd', h: 'h', fillet: 8, hole: 0, seg: 10 }, pos: [0, 0, 'h/2'] });
  const inner = mk('plate', { name: 'Rongga', params: { w: 'w - wall*2', d: 'd - wall*2', h: 'h', fillet: 'max(1, 8 - wall)', hole: 0, seg: 10 }, pos: [0, 0, 'h/2 + wall'] });
  const shell = mk('boolean', { name: 'Cangkang', material: 'abs', params: { op: 'subtract' }, inputs: [outer.id, inner.id] });
  doc.features = [outer, inner, shell];
  return doc;
}

function app_shaft() {
  const doc = baseDoc('Poros bertingkat', [['d1', 20, 'Diameter besar/2'], ['d2', 14, 'Diameter tengah/2'], ['d3', 9, 'Diameter kecil/2'], ['seg_len', 45, 'Panjang tiap tingkat']]);
  const a = mk('cylinder', { name: 'Tingkat 1', material: 'steel', params: { r: 'd1', h: 'seg_len', seg: 48, arc: 360 }, pos: [0, 0, 'seg_len/2'] });
  const b = mk('cylinder', { name: 'Tingkat 2', material: 'steel', params: { r: 'd2', h: 'seg_len', seg: 48, arc: 360 }, pos: [0, 0, 'seg_len*1.5'] });
  const c = mk('cylinder', { name: 'Tingkat 3', material: 'steel', params: { r: 'd3', h: 'seg_len', seg: 48, arc: 360 }, pos: [0, 0, 'seg_len*2.5'] });
  const u = mk('boolean', { name: 'Poros', material: 'steel', params: { op: 'union' }, inputs: [a.id, b.id, c.id] });
  doc.features = [a, b, c, u];
  return doc;
}

function app_tower() {
  const doc = baseDoc('Urutan bangun 4D', [['floor_h', 30, 'Tinggi lantai'], ['floors', 6, 'Jumlah lantai']]);
  const slab = mk('box', { name: 'Pondasi', material: 'concrete', params: { w: 140, d: 100, h: 14 }, pos: [0, 0, 7] });
  const floor = mk('box', { name: 'Lantai', material: 'concrete', params: { w: 120, d: 84, h: 'floor_h * 0.25' }, pos: [0, 0, 'floor_h/2 + 14'] });
  const stack = mk('patternLinear', { name: 'Tumpukan lantai', params: { dx: 0, dy: 0, dz: 'floor_h', count: 'floors', dx2: 0, dy2: 0, dz2: 0, count2: 1 }, inputs: [floor.id] });
  const col = mk('cylinder', { name: 'Kolom', material: 'steel', params: { r: 4, h: 'floor_h * floors', seg: 20, arc: 360 }, pos: [52, 34, 'floor_h*floors/2 + 14'] });
  const cols = mk('patternLinear', { name: 'Kolom', params: { dx: -104, dy: 0, dz: 0, count: 2, dx2: 0, dy2: -68, dz2: 0, count2: 2 }, inputs: [col.id] });
  doc.features = [slab, floor, stack, col, cols];
  doc.sim.duration = 12;
  doc.sim.schedule.enabled = true;
  doc.sim.schedule.items[slab.id] = { start: 0, dur: 1.4, mode: 'build', enabled: true };
  doc.sim.schedule.items[stack.id] = { start: 1.6, dur: 4.5, mode: 'riseZ', enabled: true };
  doc.sim.schedule.items[cols.id] = { start: 6.4, dur: 3, mode: 'build', enabled: true };
  return doc;
}

export { UNITS, MATERIALS };
