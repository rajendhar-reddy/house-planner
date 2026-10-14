// DXF writer tests (no browser). Run:  node --test tests/
// There is no CAD program in the test environment, so a strict structural validator stands in
// for "does a DXF reader accept this file?". It is NOT a substitute for opening the file in CAD.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDXF, dxfText, DXF_LAYERS } from '../modules/dxf.js';
import { units, UnitSystem } from '../modules/units.js';
import { WallManager } from '../modules/walls.js';
import { OpeningManager } from '../modules/openings.js';
import { RoomManager } from '../modules/rooms.js';
import { ColumnManager } from '../modules/columns.js';
import { FurnitureManager } from '../modules/furniture.js';
import { DimensionManager } from '../modules/dimensions.js';
import { StairManager } from '../modules/stairs.js';
import { RoadManager } from '../modules/roads.js';
import { PlotManager } from '../modules/plot.js';
import { SlabManager } from '../modules/slab.js';

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);

function project() {
    units.setSystem(UnitSystem.IMPERIAL);
    return {
        wallManager: new WallManager(), openingManager: new OpeningManager(), roomManager: new RoomManager(),
        columnManager: new ColumnManager(), furnitureManager: new FurnitureManager(),
        dimensionManager: new DimensionManager(), stairManager: new StairManager(), roadManager: new RoadManager(),
        plotManager: new PlotManager(), slabManager: new SlabManager()
    };
}

/** Strict structural parse: returns { entities:[{type, codes:Map-ish array}], layers:[], ... } or throws. */
function parseDXF(text) {
    assert.ok(/^[\x00-\x7F]*$/.test(text), 'file must be pure ASCII');
    const lines = text.split('\n');
    assert.equal(lines.pop(), '', 'file must end with a newline');
    assert.equal(lines.length % 2, 0, 'group code / value lines must come in pairs');
    const pairs = [];
    for (let i = 0; i < lines.length; i += 2) {
        assert.match(lines[i], /^\s*\d+$/, `group code expected at line ${i + 1}, got "${lines[i]}"`);
        pairs.push([parseInt(lines[i], 10), lines[i + 1]]);
    }
    assert.deepEqual(pairs[pairs.length - 1], [0, 'EOF']);

    const sections = {}; let cur = null, name = null;
    for (let i = 0; i < pairs.length; i++) {
        const [c, v] = pairs[i];
        if (c === 0 && v === 'SECTION') { assert.equal(cur, null, 'nested SECTION'); name = pairs[++i][1]; cur = []; sections[name] = cur; continue; }
        if (c === 0 && v === 'ENDSEC') { assert.notEqual(cur, null, 'ENDSEC without SECTION'); cur = null; continue; }
        if (c === 0 && v === 'EOF') { assert.equal(cur, null, 'EOF inside a section'); continue; }
        assert.notEqual(cur, null, `data outside any section at pair ${i}`);
        cur.push([c, v]);
    }
    assert.deepEqual(Object.keys(sections), ['HEADER', 'TABLES', 'ENTITIES']);

    // TABLES: every TABLE closed, declared count == records
    const t = sections.TABLES; const tables = {}; let tb = null;
    for (const [c, v] of t) {
        if (c === 0 && v === 'TABLE') { tb = { declared: null, records: [], name: null }; continue; }
        if (c === 0 && v === 'ENDTAB') { tables[tb.name] = tb; tb = null; continue; }
        if (tb && tb.name === null && c === 2) { tb.name = v; continue; }
        if (tb && tb.declared === null && c === 70) { tb.declared = parseInt(v, 10); continue; }
        if (tb && c === 0) tb.records.push({ type: v, items: [] });
        else if (tb && tb.records.length) tb.records[tb.records.length - 1].items.push([c, v]);
    }
    assert.equal(tb, null, 'unterminated TABLE');
    for (const [n, x] of Object.entries(tables)) assert.equal(x.declared, x.records.length, `table ${n}: declared ${x.declared} but has ${x.records.length}`);
    const layerNames = new Set(tables.LAYER.records.map(r => r.items.find(i => i[0] === 2)[1]));
    assert.ok(tables.LTYPE.records.some(r => r.items.some(i => i[0] === 2 && i[1] === 'CONTINUOUS')), 'CONTINUOUS linetype must be defined');

    // ENTITIES
    const entities = []; let e = null;
    for (const [c, v] of sections.ENTITIES) {
        if (c === 0) { e = { type: v, items: [] }; entities.push(e); } else e.items.push([c, v]);
    }
    const get = (ent, code) => (ent.items.find(i => i[0] === code) || [])[1];
    const getNum = (ent, code) => { const v = get(ent, code); assert.notEqual(v, undefined, `${ent.type} missing code ${code}`); const n = Number(v); assert.ok(Number.isFinite(n), `${ent.type} code ${code} not numeric: ${v}`); return n; };
    for (const ent of entities) {
        assert.ok(['LINE', 'TEXT'].includes(ent.type), `unexpected entity ${ent.type}`);
        assert.ok(layerNames.has(get(ent, 8)), `layer "${get(ent, 8)}" is not declared in the LAYER table`);
        if (ent.type === 'LINE') for (const c of [10, 20, 30, 11, 21, 31]) getNum(ent, c);
        if (ent.type === 'TEXT') {
            for (const c of [10, 20, 30, 11, 21, 31, 50]) getNum(ent, c);
            assert.ok(getNum(ent, 40) > 0, 'TEXT height must be positive');
            assert.ok((get(ent, 1) || '').length > 0, 'TEXT value must not be empty');
        }
    }
    const lines_ = entities.filter(x => x.type === 'LINE').map(x => ({ layer: get(x, 8), a: { x: getNum(x, 10), y: getNum(x, 20) }, b: { x: getNum(x, 11), y: getNum(x, 21) } }));
    const texts = entities.filter(x => x.type === 'TEXT').map(x => ({ layer: get(x, 8), value: get(x, 1), h: getNum(x, 40), rot: getNum(x, 50), x: getNum(x, 10), y: getNum(x, 20) }));
    return { layerNames, tables, lines: lines_, texts };
}

