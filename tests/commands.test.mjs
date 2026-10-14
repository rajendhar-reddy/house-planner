// Command-line tests (no browser). A small stand-in app drives the interpreter. Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandLine, parsePointInput, resolvePoint, parseAngle } from '../modules/commands.js';
import { units, UnitSystem } from '../modules/units.js';
import { DEFAULT_SNAP_MODES } from '../modules/snap.js';
import { LayerManager } from '../modules/layers.js';
import { WallManager } from '../modules/walls.js';
import { OpeningManager } from '../modules/openings.js';
import { RoomManager } from '../modules/rooms.js';
import { ColumnManager } from '../modules/columns.js';
import { FurnitureManager } from '../modules/furniture.js';
import { DimensionManager } from '../modules/dimensions.js';
import { StairManager } from '../modules/stairs.js';
import { applyTransform, deleteItems, allSelectable, SELECTABLE } from '../modules/transform.js';
import { AnnotationManager } from '../modules/annotations.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
units.setSystem(UnitSystem.IMPERIAL);

function makeApp() {
    const lm = new LayerManager();
    const app = {
        layerManager: lm, wallManager: new WallManager(), openingManager: new OpeningManager(), roomManager: new RoomManager(), columnManager: new ColumnManager(),
        furnitureManager: new FurnitureManager(), dimensionManager: new DimensionManager(), stairManager: new StairManager(), annotationManager: new AnnotationManager(),
        activeTool: 'select', draftStart: null, draftCurrent: null, selection: [], selectedObject: null, selectedCategory: null,
        canvasEngine: { orthoMode: false, snapToGrid: true, snapToPoints: true, scale: 2, polarMode: false, polarIncrement: 45, snapModes: { ...DEFAULT_SNAP_MODES } },
        calls: [], history: 0,
        requestRender() {}, saveHistory() { this.history++; }, clearSelection() { this.selection = []; this.selectedObject = null; this.selectedCategory = null; },
        setTool(t) { this.activeTool = t; this.draftStart = null; this.calls.push('tool:' + t); },
        getSelectionItems() { return this.selection; },
        setSelection(items) { this.selection = items.slice(); },
        selectAll() { this.selection = allSelectable(this); },
        selectionCenter() { return { x: 50, y: 0 }; },
        runTransform(kind, p) { const t = applyTransform(this, this.selection, kind, p); this.selection = t.filter(i => i.category !== 'opening' || p.copy); this.history++; return t; },
        deleteSelected() { deleteItems(this, this.selection); this.selection = []; },
        undo() { this.calls.push('undo'); }, redo() { this.calls.push('redo'); },
        zoomExtents() { this.calls.push('zoomExtents'); },
        setOrtho(on) { this.canvasEngine.orthoMode = on; }, setGridSnap(on) { this.canvasEngine.snapToGrid = on; },
        setUnits(s) { units.setSystem(s); },
        openLayersPanel() { this.calls.push('layersPanel'); }, openSchedulePanel() { this.calls.push('schedule'); },
        addDraftPoint(tool, pt) {                                     // same contract as the real one (see ui/input.js)
            if (!this.draftStart) { this.draftStart = { ...pt }; return true; }
            if (tool === 'wall') { const w = this.wallManager.addWall(this.draftStart, pt); if (!w) return false; this.draftStart = { ...pt }; return true; }
            return false;
        }
    };
    const out = []; const prompts = [];
    const cl = new CommandLine(app, { log: (t, k) => out.push([k || 'info', t]), setPrompt: (t) => prompts.push(t) });
    return { app, cl, out, prompts, last: () => out[out.length - 1] };
}
const sel = (app, ...objs) => { app.selection = objs.map(o => ({ category: o.start ? 'wall' : 'furniture', obj: o })); };

