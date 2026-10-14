// Wall editing (OFFSET / TRIM / EXTEND / FILLET / CHAMFER) and measuring. Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { LayerManager } from '../modules/layers.js';
import { WallManager } from '../modules/walls.js';
import { OpeningManager } from '../modules/openings.js';
import { reshapeWall, offsetWall, trimWall, extendWall, filletWalls, chamferWalls, lineIntersection } from '../modules/wall_edit.js';
import { distanceInfo, polygonArea, polylineLength, angleAt, describeDistance, describeArea, fmtDeg } from '../modules/measure.js';
import { units, UnitSystem } from '../modules/units.js';

units.setSystem(UnitSystem.IMPERIAL);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const nearPt = (p, x, y, eps = 1e-9) => { near(p.x, x, eps); near(p.y, y, eps); };
function makeApp() {
    const app = { layerManager: new LayerManager(), wallManager: new WallManager(), openingManager: new OpeningManager() };
    app.wallManager.layers = app.layerManager; app.openingManager.layers = app.layerManager;
    return app;
}
const W = (app, x1, y1, x2, y2, t = 9, type = 'exterior') => app.wallManager.addWall({ x: x1, y: y1 }, { x: x2, y: y2 }, t, type);
const worldX = (app, w, o) => w.start.x + o.t * (w.end.x - w.start.x);

test('reshape: doors and windows stay where they are in the world', () => {
    const app = makeApp(); const w = W(app, 0, 0, 200, 0);
    const d = app.openingManager.addOpening(w.id, 0.5, { type: 'door', width: 36 });          // centre at x = 100
    const r = reshapeWall(app, w, { x: 50, y: 0 }, { x: 250, y: 0 });
    assert.equal(r.removed, 0); near(worldX(app, w, d), 100); near(d.t, 0.25);
    reshapeWall(app, w, { x: 0, y: 0 }, { x: 400, y: 0 });
    near(worldX(app, w, d), 100);
});

test('reshape: an opening that no longer fits is removed (and counted); a tiny wall is refused', () => {
    const app = makeApp(); const w = W(app, 0, 0, 200, 0);
    app.openingManager.addOpening(w.id, 0.5, { type: 'door', width: 36 }); app.openingManager.addOpening(w.id, 0.9, { type: 'window', width: 40 });
    const r = reshapeWall(app, w, { x: 0, y: 0 }, { x: 110, y: 0 });                             // door ends at 118 > 110, window gone
    assert.equal(r.removed, 2); assert.equal(app.openingManager.openings.length, 0);
    assert.throws(() => reshapeWall(app, w, { x: 5, y: 5 }, { x: 5.2, y: 5 }), /nothing of the wall/);
});

test('offset: parallel copy on the chosen side, same thickness / type / layer', () => {
    const app = makeApp(); const w = W(app, 0, 0, 200, 0, 4.5, 'interior'); w.layer = 'walls';
    let c = offsetWall(app, w, 30, { x: 100, y: 80 });                                          // below (Y down)
    nearPt(c.start, 0, 30); nearPt(c.end, 200, 30); assert.equal(c.thickness, 4.5); assert.equal(c.type, 'interior'); assert.equal(c.layer, 'walls');
    c = offsetWall(app, w, 30, { x: 100, y: -80 });
    nearPt(c.start, 0, -30);
    const v = W(app, 50, 0, 50, 100); c = offsetWall(app, v, 12, { x: 200, y: 50 }); nearPt(c.start, 62, 0); nearPt(c.end, 62, 100);
    const diag = W(app, 0, 0, 100, 100); c = offsetWall(app, diag, Math.SQRT2 * 10, { x: 100, y: 0 }); nearPt(c.start, 10, -10, 1e-9);
    assert.throws(() => offsetWall(app, w, 0, { x: 0, y: 5 }), /more than zero/); assert.throws(() => offsetWall(app, w, -3, { x: 0, y: 5 }), /more than zero/);
    assert.equal(app.wallManager.walls.length, 7);
});

test('trim: removes the part on the side that was picked', () => {
    const app = makeApp(); const w = W(app, 0, 0, 200, 0); const cutter = W(app, 120, -50, 120, 50);
    trimWall(app, w, cutter, { x: 190, y: 0 }); nearPt(w.start, 0, 0); nearPt(w.end, 120, 0);
    const w2 = W(app, 0, 100, 200, 100); const c2 = W(app, 120, 50, 120, 150);
    trimWall(app, w2, c2, { x: 10, y: 100 }); nearPt(w2.start, 120, 100); nearPt(w2.end, 200, 100);
});

test('trim: needs a real crossing, keeps doors on the remaining part, drops the rest', () => {
    const app = makeApp(); const w = W(app, 0, 0, 200, 0); const cutter = W(app, 120, -50, 120, 50);
    const keep = app.openingManager.addOpening(w.id, 0.25, { type: 'door', width: 36 });            // x = 50
    const gone = app.openingManager.addOpening(w.id, 0.8, { type: 'window', width: 40 });           // x = 160
    const r = trimWall(app, w, cutter, { x: 190, y: 0 });
    assert.equal(r.removed, 1); assert.ok(app.openingManager.getOpeningById(keep.id)); assert.ok(!app.openingManager.getOpeningById(gone.id));
    near(worldX(app, w, keep), 50);
    const far = W(app, 500, -50, 500, 50);
    assert.throws(() => trimWall(app, w, far, { x: 10, y: 0 }), /do not cross/);
    assert.throws(() => trimWall(app, w, w, { x: 10, y: 0 }), /different/);
    assert.throws(() => trimWall(app, w, cutter, { x: 190, y: 0 }) && trimWall(app, w, W(app, 0.4, -50, 0.4, 50), { x: 100, y: 0 }), /nothing of the wall/);
});

