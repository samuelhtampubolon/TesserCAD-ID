/**
 * Menu bar and ribbon layouts.
 *
 * Both are pure descriptions built fresh each time they open, so toggle
 * checkmarks and enabled states are always live. Nothing here holds state.
 */
import { CATALOG, MATERIALS, store } from '../core/doc.js';
import { ICON_FOR, TEMPLATES } from './commands.js';

const solids = () => Object.entries(CATALOG).filter(([, c]) => c.group === 'solid');

/**
 * @param {object} app
 * @param {(id:string)=>object} c  command lookup that resolves checked/enabled
 */
export function menuDefs(app, c) {
  return [
    ['Berkas', () => [
      c('file.new'), {
        label: 'Baru dari templat', icon: 'template',
        sub: TEMPLATES.map(t => ({ label: t.name, icon: t.icon, run: () => app.applyTemplate(t) })),
      },
      '-',
      c('file.open'), c('file.save'), c('file.saveAs'),
      '-',
      { header: 'Masukkan' },
      c('file.import'),
      { label: 'Format impor', icon: 'file-import', sub: [
        { label: 'Mesh STL…', icon: 'cube3d', run: () => app.pickFile('.stl') },
        { label: 'Mesh OBJ…', icon: 'mesh', run: () => app.pickFile('.obj') },
        { label: 'Gambar DXF…', icon: 'layers', run: () => app.pickFile('.dxf') },
        { label: 'Proyek TesserCAD-ID…', icon: 'file-open', run: () => app.pickFile('.tcad,.json') },
      ] },
      '-',
      c('file.props'), c('file.sample'), c('file.autosave'), c('file.revert'),
      '-',
      c('file.clearAutosave'),
    ]],

    ['Sunting', () => [
      c('edit.undo'), c('edit.redo'), c('edit.history'),
      '-',
      c('edit.duplicate'), c('edit.rename'), c('edit.delete'),
      '-',
      { header: 'Pilih' },
      c('edit.selectAll'), c('edit.selectNone'), c('edit.selectInvert'), c('edit.selectSameType'),
      '-',
      c('edit.prefs'),
    ]],

    ['Buat', () => [
      { header: 'Solids' },
      ...solids().slice(0, 6).map(([t]) => c(`add.${t}`)),
      { label: 'Solid lain', icon: 'workspace', sub: solids().slice(6).map(([t]) => c(`add.${t}`)) },
      '-',
      { header: 'Dari gambar' },
      c('sketch.extrude'), c('sketch.revolve'),
      '-',
      c('add.import'),
    ]],

    ['Ubah', () => [
      { header: 'Gabungkan' },
      c('bool.union'), c('bool.subtract'), c('bool.intersect'),
      '-',
      { header: 'Ulangi' },
      c('mod.linear'), c('mod.circular'), c('mod.mirror'),
      '-',
      { header: 'Transform' },
      c('op.move'), c('op.rotate'), c('op.scale'),
      { label: 'Gizmo', icon: 'move', sub: [c('gizmo.translate'), c('gizmo.rotate'), c('gizmo.scale'), '-', c('gizmo.off')] },
      { label: 'Ratakan', icon: 'align', sub: [c('xf.alignX'), c('xf.alignY'), c('xf.alignZ'), '-', c('xf.distribute')] },
      c('xf.drop'), c('xf.centre'), c('xf.reset'),
      '-',
      { header: 'Tampilan' },
      { label: 'Material', icon: 'palette', sub: Object.entries(MATERIALS).map(([k, m]) => ({
        label: m.name, icon: 'palette', run: () => app.setMaterial(k),
        disabled: app.selection.size === 0,
      })) },
      c('mod.colour'),
      '-',
      c('mod.hide'), c('mod.isolate'), c('mod.showAll'), c('mod.suppress'),
    ]],

    ['Tampilan', () => [
      c('view.fit'), c('view.selection'), c('view.zoomIn'), c('view.zoomOut'),
      '-',
      { label: 'Tampilan standar', icon: 'view-iso', sub: [
        c('view.iso'), '-', c('view.front'), c('view.back'), c('view.left'), c('view.right'), c('view.top'), c('view.bottom'),
      ] },
      c('view.ortho'),
      '-',
      { header: 'Tampilan' },
      { label: 'Shading', icon: 'shade-solid', sub: [
        c('shade.shaded-edges'), c('shade.shaded'), c('shade.wire'), c('shade.xray'),
      ] },
      { label: 'Latar', icon: 'image', sub: [c('bg.studio'), c('bg.graphite'), c('bg.white'), c('bg.blueprint')] },
      c('view.grid'), c('view.axes'), c('view.ground'), c('view.section'),
      '-',
      c('view.theme'), c('view.fullscreen'),
    ]],

    ['Ukur', () => [
      c('measure.distance'), c('measure.angle'), c('measure.point'),
      '-',
      c('measure.mass'), c('export.bom'),
      '-',
      c('measure.off'),
    ]],

    ['Draft', () => [
      { header: 'Gambar' },
      c('draft.line'), c('draft.polyline'), c('draft.rect'), c('draft.circle'), c('draft.arc'),
      { label: 'Bentuk lain', icon: 'polygon', sub: [c('draft.ellipse'), c('draft.polygon'), c('draft.spline'), c('draft.point'), c('draft.text')] },
      '-',
      { label: 'Dimensi', icon: 'dim-linear', sub: [c('draft.dimLinear'), c('draft.dimAligned'), c('draft.dimRadial'), c('draft.dimAngular')] },
      c('draft.offset'), c('draft.measure'),
      '-',
      { header: 'Bantuan drafting' },
      c('draft.snap'), c('draft.ortho'), c('draft.polar'), c('draft.gridSnap'),
      '-',
      { label: 'Ubah', icon: 'rotate', sub: [c('draft.rotate90'), c('draft.mirrorX'), c('draft.mirrorY')] },
      c('draft.addLayer'), c('draft.zoomExtents'),
      '-',
      c('sketch.extrude'), c('sketch.revolve'),
    ]],

    ['Simulasi', () => [
      c('ai.chat4d'),
      '-',
      c('sim.play'), c('sim.stop'),
      { label: 'Lompat ke', icon: 'timeline', sub: [c('sim.rewind'), c('sim.end'), '-', c('sim.stepBack'), c('sim.stepFwd')] },
      c('sim.loop'),
      '-',
      { header: 'Animasi' },
      c('sim.key'), c('sim.clearKeys'),
      '-',
      { header: 'Urutan bangun 4D' },
      c('sim.schedule'), c('sim.autoSchedule'), c('sim.clearSchedule'),
      '-',
      { header: 'Fisika' },
      c('sim.physics'), c('sim.dropTest'), c('sim.motor'), c('sim.bake'),
      '-',
      c('sim.record'),
    ]],

    ['Ekspor', () => [
      c('export.quality'),
      '-',
      { header: '3D' },
      c('export.stl'), c('export.stlAscii'), c('export.obj'), c('export.ply'),
      '-',
      { header: 'Gambar 2D' },
      c('export.dxf'), c('export.svg'),
      '-',
      { header: 'Gambar dan data' },
      { label: 'Gambar viewport', icon: 'image', sub: [c('export.png1'), c('export.png'), c('export.png4')] },
      c('export.bom'), c('export.report'),
      '-',
      c('sim.record'),
    ]],

    ['Jendela', () => [
      c('win.left'), c('win.right'), c('win.timeline'),
      '-',
      c('win.zen'), c('win.reset'),
      '-',
      { header: 'Workspace' },
      c('ws.model'), c('ws.draft'), c('ws.sim'),
    ]],

    ['Studio', () => [
      { header: 'Mulai dari kebutuhan' },
      c('studio.brief'), c('ai.chat3d'), c('speak.build'), c('lib.fasteners'),
      '-',
      { header: 'Periksa dan biaya' },
      c('studio.doctor'), c('studio.cost'),
      '-',
      { header: 'Gambar' },
      c('draw.sheet'), c('draw.sheetSVG'), c('draw.sheetDXF'),
      '-',
      { header: 'Rilis' },
      c('release.package'), c('studio.intent'), c('studio.intentIn'),
      '-',
      { header: 'Teks' },
      c('spec.edit'), c('spec.copy'),
      '-',
      { header: 'Automate' },
      c('macro.record'), c('macro.stop'), c('macro.manage'),
      '-',
      c('studio.standards'), c('studio.lessons'),
    ]],

    ['Analisis', () => [
      { header: 'Strength' },
      c('studio.section'),
      '-',
      { header: 'Pas' },
      c('studio.clash'), c('tol.stack'), c('tol.fits'),
      '-',
      { header: 'Imported geometry' },
      c('studio.inspect'),
      '-',
      { header: 'Dokumennya sendiri' },
      c('doc.health'),
      '-',
      { header: 'Varian' },
      c('cfg.manage'), c('cfg.add'), c('cfg.next'), c('cfg.family'),
      '-',
      { header: 'Versions' },
      c('vcs.commit'), c('vcs.browse'), c('vcs.branch'),
    ]],

    ['Bantuan', () => [
      c('help.palette'), c('help.quickstart'), c('help.shortcuts'), c('help.expressions'),
      '-',
      c('help.learn'), c('help.guide'),
      '-',
      c('app.ownership'),
      '-',
      c('help.source'), c('help.issue'),
      '-',
      c('help.about'),
    ]],
  ];
}