const onLayer = (d, layer) => d.lines.filter(l => l.layer === layer);
const extents = (ls) => { const xs = ls.flatMap(l => [l.a.x, l.b.x]), ys = ls.flatMap(l => [l.a.y, l.b.y]); return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), minX: Math.min(...xs), maxY: Math.max(...ys) }; };

test('dxf: an empty project is still a valid file', () => {
    const d = parseDXF(buildDXF(project()));
    assert.equal(d.lines.length, 0); assert.equal(d.texts.length, 0);
    assert.equal(d.tables.LAYER.records.length, DXF_LAYERS.length);
});

test('dxf: walls are drawn with real thickness; centreline on its own layer; Y is flipped', () => {
    const p = project();
    p.wallManager.addWall({ x: 0, y: 100 }, { x: 200, y: 100 }, 10, 'exterior');
    const d = parseDXF(buildDXF(p));
    const faces = onLayer(d, 'WALLS_EXTERIOR');
    assert.equal(faces.length, 4);
    const e = extents(faces); near(e.w, 200); near(e.h, 10);
    const cl = onLayer(d, 'WALLS_CENTERLINE'); assert.equal(cl.length, 1);
    near(cl[0].a.y, -100);                                      // y axis flipped for CAD
});

test('dxf: a door in a VERTICAL wall is oriented along that wall (was always horizontal)', () => {
    const p = project();
    const w = p.wallManager.addWall({ x: 50, y: 0 }, { x: 50, y: 200 }, 9, 'exterior');
    p.openingManager.addOpening(w.id, 0.5, { type: 'door', width: 36 });
    const d = parseDXF(buildDXF(p));
    const door = onLayer(d, 'DOORS');
    assert.equal(door.length, 5);                               // 4 box edges + axis
    const e = extents(door); near(e.w, 9); near(e.h, 36);       // long side runs along y
    const axis = door.find(l => Math.abs(l.a.x - l.b.x) < 1e-6 && Math.abs(l.a.y - l.b.y) > 30);
    assert.ok(axis, 'axis line must be vertical');
});

test('dxf: a window in a diagonal wall is rotated with it', () => {
    const p = project();
    const w = p.wallManager.addWall({ x: 0, y: 0 }, { x: 200, y: 200 }, 9, 'exterior');
    p.openingManager.addOpening(w.id, 0.5, { type: 'window', width: 48 });
    const win = onLayer(parseDXF(buildDXF(p)), 'WINDOWS');
    const axis = win[win.length - 1];
    near(Math.hypot(axis.b.x - axis.a.x, axis.b.y - axis.a.y), 48);
    near(Math.abs(axis.b.x - axis.a.x), Math.abs(axis.b.y - axis.a.y));     // 45 degrees
});

test('dxf: furniture keeps its rotation', () => {
    const p = project();
    p.furnitureManager.addItem('bed_king', 100, 100, 90);
    const it = p.furnitureManager.items[0];
    const d = parseDXF(buildDXF(p));
    const e = extents(onLayer(d, 'FURNITURE'));
    near(e.w, it.height); near(e.h, it.width);                  // swapped by the 90 degree turn
});

