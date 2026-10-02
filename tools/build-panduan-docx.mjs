/**
 * Build the Word version of the user guide from docs/PANDUAN.md.
 *
 *   node tools/build-panduan-docx.mjs [output.docx]
 *
 * Writes docs/Panduan-Pengguna-TesserCAD-ID.docx unless another path is given,
 * overwriting it. The output is byte-for-byte deterministic - every archive
 * timestamp is fixed - which is what lets `tools/tests/docs.mjs` rebuild it to
 * a temporary file and fail if the committed document is not exactly what the
 * current docs/PANDUAN.md produces. The binary in the repository is therefore
 * never something anyone has to take on trust.
 *
 * Why this exists rather than a committed document somebody edited by hand:
 * a `.docx` is a ZIP of XML, which means it is a binary as far as this
 * repository is concerned, and a binary nobody can review is the one thing
 * this project consistently refuses to ship. `tools/tests/security.mjs` even
 * fails the build over an executable one. A generated document is a different
 * thing: the text lives in `docs/PANDUAN.md`, where it can be read, diffed and
 * reviewed like anything else, and this file is the only thing that has to be
 * trusted to turn it into Word format. Regenerate and the two agree by
 * construction.
 *
 * Why no library: `docx` from npm would do this in a third of the lines, and
 * this project has exactly one runtime dependency and claims that `npm test`
 * downloads nothing. A document build is not worth changing either of those
 * sentences, and WordprocessingML for headings, tables, lists and code blocks
 * is a small enough surface to write out. Node's own zlib does the archive.
 *
 * What it understands, which is the subset docs/PANDUAN.md actually uses:
 * ATX headings to three levels, paragraphs, pipe tables with a header row,
 * fenced code blocks, bullet and numbered lists, horizontal rules, and the
 * inline forms `**bold**`, `` `code` `` and `[text](url)`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(root, 'docs/PANDUAN.md');
const TARGET = process.argv[2] || join(root, 'docs/Panduan-Pengguna-TesserCAD-ID.docx');

/* ------------------------------------------------------------------- zip */

/**
 * The smallest ZIP writer that produces an archive Word will open.
 *
 * Deflate for everything, no data descriptors, no zip64: the whole document
 * is a few hundred kilobytes, so none of the cases those exist for arise.
 * `crc32` comes from zlib rather than a hand-rolled table, which is both
 * shorter and faster than the version this started as.
 */
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const sum = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(8, 8);            // deflate
    local.writeUInt32LE(0, 10);           // time and date, left at zero
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, deflated);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(0, 12);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(0, 38);           // external attributes
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, dir, end]);
}

/* --------------------------------------------------------------- markdown */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Inline markdown to a list of runs.
 *
 * One pass, because the three forms cannot nest in this document: a split on
 * the alternation keeps the delimiters, so the odd positions are the marked-up
 * pieces and the even ones are plain text.
 */