/**
 * Ribbon layout per workspace.
 * A group is { label, items } where an item is a command id, or
 * { stack: [ids] } for a vertical pair, or { custom: 'name' } for a widget
 * main.js renders itself.
 */
export function ribbonDefs(app) {
  const isDraft = app.workspace === 'draft';
  const isSim = app.workspace === 'sim';

  if (isDraft) {
    return [
      { label: 'Gambar', items: ['draft.select', 'draft.line', 'draft.polyline', 'draft.rect', 'draft.circle', 'draft.arc', 'draft.ellipse', 'draft.polygon', 'draft.spline'] },
      { label: 'Anotasi', items: ['draft.text', 'draft.dimLinear', 'draft.dimAligned', 'draft.dimRadial', 'draft.dimAngular'] },
      { label: 'Ubah', items: ['draft.offset', 'edit.duplicate', 'draft.rotate90', 'draft.mirrorX', 'edit.delete'] },
      { label: 'Presisi', items: ['draft.snap', 'draft.ortho', 'draft.polar', 'draft.gridSnap', 'draft.measure'] },
      { label: 'Ke 3D', items: ['sketch.extrude', 'sketch.revolve'] },
      { label: 'Tampilan', items: ['draft.zoomExtents', 'view.grid', 'view.theme'] },
      { label: 'Layer', items: [{ custom: 'layerPicker' }] },
      { label: 'Keluaran', items: ['export.dxf', 'export.svg'] },
      { label: 'Studio', items: ['studio.doctor', 'release.package'] },
    ];
  }

  if (isSim) {
    return [
      { label: 'Putar', items: ['sim.rewind', 'sim.stepBack', 'sim.play', 'sim.stepFwd', 'sim.end', 'sim.stop', 'sim.loop'] },
      { label: 'Animasi', items: ['sim.key', 'sim.clearKeys'] },
      { label: 'Urutan 4D', items: ['sim.schedule', 'sim.autoSchedule', 'sim.clearSchedule'] },
      { label: 'Fisika', items: ['sim.physics', 'sim.dropTest', 'sim.motor', 'sim.bake'] },
      { label: 'Kecepatan', items: [{ custom: 'speedPicker' }] },
      { label: 'Keluaran', items: ['sim.record', 'export.png'] },
      { label: 'Tampilan', items: ['view.fit', 'view.shadingCycle', 'view.ortho'] },
      { label: 'Studio', items: ['studio.doctor', 'release.package'] },
    ];
  }

  return [
    { label: 'Buat', items: solids().slice(0, 8).map(([t]) => `add.${t}`).concat([{ custom: 'moreSolids' }]) },
    { label: 'Dari gambar', items: ['sketch.extrude', 'sketch.revolve'] },
    { label: 'Gabungkan', items: ['bool.union', 'bool.subtract', 'bool.intersect'] },
    { label: 'Ulangi', items: ['mod.linear', 'mod.circular', 'mod.mirror'] },
    { label: 'Transform', items: ['op.move', 'op.rotate', 'op.scale', 'xf.drop'] },
    { label: 'Tata', items: ['mod.hide', 'mod.isolate', 'mod.showAll', 'mod.material'] },
    { label: 'Ukur', items: ['measure.distance', 'measure.angle', 'measure.mass'] },
    { label: 'Tampilan', items: ['view.fit', 'view.shadingCycle', 'view.ortho', 'view.section'] },
    { label: 'Studio', items: ['studio.brief', 'studio.doctor', 'studio.cost', 'release.package'] },
    { label: 'Analisis', items: ['studio.section', 'studio.clash', 'tol.stack', 'cfg.manage', 'vcs.commit', 'vcs.browse'] },
    { label: 'Gambar kerja', items: ['draw.sheet', 'spec.edit', 'draw.sheetDXF'] },
    { label: 'Intent', items: ['ai.chat3d', 'ai.chat4d', 'speak.build'] },
  ];
}

