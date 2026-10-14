// Blocks (symbols): saving a selection, inserting it, the shared library, commands. Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => store.delete(k) };

const { makeBlock, insertBlock, sanitizeBlockName, findBlockName, sanitizeBlocks, blockSize, MAX_BLOCK_OBJECTS } = await import('../modules/blocks.js');
const { BlocksPanelMethods } = await import('../modules/ui/blocks_panel.js');
const { LayerManager } = await import('../modules/layers.js');
const { WallManager } = await import('../modules/walls.js');
const { OpeningManager } = await import('../modules/openings.js');
const { RoomManager } = await import('../modules/rooms.js');
const { ColumnManager } = await import('../modules/columns.js');
const { FurnitureManager } = await import('../modules/furniture.js');
const { DimensionManager } = await import('../modules/dimensions.js');
const { StairManager } = await import('../modules/stairs.js');
const { AnnotationManager } = await import('../modules/annotations.js');
const { CommandLine } = await import('../modules/commands.js');
const { units, UnitSystem } = await import('../modules/units.js');
const { DEFAULT_SNAP_MODES } = await import('../modules/snap.js');
const { centerOf } = await import('../modules/transform.js');

units.setSystem(UnitSystem.IMPERIAL);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const nearPt = (p, x, y, eps = 1e-6) => { near(p.x, x, eps); near(p.y, y, eps); };

function makeApp() {
    const lm = new LayerManager();
    const app = { layerManager: lm, wallManager: new WallManager(), openingManager: new OpeningManager(), roomManager: new RoomManager(), columnManager: new ColumnManager(), furnitureManager: new FurnitureManager(),
        dimensionManager: new DimensionManager(), stairManager: new StairManager(), annotationManager: new AnnotationManager(), blocks: {}, selection: [], history: 0, activeTool: 'select', draftStart: null,
        canvasEngine: { snapModes: { ...DEFAULT_SNAP_MODES }, scale: 2 }, requestRender() {}, saveHistory() { this.history++; }, setTool() {},
        getSelectionItems() { return this.selection; }, setSelection(i) { this.selection = i; }, selectionCenter() { return centerOf(this, this.selection); } };
    for (const k of ['wallManager', 'openingManager', 'roomManager', 'columnManager', 'furnitureManager', 'dimensionManager', 'stairManager', 'annotationManager']) app[k].layers = lm;
    for (const name of Object.getOwnPropertyNames(BlocksPanelMethods.prototype)) if (name !== 'constructor') app[name] = BlocksPanelMethods.prototype[name];      // the real methods
    app.openBlocksPanel = () => { app.panelOpened = (app.panelOpened || 0) + 1; };                     // the dialog itself needs a browser
    return app;
}
/** a small bathroom: 2 walls with a door, a room, a fixture */
function bathroom(app, ox = 1000, oy = 500) {
    const w1 = app.wallManager.addWall({ x: ox, y: oy }, { x: ox + 100, y: oy }, 4.5, 'interior');
    const w2 = app.wallManager.addWall({ x: ox + 100, y: oy }, { x: ox + 100, y: oy + 60 }, 4.5, 'interior');
    const door = app.openingManager.addOpening(w1.id, 0.3, { type: 'door', width: 30 });
    const room = app.roomManager.addRoom(ox + 50, oy + 30, { name: 'WC', width: 100, height: 60 });
    const wc = app.furnitureManager.addItem('toilet', ox + 80, oy + 40, 90);
    app.selection = [w1, w2].map(o => ({ category: 'wall', obj: o })).concat([{ category: 'room', obj: room }, { category: 'furniture', obj: wc }]);
    return { w1, w2, door, room, wc };
}

