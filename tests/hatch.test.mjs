// Floor-finish hatch tests (no browser). Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { hatchSegments, clipLineToRect, HATCH_TYPES, HATCH_IDS, MAX_SEGMENTS, drawHatch } from '../modules/hatch.js';
import { RoomManager } from '../modules/rooms.js';
import { LayerManager } from '../modules/layers.js';
import { buildDXF, DXF_LAYERS } from '../modules/dxf.js';
import { CommandLine } from '../modules/commands.js';
import { units, UnitSystem } from '../modules/units.js';
import { DEFAULT_SNAP_MODES } from '../modules/snap.js';

units.setSystem(UnitSystem.IMPERIAL);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const R = { x: 10, y: 20, width: 240, height: 168 };
const inside = (s, r = R, eps = 1e-6) => [[s.x1, s.y1], [s.x2, s.y2]].every(([x, y]) => x >= r.x - eps && x <= r.x + r.width + eps && y >= r.y - eps && y <= r.y + r.height + eps);

test('clip: line against rectangle', () => {
    const c = clipLineToRect(0, 0, 1, 0, { x: 10, y: -5, width: 20, height: 10 });
    near(c.x1, 10); near(c.x2, 30); near(c.y1, 0);
    assert.equal(clipLineToRect(0, 100, 1, 0, { x: 10, y: -5, width: 20, height: 10 }), null);               // misses
    assert.equal(clipLineToRect(0, 0, 1, 1, { x: 10, y: -10, width: 10, height: 10 }), null);               // touches only a corner
    const v = clipLineToRect(15, -100, 0, 1, { x: 10, y: -5, width: 20, height: 10 }); near(v.y1, -5); near(v.y2, 5);
});

test('every pattern stays inside the room; "none" and empty rooms give nothing', () => {
    assert.deepEqual(hatchSegments('none', R), []); assert.deepEqual(hatchSegments('bogus', R), []);
    assert.deepEqual(hatchSegments('tiles', { x: 0, y: 0, width: 0, height: 50 }), []);
    for (const t of HATCH_TYPES.filter(t => t.id !== 'none')) {
        const segs = hatchSegments(t.id, R, 1); assert.ok(segs.length > 5, t.id);
        for (const s of segs) assert.ok(inside(s), `${t.id}: ${JSON.stringify(s)}`);
    }
    assert.deepEqual(HATCH_IDS, ['none', 'tiles', 'tiles_diag', 'wood', 'concrete', 'lines']);
});

test('tiles: one line per tile edge; a bigger pattern size means fewer lines', () => {
    const r = { x: 0, y: 0, width: 240, height: 240 };
    const segs = hatchSegments('tiles', r, 1);
    assert.equal(segs.length, 18);                                                                           // 9 vertical + 9 horizontal at 24"
    assert.equal(segs.filter(s => s.x1 === s.x2).length, 9);
    assert.equal(hatchSegments('tiles', r, 2).length, 8);                                                    // 48" tiles: 4 + 4
    assert.ok(hatchSegments('tiles', r, 0.5).length > segs.length);
    assert.equal(hatchSegments('tiles', r, NaN).length, 18); assert.equal(hatchSegments('tiles', r, -3).length, 18);   // nonsense sizes fall back to 100%
});

test('diagonal patterns are really at 45 degrees', () => {
    for (const t of ['tiles_diag', 'lines']) for (const s of hatchSegments(t, R, 1)) near(Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1), 1e-6);
    const both = hatchSegments('tiles_diag', R, 1), one = hatchSegments('lines', R, 1);
    assert.ok(both.some(s => (s.x2 - s.x1) * (s.y2 - s.y1) > 0) && both.some(s => (s.x2 - s.x1) * (s.y2 - s.y1) < 0));     // both directions
    assert.ok(one.every(s => (s.x2 - s.x1) * (s.y2 - s.y1) > 0));                                              // one direction only
});

test('wood: planks across, butt joints staggered from row to row', () => {
    const segs = hatchSegments('wood', { x: 0, y: 0, width: 480, height: 60 }, 1);
    const planks = segs.filter(s => s.y1 === s.y2), joints = segs.filter(s => s.x1 === s.x2);
    assert.equal(planks.length, 9);                                                                          // 10 rows of 6" -> 9 inner lines
    const firstJointX = (row) => joints.filter(j => Math.abs(j.y1 - row * 6) < 1e-9).map(j => j.x1).sort((a, b) => a - b)[0];
    assert.notEqual(firstJointX(1), firstJointX(2)); assert.notEqual(firstJointX(2), firstJointX(3));
    for (const j of joints) near(j.y2 - j.y1, 6, 1e-9);
});

test('concrete: repeatable dots, cached, plausible density', () => {
    const a = hatchSegments('concrete', R, 1), b = hatchSegments('concrete', R, 1);
    assert.equal(a, b);                                                                                      // same cached array
    const other = hatchSegments('concrete', { ...R, height: 268 }, 1);
    assert.ok(a.length > 150 && a.length < 400, `got ${a.length}`);                                           // 24x17 cells of 10", ~70% filled
    assert.notEqual(a.length, other.length);
    for (const s of a) assert.ok(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 1);
});

test('a huge room stays cheap: the cap widens the spacing', () => {
    const t0 = Date.now();
    for (const t of ['tiles', 'tiles_diag', 'lines', 'wood', 'concrete']) {
        const segs = hatchSegments(t, { x: 0, y: 0, width: 200000, height: 200000 }, 0.25);
        assert.ok(segs.length > 0 && segs.length <= MAX_SEGMENTS, `${t}: ${segs.length}`);
    }
    assert.ok(Date.now() - t0 < 1500, 'pattern generation must stay fast');
});