/** The eight commands on the Q quick menu, resolved per workspace. */
export function quickDefaults(app) {
  if (app.workspace === 'draft') {
    return ['draft.line', 'draft.rect', 'draft.circle', 'draft.dimLinear', 'draft.offset', 'draft.snap', 'sketch.extrude', 'draft.zoomExtents'];
  }
  if (app.workspace === 'sim') {
    return ['sim.play', 'sim.key', 'sim.autoSchedule', 'sim.dropTest', 'sim.physics', 'sim.bake', 'sim.record', 'view.fit'];
  }
  return ['add.box', 'add.cylinder', 'bool.subtract', 'mod.linear', 'op.move', 'mod.isolate', 'view.fit', 'measure.distance'];
}

/** Right-click menu inside the 3D viewport. */
export function viewportContextMenu(app, c, hitId) {
  const sel = app.selection.size;
  if (!hitId && !sel) {
    return [
      { header: 'Viewport' },
      c('view.fit'), c('view.shadingCycle'), c('view.ortho'), c('view.section'),
      '-',
      c('edit.selectAll'), c('help.palette'),
    ];
  }
  return [
    { header: store.feature(hitId)?.name || `${sel} dipilih` },
    c('op.move'), c('op.rotate'), c('op.scale'),
    '-',
    c('edit.duplicate'), c('edit.rename'), c('mod.isolate'), c('mod.hide'),
    '-',
    c('bool.union'), c('bool.subtract'), c('mod.linear'), c('mod.circular'), c('mod.mirror'),
    '-',
    { label: 'Material', icon: 'palette', sub: Object.entries(MATERIALS).map(([k, m]) => ({ label: m.name, run: () => app.setMaterial(k) })) },
    c('xf.drop'), c('view.selection'),
    '-',
    c('edit.delete'),
  ];
}