test('names: cleaned up, refused when empty, found ignoring capitals', () => {
    assert.equal(sanitizeBlockName('  Bathroom   set (A) '), 'Bathroom set (A)'); assert.equal(sanitizeBlockName('a<b>"c"/d\\e'), 'abcde'); assert.equal(sanitizeBlockName('x'.repeat(100)).length, 40);
    assert.equal(sanitizeBlockName('Kuchen \u0915'), 'Kuchen \u0915');
    for (const bad of ['', '   ', '<>', null, undefined, '///']) assert.throws(() => sanitizeBlockName(bad), /Give the block a name/);
    assert.equal(findBlockName({ 'Bath Set': 1 }, 'bath set'), 'Bath Set'); assert.equal(findBlockName({ A: 1 }, 'b'), null); assert.equal(findBlockName(null, 'a'), null);
});

test('makeBlock: positions are relative to the base point, doors of selected walls come along, originals untouched', () => {
    const app = makeApp(); const o = bathroom(app);
    const before = JSON.stringify([o.w1, o.w2, o.door, o.room, o.wc]);
    const b = makeBlock(app, app.selection, 'WC set', { x: 1000, y: 500 });
    assert.equal(b.name, 'WC set'); assert.equal(b.count, 5); assert.equal(JSON.stringify([o.w1, o.w2, o.door, o.room, o.wc]), before, 'the drawing is not changed');
    const wall = b.objects.find(x => x.category === 'wall' && x.data.end.y === 0 && x.data.end.x === 100);
    assert.ok(wall); nearPt(wall.data.start, 0, 0);
    assert.deepEqual(b.objects.filter(x => x.category === 'opening').length, 1);
    const door = b.objects.find(x => x.category === 'opening').data; assert.ok(b.objects.some(x => x.category === 'wall' && x.data.id === door.wallId), 'the door points at a wall inside the block');
    assert.notEqual(door.wallId, o.w1.id);
    assert.equal(b.objects.find(x => x.category === 'room').data.x, 50);
    assert.deepEqual(Object.keys(blockSize(b)), ['width', 'height']); near(blockSize(b).width, 100, 5);
});

test('makeBlock: refuses nothing-to-save cases', () => {
    const app = makeApp(); const o = bathroom(app);
    assert.throws(() => makeBlock(app, [], 'x', { x: 0, y: 0 }), /Select walls/);
    assert.throws(() => makeBlock(app, [{ category: 'opening', obj: o.door }], 'x', { x: 0, y: 0 }), /door or window alone/);
    assert.throws(() => makeBlock(app, app.selection, '  ', { x: 0, y: 0 }), /Give the block a name/);
});

test('insertBlock: copies land at the point, doors attach to the NEW walls, inserts are independent', () => {
    const app = makeApp(); const o = bathroom(app); const b = makeBlock(app, app.selection, 'WC', { x: 1000, y: 500 });
    const made = insertBlock(app, b, { x: 200, y: 300 }, 0);
    assert.equal(made.length, 5); assert.equal(app.wallManager.walls.length, 4); assert.equal(app.openingManager.openings.length, 2);
    const newWall = made.find(m => m.category === 'wall' && Math.abs(m.obj.end.x - m.obj.start.x) > 50).obj; nearPt(newWall.start, 200, 300); nearPt(newWall.end, 300, 300);
    const newDoor = made.find(m => m.category === 'opening').obj; assert.ok(app.wallManager.getWallById(newDoor.wallId)); assert.notEqual(newDoor.wallId, o.w1.id); near(newDoor.t, 0.3);
    nearPt(made.find(m => m.category === 'room').obj, 250, 330);
    const again = insertBlock(app, b, { x: 200, y: 600 }, 0);
    again.find(m => m.category === 'wall').obj.start.x = 9999; assert.notEqual(newWall.start.x, 9999); assert.ok(b.objects.every(o => o.data.start === undefined || o.data.start.x !== 9999));
    const ids = [...app.wallManager.walls, ...app.openingManager.openings, ...app.roomManager.rooms, ...app.furnitureManager.items].map(x => x.id); assert.equal(new Set(ids).size, ids.length);
    assert.equal(b.count, 5, 'the stored block is not changed by inserting it');
});

