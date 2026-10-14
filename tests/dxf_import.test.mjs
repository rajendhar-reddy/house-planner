// DXF import (no browser). Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDXF, convertDXF, guessUnitScale, arcToPoints, mtextToPlain, sanitizeReference, INSUNITS, LIMITS } from '../modules/dxf_import.js';
import { buildDXF } from '../modules/dxf.js';
import { WallManager } from '../modules/walls.js';
import { OpeningManager } from '../modules/openings.js';
import { RoomManager } from '../modules/rooms.js';
import { LayerManager } from '../modules/layers.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const dxf = (...recs) => recs.join('\n') + '\n';
const rec = (type, ...gv) => `0\n${type}\n` + gv.map(([c, v]) => `${c}\n${v}`).join('\n');
const wrap = (entities, header = '') => dxf('0\nSECTION\n2\nHEADER', header, '0\nENDSEC', '0\nSECTION\n2\nENTITIES', ...entities, '0\nENDSEC', '0\nEOF');

const SAMPLE = wrap([
    rec('LINE', [8, 'WALLS'], [10, 0], [20, 0], [30, 0], [11, 5000], [21, 0], [31, 0]),
    rec('LWPOLYLINE', [8, 'WALLS'], [90, 4], [70, 1], [10, 0], [20, 0], [10, 5000], [20, 0], [10, 5000], [20, 4000], [10, 0], [20, 4000]),
    rec('POLYLINE', [8, 'OLD'], [66, 1], [70, 0]) + '\n' + rec('VERTEX', [8, 'OLD'], [10, 1000], [20, 1000]) + '\n' + rec('VERTEX', [8, 'OLD'], [10, 2000], [20, 1000]) + '\n' + rec('VERTEX', [8, 'OLD'], [10, 2000], [20, 2000]) + '\n' + rec('SEQEND', [8, 'OLD']),
    rec('CIRCLE', [8, 'X'], [10, 3000], [20, 2000], [40, 500]),
    rec('ARC', [8, 'X'], [10, 0], [20, 0], [40, 1000], [50, 0], [51, 90]),
    rec('TEXT', [8, 'T'], [10, 100], [20, 200], [40, 250], [1, 'Living room'], [50, 0]),
    rec('MTEXT', [8, 'T'], [10, 300], [20, 400], [40, 200], [1, '{\\fArial|b0;Kitchen}\\Pdoor \\U+00B0 %%d']),
    rec('INSERT', [8, 'B'], [2, 'CHAIR'], [10, 0], [20, 0]),
    rec('SPLINE', [8, 'S'])
], rec('', ) && '9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4');

test('parse: every supported entity, the units header and a report of what was left out', () => {
    const p = parseDXF(SAMPLE);
    const count = (t) => p.entities.filter(e => e.type === t).length;
    assert.deepEqual([count('LINE'), count('POLY'), count('CIRCLE'), count('ARC'), count('TEXT')], [1, 2, 1, 1, 2]);
    assert.equal(p.insunits, 4);
    assert.equal(p.entities.find(e => e.type === 'POLY' && e.closed).pts.length, 4); assert.equal(p.entities.find(e => e.type === 'POLY' && !e.closed).pts.length, 3);
    assert.ok(p.warnings.some(w => /1 INSERT object .*blocks are not expanded/.test(w))); assert.ok(p.warnings.some(w => /1 SPLINE/.test(w)));
    assert.deepEqual([p.extents.minX, p.extents.maxX, p.extents.minY, p.extents.maxY], [-1000, 5000, -1000, 4000]);      // arcs count as full circles here (a safe box for guessing units)
    assert.equal(p.entities.find(e => e.type === 'TEXT' && e.text.startsWith('Living')).height, 250);
    assert.equal(p.entities.filter(e => e.type === 'TEXT')[1].text, 'Kitchen\ndoor \u00b0 \u00b0');
});

test('parse: friendly errors for files that are not usable', () => {
    assert.throws(() => parseDXF(''), /empty/); assert.throws(() => parseDXF('   \n  '), /empty/); assert.throws(() => parseDXF(null), /empty/);
    assert.throws(() => parseDXF('AutoCAD Binary DXF\r\n\u001a\u0000'), /binary DXF/); assert.throws(() => parseDXF('AC1027\u0000\u0000garbage'), /DWG/);
    assert.throws(() => parseDXF('hello world\nthis is not a drawing\n'), /ASCII DXF/);
    assert.throws(() => parseDXF('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n'), /ENTITIES/);
    assert.throws(() => parseDXF(wrap([rec('SPLINE', [8, '0'])])), /No lines, polylines/);
    assert.throws(() => parseDXF(wrap([rec('LINE', [8, '0'], [10, 'x'], [20, 0], [11, 1], [21, 1])])), /No lines/);
    assert.throws(() => parseDXF('x'.repeat(LIMITS.maxBytes + 1)), /larger than 40 MB/);
});

