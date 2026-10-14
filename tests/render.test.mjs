// Render smoke tests: every furniture/landscape type, stair type, door/window/gate subtype, etc. is drawn
// against a recording canvas stub. Catches exceptions and "draws nothing" bugs without a browser.
// Run:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import { FURNITURE_CATALOG, FurnitureManager } from '../modules/furniture.js';
import { STAIR_PRESETS, Stair } from '../modules/stairs.js';
import { WallManager } from '../modules/walls.js';
import { OpeningManager } from '../modules/openings.js';
import { RoomManager, ROOM_PRESETS } from '../modules/rooms.js';
import { ColumnManager, COLUMN_PRESETS } from '../modules/columns.js';
import { DimensionManager } from '../modules/dimensions.js';
import { RoadManager, ROAD_PRESETS } from '../modules/roads.js';
import { PlotManager } from '../modules/plot.js';
import { SlabManager } from '../modules/slab.js';

/** A canvas 2D context stand-in that records what was drawn and fails on non-finite numbers. */
function makeCtx() {
    const log = { draws: 0, calls: 0, props: {}, sig: [], fillRects: [] };
    const DRAW = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage']);
    const target = {
        measureText: (t) => ({ width: String(t).length * 5 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        createPattern: () => ({}),
        getLineDash: () => [],
        canvas: { width: 800, height: 600 },
    };
    const ctx = new Proxy(target, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === '__log') return log;
            return (...args) => {
                log.calls++; if (DRAW.has(k)) log.draws++;
                log.sig.push(String(k));
                if (k === 'fillRect') log.fillRects.push(t.fillStyle);
                for (const a of args) if (typeof a === 'number') assert.ok(Number.isFinite(a), `${String(k)}() got a non-finite number: ${a}`);
            };
        },
        set(t, k, v) { t[k] = v; log.props[k] = v; return true; }
    });
    return ctx;
}

test('furniture: every catalog item draws something, at 0/90/200 degrees, selected or not', () => {
    const fm = new FurnitureManager();
    assert.ok(FURNITURE_CATALOG.length > 20);
    const ids = FURNITURE_CATALOG.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, 'catalog ids must be unique');
    for (const c of FURNITURE_CATALOG) {
        assert.ok(c.width > 0 && c.height > 0, `${c.id} has no size`);
        for (const rot of [0, 90, 200]) {
            const item = fm.addItem(c.id, 100, 100, rot);
            for (const sel of [false, true]) {
                const ctx = makeCtx();
                fm.renderSingleItem(ctx, item, 2, sel);
                assert.ok(ctx.__log.draws > 0, `${c.id} (rot ${rot}, selected ${sel}) drew nothing`);
            }
        }
    }
});

test('furniture: every catalog item has its own symbol (none falls back to the generic box with an X)', () => {
    const fm = new FurnitureManager();
    const signature = (id, w, h) => { const it = fm.addItem(id, 0, 0, 0); it.width = w; it.height = h; const c = makeCtx(); fm.renderSingleItem(c, it, 2, false); return c.__log.sig.join(','); };
    const generic = signature('does_not_exist', 40, 40);
    for (const c of FURNITURE_CATALOG) assert.notEqual(signature(c.id, c.width, c.height), generic, `${c.id} is drawn with the generic fallback`);
});

test('furniture: an unknown type still renders (no crash)', () => {
    const fm = new FurnitureManager();
    const item = fm.addItem('does_not_exist', 0, 0, 0);
    fm.renderSingleItem(makeCtx(), item, 1, false);
});

test('stairs: every preset type renders and its hit area matches its bounds', () => {
    assert.ok(STAIR_PRESETS.length > 0);
    for (const type of ['straight', 'dogleg', 'open_well', 'l_shape', 'spiral']) {
        for (const treads of [10, 13, 16, 17, 24]) for (const rotation of [0, 90, 180, 270]) {
            const s = new Stair({ type, treads, rotation, landingSteps: type === 'dogleg' ? 3 : 0, x: 50, y: 50 });
            const ctx = makeCtx(); s.render(ctx, 2, false);
            assert.ok(ctx.__log.draws > 0, `${type}/${treads}/${rotation} drew nothing`);
            const b = s.getBounds();
            assert.ok(b.width > 0 && b.height > 0);
            assert.ok(s.hitTest(s.x, s.y), `${type}: centre must hit`);
        }
    }
});

test('openings: every door/window/gate subtype renders, on horizontal and vertical walls, both flips', () => {
    const subtypes = { door: ['single', 'double', 'sliding', 'archway'], window: ['standard', 'sliding', 'fixed'], gate: ['sliding', 'swing', 'double'] };
    for (const style of ['blueprint', 'clean']) for (const [x2, y2] of [[200, 0], [0, 200]]) {
        const wm = new WallManager(); const om = new OpeningManager();
        const w = wm.addWall({ x: 0, y: 0 }, { x: x2, y: y2 }, 9, 'exterior');
        for (const [type, subs] of Object.entries(subtypes)) for (const subtype of subs) for (const flip of [false, true]) {
            om.addOpening(w.id, 0.5, { type, subtype, flipHinge: flip, flipSwing: flip, width: type === 'gate' ? 120 : 40, showLabel: true, showMeasurement: true });
        }
        const ctx = makeCtx(); om.render(ctx, 2, wm, style);
        assert.ok(ctx.__log.draws > 50);
        const want = style === 'clean' ? '#ffffff' : '#0f172a';
        assert.equal(om.cutoutColor, want);
        const cutouts = ctx.__log.fillRects.filter(c => c === want).length;
        assert.ok(cutouts >= om.openings.length, `expected a cut-out per opening, got ${cutouts} for ${om.openings.length}`);
    }
});

