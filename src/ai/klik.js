/**
 * What a plan would have cost with the mouse.
 *
 * Both chat features are sold on a number — "this turn was worth about 780
 * steps-clicks" — and a number like that is worthless unless the model behind
 * it is written down. So the model is here, in one file, as data: the cost of
 * each interaction the interface actually charges for, counted the way a user
 * pays it.
 *
 * The counts come from the interface in this repository, not from a guess at
 * CAD in general. Adding a primitive from the Create menu is menu, submenu,
 * item — three clicks — and then one to select the new feature before its
 * fields can be edited, so four. A numeric field is a click to focus and a
 * typed value committed with Enter, so two. A boolean is select the first
 * body, Ctrl-click the second, open Modify, pick the operation: four. Those
 * are the four numbers that dominate every estimate below, and anyone can
 * check them by doing it.
 *
 * Deliberately conservative. Where a step could be counted twice — a pattern's
 * own parameters, say, on top of the pattern feature — it is counted once, and
 * the drag-and-drop reordering, the mis-clicks, the scrolling and the undo of
 * a wrong guess are all counted as zero. The honest claim is a floor: doing it
 * by hand costs at least this much.
 */

/** Cost of each kind of interaction, in clicks-or-keystrokes. */
export const BIAYA = {
  fitur: 4,          // open Create, walk the submenu, pick it, select it
  param: 2,          // focus a field, type a value, commit
  ekspresi: 3,       // the same, but an expression is longer to type
  paramBernama: 4,   // Parameters panel: add, name, value, note
  boolean: 4,        // select, Ctrl-click, open Modify, pick the operation
  pattern: 4,        // same as a feature, then its count and steps are params
  transform: 4,      // gizmo or the transform fields
  material: 3,       // open the material list, scroll, pick
  namaUlang: 3,      // F2, type, Enter
  visibilitas: 2,    // select, toggle
  lapisan: 3,        // new layer, name it, make it active
  jadwal: 5,         // enable the sequence, pick the body, start, duration, mode
  keyframe: 4,       // move the playhead, set the property, key it, ease it
  motor: 6,          // enable dynamics, pick the body, type, axis, rate, direction
  dinamika: 3,       // enable, gravity, ground
  lembar: 6,         // drawing sheet: size, projection, views, scale
  ekspor: 3,         // menu, submenu, item
};

/**
 * Add up a program's clicks.
 *
 * `program` is the shape both chat modules produce: features and named
 * parameters to add, plus a tally of the edits that are not features. Every
 * feature's own parameters are counted, which is where the large numbers come
 * from: a bolt pattern with eight driven dimensions is not one interaction.
 */
export function klikProgram(program = {}) {
  let n = 0;
  for (const f of program.features || []) {
    n += f.type && /^pattern/.test(f.type) ? BIAYA.pattern
      : f.type === 'boolean' ? BIAYA.boolean
        : BIAYA.fitur;
    for (const v of Object.values(f.params || {})) {
      n += typeof v === 'string' && /[a-z_]/i.test(v) ? BIAYA.ekspresi : BIAYA.param;
    }
    if (f.material) n += BIAYA.material;
    if (f.name) n += BIAYA.namaUlang;
    if (f.transform && !isIdentity(f.transform)) n += BIAYA.transform;
    if (f.visible === false) n += BIAYA.visibilitas;
  }
  n += (program.params || []).length * BIAYA.paramBernama;
  for (const [kind, count] of Object.entries(program.tally || {})) {
    n += (BIAYA[kind] || 1) * count;
  }
  return n;
}

const isIdentity = (t) => {
  const p = t.pos || [0, 0, 0], r = t.rot || [0, 0, 0], s = t.scale || [1, 1, 1];
  return p.every(v => v === 0) && r.every(v => v === 0) && s.every(v => v === 1);
};

/**
 * The sentence the chat prints after a turn.
 *
 * Rounded to ten, because a figure like "783" claims a precision the model
 * does not have, and reported as "sekitar" for the same reason.
 */
export function klikKalimat(n) {
  if (!n) return 'Belum ada yang dibangun, jadi belum ada langkah yang dihemat.';
  const bulat = n < 100 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10;
  return `Setara sekitar ${bulat} langkah-klik jika dikerjakan manual.`;
}
