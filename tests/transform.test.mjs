// Multi-select / Move / Copy / Rotate / Mirror tests (no browser). Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { LayerManager } from '../modules/layers.js';
import { WallManager } from '../modules/walls.js';
import { OpeningManager } from '../modules/openings.js';
import { RoomManager } from '../modules/rooms.js';
import { ColumnManager } from '../modules/columns.js';
import { FurnitureManager } from '../modules/furniture.js';
import { DimensionManager } from '../modules/dimensions.js';
import { StairManager } from '../modules/stairs.js';
import { AnnotationManager } from '../modules/annotations.js';
import { SELECTABLE, boundsOf, selectionBounds, centerOf, allSelectable, pickRect, moveItems, rotateItems, mirrorItems, copyItems, deleteItems, describeSelection } from '../modules/transform.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const nearPt = (p, x, y, eps = 1e-6) => { near(p.x, x, eps); near(p.y, y, eps); };

function makeApp() {
    const app = { layerManager: new LayerManager(), wallManager: new WallManager(), openingManager: new OpeningManager(), roomManager: new RoomManager(),
        columnManager: new ColumnManager(), furnitureManager: new FurnitureManager(), dimensionManager: new DimensionManager(), stairManager: new StairManager(), annotationManager: new AnnotationManager() };
    for (const k of ['wallManager', 'openingManager', 'roomManager', 'columnManager', 'furnitureManager', 'dimensionManager', 'stairManager', 'annotationManager']) app[k].layers = app.layerManager;
    return app;
}
/** A small house: 2 walls with a door, a room, a column, a sofa, a stair and a dimension. */
function house() {
    const app = makeApp();
    const w1 = app.wallManager.addWall({ x: 0, y: 0 }, { x: 200, y: 0 }, 9, 'exterior');
    const w2 = app.wallManager.addWall({ x: 200, y: 0 }, { x: 200, y: 100 }, 9, 'exterior');
    const door = app.openingManager.addOpening(w1.id, 0.25, { type: 'door', width: 36 });
    const room = app.roomManager.addRoom(100, 50, { name: 'Hall', width: 120, height: 60 });
    const col = app.columnManager.addColumn(10, 10, { width: 9, depth: 15 });
    const sofa = app.furnitureManager.addItem('sofa_3p', 60, 60, 0);
    const stair = app.stairManager.addStair({ x: 150, y: 70, type: 'dogleg', turnDirection: 'left' });
    const dim = app.dimensionManager.addDimension({ x: 0, y: 0 }, { x: 200, y: 0 }, 24);
    const note = app.annotationManager.addText(20, 90, { text: 'Hall', height: 9 });
    const lead = app.annotationManager.addLeader([{ x: 60, y: 60 }, { x: 120, y: 30 }], { text: 'Beam' });
    const ang = app.annotationManager.addAngularDim({ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 0, y: 80 }, { radius: 40 });
    const all = [['wall', w1], ['wall', w2], ['opening', door], ['room', room], ['column', col], ['furniture', sofa], ['stair', stair], ['dimension', dim], ['text', note], ['leader', lead], ['angdim', ang]].map(([category, obj]) => ({ category, obj }));
    return { app, w1, w2, door, room, col, sofa, stair, dim, note, lead, ang, all };
}
const snapshot = (h) => JSON.stringify(h.all.map(i => i.obj));

test('select: window selects only what is fully inside, crossing also what touches', () => {
    const h = house();
    const win = pickRect(h.app, { x1: -20, y1: -20, x2: 120, y2: 20 }, 'window').map(i => i.category + (i.obj === h.w1 ? ':w1' : ''));
    assert.ok(!win.includes('wall:w1'));                                      // w1 runs 0..200, sticks out of the window
    const cross = pickRect(h.app, { x1: -20, y1: -20, x2: 120, y2: 20 }, 'crossing').map(i => i.obj);
    assert.ok(cross.includes(h.w1)); assert.ok(cross.includes(h.door)); assert.ok(cross.includes(h.col)); assert.ok(!cross.includes(h.w2));
    const big = pickRect(h.app, { x1: 300, y1: 200, x2: -50, y2: -50 }, 'window');          // corners given in any order
    assert.equal(big.length, h.all.length);
    assert.equal(pickRect(h.app, { x1: 1000, y1: 1000, x2: 1100, y2: 1100 }, 'crossing').length, 0);
});

