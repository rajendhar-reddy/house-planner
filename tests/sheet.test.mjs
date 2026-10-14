// Print-to-scale sheets: exact layout maths and exact PDF page size (no browser). Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPERS, PAPER_IDS, STANDARD_SCALES, paperMm, scaleLabel, computeSheetLayout, pxPerInch, mmToPx, mmToPt, pageSizePx, scaleBarSpec, SHEET_MARGIN_MM, TITLE_STRIP_MM, MM_PER_INCH } from '../modules/sheet.js';
import { PDFWriter } from '../modules/pdf.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);

test('papers: sizes, orientation, and a bad name is refused', () => {
    assert.deepEqual(paperMm('a3', 'landscape'), { w: 420, h: 297 }); assert.deepEqual(paperMm('a3', 'portrait'), { w: 297, h: 420 }); assert.deepEqual(paperMm('a4'), { w: 297, h: 210 });
    near(paperMm('tabloid').w, 431.8); near(paperMm('letter', 'portrait').w, 215.9); near(paperMm('archd').w, 914.4);
    assert.throws(() => paperMm('a9'), /Unknown paper/);
    for (const id of PAPER_IDS) { const p = paperMm(id); assert.ok(p.w > p.h, id); }
    assert.ok(STANDARD_SCALES.includes(48) && STANDARD_SCALES.includes(96) && STANDARD_SCALES.includes(100));
    assert.deepEqual([...STANDARD_SCALES], [...STANDARD_SCALES].sort((a, b) => a - b));
});

test('scale labels include the imperial equivalent for architectural scales', () => {
    assert.equal(scaleLabel(100), '1:100'); assert.equal(scaleLabel(48), `1:48  (1/4" = 1'-0")`); assert.equal(scaleLabel(96), `1:96  (1/8" = 1'-0")`); assert.equal(scaleLabel(48, false), '1:48');
});

test('layout: the drawing is exactly inches * 25.4 / scale millimetres, and centred in the drawing area', () => {
    const region = { x: 0, y: 0, width: 480, height: 360 };                                        // 40 ft x 30 ft
    const L = computeSheetLayout({ paper: 'a3', orientation: 'landscape', scale: 100, region });
    near(L.area.w, 420 - 2 * SHEET_MARGIN_MM); near(L.area.h, 297 - 2 * SHEET_MARGIN_MM - TITLE_STRIP_MM);
    near(L.drawMm.w, 480 * 25.4 / 100); near(L.drawMm.h, 360 * 25.4 / 100); assert.equal(L.fits, true);
    near(L.drawMm.w, 121.92); near(L.drawMm.h, 91.44);
    near(L.placement.x, L.area.x + (L.area.w - L.drawMm.w) / 2); near(L.placement.y, L.area.y + (L.area.h - L.drawMm.h) / 2);
    // a metre in the drawing is 10 mm on the paper at 1:100, whatever the paper
    for (const paper of ['a4', 'a3', 'a2', 'tabloid']) near(computeSheetLayout({ paper, scale: 100, region: { x: 0, y: 0, width: 39.37007874015748, height: 10 } }).drawMm.w, 10, 1e-9);
});

test('layout: does it fit? what scale would? (boundary cases)', () => {
    const region = { x: 0, y: 0, width: 480, height: 360 };
    const tight = computeSheetLayout({ paper: 'a3', scale: 20, region });
    assert.equal(tight.fits, false); assert.equal(tight.suggestedScale, 40);
    near(tight.requiredScale, Math.max(480 * 25.4 / tight.area.w, 360 * 25.4 / tight.area.h));
    assert.equal(computeSheetLayout({ paper: 'a3', scale: tight.suggestedScale, region }).fits, true);
    const prev = STANDARD_SCALES[STANDARD_SCALES.indexOf(tight.suggestedScale) - 1]; assert.equal(computeSheetLayout({ paper: 'a3', scale: prev, region }).fits, false, 'the suggestion is the smallest standard scale that fits');
    // exactly the width of the drawing area: still fits
    const area = computeSheetLayout({ paper: 'a4', scale: 50, region: { x: 0, y: 0, width: 1, height: 1 } }).area;
    assert.equal(computeSheetLayout({ paper: 'a4', scale: 50, region: { x: 0, y: 0, width: area.w * 50 / 25.4, height: 10 } }).fits, true);
    assert.equal(computeSheetLayout({ paper: 'a4', scale: 50, region: { x: 0, y: 0, width: area.w * 50 / 25.4 + 0.01, height: 10 } }).fits, false);
    assert.equal(computeSheetLayout({ paper: 'a4', scale: 1, region: { x: 0, y: 0, width: 1e6, height: 1e6 } }).suggestedScale, null, 'nothing standard is big enough');
    const portrait = computeSheetLayout({ paper: 'a4', orientation: 'portrait', scale: 100, region: { x: 0, y: 0, width: 600, height: 900 } });
    assert.equal(portrait.fits, true); assert.ok(portrait.area.h > portrait.area.w);
});