test('parse: Windows line endings, trailing junk, missing layer, odd spacing', () => {
    const win = wrap([rec('LINE', [10, 0], [20, 0], [11, 10], [21, 0])]).replace(/\n/g, '\r\n') + '\r\n\r\n';
    const p = parseDXF(win); assert.equal(p.entities.length, 1); assert.equal(p.entities[0].layer, '0');
    const spaced = wrap([rec('LINE', [8, ' A '], [10, '  1.5 '], [20, ' 2 '], [11, 3], [21, 4])]).replace(/\n(\d+)\n/g, '\n  $1  \n');
    assert.equal(parseDXF(spaced).entities.length, 1);
});

test('convert: units, Y flip, recentring, de-duplication', () => {
    const p = parseDXF(SAMPLE);
    const c = convertDXF(p, { scale: INSUNITS[4], mode: 'reference' });                                      // millimetres
    assert.ok(c.segments.length > 20);
    const xs = c.segments.flatMap(s => [s[0], s[2]]), ys = c.segments.flatMap(s => [s[1], s[3]]);
    near(Math.min(...xs), 0, 0.011); near(Math.min(...ys), 0, 0.011);                                         // the drawing's top-left corner is the origin
    near(Math.max(...xs), c.width, 0.02); near(Math.max(...ys), c.height, 0.02);                              // and width / height describe what was imported
    const line = convertDXF(parseDXF(wrap([rec('LINE', [10, 0], [20, 0], [11, 100], [21, 0]), rec('LINE', [10, 100], [20, 0], [11, 0], [21, 0]), rec('LINE', [10, 5], [20, 5], [11, 5], [21, 5]), rec('LINE', [10, 0], [20, 0], [11, 0], [21, 100])])), { scale: 1 });
    assert.equal(line.segments.length, 2, 'the reversed duplicate and the zero-length line are dropped');
    const up = line.segments.find(s => s[0] === s[2]); assert.deepEqual(up, [0, 100, 0, 0]);                  // the vertical line starts at the bottom (Y 100 down the screen) and ends at the top (Y 0)
    assert.throws(() => convertDXF(p, { scale: 0 }), /units/); assert.throws(() => convertDXF(p, {}), /units/);
});

test('convert: Y is flipped (DXF up -> app down) and "keep position" leaves coordinates alone', () => {
    const p = parseDXF(wrap([rec('LINE', [10, 100], [20, 200], [11, 100], [21, 500])]));
    const a = convertDXF(p, { scale: 1, recenter: false }); assert.deepEqual(a.segments, [[100, -200, 100, -500]]);
    const b = convertDXF(p, { scale: 2, recenter: true }); assert.deepEqual(b.segments, [[0, 600, 0, 0]]);   // the top (highest DXF Y) is at app Y 0
});

test('convert: circles and arcs become chords with the right size; texts are scaled, turned and clamped', () => {
    const circle = arcToPoints(0, 0, 100, 0, 360); near(circle.length, 49, 1); for (const q of circle) near(Math.hypot(q.x, q.y), 100, 1e-9);
    let len = 0; for (let i = 1; i < circle.length; i++) len += Math.hypot(circle[i].x - circle[i - 1].x, circle[i].y - circle[i - 1].y); near(len, 2 * Math.PI * 100, 1.1);
    const arc = arcToPoints(0, 0, 100, 350, 10); near(arc[0].x, 100 * Math.cos(-10 * Math.PI / 180), 1e-9); near(arc.at(-1).y, 100 * Math.sin(10 * Math.PI / 180), 1e-9);   // wraps through 0 degrees
    const p = parseDXF(wrap([rec('LINE', [10, 0], [20, 0], [11, 10], [21, 0]), rec('TEXT', [10, 0], [20, 0], [40, 2.5], [1, 'A'], [50, 90]), rec('TEXT', [10, 1], [20, 1], [40, 1000], [1, 'B'], [50, 0]), rec('TEXT', [10, 1], [20, 1], [1, 'C'])]));
    const t = convertDXF(p, { scale: 12, recenter: false }).texts;
    near(t[0].height, 30); near(t[0].rotation, 270); near(t[1].height, 60); near(t[2].height, 9);              // 90 deg counter-clockwise = 270 clockwise-on-screen; huge text clamped; missing height -> 9
});

test('convert: walls mode and the segment limit', () => {
    const p = parseDXF(wrap([rec('LINE', [10, 0], [20, 0], [11, 100], [21, 0])]));
    const w = convertDXF(p, { scale: 1, mode: 'walls' }); assert.equal(w.walls.length, 1); assert.equal(w.segments.length, 0);
    const many = wrap(Array.from({ length: LIMITS.maxSegments + 500 }, (_, i) => rec('LINE', [10, i], [20, 0], [11, i], [21, 5])));
    const c = convertDXF(parseDXF(many), { scale: 1 }); assert.equal(c.segments.length, LIMITS.maxSegments); assert.ok(c.warnings.some(x => /Only the first/.test(x)));
});