test('select: hidden and locked layers are never picked', () => {
    const h = house(); const everything = { x1: -100, y1: -100, x2: 400, y2: 400 };
    assert.equal(pickRect(h.app, everything, 'window').length, h.all.length);
    h.app.layerManager.setLocked('furniture', true); h.app.layerManager.setVisible('rooms', false);
    const picked = pickRect(h.app, everything, 'window').map(i => i.category);
    assert.ok(!picked.includes('furniture') && !picked.includes('room'));
    h.app.layerManager.setVisible('walls', false);
    assert.ok(!allSelectable(h.app).some(i => i.category === 'opening'), 'a door on a hidden wall cannot be picked');
});

test('bounds: every category reports a sensible box', () => {
    const h = house();
    for (const it of h.all) { const b = boundsOf(h.app, it); assert.ok(b && b.width > 0 && b.height > 0 && [b.x, b.y, b.width, b.height].every(Number.isFinite), it.category); }
    const b = selectionBounds(h.app, [{ category: 'wall', obj: h.w1 }]);
    near(b.x, -4.5); near(b.width, 209); near(b.height, 9);
    nearPt(centerOf(h.app, [{ category: 'wall', obj: h.w1 }]), 100, 0);
    assert.equal(selectionBounds(h.app, []), null);
    assert.equal(SELECTABLE.length, 10);
});

test('move: everything moves, doors follow their wall, a lone door stays put', () => {
    const h = house(); const before = JSON.parse(snapshot(h));
    moveItems(h.app, h.all, 30, -10);
    nearPt(h.w1.start, 30, -10); nearPt(h.w2.end, 230, 90); nearPt({ x: h.room.x, y: h.room.y }, 130, 40);
    nearPt({ x: h.col.x, y: h.col.y }, 40, 0); nearPt({ x: h.sofa.x, y: h.sofa.y }, 90, 50); nearPt({ x: h.stair.x, y: h.stair.y }, 180, 60);
    nearPt(h.dim.start, 30, -10); near(h.door.t, 0.25);                        // door is still 25% along its (moved) wall
    moveItems(h.app, [{ category: 'opening', obj: h.door }], 500, 500); near(h.door.t, 0.25);
    moveItems(h.app, h.all, -30, 10);
    assert.deepEqual(JSON.parse(snapshot(h)), before);                        // moving there and back restores everything exactly
});

test('move: polygon rooms move their outline too', () => {
    const app = makeApp(); const r = app.roomManager.addRoom(5, 5, { polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] });
    moveItems(app, [{ category: 'room', obj: r }], 100, 50);
    assert.deepEqual(r.polygon, [{ x: 100, y: 50 }, { x: 110, y: 50 }, { x: 100, y: 60 }]);
    assert.deepEqual(r.getBounds(), { x: 100, y: 50, width: 10, height: 10 });
});

test('rotate: 90 degrees about a pivot, rooms swap width/height, objects turn', () => {
    const h = house();
    rotateItems(h.app, h.all, 90, { x: 0, y: 0 });                            // (x,y) -> (-y, x) in screen coordinates
    nearPt(h.w1.end, 0, 200); nearPt(h.w2.start, 0, 200); nearPt(h.w2.end, -100, 200);
    nearPt({ x: h.room.x, y: h.room.y }, -50, 100); near(h.room.width, 60); near(h.room.height, 120);
    near(h.sofa.rotation, 90); near(h.col.rotation, 90); near(h.stair.rotation, 90);
    near(h.door.t, 0.25);
});

test('rotate: four quarter turns, a full turn and turning back all restore the original', () => {
    const h = house(); const before = JSON.parse(snapshot(h)); const pivot = { x: 37, y: -12 };
    for (let i = 0; i < 4; i++) rotateItems(h.app, h.all, 90, pivot);
    const after = JSON.parse(snapshot(h));
    for (let i = 0; i < before.length; i++) for (const k of ['x', 'y', 'rotation', 'width', 'height']) if (typeof before[i][k] === 'number') near(after[i][k], before[i][k], 1e-9);
    rotateItems(h.app, h.all, 37, pivot); rotateItems(h.app, h.all, -37, pivot);
    near(h.w1.end.x, 200, 1e-9); near(h.sofa.rotation, 0, 1e-9);
    rotateItems(h.app, h.all, 360, pivot); near(h.w1.end.x, 200, 1e-9);
});