test('rooms, columns, dimensions, walls: all presets render', () => {
    const rm = new RoomManager(); const cm = new ColumnManager(); const dm = new DimensionManager(); const wm = new WallManager();
    for (const p of ROOM_PRESETS) for (const tagStyle of ['pill', 'clean']) rm.addRoom(100, 100, { name: p.name, width: p.defaultW, height: p.defaultH, tagStyle, rotation: 45 });
    rm.addRoom(0, 0, { name: 'Void', isVoid: true }); rm.addRoom(0, 0, { name: 'Tall', isDoubleHeight: true, dottedSlabLine: true });
    for (const p of COLUMN_PRESETS) cm.addColumn(10, 10, { width: p.width, depth: p.depth, showLabel: true });
    dm.addDimension({ x: 0, y: 0 }, { x: 150, y: 90 }, 24); dm.addDimension({ x: 0, y: 0 }, { x: 0, y: 90 }, -24, 'CUSTOM');
    for (const type of ['exterior', 'interior', 'compound']) wm.addWall({ x: 0, y: 0 }, { x: 100, y: 40 }, 9, type);
    for (const style of ['blueprint', 'clean']) {
        for (const draw of [() => rm.render(makeCtx(), 2), () => cm.render(makeCtx(), 2, false, style), () => dm.render(makeCtx(), 2), () => wm.render(makeCtx(), 2, null, style)]) draw();
    }
    const ctx = makeCtx(); rm.render(ctx, 2); assert.ok(ctx.__log.draws > 20);
});

test('plot, roads and slab render for blueprint and clean themes', () => {
    const pm = new PlotManager(); const rd = new RoadManager(); const wm = new WallManager(); const slab = new SlabManager();
    pm.createRectangularPlot(0, 0, 360, 480);
    for (const [a, b] of [[[60, 60], [300, 60]], [[300, 60], [300, 400]], [[300, 400], [60, 400]], [[60, 400], [60, 60]]]) wm.addWall({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, 9, 'exterior');
    for (const side of ['front', 'rear', 'left', 'right']) rd.addRoad({ side, width: 240 });
    assert.ok(ROAD_PRESETS.length > 0);
    slab.enabled = true;
    for (const theme of ['blueprint', 'clean']) for (const isExport of [false, true]) {
        const c1 = makeCtx(); pm.render(c1, 1.5, true, wm, theme, isExport); assert.ok(c1.__log.draws > 10);
        const c2 = makeCtx(); rd.render(c2, 1.5, pm.getBounds(), isExport, theme); assert.ok(c2.__log.draws > 4);
        const c3 = makeCtx(); slab.render(c3, 1.5, true, wm, theme === 'clean', isExport); assert.ok(c3.__log.draws > 0);
    }
    const c4 = makeCtx(); pm.renderCompass(c4, 1, true); assert.ok(c4.__log.draws > 0);
});

const vset = (p) => p.map(q => `${Math.round(q.x * 1e6) / 1e6},${Math.round(q.y * 1e6) / 1e6}`).sort();

test('slab: exact corner vertices (a broken line intersection must not pass)', () => {
    const walls = (pts) => { const wm = new WallManager(); pts.forEach((a, i) => wm.addWall(a, pts[(i + 1) % pts.length], 9, 'exterior')); return wm; };
    const s = new SlabManager();
    const rect = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 250 }, { x: 100, y: 250 }];
    assert.deepEqual(vset(s.getSlabPolygon(walls(rect), null)), ['318,268', '318,82', '82,268', '82,82'].sort());
    const L = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 180 }, { x: 200, y: 180 }, { x: 200, y: 300 }, { x: 100, y: 300 }];
    assert.deepEqual(vset(s.getSlabPolygon(walls(L), null)),
        ['82,82', '318,82', '318,198', '218,198', '218,318', '82,318'].sort());
});

test('slab: offset polygon is exact for rectangles, L-shapes, split walls and reversed winding', () => {
    const bb = (p) => { const xs = p.map(q => q.x), ys = p.map(q => q.y); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(v => Math.round(v * 1e6) / 1e6); };
    const walls = (pts) => { const wm = new WallManager(); pts.forEach((a, i) => wm.addWall(a, pts[(i + 1) % pts.length], 9, 'exterior')); return wm; };
    const rect = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 250 }, { x: 100, y: 250 }];
    const s = new SlabManager();
    assert.deepEqual(bb(s.getSlabPolygon(walls(rect), null)), [82, 82, 318, 268]);
    assert.deepEqual(bb(s.getSlabPolygon(walls([...rect].reverse()), null)), [82, 82, 318, 268]);
    const split = rect.flatMap((a, i) => { const b = rect[(i + 1) % 4]; return [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]; });
    assert.deepEqual(bb(s.getSlabPolygon(walls(split), null)), [82, 82, 318, 268]);
    s.isUniform = false; s.offsets = { front: 48, rear: 12, left: 18, right: 24 };
    assert.deepEqual(bb(s.getSlabPolygon(walls(rect), null)), [82, 88, 324, 298]);
    s.isUniform = true; s.setUniformOffset(18);
    const L = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 180 }, { x: 200, y: 180 }, { x: 200, y: 300 }, { x: 100, y: 300 }];
    const lp = s.getSlabPolygon(walls(L), null);
    assert.equal(lp.length, 6); assert.deepEqual(bb(lp), [82, 82, 318, 318]);
    s.cornerStyle = 'chamfer'; s.chamferDist = 12;
    assert.equal(s.getSlabPolygon(walls(rect), null).length, 8);
});