/**
 * Short labels for the ribbon. A ribbon button is ~46px wide, so anything
 * longer than about nine characters wraps or clips; the full label still
 * shows in the tooltip, the menus and the palette.
 */
export const SHORT_LABEL = {
  'add.cone': 'Cone', 'add.tube': 'Tube', 'add.helix': 'Helix', 'add.plate': 'Pelat',
  'sketch.extrude': 'Extrude', 'sketch.revolve': 'Revolve',
  'bool.union': 'Union', 'bool.subtract': 'Subtract', 'bool.intersect': 'Common',
  'mod.linear': 'Linear', 'mod.circular': 'Circular', 'mod.mirror': 'Mirror',
  'mod.hide': 'Sembunyi', 'mod.isolate': 'Isolasi', 'mod.showAll': 'Tampil semua', 'mod.material': 'Material',
  'op.move': 'Geser', 'op.rotate': 'Rotate', 'op.scale': 'Scale', 'xf.drop': 'Jatuhkan',
  'measure.distance': 'Jarak', 'measure.angle': 'Sudut', 'measure.mass': 'Massa',
  'view.fit': 'Pas', 'view.shadingCycle': 'Shading', 'view.ortho': 'Ortho', 'view.section': 'Section',
  'edit.duplicate': 'Salin', 'edit.delete': 'Hapus',
  'export.dxf': 'DXF', 'export.svg': 'SVG', 'export.png': 'PNG',
  'draft.select': 'Pilih', 'draft.polyline': 'Polyline', 'draft.rect': 'Rect',
  'draft.dimLinear': 'Linear', 'draft.dimAligned': 'Aligned', 'draft.dimRadial': 'Radius', 'draft.dimAngular': 'Sudut',
  'draft.offset': 'Offset', 'draft.snap': 'Snap', 'draft.ortho': 'Ortho', 'draft.polar': 'Polar',
  'draft.gridSnap': 'Grid', 'draft.zoomExtents': 'Pas', 'draft.measure': 'Ukur',
  'draft.rotate90': 'Rotate', 'draft.mirrorX': 'Mirror', 'draft.addLayer': 'Layer',
  'sim.play': 'Putar', 'sim.stop': 'Stop', 'sim.rewind': 'Awal', 'sim.end': 'Akhir',
  'sim.stepBack': 'Sebelum', 'sim.stepFwd': 'Berikut', 'sim.loop': 'Loop',
  'sim.key': 'Keyframe', 'sim.clearKeys': 'Hapus', 'sim.schedule': 'Urutan',
  'sim.autoSchedule': 'Urutan', 'sim.clearSchedule': 'Hapus', 'sim.physics': 'Fisika',
  'sim.dropTest': 'Uji jatuh', 'sim.motor': 'Motor', 'sim.bake': 'Bake', 'sim.record': 'Rekam',
  'studio.brief': 'Brief', 'studio.doctor': 'Doctor', 'studio.cost': 'Biaya',
  'studio.section': 'Section', 'studio.clash': 'Clash', 'studio.inspect': 'Periksa',
  'cfg.manage': 'Varian', 'cfg.add': 'Varian baru', 'cfg.next': 'Berikut', 'cfg.family': 'Family',
  'vcs.commit': 'Simpan versi', 'vcs.browse': 'Riwayat', 'vcs.branch': 'Cabang',
  'export.quality': 'Kualitas',
  'release.package': 'Rilis', 'studio.intent': 'Intent', 'studio.standards': 'Standar',
  'macro.record': 'Rekam', 'macro.stop': 'Stop', 'macro.manage': 'Makro', 'studio.lessons': 'Catatan',
};

/** Menu-bar labels to icons, for the compact single-button menu on a tablet. */
export const MENU_ICON = {
  File: 'file-new', Edit: 'undo', Create: 'box', Modify: 'union', View: 'view-iso',
  Measure: 'ruler', Draft: 'sketch', Simulate: 'timeline', Export: 'file-export',
  Window: 'panel-left', Studio: 'workspace', Analyse: 'probe', Drawing: 'sheet', Help: 'help',
};

export { ICON_FOR };