test('rotate: odd angles keep rooms axis-aligned but still move their centre', () => {
    const app = makeApp(); const r = app.roomManager.addRoom(100, 0, { width: 80, height: 40 });
    rotateItems(app, [{ category: 'room', obj: r }], 45, { x: 0, y: 0 });
    near(r.width, 80); near(r.height, 40); nearPt({ x: r.x, y: r.y }, 100 * Math.SQRT1_2, 100 * Math.SQRT1_2, 1e-9);
});

test('mirror: reflect across a vertical line', () => {
    const h = house();
    mirrorItems(h.app, h.all, { x: 100, y: -50 }, { x: 100, y: 500 });         // the line x = 100
    nearPt(h.w1.start, 200, 0); nearPt(h.w1.end, 0, 0); nearPt(h.w2.start, 0, 0); nearPt(h.w2.end, 0, 100);
    nearPt({ x: h.room.x, y: h.room.y }, 100, 50); nearPt({ x: h.sofa.x, y: h.sofa.y }, 140, 60); nearPt({ x: h.col.x, y: h.col.y }, 190, 10);
    near(h.sofa.rotation, 0);                                                  // symmetric artwork facing "up" stays facing up
    assert.equal(h.stair.turnDirection, 'right');
    assert.equal(h.door.flipSwing, true);
    near(h.dim.offset, -24);
});

test('mirror: reflect across a horizontal line turns furniture upside-down; angled axes work', () => {
    const h = house();
    mirrorItems(h.app, [{ category: 'furniture', obj: h.sofa }], { x: 0, y: 30 }, { x: 10, y: 30 });
    nearPt({ x: h.sofa.x, y: h.sofa.y }, 60, 0); near(h.sofa.rotation, 180);
    const app = makeApp(); const w = app.wallManager.addWall({ x: 10, y: 0 }, { x: 30, y: 0 });
    mirrorItems(app, [{ category: 'wall', obj: w }], { x: 0, y: 0 }, { x: 10, y: 10 });   // the diagonal y = x swaps x and y
    nearPt(w.start, 0, 10); nearPt(w.end, 0, 30);
    assert.throws(() => mirrorItems(app, [], { x: 1, y: 1 }, { x: 1, y: 1 }), /different/);
});

test('mirror: doing it twice restores everything, and the dimension stays attached to its points', () => {
    const h = house(); const before = JSON.parse(snapshot(h));
    const dimP1 = h.dim.getGeometry().p1;
    mirrorItems(h.app, h.all, { x: 30, y: 0 }, { x: 80, y: 77 });
    const g = h.dim.getGeometry();                                             // the offset line must be the reflection of the original one
    const reflect = (p) => { const dx = 50, dy = 77, t = ((p.x - 30) * dx + p.y * dy) / (dx * dx + dy * dy); return { x: 2 * (30 + t * dx) - p.x, y: 2 * (t * dy) - p.y }; };
    nearPt(g.p1, reflect(dimP1).x, reflect(dimP1).y, 1e-9);
    mirrorItems(h.app, h.all, { x: 30, y: 0 }, { x: 80, y: 77 });
    const after = JSON.parse(snapshot(h));
    for (let i = 0; i < before.length; i++) for (const k of ['x', 'y', 'rotation', 'offset']) if (typeof before[i][k] === 'number') near(after[i][k], before[i][k], 1e-9);
    nearPt(h.w1.end, 200, 0, 1e-9); assert.equal(h.stair.turnDirection, 'left'); assert.equal(!!h.door.flipSwing, false);
});