test('parse: every typed point form', () => {
    assert.deepEqual(parsePointInput("12'"), { kind: 'distance', dist: 144 });
    assert.deepEqual(parsePointInput("5',3'"), { kind: 'abs', x: 60, y: 36 });
    assert.deepEqual(parsePointInput("@5',3'"), { kind: 'rel', dx: 60, dy: 36 });
    assert.deepEqual(parsePointInput("@12'<30"), { kind: 'polar', dist: 144, angle: 30 });
    assert.deepEqual(parsePointInput('10<-45'), { kind: 'polar', dist: 120, angle: -45 });
    assert.deepEqual(parsePointInput('36"'), { kind: 'distance', dist: 36 });
    assert.deepEqual(parsePointInput("5' 6\""), { kind: 'distance', dist: 66 });
    for (const bad of ['', '   ', '@', 'abc', '1,2,3', "5'<", '<45', 'x,y', '12<30<40', null, undefined]) assert.equal(parsePointInput(bad), null, `should reject ${JSON.stringify(bad)}`);
    assert.equal(parseAngle('90'), 90); assert.equal(parseAngle('-12.5'), -12.5); assert.equal(parseAngle('45°'), 45); assert.equal(parseAngle('abc'), null); assert.equal(parseAngle(''), null);
    units.setSystem(UnitSystem.METRIC); assert.deepEqual(parsePointInput('2.5m'), { kind: 'distance', dist: 2500 / 25.4 }); units.setSystem(UnitSystem.IMPERIAL);
});

test('resolve: distance towards the cursor, relative with Y up, polar counter-clockwise', () => {
    const base = { x: 10, y: 10 };
    let p = resolvePoint({ kind: 'distance', dist: 100 }, { base, cursor: { x: 10, y: 500 } }); near(p.x, 10); near(p.y, 110);          // straight down the screen
    p = resolvePoint({ kind: 'distance', dist: 50 }, { base, cursor: { x: 13, y: 14 } }); near(Math.hypot(p.x - 10, p.y - 10), 50); near((p.x - 10) / 50, 0.6); near((p.y - 10) / 50, 0.8);
    p = resolvePoint({ kind: 'rel', dx: 3, dy: 4 }, { base }); assert.deepEqual(p, { x: 13, y: 6 });                                     // +Y is up
    p = resolvePoint({ kind: 'polar', dist: 10, angle: 90 }, { base }); near(p.x, 10, 1e-9); near(p.y, 0, 1e-9);                          // 90 = up
    p = resolvePoint({ kind: 'polar', dist: 10, angle: 0 }, { base }); near(p.x, 20); near(p.y, 10);
    p = resolvePoint({ kind: 'polar', dist: 10, angle: 180 }, { base }); near(p.x, 0); near(p.y, 10, 1e-9);
    assert.deepEqual(resolvePoint({ kind: 'abs', x: 7, y: 8 }, {}), { x: 7, y: 8 });
    assert.throws(() => resolvePoint({ kind: 'rel', dx: 1, dy: 1 }, {}), /previous point/);
    assert.throws(() => resolvePoint({ kind: 'distance', dist: 5 }, {}), /start point/);
    assert.throws(() => resolvePoint({ kind: 'distance', dist: 5 }, { base, cursor: base }), /cursor/);
});

test('tools: names and one-letter aliases switch tools; unknown words are reported', () => {
    const { app, cl, out } = makeApp();
    for (const [typed, tool] of [['w', 'wall'], ['WALL', 'wall'], ['door', 'door'], ['K', 'compound_wall'], ['dim', 'dimension'], ['plot', 'plot_rect'], ['v', 'select'], ['stairs', 'stairs']]) {
        cl.submit(typed); assert.equal(app.activeTool, tool, typed);
    }
    cl.submit('frobnicate'); assert.equal(out.at(-1)[0], 'error'); assert.match(out.at(-1)[1], /Unknown command/);
});

test('direct distance entry: type a length while drawing a wall, chain on, Enter finishes', () => {
    const { app, cl, out } = makeApp();
    cl.submit('wall');
    cl.submit("0,0");                                                          // absolute start point (X right, Y down like the readout)
    assert.deepEqual(app.draftStart, { x: 0, y: 0 });
    app.draftCurrent = { x: 400, y: 3 };                                       // the mouse is to the right of the start
    cl.submit("12'");
    assert.equal(app.wallManager.walls.length, 1);
    const w = app.wallManager.walls[0]; near(w.getLength(), 144); near(w.end.x, 143.99, 0.02);
    assert.deepEqual(app.draftStart, { x: w.end.x, y: w.end.y });             // chained
    cl.submit("@5'<90");                                                       // 5 ft straight UP
    const w2 = app.wallManager.walls[1]; near(w2.end.y, w.end.y - 60, 1e-6); near(w2.end.x, w.end.x, 1e-6);
    cl.submit("@5',0");                                                        // relative: 5 ft to the right
    near(app.wallManager.walls[2].getLength(), 60);
    cl.submit('');                                                             // Enter on an empty line ends the chain
    assert.equal(app.draftStart, null); assert.equal(app.wallManager.walls.length, 3);
    assert.equal(out.filter(o => o[0] === 'error').length, 0);
});

