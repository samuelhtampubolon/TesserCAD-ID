/**
 * The timeline: transport controls, per-body tracks, keyframe editing and the
 * build-sequence Gantt view. Rendered as DOM so keys stay clickable and
 * draggable without hit-testing a canvas.
 */
import { el, clear, icon } from './shell.js';
import { store, DURASI_MIN, DURASI_MAX } from '../core/doc.js';
import { bus, T } from '../core/bus.js';
import { ANIM_PROPS, sortTrack } from '../sim/sim.js';
import { isi } from '../core/teks.js';

/**
 * The timeline's own duration, never a value it cannot draw.
 *
 * `drawRuler` walks `for (t = 0; t <= dur; t += step)` with a canvas path
 * operation per tick, so a non-finite duration is not a wrong drawing, it is
 * a loop that does not end. `migrate()` bounds this at the trust boundary; the
 * guard is repeated here because this reads `store.doc` directly and a
 * document can also be assembled in memory.
 */
const durasiAman = () => {
  const d = Number(store.doc.sim.duration);
  return Number.isFinite(d) ? Math.max(DURASI_MIN, Math.min(DURASI_MAX, d)) : 10;
};

export class TimelineUI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('timeline');
    this.expanded = new Set();
    this.pxPerSec = 60;
    this._build();
    bus.on(T.TIME, () => this.updatePlayhead());
    bus.on(T.SIM_STATE, ({ playing }) => {
      clear(this.playBtn).appendChild(icon(playing ? 'pause' : 'play', { size: 14 }));
      this.playBtn.classList.toggle('on', playing);
    });
    addEventListener('resize', () => this.layout());
  }

  _build() {
    const root = clear(this.root);

    /* --- transport --- */
    const bar = el('div', { class: 'tl-bar' });
    const transport = el('div', { class: 'tl-transport' });
    const btn = (name, title, fn) => {
      const b = el('button', { title, onclick: fn }, [icon(name, { size: 14 })]);
      transport.appendChild(b);
      return b;
    };
    btn('rewind', 'Ke awal  (Home)', () => this.app.sim.seek(0));
    btn('step-back', 'Frame sebelumnya  (,)', () => this.app.sim.step(-1));
    this.playBtn = btn('play', 'Play / pause  (Space)', () => this.app.sim.toggle());
    btn('step-fwd', 'Frame berikutnya  (.)', () => this.app.sim.step(1));
    btn('forward', 'Ke akhir  (End)', () => this.app.sim.seek(durasiAman()));
    btn('stop', 'Stop dan ulang', () => this.app.sim.stop());

    this.timeLabel = el('span', { class: 'tl-time', text: '0.00 s' });

    const loop = el('input', { type: 'checkbox' });
    loop.checked = store.doc.sim.loop;
    loop.addEventListener('change', () => store.quiet((d) => { d.sim.loop = loop.checked; }));

    const schedule = el('input', { type: 'checkbox' });
    schedule.checked = store.doc.sim.schedule.enabled;
    schedule.addEventListener('change', () => {
      store.edit('Schedule', (d) => { d.sim.schedule.enabled = schedule.checked; }, { rebuild: false });
      this.app.refreshSim();
      this.render();
    });

    const dur = el('input', { type: 'number', min: DURASI_MIN, max: DURASI_MAX, step: 1, value: durasiAman() });
    dur.addEventListener('change', () => {
      // `type="number"` with a `max` does not stop a typed value from being
      // stored, and this writes to the document directly, so it never passes
      // `migrate()`. Typing a one followed by four hundred zeros here gave
      // `parseFloat` an `Infinity` that `Math.max(0.1, …)` happily kept, and
      // the timeline had no finite duration from then on. Same bound as the
      // file boundary uses, applied where the value actually enters.
      const typed = parseFloat(dur.value);
      const v = Number.isFinite(typed) ? Math.min(DURASI_MAX, Math.max(DURASI_MIN, typed)) : 10;
      dur.value = v;
      store.edit('Timeline duration', (d) => { d.sim.duration = v; }, { rebuild: false });
      this.render();
    });

    const speed = el('select');
    for (const s of [0.1, 0.25, 0.5, 1, 2, 4]) {
      const o = el('option', { value: s, text: `${s}×` });
      if (s === store.doc.sim.speed) o.selected = true;
      speed.appendChild(o);
    }
    speed.addEventListener('change', () => store.quiet((d) => { d.sim.speed = parseFloat(speed.value); }));

    bar.append(
      transport,
      this.timeLabel,
      el('span', { class: 'tl-field' }, [el('label', { text: 'Panjang' }), dur, el('span', { text: 's' })]),
      el('span', { class: 'tl-field' }, [el('label', { text: 'Kecepatan' }), speed]),
      el('label', { class: 'chk' }, [loop, el('span', { text: 'Loop' })]),
      el('label', { class: 'chk' }, [schedule, el('span', { text: 'Urutan bangun' })]),
      el('span', { style: { flex: '1' } }),
      el('button', { class: 'btn sm', onclick: () => this.app.autoSchedule() }, [icon('sequence', { size: 13 }), 'Urutan']),
      el('button', { class: 'btn sm', onclick: () => this.app.run('sim.record') }, [icon('record', { size: 13 }), 'Rekam']),
      el('button', { class: 'mini-btn', title: 'Sembunyikan timeline', onclick: () => this.app.setTimelineVisible(false) }, [icon('close', { size: 14 })]),
    );

    /* --- tracks --- */
    this.trackCol = el('div', { class: 'tl-tracks' });
    this.ruler = el('canvas');
    this.rulerWrap = el('div', { class: 'tl-ruler' }, [this.ruler]);
    this.rows = el('div', { class: 'tl-rows' });
    this.playhead = el('div', { class: 'tl-playhead' });
    this.gridWrap = el('div', { class: 'tl-grid-wrap' }, [this.rulerWrap, this.rows, this.playhead]);

    const main = el('div', { class: 'tl-main' }, [this.trackCol, this.gridWrap]);
    root.append(bar, main);

    this.durInput = dur;
    this.loopInput = loop;
    this.schedInput = schedule;
    this.speedInput = speed;

    // keep the name column and the key grid scrolled together
    let syncing = false;
    const sync = (from, to) => from.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      to.scrollTop = from.scrollTop;
      syncing = false;
    });
    sync(this.trackCol, this.gridWrap);
    sync(this.gridWrap, this.trackCol);

    const scrub = (e) => {
      const r = this.gridWrap.getBoundingClientRect();
      const x = e.clientX - r.left + this.gridWrap.scrollLeft;
      this.app.sim.seek(Math.max(0, x / this.pxPerSec));
    };
    this.rulerWrap.addEventListener('pointerdown', (e) => {
      this.rulerWrap.setPointerCapture(e.pointerId);
      this._scrubbing = true;
      this.app.sim.pause();
      scrub(e);
    });
    this.rulerWrap.addEventListener('pointermove', (e) => { if (this._scrubbing) scrub(e); });
    this.rulerWrap.addEventListener('pointerup', () => { this._scrubbing = false; });
  }

  layout() {
    const w = Math.max(200, this.gridWrap.clientWidth);
    const dur = durasiAman();
    this.pxPerSec = Math.max(8, w / dur);
    this.drawRuler();
    this.updatePlayhead();
  }

  drawRuler() {
    const cv = this.ruler;
    const w = Math.max(200, this.gridWrap.clientWidth);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = 22 * dpr;
    cv.style.width = `${w}px`; cv.style.height = '22px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, w, 22);
    ctx.fillStyle = (css.getPropertyValue('--txt-3') || '#6b7888').trim();
    ctx.strokeStyle = (css.getPropertyValue('--line') || '#262e3a').trim();
    ctx.font = '10px ui-monospace, monospace';

    const dur = durasiAman();
    const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find(s => s * this.pxPerSec >= 54) || steps[steps.length - 1];
    ctx.beginPath();
    for (let t = 0; t <= dur + 1e-6; t += step) {
      const x = Math.round(t * this.pxPerSec) + 0.5;
      ctx.moveTo(x, 12); ctx.lineTo(x, 22);
      ctx.fillText(step < 1 ? t.toFixed(2) : `${t.toFixed(step < 1 ? 1 : 0)}s`, x + 3, 9);
    }
    ctx.stroke();
  }

  /** Rebuild the track rows from the document. */
  render() {
    const sim = store.doc.sim;
    if (document.activeElement !== this.durInput) this.durInput.value = round2(sim.duration);
    this.loopInput.checked = sim.loop;
    this.schedInput.checked = sim.schedule.enabled;
    this.speedInput.value = String(sim.speed);
    clear(this.trackCol);
    clear(this.rows);
    this.layout();

    const ids = [...this.app.vp.bodies.keys()];
    if (!ids.length) {
      this.trackCol.appendChild(el('div', { class: 'empty-note' }, [
        icon('cube3d', { size: 22, cls: 'empty-icon' }),
        el('b', { text: 'Belum ada body' }),
        el('span', { text: 'Tambah solid di workspace Model.' }),
      ]));
      return;
    }

    const width = Math.max(200, durasiAman() * this.pxPerSec);

    for (const id of ids) {
      const f = store.feature(id);
      if (!f) continue;
      const open = this.expanded.has(id);
      const tr = sim.tracks[id] || {};
      const keyCount = Object.values(tr).reduce((n, k) => n + (k?.length || 0), 0);

      const head = el('div', {
        class: `tl-track-head ${this.app.selection.has(id) ? 'selected' : ''}`,
        onclick: () => { this.app.select([id], false); },
      }, [
        el('span', {
          class: 'mini-btn',
          onclick: (e) => { e.stopPropagation(); open ? this.expanded.delete(id) : this.expanded.add(id); this.render(); },
        }, [icon(open ? 'chevron-down' : 'chevron-right', { size: 12 })]),
        el('span', { class: 'tn-swatch', style: { background: f.appearance.color } }),
        el('span', { class: 'tname', text: f.name, title: f.name }),
        keyCount ? el('span', { class: 'pill', text: String(keyCount) }) : null,
      ]);
      this.trackCol.appendChild(head);

      const row = el('div', { class: 'tl-row', style: { width: `${width}px` } });
      // build-sequence bar
      const item = sim.schedule.items[id];
      if (sim.schedule.enabled && item && item.enabled !== false) {
        const span = el('div', {
          class: 'tl-span',
          style: { left: `${(item.start || 0) * this.pxPerSec}px`, width: `${Math.max(6, (item.dur || 1) * this.pxPerSec)}px` },
          title: `${f.name}: ${(item.start || 0).toFixed(2)}s → ${((item.start || 0) + (item.dur || 1)).toFixed(2)}s`,
          text: f.name,
        });
        this._bindSpanDrag(span, id);
        row.appendChild(span);
      }
      // summary of every key on the collapsed row
      const seen = new Set();
      for (const keys of Object.values(tr)) {
        for (const k of keys || []) {
          const key = Math.round(k.t * 1000);
          if (seen.has(key)) continue;
          seen.add(key);
          row.appendChild(el('div', {
            class: 'tl-key',
            style: { left: `${k.t * this.pxPerSec}px` },
            title: `${k.t.toFixed(2)} s`,
          }));
        }
      }
      row.addEventListener('dblclick', (e) => {
        const r = row.getBoundingClientRect();
        this.app.sim.seek((e.clientX - r.left) / this.pxPerSec);
      });
      this.rows.appendChild(row);

      if (!open) continue;
      for (const p of ANIM_PROPS) {
        const keys = tr[p.key] || [];
        this.trackCol.appendChild(el('div', { class: 'tl-track-head sub' }, [
          el('span', { class: 'tname', text: p.label }),
          el('span', {
            class: 'mini-btn', title: isi('Tambah key {channel} di playhead', { channel: p.label }),
            onclick: (e) => {
              e.stopPropagation();
              const v = keys.length ? keys[keys.length - 1].v : p.def;
              this.app.sim.setKey(id, p.key, this.app.sim.time, v, this.app.defaultEase);
              this.app.refreshSim(); this.render();
            },
          }, [icon('key', { size: 12 })]),
        ]));
        const prow = el('div', { class: 'tl-row', style: { width: `${width}px` } });
        for (const k of keys) {
          const node = el('div', {
            class: 'tl-key',
            style: { left: `${k.t * this.pxPerSec}px` },
            title: isi('t {t}d · nilai {v} · {ease}\nSeret untuk memindahkan · Alt-klik untuk menghapus', { t: k.t.toFixed(3), v: Number(k.v).toFixed(3), ease: k.ease || 'smooth' }),
          });
          this._bindKeyDrag(node, id, p.key, k);
          prow.appendChild(node);
        }
        prow.addEventListener('dblclick', (e) => {
          const r = prow.getBoundingClientRect();
          const t = Math.max(0, (e.clientX - r.left) / this.pxPerSec);
          const v = keys.length ? keys[keys.length - 1].v : p.def;
          this.app.sim.setKey(id, p.key, t, v, this.app.defaultEase);
          this.app.refreshSim(); this.render();
        });
        this.rows.appendChild(prow);
      }
    }
    this.updatePlayhead();
  }

  _bindKeyDrag(node, id, prop, key) {
    let drag = null;
    node.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.altKey || e.button === 2) {
        this.app.sim.removeKey(id, prop, key.t);
        this.app.refreshSim(); this.render();
        return;
      }
      node.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, t0: key.t };
      node.classList.add('sel');
    });
    node.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dt = (e.clientX - drag.x) / this.pxPerSec;
      const t = Math.max(0, Math.min(durasiAman(), drag.t0 + dt));
      node.style.left = `${t * this.pxPerSec}px`;
      drag.t = t;
    });
    node.addEventListener('pointerup', () => {
      if (!drag) return;
      node.classList.remove('sel');
      if (drag.t !== undefined && Math.abs(drag.t - drag.t0) > 1e-4) {
        store.edit('Pindahkan keyframe', (d) => {
          const keys = d.sim.tracks[id]?.[prop];
          if (!keys) return;
          const k = keys.find(x => Math.abs(x.t - drag.t0) < 1e-6);
          if (k) { k.t = drag.t; sortTrack(keys); }
        }, { rebuild: false });
        this.app.refreshSim();
      }
      drag = null;
      this.render();
    });
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.app.sim.removeKey(id, prop, key.t);
      this.app.refreshSim(); this.render();
    });
  }

  _bindSpanDrag(span, id) {
    let drag = null;
    span.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      span.setPointerCapture(e.pointerId);
      const item = store.doc.sim.schedule.items[id];
      drag = { x: e.clientX, start: item.start || 0 };
    });
    span.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const t = Math.max(0, drag.start + (e.clientX - drag.x) / this.pxPerSec);
      span.style.left = `${t * this.pxPerSec}px`;
      drag.t = t;
    });
    span.addEventListener('pointerup', () => {
      if (!drag) return;
      if (drag.t !== undefined) {
        store.edit('Pindahkan slot bangun', (d) => { d.sim.schedule.items[id].start = drag.t; }, { rebuild: false });
        this.app.refreshSim();
      }
      drag = null;
      this.render();
    });
  }

  updatePlayhead() {
    const t = this.app.sim.time;
    this.playhead.style.left = `${t * this.pxPerSec}px`;
    this.timeLabel.textContent = `${t.toFixed(2)} s`;
  }
}

function round2(v) { return Math.round(v * 100) / 100; }