test('extend: the end nearest the click grows until it meets the other wall', () => {
    const app = makeApp(); const w = W(app, 0, 0, 100, 0); const b = W(app, 160, -50, 160, 50);
    const d = app.openingManager.addOpening(w.id, 0.5, { type: 'door', width: 36 });                  // x = 50
    const r = extendWall(app, w, b, { x: 95, y: 0 }); nearPt(w.end, 160, 0); nearPt(w.start, 0, 0); near(worldX(app, w, d), 50); assert.equal(r.removed, 0);
    const w2 = W(app, 0, 20, 100, 20); const b2 = W(app, -70, -50, -70, 50);
    extendWall(app, w2, b2, { x: 5, y: 20 }); nearPt(w2.start, -70, 20);                              // extends backwards at the start
});

test('extend: explains why it cannot', () => {
    const app = makeApp(); const w = W(app, 0, 0, 100, 0); const b = W(app, 160, -50, 160, 50);
    assert.throws(() => extendWall(app, w, b, { x: 5, y: 0 }), /does not run into/);                  // the start end points away from the boundary
    assert.throws(() => extendWall(app, w, W(app, 160, 10, 160, 50), { x: 95, y: 0 }), /does not run into/);   // boundary does not reach the wall's line
    assert.throws(() => extendWall(app, W(app, 0, 0, 160, 0), b, { x: 150, y: 0 }), /already touches/);
    assert.throws(() => extendWall(app, w, w, { x: 95, y: 0 }), /different/);
});

test('fillet: two walls meet in a sharp corner (extend + trim in one step)', () => {
    const app = makeApp(); const a = W(app, 0, 0, 90, 0), b = W(app, 110, 100, 110, 20);
    const r = filletWalls(app, a, b); nearPt(r.point, 110, 0); nearPt(a.end, 110, 0); nearPt(b.end, 110, 0); nearPt(a.start, 0, 0); nearPt(b.start, 110, 100);
    const c = W(app, 0, 200, 130, 200), d = W(app, 110, 200, 110, 300);                              // c overshoots the corner
    filletWalls(app, c, d); nearPt(c.end, 110, 200); nearPt(d.start, 110, 200);
    assert.throws(() => filletWalls(app, W(app, 0, 0, 10, 0), W(app, 0, 5, 10, 5)), /parallel/);
    assert.throws(() => filletWalls(app, c, c), /different/);
});

test('fillet keeps doors in place', () => {
    const app = makeApp(); const a = W(app, 0, 0, 90, 0), b = W(app, 110, 100, 110, 20);
    const d = app.openingManager.addOpening(a.id, 0.5, { type: 'door', width: 36 });                  // x = 45
    filletWalls(app, a, b); near(worldX(app, a, d), 45);
});

test('chamfer: cuts the corner with a new short wall', () => {
    const app = makeApp(); const a = W(app, 0, 0, 100, 0), b = W(app, 100, 0, 100, 100, 6, 'interior');
    const r = chamferWalls(app, a, b, 20, 30);
    nearPt(a.end, 80, 0); nearPt(b.start, 100, 30); nearPt(r.wall.start, 80, 0); nearPt(r.wall.end, 100, 30);
    assert.equal(r.wall.thickness, 9); assert.equal(app.wallManager.walls.length, 3);
    near(r.wall.getLength(), Math.hypot(20, 30));
    assert.throws(() => chamferWalls(app, a, b, 500, 5), /too short/); assert.throws(() => chamferWalls(app, a, b, 0, 5), /more than zero/);
    assert.throws(() => chamferWalls(app, a, a, 5, 5), /different/);
    assert.equal(app.wallManager.walls.length, 3, 'failed chamfers add nothing');
});

test('lineIntersection', () => {
    nearPt(lineIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }), 5, 5);
    nearPt(lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 50, y: -5 }, { x: 50, y: 5 }), 50, 0);       // beyond both segments: infinite lines
    assert.equal(lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 5, y: 1 }), null);
});

test('measure: distance (Y up, counter-clockwise), area, perimeter, angle', () => {
    let d = distanceInfo({ x: 0, y: 0 }, { x: 30, y: -40 });                                         // up and to the right on screen
    near(d.dist, 50); near(d.dx, 30); near(d.dy, 40); near(d.angle, Math.atan2(40, 30) * 180 / Math.PI);
    near(distanceInfo({ x: 0, y: 0 }, { x: 0, y: 10 }).angle, 270); near(distanceInfo({ x: 0, y: 0 }, { x: -10, y: 0 }).angle, 180); near(distanceInfo({ x: 5, y: 5 }, { x: 5, y: 5 }).dist, 0);
    near(polygonArea([{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 144 }, { x: 0, y: 144 }]), 144 * 144);
    near(polygonArea([{ x: 0, y: 144 }, { x: 144, y: 144 }, { x: 144, y: 0 }, { x: 0, y: 0 }]), 144 * 144);                 // winding does not matter
    assert.equal(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }]), 0); assert.equal(polygonArea(null), 0);
    near(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]), 11); near(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }], true), 12);
    near(angleAt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }), 90); near(angleAt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }), 45); near(angleAt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -10, y: 0 }), 180);
    assert.equal(angleAt({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }), null);
    assert.equal(fmtDeg(45), '45\u00b0'); assert.equal(fmtDeg(33.333), '33.33\u00b0');
    assert.match(describeDistance({ x: 0, y: 0 }, { x: 144, y: 0 }), /Distance 12'/); assert.match(describeArea([{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 144 }, { x: 0, y: 144 }]), /Area 144\.0 Sq\. Ft\./);
});
