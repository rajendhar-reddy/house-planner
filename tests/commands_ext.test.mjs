// Interactive measuring / zoom / wall-editing commands, driven through a stand-in app. Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandLine } from '../modules/commands.js';
import { units, UnitSystem } from '../modules/units.js';
import { DEFAULT_SNAP_MODES } from '../modules/snap.js';
import { LayerManager } from '../modules/layers.js';
import { WallManager } from '../modules/walls.js';
import { OpeningManager } from '../modules/openings.js';

units.setSystem(UnitSystem.IMPERIAL);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const nearPt = (p, x, y) => { near(p.x, x); near(p.y, y); };

function makeApp() {
    const lm = new LayerManager();
    const app = {
        layerManager: lm, wallManager: new WallManager(), openingManager: new OpeningManager(),
        activeTool: 'select', draftStart: null, draftCurrent: null, selection: [], history: 0, views: [], fits: [],
        canvasEngine: { orthoMode: false, snapToGrid: true, snapToPoints: true, scale: 2, offsetX: 0, offsetY: 0, polarMode: false, polarIncrement: 45, snapModes: { ...DEFAULT_SNAP_MODES },
            fitToBounds(b, pad) { app.fits.push({ b, pad }); this.scale = 7; } },
        requestRender() {}, saveHistory() { this.history++; }, setTool(t) { this.activeTool = t; },
        pickWall(pt) { return this.wallManager.getWallAt(pt.x, pt.y, 2); },
        pushView() { this.views.push({ scale: this.canvasEngine.scale }); },
        zoomPrevious() { const v = this.views.pop(); if (!v) return false; this.canvasEngine.scale = v.scale; return true; },
        getSelectionItems() { return this.selection; }
    };
    app.wallManager.layers = lm; app.openingManager.layers = lm;
    const out = [];
    const cl = new CommandLine(app, { log: (t, k) => out.push([k || 'info', t]), setPrompt() {} });
    return { app, cl, out, last: () => out.at(-1), W: (x1, y1, x2, y2, t = 9) => app.wallManager.addWall({ x: x1, y: y1 }, { x: x2, y: y2 }, t, 'exterior') };
}