test('direct distance entry: helpful errors', () => {
    const { app, cl, out } = makeApp();
    cl.submit('wall'); cl.submit("12'");
    assert.match(out.at(-1)[1], /start point/);                                // no start point yet
    cl.submit('0,0'); app.draftCurrent = { x: 0, y: 0 }; cl.submit("12'");
    assert.match(out.at(-1)[1], /cursor/);                                     // cursor sits on the start point: no direction
    app.draftCurrent = { x: 10, y: 0 }; cl.submit('banana'); assert.match(out.at(-1)[1], /Unknown command/);
    cl.submit('select'); cl.submit("12'"); assert.match(out.at(-1)[1], /Unknown command/);   // a bare number means nothing outside a drawing tool
});

test('MOVE: base point, then a typed second point', () => {
    const { app, cl, out, prompts } = makeApp();
    const w = app.wallManager.addWall({ x: 0, y: 0 }, { x: 100, y: 0 }); sel(app, w);
    cl.submit('move'); assert.ok(cl.wantsCanvasPoint()); assert.match(prompts.at(-1), /base point/);
    assert.equal(cl.canvasPoint({ x: 10, y: 10 }), true);                      // a mouse click answers the prompt
    assert.match(prompts.at(-1), /second point/);
    cl.submit("@6',2'");                                                       // 6 ft right, 2 ft UP
    assert.deepEqual(w.start, { x: 72, y: -24 }); assert.deepEqual(w.end, { x: 172, y: -24 });
    assert.equal(cl.pending, null); assert.equal(prompts.at(-1), 'Command:');
    assert.equal(cl.canvasPoint({ x: 1, y: 1 }), false);                       // nothing is waiting any more
});

test('MOVE with a distance towards the cursor', () => {
    const { app, cl } = makeApp();
    const w = app.wallManager.addWall({ x: 0, y: 0 }, { x: 100, y: 0 }); sel(app, w);
    cl.submit('move'); cl.canvasPoint({ x: 0, y: 0 });
    app.draftCurrent = { x: 0, y: 50 };                                        // cursor straight below the base point
    cl.submit("3'");
    assert.deepEqual(w.start, { x: 0, y: 36 });
});

test('COPY repeats until Enter, always copying the original', () => {
    const { app, cl } = makeApp();
    const w = app.wallManager.addWall({ x: 0, y: 0 }, { x: 100, y: 0 }); sel(app, w);
    cl.submit('copy'); cl.canvasPoint({ x: 0, y: 0 });
    cl.submit("@0,-10'");                                                      // 10 ft DOWN
    assert.equal(app.wallManager.walls.length, 2);
    assert.ok(cl.pending, 'COPY keeps asking for more points');
    cl.submit("@0,-20'");
    assert.equal(app.wallManager.walls.length, 3);
    const ys = app.wallManager.walls.map(x => x.start.y).sort((a, b) => a - b);
    assert.deepEqual(ys, [0, 120, 240]);                                       // original + two copies, both measured from the original
    cl.submit('');                                                             // Enter ends
    assert.equal(cl.pending, null); assert.equal(w.start.y, 0);
});

test('ROTATE: counter-clockwise like AutoCAD, Enter = centre of selection, C keeps the original', () => {
    const { app, cl } = makeApp();
    const w = app.wallManager.addWall({ x: 0, y: 0 }, { x: 100, y: 0 }); sel(app, w);
    cl.submit('rotate'); cl.submit('');                                        // default pivot: selection centre (50,0)
    cl.submit('90');
    near(w.start.x, 50); near(w.start.y, 50); near(w.end.x, 50); near(w.end.y, -50);        // the east end went UP (counter-clockwise)
    const { app: a2, cl: c2 } = makeApp();
    const v = a2.wallManager.addWall({ x: 0, y: 0 }, { x: 100, y: 0 }); sel(a2, v);
    c2.submit('ro'); c2.canvasPoint({ x: 0, y: 0 }); c2.submit('c'); c2.submit('-90');
    assert.equal(a2.wallManager.walls.length, 2);
    near(v.end.x, 100); near(v.end.y, 0);                                      // original untouched
    const copy = a2.wallManager.walls[1]; near(copy.end.x, 0); near(copy.end.y, 100);        // -90 (clockwise) about the origin
});