test('units: header codes, mm guess for big drawings, ask for small unitless ones', () => {
    assert.deepEqual(guessUnitScale({ insunits: 4, extents: { width: 10, height: 10 } }), { scale: 1 / 25.4, from: 'file' });
    assert.deepEqual(guessUnitScale({ insunits: 1, extents: { width: 10, height: 10 } }), { scale: 1, from: 'file' });
    assert.equal(guessUnitScale({ insunits: 6, extents: { width: 10, height: 10 } }).scale, 39.37007874015748);
    assert.equal(guessUnitScale({ insunits: null, extents: { width: 12000, height: 8000 } }).from, 'guess-mm');
    assert.equal(guessUnitScale({ insunits: 0, extents: { width: 40, height: 30 } }).from, 'unknown'); assert.equal(guessUnitScale({ insunits: 99, extents: { width: 40, height: 30 } }).scale, null);
});

test('mtext: formatting codes removed, symbols decoded', () => {
    assert.equal(mtextToPlain('{\\fArial|b1;Hello}\\Pworld'), 'Hello\nworld'); assert.equal(mtextToPlain('90%%d'), '90\u00b0'); assert.equal(mtextToPlain('\\U+00E9t\\U+00E9'), '\u00e9t\u00e9');
    assert.equal(mtextToPlain('a\\~b'), 'a b'); assert.equal(mtextToPlain('\\Ltext\\l'), 'text'); assert.equal(mtextToPlain('back\\\\slash'), 'back\\slash');
});

test('ROUND TRIP: what this app exports as DXF imports back to the same coordinates', () => {
    const lm = new LayerManager(); const wm = new WallManager(), om = new OpeningManager(), rm = new RoomManager(); for (const m of [wm, om, rm]) m.layers = lm;
    wm.addWall({ x: 100, y: 200 }, { x: 400, y: 200 }, 9, 'exterior'); wm.addWall({ x: 400, y: 200 }, { x: 400, y: 500 }, 9, 'exterior');
    rm.addRoom(250, 350, { name: 'Hall', width: 200, height: 200 });
    const text = buildDXF({ wallManager: wm, openingManager: om, roomManager: rm, layerManager: lm });
    const p = parseDXF(text);
    assert.ok(p.entities.filter(e => e.type === 'LINE').length >= 8); assert.ok(p.entities.some(e => e.type === 'TEXT' && e.text === 'HALL'));
    const c = convertDXF(p, { scale: 1, recenter: false });
    const has = (x1, y1, x2, y2) => c.segments.some(s => (Math.abs(s[0] - x1) < 0.02 && Math.abs(s[1] - y1) < 0.02 && Math.abs(s[2] - x2) < 0.02 && Math.abs(s[3] - y2) < 0.02) || (Math.abs(s[2] - x1) < 0.02 && Math.abs(s[3] - y1) < 0.02 && Math.abs(s[0] - x2) < 0.02 && Math.abs(s[1] - y2) < 0.02));
    assert.ok(has(100, 200, 400, 200), 'the wall centreline comes back where it was');                        // WALLS_CENTERLINE
    assert.ok(has(100, 195.5, 404.5, 195.5) && has(100, 204.5, 395.5, 204.5), 'both wall faces come back, with the mitred corner');   // 9" thick, joined to the wall that turns down at x = 400
    assert.ok(has(404.5, 195.5, 404.5, 500) && has(395.5, 204.5, 395.5, 500), 'the second wall: faces run from the mitre to its free end at y = 500');
    assert.ok(c.texts.some(t => t.text === 'HALL' && Math.abs(t.x - 250) < 0.02));
    assert.equal(p.warnings.length, 0);
});

test('reference geometry from a project file is checked', () => {
    assert.equal(sanitizeReference(null), null); assert.equal(sanitizeReference({ segments: 'x' }), null); assert.equal(sanitizeReference({ segments: [] }), null);
    const r = sanitizeReference({ name: 'x'.repeat(200), segments: [[0, 0, 1, 1], [1, 2, 3], 'bad', [NaN, 0, 1, 1], [0, 0, 1e9, 1], [5, 5, 6, 6]], visible: false });
    assert.equal(r.segments.length, 2); assert.equal(r.name.length, 80); assert.equal(r.visible, false);
    assert.equal(sanitizeReference({ segments: [[0, 0, 1, 1]] }).visible, true);
});

test('garbage never crashes the parser: it returns or throws a normal Error', () => {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const bits = ['0', 'SECTION', 'ENTITIES', 'LINE', 'ENDSEC', '10', '20', '1.5', 'x', '', '999', 'POLYLINE', 'VERTEX', 'SEQEND', 'CIRCLE', '40', 'TEXT', '1', '-3'];
    for (let n = 0; n < 400; n++) {
        const txt = Array.from({ length: Math.floor(rnd() * 60) }, () => bits[Math.floor(rnd() * bits.length)]).join('\n');
        try { parseDXF(txt); } catch (e) { assert.ok(e instanceof Error && typeof e.message === 'string' && e.message.length > 0, `bad error for ${JSON.stringify(txt).slice(0, 80)}`); }
    }
});