test('DIST: two clicks report distance, direction and the X/Y offsets', () => {
    const { cl, out } = makeApp();
    cl.submit('dist'); assert.ok(cl.wantsCanvasPoint());
    cl.canvasPoint({ x: 0, y: 0 }); cl.canvasPoint({ x: 144, y: -144 });                        // up and to the right
    assert.match(out.at(-1)[1], /Distance 16' - 11\.6"/); assert.match(out.at(-1)[1], /angle 45\u00b0/); assert.match(out.at(-1)[1], /dX 12'.*dY 12'/);
    assert.equal(cl.pending, null);
});

test('AREA: collects points until Enter, then reports area and perimeter', () => {
    const { cl, out } = makeApp();
    cl.submit('area'); cl.canvasPoint({ x: 0, y: 0 }); cl.canvasPoint({ x: 144, y: 0 });
    assert.deepEqual(cl.pending.trail.length, 2); assert.equal(cl.pending.closeTrail, true);
    cl.submit('');                                                                              // too few points
    assert.equal(out.at(-1)[0], 'error'); assert.equal(cl.pending, null);
    cl.submit('aa'); for (const p of [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 144 }, { x: 0, y: 144 }]) cl.canvasPoint(p);
    cl.submit('');
    assert.match(out.at(-1)[1], /Area 144\.0 Sq\. Ft\./); assert.match(out.at(-1)[1], /perimeter 48'/);
    cl.submit('area'); cl.submit('0,0'); cl.submit('@12\',0'); cl.submit("@0,12'"); cl.submit('');         // typed points work too (relative: Y up)
    assert.match(out.at(-1)[1], /Area 72\.0 Sq\. Ft\./);
});

test('ANGLE: vertex then two sides', () => {
    const { cl, out } = makeApp();
    cl.submit('angle'); cl.canvasPoint({ x: 0, y: 0 }); cl.canvasPoint({ x: 100, y: 0 }); cl.canvasPoint({ x: 100, y: 100 });
    assert.match(out.at(-1)[1], /Angle 45\u00b0/); assert.match(out.at(-1)[1], /315\u00b0/);
    cl.submit('ang'); cl.canvasPoint({ x: 0, y: 0 }); cl.canvasPoint({ x: 100, y: 0 }); cl.canvasPoint({ x: 0, y: 0 });
    assert.equal(out.at(-1)[0], 'error'); assert.ok(cl.pending, 'a bad click re-asks');
});

test('ZOOM W and ZOOM P', () => {
    const { app, cl, out } = makeApp();
    cl.submit('zoom w'); cl.canvasPoint({ x: 10, y: 20 }); cl.canvasPoint({ x: 210, y: 120 });
    assert.deepEqual(app.fits[0].b, { x: 10, y: 20, width: 200, height: 100 }); assert.equal(app.canvasEngine.scale, 7);
    cl.submit('zoom p'); assert.equal(app.canvasEngine.scale, 2);
    cl.submit('zoom p'); assert.match(out.at(-1)[1], /no earlier view/);
    cl.submit('zoom w'); cl.canvasPoint({ x: 5, y: 5 }); cl.canvasPoint({ x: 5, y: 5 });
    assert.match(out.at(-1)[1], /apart/); assert.ok(cl.pending);
});

test('OFFSET: distance, then wall + side, repeating until Enter; remembers the last distance', () => {
    const { app, cl, W, out } = makeApp(); const w = W(0, 0, 200, 0);
    cl.submit('offset'); cl.submit("2'");
    cl.canvasPoint({ x: 100, y: 0 }); cl.canvasPoint({ x: 100, y: 50 });                       // wall, then a spot below it
    assert.equal(app.wallManager.walls.length, 2); nearPt(app.wallManager.walls[1].start, 0, 24); assert.equal(app.history, 1);
    cl.canvasPoint({ x: 100, y: 0 }); cl.canvasPoint({ x: 100, y: -50 });                       // the loop continues
    nearPt(app.wallManager.walls[2].start, 0, -24);
    cl.submit('');                                                                              // Enter ends
    assert.equal(cl.pending, null);
    cl.submit('of'); assert.match(cl.pending.prompt, /<2'>/); cl.submit('');                    // Enter keeps 2'
    assert.match(cl.pending.prompt, /OFFSET 2'/);
    cl.canvasPoint({ x: 500, y: 500 }); assert.equal(out.at(-1)[0], 'error'); assert.match(out.at(-1)[1], /no wall/i);
    cl.cancel(false); cl.submit('offset'); cl.submit('abc'); assert.equal(out.at(-1)[0], 'error'); cl.submit('-3'); assert.equal(out.at(-1)[0], 'error');
});

test('TRIM: cutting wall first, then click the part to remove (repeats)', () => {
    const { app, cl, W } = makeApp(); const cutter = W(120, -50, 120, 150); const a = W(0, 0, 200, 0), b = W(0, 100, 200, 100);
    cl.submit('trim'); cl.canvasPoint({ x: 120, y: 120 });                                      // choose the cutter
    cl.canvasPoint({ x: 190, y: 0 }); nearPt(a.end, 120, 0);
    cl.canvasPoint({ x: 10, y: 100 }); nearPt(b.start, 120, 100);
    assert.equal(app.history, 2); assert.ok(cl.pending);
    cl.canvasPoint({ x: 60, y: 0 });                                                            // a no longer crosses in that spot... it ends AT the cutter
    cl.submit(''); assert.equal(cl.pending, null);
});

test('EXTEND: boundary first, then the wall near the end that should grow', () => {
    const { app, cl, W, out } = makeApp(); const boundary = W(160, -60, 160, 60); const a = W(0, 0, 100, 0);
    cl.submit('extend'); cl.canvasPoint({ x: 160, y: 40 });
    cl.canvasPoint({ x: 3, y: 0 }); assert.equal(out.at(-1)[0], 'error'); assert.match(out.at(-1)[1], /does not run into/);     // wrong end
    cl.canvasPoint({ x: 97, y: 0 }); nearPt(a.end, 160, 0); assert.equal(app.history, 1);
    cl.submit('');
});

test('FILLET: pick two walls and they meet in a corner', () => {
    const { app, cl, W } = makeApp(); const a = W(0, 0, 90, 0), b = W(110, 100, 110, 20);
    cl.submit('fillet'); cl.canvasPoint({ x: 40, y: 0 }); cl.canvasPoint({ x: 110, y: 60 });
    nearPt(a.end, 110, 0); nearPt(b.end, 110, 0); assert.equal(cl.pending, null);
});

test('CHAMFER uses typed distances and reports problems without losing the prompt', () => {
    const { app, cl, W, out } = makeApp(); const c = W(0, 300, 100, 300), d = W(100, 300, 100, 400);
    cl.submit('cha'); cl.submit('20"'); cl.submit('30"');
    cl.canvasPoint({ x: 20, y: 300 }); cl.canvasPoint({ x: 100, y: 380 });
    nearPt(c.end, 80, 300); nearPt(d.start, 100, 330); assert.equal(app.wallManager.walls.length, 3);
    assert.equal(cl.pending, null);
    cl.submit('cha'); cl.submit('900"'); cl.submit(''); cl.canvasPoint({ x: 20, y: 300 }); cl.canvasPoint({ x: 100, y: 380 });
    assert.match(out.at(-1)[1], /too short/); assert.ok(cl.pending, 'still waiting for a valid second wall');
});

test('wall edit commands need no selection and never throw out of submit()', () => {
    const { cl } = makeApp();
    for (const t of ['offset', 'trim', 'extend', 'fillet', 'chamfer', 'dist', 'area', 'angle', 'zoom w', 'of x', 'tr 1 2']) assert.doesNotThrow(() => { cl.submit(t); cl.cancel(false); }, t);
});