function runs(text, base = {}) {
  const out = [];
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  for (const part of parts) {
    if (!part) continue;
    let props = { ...base };
    let body = part;
    if (/^\*\*[^*]+\*\*$/.test(part)) { props.bold = true; body = part.slice(2, -2); }
    else if (/^`[^`]+`$/.test(part)) { props.mono = true; body = part.slice(1, -1); }
    else if (/^\[[^\]]+\]\([^)]+\)$/.test(part)) {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      body = m[1];
      // A relative link to another file in the repository is meaningless on
      // paper, so only a real URL is spelled out beside the text.
      if (/^https?:\/\//.test(m[2])) body = `${m[1]} (${m[2]})`;
    }
    // WordprocessingML enforces the order of these children, and a document
    // that gets it wrong is refused outright rather than rendered oddly:
    // rFonts, b, i, color, sz. Built in that order here rather than in the
    // order the flags happen to be read.
    const rPr = [];
    if (props.mono) rPr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
    if (props.bold) rPr.push('<w:b/>');
    if (props.italic) rPr.push('<w:i/>');
    if (props.small) rPr.push('<w:color w:val="555555"/>');
    if (props.mono) rPr.push('<w:sz w:val="19"/>');
    else if (props.small) rPr.push('<w:sz w:val="17"/>');
    out.push(`<w:r>${rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''}`
      + `<w:t xml:space="preserve">${esc(body)}</w:t></w:r>`);
  }
  return out.join('') || '<w:r><w:t/></w:r>';
}

const para = (content, { style, pageBreak, spacing, indent } = {}) => {
  // Same rule as the run properties above: pStyle, pageBreakBefore, spacing,
  // ind, in that order.
  const pPr = [];
  if (style) pPr.push(`<w:pStyle w:val="${style}"/>`);
  if (pageBreak) pPr.push('<w:pageBreakBefore/>');
  if (spacing) pPr.push(`<w:spacing w:before="${spacing[0]}" w:after="${spacing[1]}"/>`);
  if (indent) pPr.push(`<w:ind w:left="${indent}" w:hanging="283"/>`);
  return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${content}</w:p>`;
};

const listPara = (content, numId, level = 0) =>
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr>`
  + `<w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${content}</w:p>`;

/** A pipe table, with the header row shaded and the widths fixed in DXA. */
function table(rows) {
  const TOTAL = 9360;                       // the text width of an A4 page
  const cols = Math.max(...rows.map(r => r.length));
  const width = Math.floor(TOTAL / cols);
  const grid = Array.from({ length: cols }, () => `<w:gridCol w:w="${width}"/>`).join('');
  const body = rows.map((cells, i) => {
    const tcs = Array.from({ length: cols }, (_, c) => {
      const shade = i === 0
        ? '<w:shd w:val="clear" w:color="auto" w:fill="EDF0F4"/>' : '';
      return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade}</w:tcPr>`
        + `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>`
        + `${runs(cells[c] ?? '', i === 0 ? { bold: true } : {})}</w:p></w:tc>`;
    }).join('');
    const header = i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
    return `<w:tr>${header}${tcs}</w:tr>`;
  }).join('');
  return '<w:tbl><w:tblPr><w:tblW w:w="' + TOTAL + '" w:type="dxa"/>'
    + '<w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="C9D1DA"/>`).join('')
    + '</w:tblBorders><w:tblCellMar>'
    + '<w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/>'
    + '</w:tblCellMar></w:tblPr>'
    + `<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`
    + '<w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>';
}

function convert(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let seenChapter = false;
  while (i < lines.length) {
    const line = lines[i];

    if (/^<!--/.test(line)) { while (i < lines.length && !/-->/.test(lines[i])) i++; i++; continue; }
    if (/^\s*$/.test(line) || /^---+$/.test(line)) { i++; continue; }

    // Fenced code
    if (/^```/.test(line)) {
      i++;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      for (const [n, c] of code.entries()) {
        out.push(`<w:p><w:pPr><w:pStyle w:val="Code"/>`
          + (n === 0 ? '<w:spacing w:before="120"/>' : '')
          + `</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>`
          + `<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(c || ' ')}</w:t></w:r></w:p>`);
      }
      continue;
    }

    // Table
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        const cells = lines[i].replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
        if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      out.push(table(rows));
      continue;
    }

    // Headings
    let m = /^(#{1,3}) (.*)$/.exec(line);
    if (m) {
      const level = m[1].length;
      const text = m[2].replace(/\s*\{#.*\}$/, '');
      if (level === 1) out.push(para(runs(text), { style: 'Title' }));
      else if (level === 2) {
        // A page break before every chapter was the first version and it cost
        // about eleven pages of white space across twenty-three chapters, on a
        // document that is meant to be a compact handbook rather than a
        // printed book. The heading carries a rule and generous space before
        // it instead, and only the two reference chapters, which nobody reads
        // in sequence, start on a fresh page.
        const fresh = /^1[67]\. /.test(text);
        out.push(para(runs(text), { style: 'Heading1', pageBreak: fresh && seenChapter }));
        seenChapter = true;
      } else out.push(para(runs(text), { style: 'Heading2' }));
      i++;
      continue;
    }

    // Lists: a run of items, each possibly wrapped over several lines
    if (/^(\s*)([-*]|\d+\.) /.test(line)) {
      while (i < lines.length && /^(\s*)([-*]|\d+\.) /.test(lines[i])) {
        const im = /^(\s*)([-*]|\d+\.) (.*)$/.exec(lines[i]);
        const level = Math.min(1, Math.floor(im[1].length / 2));
        const ordered = /\d/.test(im[2]);
        let text = im[3];
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !/^(\s*)([-*]|\d+\.) /.test(lines[i])) {
          text += ' ' + lines[i].trim();
          i++;
        }
        out.push(listPara(runs(text), ordered ? 2 : 1, level));
      }
      continue;
    }

    // Paragraph: join until a blank line
    const buf = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,3} |\||```|---|[-*] |\d+\. )/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(para(runs(buf.join(' ').trim())));
  }
  return out.join('');
}

