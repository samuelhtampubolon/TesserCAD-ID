/**
 * Reading Indonesian numbers, sizes and quantities out of a sentence.
 *
 * Both chat features need the same thing from a line of text: the numbers in
 * it, in millimetres, along with what each one was called. `intel/speak.js`
 * already does this for a single shape phrase, and does it well, but it reads
 * one instruction at a time and returns a shape. A conversation needs the
 * layer underneath: split a paragraph into instructions, then pull the
 * quantities out of each without deciding yet what they mean.
 *
 * Indonesian number words are the reason this is not a regular expression.
 * "dua ratus lima puluh" is 250 and "dua setengah" is 2.5, and a drawing
 * office types both, mixed freely with digits and with English. So the lexer
 * folds spelled numbers into values first and only then looks for units,
 * which is also why "delapan lantai" and "8 lantai" come out the same.
 *
 * Nothing here knows about geometry. That keeps it testable on strings alone,
 * and keeps the two planners from growing a private copy each.
 */

/** Digit words, including the contracted forms people actually type. */
const ANGKA = {
  nol: 0, kosong: 0,
  satu: 1, se: 1, sebuah: 1, seorang: 1,
  dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
  sepuluh: 10, sebelas: 11,
  seratus: 100, seribu: 1000,
};

/** Multiplier words. `belas` is the teens: "lima belas" is 15. */
const KALI = { belas: 'belas', puluh: 10, ratus: 100, ribu: 1000, juta: 1000000 };

/** Length units to millimetres. Everything internal is the millimetre. */
export const SATUAN = {
  mm: 1, milimeter: 1, milimeters: 1, millimetre: 1, millimeter: 1,
  cm: 10, sentimeter: 10, centimetre: 10, centimeter: 10,
  m: 1000, meter: 1000, metre: 1000,
  in: 25.4, inci: 25.4, inch: 25.4, inches: 25.4,
  ft: 304.8, kaki: 304.8, feet: 304.8, foot: 304.8,
};

/** Time units to seconds, for the 4D side. */
export const WAKTU = {
  ms: 0.001, milidetik: 0.001,
  s: 1, detik: 1, sec: 1, second: 1, seconds: 1,
  menit: 60, minute: 60, minutes: 60, min: 60,
  jam: 3600, hour: 3600, hours: 3600,
  hari: 86400, day: 86400, days: 86400,
  minggu: 604800, week: 604800, weeks: 604800,
  bulan: 2592000, bulanan: 2592000, month: 2592000,
};

/**
 * Fold spelled-out numbers into digits, left to right.
 *
 * Written as a small state machine rather than a lookup because Indonesian
 * builds numbers by juxtaposition: a digit word followed by a multiplier word
 * multiplies, and the groups then add. "dua ribu tiga ratus lima puluh" walks
 * through as 2·1000 + 3·100 + 5·10.
 */
export function angkaKata(text) {
  const words = String(text).toLowerCase().split(/\s+/);
  const out = [];
  let acc = null;         // the group being built
  let total = null;       // groups already closed by a thousand-or-larger
  let pending = null;     // the digit waiting for its multiplier

  const flush = () => {
    let n = (total || 0) + (acc || 0) + (pending || 0);
    if (total === null && acc === null && pending === null) return;
    out.push(String(round4(n)));
    acc = total = pending = null;
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[.,;:!?]+$/, '');
    if (w === 'setengah' || w === 'separuh') {
      if (pending !== null || acc !== null || total !== null) {
        // "dua setengah" - half added to whatever came before
        pending = (pending ?? 0) + 0.5;
      } else pending = 0.5;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(ANGKA, w)) {
      if (pending !== null) { acc = (acc || 0) + pending; }
      pending = ANGKA[w];
      // The contracted forms are also ordinary words; only treat them as one
      // when a multiplier or another number follows, so "sebuah kotak" stays
      // a sentence rather than becoming "1 kotak" and losing nothing.
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(KALI, w)) {
      const mult = KALI[w];
      if (mult === 'belas') { pending = 10 + (pending ?? 0); continue; }
      const base = pending ?? 1;
      if (mult >= 1000) { total = ((total || 0) + (acc || 0) + base) * mult; acc = null; }
      else { acc = (acc || 0) + base * mult; }
      pending = null;
      continue;
    }
    flush();
    out.push(words[i]);
  }
  flush();
  return out.join(' ');
}

const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * Every number in the text, with the unit that followed it and the word
 * before it. The word before is what lets a planner tell "tebal 8" from
 * "tinggi 8" without a grammar.
 */