test('insertBlock: rotation turns the whole block about its base point', () => {
    const app = makeApp(); const o = bathroom(app); const b = makeBlock(app, app.selection, 'WC', { x: 1000, y: 500 });
    const made = insertBlock(app, b, { x: 0, y: 0 }, 90);                                              // screen-clockwise: east -> south
    const long = made.find(m => m.category === 'wall' && Math.abs(m.obj.end.y - m.obj.start.y) > 50 && Math.abs(m.obj.end.x - m.obj.start.x) < 1);
    assert.ok(long, 'the 100-inch wall now runs down the screen');
    const first = made.filter(m => m.category === 'wall').map(m => m.obj);
    const lens = first.map(w => Math.round(w.getLength())).sort((a, b) => a - b); assert.deepEqual(lens, [60, 100]);
    const wc = made.find(m => m.category === 'furniture').obj; near(wc.rotation, 180);                  // 90 + 90
    const door = made.find(m => m.category === 'opening').obj, hostW = app.wallManager.getWallById(door.wallId); near(hostW.getLength(), 100);
    assert.ok(Math.abs(hostW.end.y - hostW.start.y) > 99, 'the 100" wall now runs down the screen');
});

test('insertBlock: unusable data is skipped; a block with nothing usable is refused', () => {
    const app = makeApp();
    const b = { name: 'odd', count: 4, objects: [{ category: 'wall', data: { start: { x: 0, y: 0 }, end: { x: 50, y: 0 } } }, { category: 'wall', data: { start: 'x' } }, { category: 'bogus', data: {} }, { category: 'opening', data: { wallId: 'wall_missing', t: 0.5, width: 30 } }] };
    const made = insertBlock(app, b, { x: 10, y: 10 }, 0);
    assert.equal(made.length, 1); assert.equal(app.openingManager.openings.length, 0);
    assert.throws(() => insertBlock(app, { objects: [{ category: 'bogus', data: {} }] }, { x: 0, y: 0 }), /no usable objects/);
    assert.throws(() => insertBlock(app, { objects: [] }, { x: 0, y: 0 }), /no usable objects/);
});

test('sanitizeBlocks: keeps good blocks, drops bad ones, caps sizes', () => {
    const app = makeApp(); bathroom(app); const good = makeBlock(app, app.selection, 'Good', { x: 1000, y: 500 });
    const clean = sanitizeBlocks({ Good: good, '<>': good, Broken: { objects: 'x' }, Empty: { objects: [{ category: 'wall', data: { start: 1 } }] }, Nope: null, Arr: [] });
    assert.deepEqual(Object.keys(clean), ['Good']); assert.equal(clean.Good.count, good.count);
    assert.deepEqual(sanitizeBlocks(null), {}); assert.deepEqual(sanitizeBlocks([1, 2]), {}); assert.deepEqual(sanitizeBlocks('x'), {});
    const huge = { name: 'Huge', objects: Array.from({ length: MAX_BLOCK_OBJECTS + 50 }, (_, i) => ({ category: 'wall', data: { start: { x: i, y: 0 }, end: { x: i + 1, y: 0 } } })) };
    assert.equal(sanitizeBlocks({ Huge: huge }).Huge.count, MAX_BLOCK_OBJECTS);
    assert.deepEqual(sanitizeBlocks(JSON.parse(JSON.stringify({ Good: good }))), { Good: good });                // survives a save / load
});

test('app: saved blocks go into the project AND the shared library; a library block can be used in another project', () => {
    store.clear();
    const a = makeApp(); bathroom(a);
    const r = a.saveSelectionAsBlock('Bath', null);
    assert.equal(r.replaced, false); assert.equal(r.inLibrary, true); assert.ok(a.blocks.Bath); assert.equal(a.history, 1);
    assert.equal(a.saveSelectionAsBlock('bath').replaced, true, 'same name (any capitals) replaces');
    assert.deepEqual(Object.keys(a.libraryBlocks()), ['bath'], 'and so does the shared library');
    assert.deepEqual(Object.keys(a.blocks), ['bath']);
    const b = makeApp();                                                                                   // a different project
    assert.ok(b.findBlock('BATH'));
    const made = b.insertBlockByName('bath', { x: 50, y: 50 }, 0);
    assert.ok(made.length >= 4); assert.ok(b.blocks.bath, 'the library block now belongs to this project too'); assert.equal(b.selection.filter(s => s.category === 'opening').length, 0);
    assert.throws(() => b.insertBlockByName('nothing', { x: 0, y: 0 }), /no block called/);
    assert.equal(b.deleteBlockByName('BATH'), 'bath'); assert.equal(b.findBlock('bath'), null); assert.throws(() => b.deleteBlockByName('bath'), /no block/);
    b.restoreBlocks({ X: { objects: 'broken' } }); assert.deepEqual(b.blocks, {});
    store.set('houseplanner_block_library', '{not json'); assert.deepEqual(makeApp().libraryBlocks(), {});
});