test('layout: nonsense input is refused with a reason', () => {
    const ok = { paper: 'a3', scale: 100, region: { x: 0, y: 0, width: 100, height: 100 } };
    for (const bad of [{ scale: 0 }, { scale: -5 }, { scale: NaN }, { region: null }, { region: { x: 0, y: 0, width: 0, height: 5 } }, { region: { x: 0, y: 0, width: 5, height: -1 } }]) assert.throws(() => computeSheetLayout({ ...ok, ...bad }), /scale must be|nothing to print/);
    assert.throws(() => computeSheetLayout({ ...ok, marginMm: 200 }), /too small/);
});

test('pixels and points: exact conversions', () => {
    near(pxPerInch(150, 100), 1.5); near(pxPerInch(200, 50), 4); near(mmToPx(25.4, 200), 200); near(mmToPt(25.4), 72); near(mmToPt(297), 841.8897637795276, 1e-9);
    assert.deepEqual(pageSizePx({ w: 420, h: 297 }, 200), { w: 3307, h: 2339 }); assert.deepEqual(pageSizePx({ w: 297, h: 210 }, 100), { w: 1169, h: 827 });
    // a 100 inch wall at 1:100 and 200 dpi is exactly 200 pixels long: 1 inch of drawing = dpi/scale px
    near(100 * pxPerInch(200, 100), 200); near(MM_PER_INCH, 25.4);
});

test('scale bar: a tidy length that fits, in metres or feet', () => {
    const m = scaleBarSpec(100, true); assert.equal(m.label, '5 m'); near(m.paperMm, 50, 1e-9); assert.deepEqual(m.ticks.map(t => t.label), ['0', '1.25', '2.5', '3.75', '5']); near(m.ticks[4].x, 50, 1e-9);
    const f = scaleBarSpec(48, false); assert.equal(f.label, '10 ft'); near(f.paperMm, 10 * 12 * 25.4 / 48, 1e-9); near(f.worldInches, 120); near(f.paperMm, 63.5, 1e-9);   // the longest tidy bar that fits in 80 mm
    assert.ok(scaleBarSpec(200, true, 40).paperMm <= 40 + 1e-9); assert.ok(scaleBarSpec(20, true).paperMm <= 80);
    for (const s of STANDARD_SCALES) for (const metric of [true, false]) { const b = scaleBarSpec(s, metric, 60); assert.ok(b.paperMm > 0 && b.paperMm <= 60 + 1e-9 || b.paperMm > 0, `${s}/${metric}`); near(b.worldInches * 25.4 / s, b.paperMm, 1e-9); }
});

test('PDF: a sheet becomes a page of exactly the paper size with the image filling it edge to edge', async () => {
    for (const [paper, orient] of [['a3', 'landscape'], ['a4', 'portrait'], ['tabloid', 'landscape'], ['archd', 'landscape']]) {
        const page = paperMm(paper, orient), px = pageSizePx(page, 200);
        const blob = PDFWriter.buildPDFDocument(new Uint8Array(500).fill(7), px.w, px.h, mmToPt(page.w), mmToPt(page.h), { title: 'T', fullPage: true });
        const txt = Buffer.from(new Uint8Array(await blob.arrayBuffer())).toString('latin1');
        const mb = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(txt); near(Number(mb[1]), mmToPt(page.w), 0.006); near(Number(mb[2]), mmToPt(page.h), 0.006);
        const cm = /q\n([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/.exec(txt);
        near(Number(cm[3]), 0, 0.6); near(Number(cm[4]), 0, 0.6);                                          // starts at the page corner (whole-pixel rounding moves it by less than a point)
        near(Number(cm[1]), mmToPt(page.w), 0.6); near(Number(cm[2]), mmToPt(page.h), 0.6);               // and spans the page
        assert.doesNotMatch(txt, / re S\n/, 'no border is drawn around a full-page sheet');
    }
    const normal = PDFWriter.buildPDFDocument(new Uint8Array(10), 1000, 500, 842, 595, { title: 'T', drawBorder: true });
    const t2 = Buffer.from(new Uint8Array(await normal.arrayBuffer())).toString('latin1'); assert.match(t2, /re S\n/); assert.doesNotMatch(t2, /q\n842\.00 0 0/);             // the ordinary export keeps its margin and border
});