/* ----------------------------------------------------------------- parts */

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const md = readFileSync(SOURCE, 'utf8');
const version = /Versi ([0-9.]+)/.exec(md)?.[1] || '';
const holder = /Hak Cipta © (\d{4}) ([^·\n]+)/.exec(md);
const title = 'Panduan Pengguna TesserCAD-ID';

const styles = `${XML}<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="110" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/>
<w:pPr><w:spacing w:after="240"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="52"/><w:color w:val="14314F"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
<w:pPr><w:keepNext/>
<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="C9D1DA"/></w:pBdr>
<w:spacing w:before="320" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="14314F"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
<w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="255070"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/>
<w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F6F8"/>
<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="220"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/>
<w:pPr><w:spacing w:after="80"/><w:contextualSpacing/></w:pPr></w:style>
</w:styles>`;

const numbering = `${XML}<w:numbering ${W}>
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="·"/>
<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="220"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/>
<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="220"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/>
<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="260"/></w:pPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2."/>
<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="260"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const footer = `${XML}<w:ftr ${W} ${R}>
<w:p><w:pPr>
<w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="D8DEE6"/></w:pBdr>
<w:spacing w:before="120" w:after="0"/><w:jc w:val="center"/></w:pPr>
<w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr>
<w:t xml:space="preserve">${esc(title)} ${esc(version)} · Hak Cipta © ${holder ? esc(holder[1] + ' ' + holder[2].trim()) : ''} · halaman </w:t></w:r>
<w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:instrText>PAGE</w:instrText></w:r>
<w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>
</w:p></w:ftr>`;

const document = `${XML}<w:document ${W} ${R}><w:body>${convert(md)}
<w:sectPr>
<w:footerReference w:type="default" r:id="rIdFooter"/>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>
</w:sectPr></w:body></w:document>`;

const files = [
  ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`],
  ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`],
  ['word/_rels/document.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`],
  ['word/document.xml', document],
  ['word/styles.xml', styles],
  ['word/numbering.xml', numbering],
  ['word/footer1.xml', footer],
  ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${esc(title)} ${esc(version)}</dc:title>
<dc:creator>${holder ? esc(holder[2].trim()) : ''}</dc:creator>
<cp:lastModifiedBy>${holder ? esc(holder[2].trim()) : ''}</cp:lastModifiedBy>
<dc:description>Dihasilkan dari docs/PANDUAN.md oleh tools/build-panduan-docx.mjs</dc:description>
<dc:language>id-ID</dc:language>
</cp:coreProperties>`],
  ['docProps/app.xml', `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>TesserCAD-ID tools/build-panduan-docx.mjs</Application>
<Company>${holder ? esc(holder[2].trim()) : ''}</Company>
</Properties>`],
];

writeFileSync(TARGET, zip(files));
const kb = (Buffer.byteLength(readFileSync(TARGET)) / 1024).toFixed(1);
console.log(`wrote ${TARGET.replace(root, '')}  ${kb} KB`);
console.log(`     from docs/PANDUAN.md: ${md.split('\n').length} lines, ${md.split(/\s+/).length} words`);