const ctxStub = () => { const log = { lineTo: 0, stroke: 0, clip: 0 }; const c = new Proxy({ measureText: () => ({ width: 5 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), getLineDash: () => [], __log: log },
    { get(t, k) { if (k in t) return t[k]; return (...a) => { if (k in log) log[k]++; }; }, set(t, k, v) { t[k] = v; return true; } }); return c; };

test('rooms draw their finish (and clip polygon rooms); voids and "none" draw none', () => {
    const rm = new RoomManager(); const room = rm.addRoom(100, 100, { name: 'Hall', width: 240, height: 240 });
    const base = ctxStub(); rm.render(base, 2); const plain = base.__log.lineTo;
    room.hatch = 'tiles'; const h = ctxStub(); rm.render(h, 2); assert.ok(h.__log.lineTo >= plain + 18, `${h.__log.lineTo} vs ${plain}`);
    room.hatch = 'none'; const n = ctxStub(); rm.render(n, 2); assert.equal(n.__log.lineTo, plain);
    room.hatch = 'tiles'; room.isVoid = true; const v = ctxStub(); rm.render(v, 2); assert.ok(v.__log.lineTo < h.__log.lineTo);
    room.isVoid = false; room.polygon = [{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 0, y: 240 }]; const p = ctxStub(); rm.render(p, 2); assert.ok(p.__log.clip >= 1, 'polygon rooms clip the pattern');
    const c = ctxStub(); drawHatch(c, [], '#000', 1); assert.equal(c.__log.stroke, 0);
});

test('DXF: the finish becomes lines on the HATCH layer inside the room; not for voids / polygon rooms / hidden layers', () => {
    const lm = new LayerManager(); const rm = new RoomManager(); rm.layers = lm;
    const room = rm.addRoom(100, 100, { name: 'Hall', width: 240, height: 240 }); room.hatch = 'tiles';
    const v = rm.addRoom(500, 100, { name: 'Void', width: 240, height: 240, isVoid: true }); v.hatch = 'tiles';
    const poly = rm.addRoom(900, 100, { name: 'Odd', polygon: [{ x: 800, y: 0 }, { x: 1000, y: 0 }, { x: 800, y: 200 }] }); poly.hatch = 'tiles';
    const ps = { roomManager: rm, layerManager: lm };
    let dxf = buildDXF(ps);
    const hatchLines = [...dxf.matchAll(/0\nLINE\n8\nHATCH\n10\n([-\d.]+)\n20\n([-\d.]+)\n30\n0.0\n11\n([-\d.]+)\n21\n([-\d.]+)/g)].map(m => m.slice(1).map(Number));
    assert.equal(hatchLines.length, 18);
    for (const [x1, y1, x2, y2] of hatchLines) { for (const x of [x1, x2]) assert.ok(x >= -20 && x <= 220 + 1e-6, `x ${x}`); for (const y of [y1, y2]) assert.ok(y <= 20 + 1e-6 && y >= -220 - 1e-6, `y ${y}`); }   // Y is flipped in DXF
    assert.ok(DXF_LAYERS.some(l => l[0] === 'HATCH'));
    const n = Number(/TABLE\n2\nLAYER\n70\n(\d+)\n/.exec(dxf)[1]); assert.equal(n, (dxf.match(/0\nLAYER\n2\n/g) || []).length);
    lm.setVisible('rooms', false); dxf = buildDXF(ps); assert.doesNotMatch(dxf, /8\nHATCH\n/);
});

function appWithRooms() {
    const lm = new LayerManager(); const rm = new RoomManager(); rm.layers = lm; const a = rm.addRoom(0, 0, { width: 120, height: 120 }), b = rm.addRoom(300, 0, { width: 120, height: 120 });
    const app = { layerManager: lm, roomManager: rm, activeTool: 'select', selection: [], history: 0, canvasEngine: { snapModes: { ...DEFAULT_SNAP_MODES } },
        getSelectionItems() { return this.selection; }, saveHistory() { this.history++; }, requestRender() {}, setTool() {} };
    const out = []; const cl = new CommandLine(app, { log: (t, k) => out.push([k || 'info', t]), setPrompt() {} });
    return { app, cl, out, a, b };
}
test('HATCH command: applies to the selected rooms, size in percent, none removes', () => {
    const { app, cl, out, a, b } = appWithRooms();
    cl.submit('hatch'); assert.match(out.at(-1)[1], /HATCH none \| tiles/);
    cl.submit('hatch tiles'); assert.equal(out.at(-1)[0], 'error'); assert.match(out.at(-1)[1], /Select one or more rooms/);
    app.selection = [{ category: 'room', obj: a }, { category: 'room', obj: b }];
    cl.submit('hatch wood 150'); assert.equal(a.hatch, 'wood'); assert.equal(b.hatchScale, 1.5); assert.equal(app.history, 1); assert.match(out.at(-1)[1], /Wood planks applied to 2 rooms/);
    cl.submit('hatch diag'); assert.equal(a.hatch, 'tiles_diag'); assert.equal(a.hatchScale, 1.5, 'size is kept when not given');
    cl.submit('hatch tiles 9'); assert.match(out.at(-1)[1], /25 to 400/); cl.submit('hatch marble'); assert.match(out.at(-1)[1], /Unknown finish/);
    cl.submit('hatch none'); assert.equal(a.hatch, undefined); assert.equal(a.hatchScale, undefined);
});