function cmdFor(app) {
    const out = []; const cl = new CommandLine(app, { log: (t, k) => out.push([k || 'info', t]), setPrompt() {} });
    return { cl, out };
}
test('BLOCK command: name, base point (or Enter for the centre), replace, delete', () => {
    store.clear(); const app = makeApp(); bathroom(app); const { cl, out } = cmdFor(app);
    cl.submit('block WC Suite'); assert.ok(cl.wantsCanvasPoint()); cl.submit('');                           // Enter = centre of the selection
    assert.ok(app.blocks['WC Suite']); assert.match(out.at(-1)[1], /Block "WC Suite" saved \(5 objects\)/); assert.equal(cl.pending, null);
    cl.submit('block'); assert.equal(cl.pending.kind, 'text'); cl.submit('Second'); cl.canvasPoint({ x: 1000, y: 500 });
    nearPt(app.blocks.Second.objects.find(o => o.category === 'wall' && o.data.end.x === 100).data.start, 0, 0);                  // the clicked base point became the origin
    cl.submit('block WC Suite'); cl.submit(''); assert.match(out.at(-1)[1], /replaced/);
    cl.submit('block delete second'); assert.equal(app.blocks.Second, undefined); assert.match(out.at(-1)[1], /deleted/);
    app.selection = []; cl.submit('block X'); assert.equal(out.at(-1)[0], 'error'); assert.match(out.at(-1)[1], /Select objects first/);
    cl.submit('block delete nothing'); assert.equal(out.at(-1)[0], 'error');
});
test('INSERT command: rotation question, repeated placing until Enter, helpful errors', () => {
    store.clear(); const app = makeApp(); bathroom(app); const { cl, out } = cmdFor(app);
    cl.submit('block Unit'); cl.submit('');
    const walls0 = app.wallManager.walls.length;
    cl.submit('insert Unit'); assert.match(cl.pending.prompt, /rotation angle/); cl.submit('');
    cl.canvasPoint({ x: 0, y: 0 }); cl.canvasPoint({ x: 300, y: 0 });
    assert.equal(app.wallManager.walls.length, walls0 + 4); assert.ok(cl.pending, 'keeps asking for more insertion points');
    cl.submit(''); assert.equal(cl.pending, null);
    cl.submit('i Unit'); cl.submit('abc'); assert.equal(out.at(-1)[0], 'error'); cl.cancel(false);
    cl.submit('insert Unit'); cl.submit('90'); cl.canvasPoint({ x: 0, y: 500 });                           // 90 degrees counter-clockwise
    cl.submit('');                                                                                             // Enter ends the insert loop
    const last = app.wallManager.walls.slice(-2).map(w => Math.round(w.getLength())).sort((a, b) => a - b); assert.deepEqual(last, [60, 100]);
    cl.submit('insert nope'); assert.equal(out.at(-1)[0], 'error'); assert.match(out.at(-1)[1], /no block called/);
    cl.submit('insert'); assert.match(out.at(-1)[1], /Blocks: .*Unit/); cl.submit('blocks'); assert.match(out.at(-1)[1], /Blocks: Unit/); assert.equal(app.panelOpened, 2);
    cl.cancel(false);
    const empty = makeApp(); store.clear(); const { cl: c2, out: o2 } = cmdFor(empty); c2.submit('blocks'); assert.match(o2.at(-1)[1], /no blocks yet/);
});