test('dxf: rooms carry name, dimensions and area as TEXT; show flags are respected', () => {
    const p = project();
    p.roomManager.addRoom(100, 100, { name: 'Kitchen', width: 144, height: 108 });
    p.roomManager.addRoom(400, 100, { name: 'Store', width: 72, height: 72, showArea: false, showDimensions: false });
    const d = parseDXF(buildDXF(p));
    const t = d.texts.filter(x => x.layer === 'ROOMS').map(x => x.value);
    assert.ok(t.includes('KITCHEN')); assert.ok(t.includes("12' x 9'")); assert.ok(t.includes('108.0 Sq. Ft.'));
    assert.ok(t.includes('STORE'));
    assert.ok(!t.some(v => /Sq\. Ft\./.test(v) && v !== '108.0 Sq. Ft.'), 'Store hides its area');
    assert.equal(onLayer(d, 'ROOMS').length, 8);                // two outlines
    for (const x of d.texts.filter(x => x.layer === 'ROOMS')) assert.ok(x.h >= 3 && x.h <= 8);
});

test('dxf: dimensions export line, extension lines and measured text', () => {
    const p = project();
    p.dimensionManager.addDimension({ x: 0, y: 0 }, { x: 120, y: 0 }, 24);
    p.dimensionManager.addDimension({ x: 0, y: 0 }, { x: 0, y: 60 }, 24, 'CUSTOM');
    const d = parseDXF(buildDXF(p));
    assert.equal(onLayer(d, 'DIMENSIONS').length, 6);
    const vals = d.texts.map(t => t.value);
    assert.ok(vals.includes("10'")); assert.ok(vals.includes('CUSTOM'));
});

test('dxf: non-Latin / special text is ASCII-escaped, never breaks the file', () => {
    assert.equal(dxfText('Pooja \u0915\u0915'), 'Pooja \\U+0915\\U+0915');
    assert.equal(dxfText('a\nb\r\nc'), 'a b c');
    assert.equal(dxfText('50%%d'), '50% %d');
    assert.equal(dxfText(null), '');
    const p = project();
    p.roomManager.addRoom(0, 0, { name: 'Pooja \u0915\u0915\n"x" & <y>', width: 120, height: 120 });
    const d = parseDXF(buildDXF(p));                            // parseDXF asserts pure ASCII
    assert.ok(d.texts.some(t => t.value.includes('\\U+0915')));
});

test('dxf: every layer used by every exporter branch is declared', () => {
    const p = project();
    p.plotManager.createRectangularPlot(0, 0, 600, 600);
    p.roadManager.addRoad({ side: 'front' });
    const w = p.wallManager.addWall({ x: 50, y: 50 }, { x: 300, y: 50 }, 9, 'exterior');
    p.wallManager.addWall({ x: 300, y: 50 }, { x: 300, y: 300 }, 9, 'exterior');
    p.wallManager.addWall({ x: 300, y: 300 }, { x: 50, y: 300 }, 9, 'exterior');
    p.wallManager.addWall({ x: 50, y: 300 }, { x: 50, y: 50 }, 9, 'exterior');
    p.wallManager.addWall({ x: 100, y: 50 }, { x: 100, y: 300 }, 4.5, 'interior');
    p.wallManager.addWall({ x: 0, y: 0 }, { x: 100, y: 0 }, 6, 'compound');
    p.openingManager.addOpening(w.id, 0.3, { type: 'door' }); p.openingManager.addOpening(w.id, 0.6, { type: 'window' });
    p.openingManager.addOpening(w.id, 0.9, { type: 'gate', width: 40 });
    p.columnManager.addColumn(60, 60, { showLabel: true, name: 'C1' });
    p.stairManager.addStair({ x: 200, y: 200, type: 'dogleg' });
    p.furnitureManager.addItem('tree_palm', 20, 20, 0); p.furnitureManager.addItem('sofa_3p', 150, 150, 30);
    p.roomManager.addRoom(150, 150, { name: 'Hall' });
    p.dimensionManager.addDimension({ x: 50, y: 50 }, { x: 300, y: 50 });
    p.slabManager.enabled = true;
    const d = parseDXF(buildDXF(p));                            // throws if any layer is undeclared
    const used = new Set([...d.lines.map(l => l.layer), ...d.texts.map(t => t.layer)]);
    for (const L of ['ROADS', 'PLOT', 'WALLS_EXTERIOR', 'WALLS_INTERIOR', 'WALLS_COMPOUND', 'DOORS', 'WINDOWS', 'GATES', 'COLUMNS',
        'STAIRS', 'LANDSCAPE', 'FURNITURE', 'ROOMS', 'DIMENSIONS', 'SLAB_PROJECTION']) assert.ok(used.has(L), `${L} not exercised`);
});

test('dxf: rotated text angle is mirrored with the Y flip', () => {
    const p = project();
    p.roomManager.addRoom(100, 100, { name: 'Tilted', width: 144, height: 144, rotation: 90 });
    const t = parseDXF(buildDXF(p)).texts.find(x => x.value === 'TILTED');
    near(t.rot, 270);                                           // screen +90 (clockwise) == CAD 270
});
