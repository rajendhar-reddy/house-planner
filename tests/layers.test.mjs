// Layer tests (no browser). Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { LayerManager, defaultLayerId, DEFAULT_LAYERS } from '../modules/layers.js';
import { buildDXF, dxfLayerName, hexToAci } from '../modules/dxf.js';
import { WallManager } from '../modules/walls.js';
import { OpeningManager } from '../modules/openings.js';
import { RoomManager } from '../modules/rooms.js';
import { ColumnManager } from '../modules/columns.js';
import { FurnitureManager } from '../modules/furniture.js';
import { DimensionManager } from '../modules/dimensions.js';
import { StairManager } from '../modules/stairs.js';

function project() {
    const lm = new LayerManager();
    const p = { layerManager: lm, wallManager: new WallManager(), openingManager: new OpeningManager(), roomManager: new RoomManager(),
        columnManager: new ColumnManager(), furnitureManager: new FurnitureManager(), dimensionManager: new DimensionManager(), stairManager: new StairManager() };
    for (const m of [p.wallManager, p.openingManager, p.roomManager, p.columnManager, p.furnitureManager, p.dimensionManager, p.stairManager]) m.layers = lm;
    return p;
}
const ctxStub = () => { let draws = 0; const c = new Proxy({ measureText: () => ({ width: 5 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), getLineDash: () => [] },
    { get(t, k) { if (k in t) return t[k]; if (k === '__draws') return draws; return () => { draws++; }; }, set(t, k, v) { t[k] = v; return true; } }); return c; };

test('layers: defaults per kind, landscape items split from furniture', () => {
    const lm = new LayerManager();
    assert.equal(lm.layers.length, DEFAULT_LAYERS.length);
    assert.equal(defaultLayerId('wall'), 'walls'); assert.equal(defaultLayerId('opening'), 'openings');
    assert.equal(defaultLayerId('furniture', { type: 'sofa_3p' }), 'furniture');
    assert.equal(defaultLayerId('furniture', { type: 'tree_palm' }), 'landscape');
    assert.equal(lm.layerIdOf({ layer: 'nope' }, 'wall'), 'walls');          // unknown layer falls back to the default
});

test('layers: add / rename / duplicate names / delete returns objects to their default layer', () => {
    const lm = new LayerManager();
    const l = lm.add('Electrical', '#ff0000');
    assert.throws(() => lm.add('electrical'), /already exists/);
    assert.throws(() => lm.add('   '), /needs a name/);
    lm.rename(l.id, 'Electric & Lights'); assert.equal(lm.get(l.id).name, 'Electric & Lights');
    assert.throws(() => lm.rename(l.id, 'Walls'), /already exists/);
    const objs = [{ layer: l.id }, { layer: 'walls' }, {}];
    lm.setCurrent(l.id);
    assert.equal(lm.remove(l.id, objs), true);
    assert.deepEqual(objs.map(o => o.layer ?? null), [null, 'walls', null]);
    assert.equal(lm.currentId, null);
    assert.throws(() => lm.remove('walls'), /cannot be deleted/);
});

test('layers: hidden and locked objects are not selectable; hidden are not visible', () => {
    const lm = new LayerManager(); const wall = {};
    assert.ok(lm.isVisible(wall, 'wall') && lm.isSelectable(wall, 'wall'));
    lm.setLocked('walls', true);
    assert.ok(lm.isVisible(wall, 'wall')); assert.ok(!lm.isSelectable(wall, 'wall'));
    lm.setLocked('walls', false); lm.setVisible('walls', false);
    assert.ok(!lm.isVisible(wall, 'wall')); assert.ok(!lm.isSelectable(wall, 'wall'));
});

test('layers: managers skip hidden objects when drawing, picking and snapping', () => {
    const p = project();
    const w = p.wallManager.addWall({ x: 0, y: 0 }, { x: 100, y: 0 });
    p.openingManager.addOpening(w.id, 0.5, { type: 'door' });
    p.roomManager.addRoom(50, 50, { name: 'A' }); p.columnManager.addColumn(5, 5); p.furnitureManager.addItem('bed_king', 30, 30);
    p.dimensionManager.addDimension({ x: 0, y: 0 }, { x: 100, y: 0 }); p.stairManager.addStair({ x: 200, y: 200 });
    const drawn = () => { const c = ctxStub(); p.wallManager.render(c, 2, p.openingManager); p.openingManager.render(c, 2, p.wallManager); p.roomManager.render(c, 2);
        p.columnManager.render(c, 2); p.furnitureManager.render(c, 2); p.dimensionManager.render(c, 2); p.stairManager.render(c, 2); return c.__draws; };
    assert.ok(drawn() > 20);
    for (const id of ['walls', 'openings', 'rooms', 'columns', 'furniture', 'dimensions', 'stairs']) p.layerManager.setVisible(id, false);
    assert.equal(drawn(), 0, 'nothing may be drawn when every layer is hidden');
    assert.equal(p.wallManager.getWallAt(50, 0, 2), null);
    assert.equal(p.wallManager.getSnapTargets().length, 0);
    assert.equal(p.furnitureManager.getItemAt(30, 30), null);
    assert.equal(p.stairManager.hitTest(200, 200), null);
    for (const id of ['walls', 'furniture']) p.layerManager.setVisible(id, true);
    assert.ok(p.wallManager.getWallAt(50, 0, 2)); assert.ok(p.wallManager.getSnapTargets().length > 0);
    p.layerManager.setLocked('walls', true);
    assert.equal(p.wallManager.getWallAt(50, 0, 2), null, 'locked walls cannot be picked');
    assert.ok(p.wallManager.getSnapTargets().length > 0, 'but they can still be snapped to');
});

test('layers: a door is hidden when its wall is hidden', () => {
    const p = project(); const w = p.wallManager.addWall({ x: 0, y: 0 }, { x: 100, y: 0 });
    p.openingManager.addOpening(w.id, 0.5, { type: 'door' });
    p.layerManager.setVisible('walls', false);
    const c = ctxStub(); p.openingManager.render(c, 2, p.wallManager); assert.equal(c.__draws, 0);
    assert.equal(p.openingManager.getOpeningAt(50, 0, 2, p.wallManager), null);
});

test('layers: new objects go on the current layer, or stay on their default layer ("by type")', () => {
    const p = project();
    const a = p.wallManager.addWall({ x: 0, y: 0 }, { x: 50, y: 0 }); assert.equal(a.layer, undefined);
    const l = p.layerManager.add('Phase 2'); p.layerManager.setCurrent(l.id);
    const b = p.wallManager.addWall({ x: 0, y: 10 }, { x: 50, y: 10 }); const f = p.furnitureManager.addItem('sofa_2p', 5, 5);
    assert.equal(b.layer, l.id); assert.equal(f.layer, l.id);
    p.layerManager.setCurrent(null);
    assert.equal(p.roomManager.addRoom(0, 0).layer, undefined);
});

test('layers: save / load round trip, and damaged data cannot break the built-in layers', () => {
    const lm = new LayerManager(); const l = lm.add('Plumbing', '#00ff00'); lm.setVisible('walls', false); lm.setLocked(l.id, true); lm.setCurrent(l.id);
    const copy = new LayerManager(); copy.deserialize(JSON.parse(JSON.stringify(lm.serialize())));
    assert.equal(copy.get('walls').visible, false); assert.equal(copy.get(l.id).locked, true); assert.equal(copy.get(l.id).color, '#00ff00'); assert.equal(copy.currentId, l.id);
    const bad = new LayerManager();
    bad.deserialize({ layers: [null, 5, { id: '../x' }, { id: 'ok', name: '' }, { id: 'good', name: 'Good', color: 'red', visible: false }, { id: 'walls', name: '', color: 'bad' }], currentId: 'missing' });
    assert.equal(bad.layers.length, DEFAULT_LAYERS.length + 1); assert.equal(bad.get('good').color, '#e2e8f0'); assert.equal(bad.get('good').visible, false);
    assert.equal(bad.get('walls').name, 'Walls'); assert.equal(bad.currentId, null);
    const none = new LayerManager(); none.deserialize(undefined); assert.equal(none.layers.length, DEFAULT_LAYERS.length);
});

test('layers + DXF: hidden layers are not exported; user layers appear by name and colour', () => {
    const p = project();
    p.wallManager.addWall({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 'exterior');
    p.roomManager.addRoom(50, 50, { name: 'Hall', width: 100, height: 100 });
    const l = p.layerManager.add('Phase 2 / Extension', '#00ff00');
    const f = p.furnitureManager.addItem('sofa_3p', 40, 40); f.layer = l.id;
    let dxf = buildDXF(p);
    assert.match(dxf, /2\nPHASE_2_EXTENSION\n70\n0\n62\n3\n/);                 // layer record, green (ACI 3)
    assert.match(dxf, /0\nLINE\n8\nPHASE_2_EXTENSION\n/);                        // the sofa is on it
    assert.match(dxf, /8\nWALLS_EXTERIOR\n/); assert.match(dxf, /8\nROOMS\n/);
    p.layerManager.setVisible('walls', false); p.layerManager.setVisible(l.id, false);
    dxf = buildDXF(p);
    assert.doesNotMatch(dxf, /8\nWALLS_EXTERIOR\n/); assert.doesNotMatch(dxf, /8\nWALLS_CENTERLINE\n/); assert.doesNotMatch(dxf, /0\nLINE\n8\nPHASE_2_EXTENSION\n/);
    assert.match(dxf, /8\nROOMS\n/);                                              // other layers unaffected
    // the layer table count still matches its records
    const n = Number(/TABLE\n2\nLAYER\n70\n(\d+)\n/.exec(dxf)[1]); assert.equal(n, (dxf.match(/0\nLAYER\n2\n/g) || []).length);
});

test('dxf layer helpers', () => {
    assert.equal(dxfLayerName('Phase 2 / Ext.'), 'PHASE_2_EXT'); assert.equal(dxfLayerName('***'), 'LAYER'); assert.equal(dxfLayerName('x'.repeat(60)).length, 31);
    assert.equal(hexToAci('#ff0000'), 1); assert.equal(hexToAci('#00ff00'), 3); assert.equal(hexToAci('#ffffff'), 7); assert.equal(hexToAci('nonsense'), 7);
});
