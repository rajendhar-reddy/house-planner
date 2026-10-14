// PDF writer tests (no browser). Run:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFWriter, pdfTextString } from '../modules/pdf.js';

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

async function makePdf(meta = {}) {
    const jpeg = new Uint8Array(1000).map((_, i) => i % 251);     // stand-in for JPEG bytes
    const blob = PDFWriter.buildPDFDocument(jpeg, 400, 300, 595.28, 420, meta);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), jpeg };
}

test('pdf text strings: ASCII is escaped, anything else is UTF-16BE with BOM', () => {
    assert.equal(pdfTextString('Plan A'), '(Plan A)');
    assert.equal(pdfTextString('Plan (A) \\ B'), '(Plan \\(A\\) \\\\ B)');
    assert.equal(pdfTextString('a\nb'), '(a b)');
    assert.equal(pdfTextString(''), '()');
    assert.equal(pdfTextString(null), '()');
    assert.equal(pdfTextString('\u0915'), '<FEFF0915>');
    assert.equal(pdfTextString('Caf\u00e9'), '<FEFF004300610066 00E9>'.replace(' ', ''));
});

test('pdf: cross-reference table points at every object, byte for byte', async () => {
    for (const meta of [{}, { title: 'Plan', client: 'Client' }, { title: 'Sri \u0915\u0937\u094d\u0923 \u2013 Plan (G+1)', client: 'R\u00e9sidence', author: '\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41' }]) {
        const { bytes } = await makePdf(meta);
        const txt = latin1(bytes);
        assert.ok(txt.startsWith('%PDF-1.4\n'));
        assert.ok(txt.trimEnd().endsWith('%%EOF'));
        const sx = Number(/startxref\n(\d+)\n%%EOF/.exec(txt)[1]);
        assert.equal(txt.slice(sx, sx + 4), 'xref', 'startxref must point at the xref keyword');
        const m = /xref\n0 (\d+)\n/.exec(txt.slice(sx));
        const count = Number(m[1]);
        const entries = txt.slice(sx + m[0].length).split('\r\n').slice(0, count);
        assert.equal(entries[0], '0000000000 65535 f');
        for (let n = 1; n < count; n++) {
            assert.match(entries[n], /^\d{10} 00000 n$/);                     // exactly 20 bytes with CRLF
            const off = Number(entries[n].slice(0, 10));
            assert.ok(txt.slice(off).startsWith(`${n} 0 obj\n`), `object ${n} is not at its xref offset`);
        }
        assert.match(txt, new RegExp(`/Size ${count} /Root 1 0 R /Info 6 0 R`));
    }
});

test('pdf: stream lengths are exact and the image bytes are embedded unchanged', async () => {
    const { bytes, jpeg } = await makePdf({ title: 'T' });
    const txt = latin1(bytes);
    const img = /\/Length (\d+) >>\nstream\n/.exec(txt.slice(txt.indexOf('/Subtype /Image')));
    assert.equal(Number(img[1]), jpeg.length);
    const start = txt.indexOf('/Subtype /Image') + txt.slice(txt.indexOf('/Subtype /Image')).indexOf('stream\n') + 7;
    assert.deepEqual([...bytes.slice(start, start + jpeg.length)], [...jpeg]);
    assert.equal(txt.slice(start + jpeg.length, start + jpeg.length + 17), '\nendstream\nendobj');
    const c = /<< \/Length (\d+) >>\nstream\n/.exec(txt);
    const cs = txt.indexOf(c[0]) + c[0].length;
    assert.equal(txt.slice(cs + Number(c[1]), cs + Number(c[1]) + 10), '\nendstream');
});

test('pdf: a non-Latin title is stored as UTF-16BE, readable by a viewer', async () => {
    const title = 'Sri \u0915\u0937\u094d\u0923 (G+1)';
    const { bytes } = await makePdf({ title });
    const txt = latin1(bytes);
    const m = /\/Title <FEFF([0-9A-F]+)>/.exec(txt);
    assert.ok(m, 'title should be a UTF-16BE hex string');
    const decoded = Buffer.from(m[1], 'hex').swap16().toString('utf16le');
    assert.equal(decoded, title);
});

test('pdf: page geometry', async () => {
    const { bytes } = await makePdf();
    const txt = latin1(bytes);
    assert.match(txt, /\/MediaBox \[0 0 595\.28 420\.00\]/);
    assert.match(txt, /\/Filter \/DCTDecode/);
});