test('ROTATE by clicking the direction', () => {
    const { app, cl } = makeApp();
    const w = app.wallManager.addWall({ x: 0, y: 0 }, { x: 100, y: 0 }); sel(app, w);
    cl.submit('rotate'); cl.canvasPoint({ x: 0, y: 0 });
    cl.canvasPoint({ x: 0, y: -80 });                                          // click straight up = 90 degrees counter-clockwise
    near(w.end.x, 0, 1e-9); near(w.end.y, -100, 1e-9);
});

test('MIRROR: two points and the "erase source" question', () => {
    const { app, cl, prompts } = makeApp();
    const w = app.wallManager.addWall({ x: 10, y: 0 }, { x: 30, y: 0 }); sel(app, w);
    cl.submit('mirror'); cl.canvasPoint({ x: 0, y: 0 }); cl.canvasPoint({ x: 0, y: 100 });         // the line x = 0
    assert.match(prompts.at(-1), /Erase source/);
    cl.submit('n');
    assert.equal(app.wallManager.walls.length, 2);
    assert.deepEqual(app.wallManager.walls[1].start, { x: -10, y: 0 }); assert.deepEqual(w.start, { x: 10, y: 0 });
    const { app: a2, cl: c2 } = makeApp(); const v = a2.wallManager.addWall({ x: 10, y: 0 }, { x: 30, y: 0 }); sel(a2, v);
    c2.submit('mi'); c2.canvasPoint({ x: 0, y: 0 }); c2.canvasPoint({ x: 0, y: 100 }); c2.submit('y');
    assert.equal(a2.wallManager.walls.length, 1); assert.deepEqual(v.start, { x: -10, y: 0 });
    const { cl: c3, out } = makeApp(); c3.app.wallManager.addWall({ x: 0, y: 0 }, { x: 1, y: 0 }); sel(c3.app, c3.app.wallManager.walls[0]);
    c3.submit('mirror'); c3.canvasPoint({ x: 5, y: 5 }); c3.canvasPoint({ x: 5, y: 5 });
    assert.match(out.at(-1)[1], /different/);                                  // identical mirror points are refused
});

test('editing commands need a selection and explain how to make one', () => {
    const { app, cl, out } = makeApp();
    for (const c of ['move', 'copy', 'rotate', 'mirror', 'erase']) { cl.submit(c); assert.equal(out.at(-1)[0], 'error'); assert.match(out.at(-1)[1], /Select objects first/); assert.equal(cl.pending, null); }
});

test('ERASE, ALL, UNDO, REDO', () => {
    const { app, cl, out } = makeApp();
    app.wallManager.addWall({ x: 0, y: 0 }, { x: 10, y: 0 }); app.furnitureManager.addItem('bed_king', 5, 5);
    cl.submit('all'); assert.equal(app.selection.length, 2);
    cl.submit('erase'); assert.equal(app.wallManager.walls.length + app.furnitureManager.items.length, 0);
    cl.submit('u'); cl.submit('redo'); assert.deepEqual(app.calls.filter(c => c === 'undo' || c === 'redo'), ['undo', 'redo']);
    cl.submit('sel all'); cl.submit('sel'); assert.match(out.at(-1)[1], /SELECT ALL/);
});