test('copy: duplicates everything with new unique ids, takes doors along, leaves originals alone', () => {
    const h = house(); const before = snapshot(h);
    const sel = [{ category: 'wall', obj: h.w1 }, { category: 'room', obj: h.room }, { category: 'furniture', obj: h.sofa }];
    const copies = copyItems(h.app, sel);
    assert.equal(copies.length, 4);                                            // wall + room + sofa + the door on the wall
    assert.equal(snapshot(h), before);
    assert.equal(h.app.wallManager.walls.length, 3); assert.equal(h.app.openingManager.openings.length, 2);
    const newWall = copies.find(c => c.category === 'wall').obj, newDoor = copies.find(c => c.category === 'opening').obj;
    assert.notEqual(newWall.id, h.w1.id); assert.equal(newDoor.wallId, newWall.id); assert.notEqual(newDoor.id, h.door.id);
    assert.equal(h.door.wallId, h.w1.id);
    for (const key of ['wallManager', 'openingManager', 'roomManager', 'furnitureManager']) {
        const arr = h.app[key][{ wallManager: 'walls', openingManager: 'openings', roomManager: 'rooms', furnitureManager: 'items' }[key]];
        assert.equal(new Set(arr.map(x => x.id)).size, arr.length, `${key} ids must stay unique`);
    }
    moveItems(h.app, copies, 0, 300);                                          // typical Copy: copy then move the copies
    nearPt(newWall.start, 0, 300); nearPt(h.w1.start, 0, 0); near(newDoor.t, 0.25);
    newWall.start.x = 999; assert.equal(h.w1.start.x, 0, 'copies must not share nested objects with the originals');
});

test('copy keeps the layer, polygon rooms and every property', () => {
    const app = makeApp(); const l = app.layerManager.add('Phase 2');
    const r = app.roomManager.addRoom(0, 0, { name: 'Odd', polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }], isVoid: true }); r.layer = l.id;
    const [c] = copyItems(app, [{ category: 'room', obj: r }]);
    assert.equal(c.obj.layer, l.id); assert.equal(c.obj.isVoid, true); assert.deepEqual(c.obj.polygon, r.polygon);
    c.obj.polygon[0].x = 77; assert.equal(r.polygon[0].x, 0);
});

test('delete: removes the objects, and the doors of deleted walls', () => {
    const h = house();
    deleteItems(h.app, [{ category: 'wall', obj: h.w1 }, { category: 'furniture', obj: h.sofa }]);
    assert.equal(h.app.wallManager.walls.length, 1); assert.equal(h.app.openingManager.openings.length, 0); assert.equal(h.app.furnitureManager.items.length, 0);
    deleteItems(h.app, h.all.filter(i => i.category !== 'wall' && i.category !== 'opening' && i.category !== 'furniture'));
    assert.equal(h.app.roomManager.rooms.length + h.app.columnManager.columns.length + h.app.stairManager.stairs.length + h.app.dimensionManager.dimensions.length, 0);
});

test('describeSelection reads naturally', () => {
    const h = house();
    assert.equal(describeSelection([h.all[0], h.all[1], h.all[2]]), '2 walls, 1 door/window');
    assert.equal(describeSelection([h.all[3]]), '1 room');
    assert.equal(describeSelection([]), '');
});

test('random stress: any mix of rotate / mirror / move and its inverse restores the drawing', () => {
    let seed = 99; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let n = 0; n < 150; n++) {
        const h = house(); const before = JSON.parse(snapshot(h));
        const piv = { x: rnd() * 300 - 100, y: rnd() * 300 - 100 }, ang = (rnd() * 360) - 180, dx = rnd() * 200 - 100, dy = rnd() * 200 - 100;
        const m1 = { x: rnd() * 100, y: rnd() * 100 }, m2 = { x: m1.x + 10 + rnd() * 100, y: m1.y + rnd() * 100 - 50 };
        rotateItems(h.app, h.all, ang, piv); mirrorItems(h.app, h.all, m1, m2); moveItems(h.app, h.all, dx, dy);
        moveItems(h.app, h.all, -dx, -dy); mirrorItems(h.app, h.all, m1, m2); rotateItems(h.app, h.all, -ang, piv);
        const after = JSON.parse(snapshot(h));
        for (let i = 0; i < before.length; i++) {
            for (const k of ['x', 'y', 'offset']) if (typeof before[i][k] === 'number') near(after[i][k], before[i][k], 1e-7);
            if (before[i].start) { near(after[i].start.x, before[i].start.x, 1e-7); near(after[i].end.y, before[i].end.y, 1e-7); }
            if (before[i].points) before[i].points.forEach((pt, k) => { near(after[i].points[k].x, pt.x, 1e-7); near(after[i].points[k].y, pt.y, 1e-7); });
            if (before[i].vertex) for (const k of ['vertex', 'p1', 'p2']) { near(after[i][k].x, before[i][k].x, 1e-7); near(after[i][k].y, before[i][k].y, 1e-7); }
            if (typeof before[i].rotation === 'number') { const d = Math.abs(((after[i].rotation - before[i].rotation) % 360 + 360) % 360); assert.ok(d < 1e-6 || Math.abs(d - 360) < 1e-6 || ((before[i].width !== undefined || before[i].text !== undefined) && Math.min(d % 180, 180 - (d % 180)) < 1e-6), `rotation ${before[i].rotation} -> ${after[i].rotation}`); }
        }
    }
});