export function ukuran(text) {
  const src = angkaKata(text).toLowerCase();
  const found = [];
  const unitAlt = [...Object.keys(SATUAN), ...Object.keys(WAKTU)]
    .sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(`([a-z_]+)?\\s*(-?\\d+(?:[.,]\\d+)?)\\s*(${unitAlt})?\\b`, 'g');
  for (const m of src.matchAll(re)) {
    const before = m[1] || '';
    const value = parseFloat(m[2].replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    const unit = m[3] || null;
    found.push({
      label: before,
      value,
      unit,
      mm: unit && SATUAN[unit] ? value * SATUAN[unit] : value,
      detik: unit && WAKTU[unit] ? value * WAKTU[unit] : null,
      at: m.index,
    });
  }
  return found;
}

/**
 * A dimension run: "120 x 80 x 8", "120 kali 80", "120 by 80".
 * Returned in millimetres, in the order written, because that order is the
 * one the drawing uses and re-ordering it silently is how a part comes out
 * lying on its side.
 */
export function dimensi(text) {
  const src = angkaKata(text).toLowerCase();
  const num = '(-?\\d+(?:[.,]\\d+)?)\\s*(mm|cm|meter|metre|m|inci|inch|in|kaki|ft)?';
  const sep = '\\s*(?:x|×|\\*|kali|by)\\s*';
  const m = src.match(new RegExp(`${num}${sep}${num}(?:${sep}${num})?`));
  if (!m) return null;
  const nums = [];
  for (let i = 1; i <= 5; i += 2) {
    if (m[i] === undefined) continue;
    nums.push(parseFloat(m[i].replace(',', '.')) * (SATUAN[m[i + 1]] ?? 1));
  }
  if (nums.length < 2) return null;
  // The span lets a caller blank these numbers out, so "denah 9 m kali 7 m"
  // does not also answer a field whose keyword happens to sit in front of it.
  return Object.assign(nums, { span: [m.index, m.index + m[0].length], src });
}

/** `text` with a dimension run blanked out, so named fields read what is left. */
export function tanpaDimensi(text) {
  const d = dimensi(text);
  if (!d) return angkaKata(text).toLowerCase();
  const [a, b] = d.span;
  return d.src.slice(0, a) + ' '.repeat(b - a) + d.src.slice(b);
}

/** The named quantity after a keyword: `nilai('tebal', 'pelat tebal 8 mm')` is 8. */
export function nilai(keyword, text, { mm = true } = {}) {
  const src = angkaKata(text).toLowerCase();
  const esc = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^a-z])${esc}(?![a-z])\\s*(?:=|:|jadi|menjadi|ke|adalah|sebesar)?\\s*(-?\\d+(?:[.,]\\d+)?)\\s*(mm|cm|meter|metre|m|inci|inch|in|kaki|ft)?`);
  const m = src.match(re);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return mm ? v * (SATUAN[m[2]] ?? 1) : v;
}

/** A count: "6 lubang", "enam lubang", "x6", "6 buah". */
export function jumlah(nounAlt, text) {
  const src = angkaKata(text).toLowerCase();
  const counter = '(?:buah|lubang|unit|batang|titik|biji|set|pcs|keping|bentang)?';
  const m = src.match(new RegExp(`(\\d+)\\s*${counter}\\s*(?:${nounAlt})(?![a-z])`))
    || src.match(new RegExp(`(?:^|[^a-z])(?:${nounAlt})(?![a-z])\\s*(?:sebanyak\\s*)?(?:x\\s*)?(\\d+)`));
  return m ? Math.round(parseFloat(m[1])) : null;
}

/**
 * Split a paragraph into instructions.
 *
 * People type a whole brief in one go - "buat pelat 200x120 tebal 10, lalu
 * bor 6 lubang M8, terus kasih fillet 5" - and each clause is a separate
 * operation. Splitting on the connectives rather than on punctuation alone is
 * what makes that work, since the commas are often missing.
 */
export function pecah(text) {
  return String(text)
    .split(/\s*(?:[;\n]|,\s*(?=lalu|terus|kemudian|setelah itu|habis itu)|\b(?:lalu|terus|kemudian|setelah itu|habis itu|and then|then)\b)\s*/i)
    .map(s => s.trim())
    .filter(s => s.length > 1);
}

/** Does the text contain any of these words, as whole words? */
export function ada(text, words) {
  const src = ` ${String(text).toLowerCase()} `;
  return words.some(w => src.includes(` ${w} `) || src.includes(` ${w},`) || src.includes(` ${w}.`));
}

/** The first of `words` present in the text, or null. */
export function pertama(text, words) {
  const src = ` ${String(text).toLowerCase()} `;
  for (const w of words) if (src.includes(` ${w} `) || src.includes(` ${w},`) || src.includes(` ${w}.`)) return w;
  return null;
}

/**
 * A pair stated with a conjunction: "sayap 150 dan 100".
 *
 * Recipes with two of the same thing - two flange lengths, two wing lengths -
 * are described that way in Indonesian far more often than as "150 x 100", and
 * without this the second field silently takes the first field's number.
 */
export function pasangan(keyword, text, { mm = true } = {}) {
  const src = angkaKata(text).toLowerCase();
  const esc = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const num = '(-?\\d+(?:[.,]\\d+)?)\\s*(mm|cm|meter|metre|m|inci|inch|in)?';
  const re = new RegExp(`(?:^|[^a-z])${esc}(?![a-z])\\s*(?:=|:)?\\s*${num}\\s*(?:dan|&|serta|,)\\s*${num}`);
  const m = src.match(re);
  if (!m) return null;
  const conv = (v, u) => parseFloat(v.replace(',', '.')) * (mm ? (SATUAN[u] ?? 1) : 1);
  return [conv(m[1], m[2]), conv(m[3], m[4])];
}

/** An ISO metric bolt callout: "M12", "baut m10", "M 16". */
export function baut(text) {
  const m = String(text).toLowerCase().match(/(?:^|[^a-z0-9])m\s?(\d+(?:[.,]\d+)?)\b/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

/**
 * A quantity written before its unit word: "120 rpm", "24 fps", "0,5 hz".
 *
 * `nilai()` reads "rpm 120", which is how a form is labelled; this reads the
 * order people speak in. Both exist because both turn up in the same sentence.
 */
export function satuanNilai(unit, text) {
  const src = angkaKata(text).toLowerCase();
  const esc = String(unit).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = src.match(new RegExp(`(-?\\d+(?:[.,]\\d+)?)\\s*${esc}(?![a-z])`));
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

/** The first length in the text, in millimetres, whatever introduced it. */
export function panjangPertama(text) {
  const hit = ukuran(text).find(u => u.unit && SATUAN[u.unit]) || ukuran(text)[0];
  return hit ? hit.mm : null;
}