test('view commands: ZOOM, ORTHO, SNAP, POLAR, OSNAP, UNITS', () => {
    const { app, cl, out } = makeApp(); const ce = app.canvasEngine;
    cl.submit('zoom e'); assert.ok(app.calls.includes('zoomExtents'));
    cl.submit('z 2'); near(ce.scale, 4); cl.submit('zoom out'); near(ce.scale, 4 / 1.5); cl.submit('zoom in'); cl.submit('zoom 100'); near(ce.scale, 30);   // clamped
    cl.submit('zoom banana'); assert.equal(out.at(-1)[0], 'error');
    cl.submit('ortho on'); assert.equal(ce.orthoMode, true); cl.submit('ortho'); assert.equal(ce.orthoMode, false); cl.submit('ortho off'); assert.equal(ce.orthoMode, false);
    cl.submit('snap off'); assert.equal(ce.snapToGrid, false); cl.submit('snap'); assert.equal(ce.snapToGrid, true);
    cl.submit('polar on'); assert.equal(ce.polarMode, true); cl.submit('polar 30'); assert.equal(ce.polarIncrement, 30); cl.submit('polar off'); assert.equal(ce.polarMode, false);
    cl.submit('polar 33'); assert.equal(out.at(-1)[0], 'error');
    cl.submit('osnap int per'); assert.deepEqual(ce.snapModes, { ...DEFAULT_SNAP_MODES, endpoint: false, midpoint: false, intersection: true, perpendicular: true, nearest: false });
    cl.submit('osnap end mid nea'); assert.equal(ce.snapModes.nearest, true); assert.equal(ce.snapModes.intersection, false); assert.equal(ce.snapModes.grid, true);
    cl.submit('osnap xyz'); assert.equal(out.at(-1)[0], 'error');
    cl.submit('osnap off'); assert.equal(ce.snapToPoints, false); cl.submit('osnap'); assert.match(out.at(-1)[1], /Object snaps/);
    cl.submit('units metric'); assert.equal(units.getSystem(), UnitSystem.METRIC); cl.submit('units imperial'); assert.equal(units.getSystem(), UnitSystem.IMPERIAL);
    cl.submit('units furlongs'); assert.equal(out.at(-1)[0], 'error');
});

test('LAYER commands', () => {
    const { app, cl, out } = makeApp(); const lm = app.layerManager;
    cl.submit('layer new Electrical'); assert.ok(lm.layers.some(l => l.name === 'Electrical'));
    cl.submit('layer new electrical'); assert.match(out.at(-1)[1], /already exists/);
    cl.submit('layer hide Walls'); assert.equal(lm.get('walls').visible, false);
    cl.submit('la show walls'); assert.equal(lm.get('walls').visible, true);
    cl.submit('layer lock Furniture'); assert.equal(lm.get('furniture').locked, true); cl.submit('layer unlock Furniture'); assert.equal(lm.get('furniture').locked, false);
    cl.submit('layer set Electrical'); assert.equal(lm.currentId, lm.layers.find(l => l.name === 'Electrical').id);
    cl.submit('layer bytype'); assert.equal(lm.currentId, null);
    const bed = app.furnitureManager.addItem('bed_king', 0, 0); app.selection = [{ category: 'furniture', obj: bed }];
    cl.submit('layer assign Electrical'); assert.equal(bed.layer, lm.layers.find(l => l.name === 'Electrical').id);
    cl.submit('layer hide Nope'); assert.match(out.at(-1)[1], /No layer called/);
    cl.submit('layer'); assert.match(out.at(-1)[1], /Layers: /);
    cl.submit('layer explode'); assert.equal(out.at(-1)[0], 'error');
    cl.submit('layers'); assert.ok(app.calls.includes('layersPanel'));
    assert.ok(app.history >= 6, 'layer changes are undoable');
});

test('Enter on an empty line repeats the last command; esc cancels a prompt; nothing leaks afterwards', () => {
    const { app, cl, out } = makeApp();
    cl.submit('ortho on'); cl.submit('ortho off'); cl.submit('');                      // repeats "ortho off"
    assert.equal(out.filter(o => o[1] === 'Ortho OFF.').length, 2);
    const w = app.wallManager.addWall({ x: 0, y: 0 }, { x: 10, y: 0 }); sel(app, w);
    cl.submit('move'); cl.submit('esc'); assert.equal(cl.pending, null);
    cl.submit('move'); cl.cancel(); assert.equal(cl.pending, null); assert.equal(cl.wantsCanvasPoint(), false);
    cl.submit('move'); cl.submit('not a point'); assert.equal(out.at(-1)[0], 'error'); assert.ok(cl.pending, 'a bad answer re-asks instead of aborting');
    cl.cancel(false);
    cl.submit('help'); assert.ok(out.filter(o => /^DRAW:|^EDIT|^VIEW/.test(o[1])).length >= 3);
});

test('a typed command never throws out of submit()', () => {
    const { cl } = makeApp();
    for (const t of ['', '   ', '@', '<', "'", '"', 'move move', 'layer', 'layer new', 'zoom', 'polar x', 'osnap on off', '\u0000', '😀', 'a'.repeat(5000)]) assert.doesNotThrow(() => cl.submit(t), JSON.stringify(t).slice(0, 30));
});