test('select: an object that only pokes into the rectangle is crossing-only, for every kind of object', () => {
    const app = makeApp();
    const room = app.roomManager.addRoom(100, 100, { width: 100, height: 100 });          // spans 50..150
    const sofa = app.furnitureManager.addItem('sofa_3p', 100, 300, 0);
    const col = app.columnManager.addColumn(300, 100, { width: 9, depth: 15 });
    const half = { x1: 0, y1: 0, x2: 100, y2: 400 };                                      // cuts the room and the sofa in half, misses the column
    const win = pickRect(app, half, 'window').map(i => i.obj), cross = pickRect(app, half, 'crossing').map(i => i.obj);
    assert.deepEqual(win, []);
    assert.ok(cross.includes(room) && cross.includes(sofa) && !cross.includes(col));
    const wall = app.wallManager.addWall({ x: 50, y: 50 }, { x: 250, y: 50 });            // a wall that runs out of the rectangle
    assert.ok(!pickRect(app, half, 'window').some(i => i.obj === wall)); assert.ok(pickRect(app, half, 'crossing').some(i => i.obj === wall));
});

test('annotation: move, rotate, mirror, copy and delete work on text, leaders and angular dimensions', () => {
    const h = house(); const items = [h.all[8], h.all[9], h.all[10]];
    moveItems(h.app, items, 10, 20);
    nearPt({ x: h.note.x, y: h.note.y }, 30, 110); nearPt(h.lead.points[0], 70, 80); nearPt(h.ang.vertex, 10, 20); nearPt(h.ang.p1, 90, 20);
    rotateItems(h.app, items, 90, { x: 0, y: 0 });
    near(h.note.rotation, 90); nearPt(h.ang.p1, -20, 90); nearPt(h.lead.points[0], -80, 70);
    rotateItems(h.app, items, -90, { x: 0, y: 0 }); moveItems(h.app, items, -10, -20);
    nearPt({ x: h.note.x, y: h.note.y }, 20, 90); near(h.note.rotation, 0, 1e-9);
    mirrorItems(h.app, items, { x: 100, y: -10 }, { x: 100, y: 10 });                              // the line x = 100
    nearPt({ x: h.note.x, y: h.note.y }, 180, 90); near(h.note.rotation, 0);                        // the text is moved, never flipped
    nearPt(h.lead.points[1], 80, 30); nearPt(h.ang.p1, 120, 0);
    mirrorItems(h.app, items, { x: 0, y: 50 }, { x: 10, y: 50 });                                   // a horizontal line: text stays upright
    near(h.note.rotation, 0);                                                                       // still upright after a horizontal mirror
    const copies = copyItems(h.app, items);
    assert.equal(copies.length, 3); assert.equal(h.app.annotationManager.texts.length, 2); assert.equal(h.app.annotationManager.leaders.length, 2); assert.equal(h.app.annotationManager.angdims.length, 2);
    const c = copies.find(x => x.category === 'leader').obj; assert.notEqual(c.id, h.lead.id); c.points[0].x = 9999; assert.notEqual(h.lead.points[0].x, 9999);
    deleteItems(h.app, copies); assert.equal(h.app.annotationManager.texts.length, 1);
    assert.equal(describeSelection(items), '1 text note, 1 leader, 1 angular dimension');
});
