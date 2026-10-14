// Unit tests for the pure geometry / units / id code (no browser needed).
// Run:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import { units, UnitSystem } from '../modules/units.js';
import { Wall, WallManager } from '../modules/walls.js';
import { OpeningManager } from '../modules/openings.js';
import { Room } from '../modules/rooms.js';
import { Column } from '../modules/columns.js';
import { DimensionLine } from '../modules/dimensions.js';
import { Stair } from '../modules/stairs.js';
import { nextId, reserveId } from '../modules/ids.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const pt = (x, y) => ({ x, y });

// ---------------------------------------------------------------- units
test('units: valid imperial inputs', () => {
    units.setSystem(UnitSystem.IMPERIAL);
    const cases = {
        "12'": 144, "12' 6\"": 150, "12'6": 150, "12'-6\"": 150, '12 ft 6 in': 150,
        '36"': 36, '36 in': 36, '10': 120, '25.5': 306, '4.5"': 4.5,
        '6 inches': 6, '36 inch': 36, '3 feet': 36, '3 feet 4 inches': 40,
        "12' 6 1/2\"": 150.5, '1/2"': 0.5, '.5"': 0.5, '-5': -60, "-5'": -60,
    };
    for (const [text, inches] of Object.entries(cases)) near(units.parseInput(text), inches);
});

test('units: metric suffixes work in both systems', () => {
    for (const sys of [UnitSystem.IMPERIAL, UnitSystem.METRIC]) {
        units.setSystem(sys);
        near(units.parseInput('10m'), 10000 / 25.4);
        near(units.parseInput('2.5 meters'), 2500 / 25.4);
        near(units.parseInput('1,5m'), 1500 / 25.4);   // decimal comma
        near(units.parseInput('230mm'), 230 / 25.4);
        near(units.parseInput('400cm'), 4000 / 25.4);
    }
    units.setSystem(UnitSystem.METRIC);
    near(units.parseInput('10'), 10000 / 25.4);          // plain number = metres
    units.setSystem(UnitSystem.IMPERIAL);
});

test('units: unclear text is rejected instead of guessed', () => {
    units.setSystem(UnitSystem.IMPERIAL);
    for (const bad of ['', '   ', 'abc', '10abc', '12x', "5'6\"x", '1/0"', '--5', '1e3', null, undefined, 42]) {
        assert.equal(units.parseInput(bad), null, `should reject ${JSON.stringify(bad)}`);
    }
});

test('units: format -> parse round trip (imperial)', () => {
    units.setSystem(UnitSystem.IMPERIAL);
    for (const inches of [0.5, 4.5, 9, 11.5, 12, 30, 36, 150, 150.5, 311, 600.5]) {
        near(units.parseInput(units.formatLength(inches)), inches, 0.05);
    }
    near(units.parseInput(units.formatLength(-150)), -150, 0.05);
});

test('units: format -> parse round trip (metric)', () => {
    units.setSystem(UnitSystem.METRIC);
    for (const inches of [9, 36, 150, 311, 600]) {
        near(units.parseInput(units.formatLength(inches)), inches, 0.25);   // 0.01 m resolution
    }
    units.setSystem(UnitSystem.IMPERIAL);
});

test('units: area formatting', () => {
    units.setSystem(UnitSystem.IMPERIAL);
    assert.equal(units.formatArea(144 * 100).primary, '100.0 Sq. Ft.');
    assert.equal(units.formatArea(0).primary, '0 Sq Ft');
    assert.equal(units.formatArea(NaN).primary, '0 Sq Ft');
});

// ---------------------------------------------------------------- ids
test('ids: unique per prefix, and restored ids are never reused', () => {
    const a = nextId('tst'), b = nextId('tst');
    assert.notEqual(a, b);
    reserveId('tst_500');
    assert.equal(nextId('tst'), 'tst_501');
    reserveId('tst_3');                       // lower than the counter: no effect
    assert.equal(nextId('tst'), 'tst_502');
    reserveId('garbage'); reserveId(undefined); reserveId(7);   // ignored, no throw
    assert.equal(nextId('other'), 'other_1');
});

// ---------------------------------------------------------------- walls
test('wall: length, angle, midpoint, polygon', () => {
    const w = new Wall(pt(0, 0), pt(100, 0), 10);
    near(w.getLength(), 100); near(w.getAngle(), 0);
    assert.deepEqual(w.getMidpoint(), pt(50, 0));
    const poly = w.getPolygon();
    assert.equal(poly.length, 4);
    near(Math.min(...poly.map(p => p.y)), -5); near(Math.max(...poly.map(p => p.y)), 5);
    near(Math.min(...poly.map(p => p.x)), 0); near(Math.max(...poly.map(p => p.x)), 100);
    assert.deepEqual(new Wall(pt(1, 1), pt(1, 1)).getPolygon(), []);       // degenerate wall
});

test('wall: projectPoint clamps to the segment and reports distance', () => {
    const w = new Wall(pt(0, 0), pt(100, 0));
    let p = w.projectPoint(pt(40, 30));
    near(p.t, 0.4); near(p.dist, 30); near(p.point.x, 40);
    p = w.projectPoint(pt(-50, 0)); near(p.t, 0); near(p.dist, 50);
    p = w.projectPoint(pt(150, 0)); near(p.t, 1); near(p.dist, 50);
});

test('wall: hit test uses max(half thickness, 8px) tolerance', () => {
    const w = new Wall(pt(0, 0), pt(100, 0), 9);
    assert.ok(w.hitTest(50, 4, 1));          // inside half-thickness (4.5)
    assert.ok(!w.hitTest(50, 20, 1));
    assert.ok(w.hitTest(50, 14, 0.5));       // zoomed out: 8px = 16 world units
});

test('walls: addWall refuses (near) zero-length walls', () => {
    const m = new WallManager();
    assert.equal(m.addWall(pt(0, 0), pt(0.5, 0)), null);
    assert.ok(m.addWall(pt(0, 0), pt(10, 0)));
    assert.equal(m.walls.length, 1);
});

test('walls: connectivity and moveVertex only touch matching endpoints', () => {
    const m = new WallManager();
    const a = m.addWall(pt(0, 0), pt(100, 0));
    const b = m.addWall(pt(100, 0), pt(100, 100));
    const c = m.addWall(pt(500, 500), pt(600, 500));
    assert.equal(m.findConnectedWalls(pt(100, 0)).length, 2);
    m.moveVertex(pt(100, 0), pt(120, 10), 2, [a.id]);
    assert.deepEqual(b.start, pt(120, 10));
    assert.deepEqual(a.end, pt(100, 0));      // excluded wall untouched
    assert.deepEqual(c.start, pt(500, 500));  // unrelated wall untouched
});

test('walls: setWallLength keeps the anchor fixed and drags connected walls', () => {
    const m = new WallManager();
    const a = m.addWall(pt(0, 0), pt(100, 0));
    const b = m.addWall(pt(100, 0), pt(100, 50));
    m.setWallLength(a.id, 150, 'start');
    near(a.getLength(), 150); assert.deepEqual(a.start, pt(0, 0)); near(a.end.x, 150);
    near(b.start.x, 150);                                  // connected wall followed
    m.setWallLength(a.id, 100, 'end');
    near(a.getLength(), 100); near(a.end.x, 150); near(a.start.x, 50);
    m.setWallLength(a.id, 200, 'center');
    near(a.getLength(), 200); near((a.start.x + a.end.x) / 2, 100);
    assert.equal(m.setWallLength(a.id, 3, 'start'), null);  // below the 6" minimum
});

test('walls: moveWall moves connected neighbours with it', () => {
    const m = new WallManager();
    const a = m.addWall(pt(0, 0), pt(100, 0));
    const b = m.addWall(pt(100, 0), pt(100, 100));
    m.moveWall(a.id, 0, 20, true);
    assert.deepEqual(a.start, pt(0, 20)); assert.deepEqual(a.end, pt(100, 20));
    assert.deepEqual(b.start, pt(100, 20)); assert.deepEqual(b.end, pt(100, 100));
    m.moveWall(a.id, 0, 10, false);
    assert.deepEqual(b.start, pt(100, 20));    // not dragged this time
});

test('walls: splitWall makes two connected walls and remaps openings', () => {
    const m = new WallManager(); const om = new OpeningManager();
    const w = m.addWall(pt(0, 0), pt(200, 0));
    const next = m.addWall(pt(200, 0), pt(200, 100));
    const left = om.addOpening(w.id, 0.25, { type: 'door' });
    const right = om.addOpening(w.id, 0.75, { type: 'window' });
    const r = m.splitWall(w.id, pt(100, 3), om);
    assert.ok(r);
    near(r.wall1.getLength(), 100); near(r.wall2.getLength(), 100);
    assert.deepEqual(r.wall1.end, r.wall2.start);
    assert.equal(left.wallId, r.wall1.id); near(left.t, 0.5);
    assert.equal(right.wallId, r.wall2.id); near(right.t, 0.5);
    assert.deepEqual(next.start, r.wall2.end);
    assert.equal(m.splitWall(w.id, pt(1, 0), om), null);       // too close to an end
    assert.equal(m.splitWall('nope', pt(1, 0)), null);
});

test('walls: bounds', () => {
    const m = new WallManager();
    assert.equal(m.getBounds(), null);
    m.addWall(pt(10, 20), pt(110, 20)); m.addWall(pt(110, 20), pt(110, 220), 4.5, 'interior');
    assert.deepEqual(m.getBounds(), { x: 10, y: 20, width: 100, height: 200 });
    assert.deepEqual(m.getBounds(true), { x: 10, y: 20, width: 100, height: 0 });
});

// ---------------------------------------------------------------- openings
test('openings: must fit the wall and may not overlap', () => {
    const m = new WallManager(); const om = new OpeningManager();
    const w = m.addWall(pt(0, 0), pt(100, 0));
    assert.equal(om.checkPlacement(w, 0.5, 96).ok, false);          // wider than wall minus jambs
    const edge = om.checkPlacement(w, 0.99, 36);                    // nudged away from the end
    assert.ok(edge.ok); near(edge.t, (100 - 3 - 18) / 100);
    const first = om.addOpening(w.id, 0.5, { width: 36 });
    assert.equal(om.checkPlacement(w, 0.6, 36).ok, false);          // overlaps (centres 10" apart)
    assert.equal(om.checkPlacement(w, 0.9, 36).ok, false);          // nudged to 0.79 -> still overlaps
    const long = m.addWall(pt(0, 200), pt(300, 200));
    om.addOpening(long.id, 0.5, { width: 36 });
    assert.ok(om.checkPlacement(long, 0.9, 36).ok);                 // plenty of room on a longer wall
    assert.equal(om.checkPlacement(w, 0.5, 36, first.id).ok, true); // editing itself is fine
    const other = m.addWall(pt(0, 50), pt(100, 50));
    assert.ok(om.checkPlacement(other, 0.5, 36).ok);                // different wall: free
});

// ---------------------------------------------------------------- rooms
test('room: rectangle and polygon area / bounds', () => {
    const r = new Room(100, 100, { width: 144, height: 120 });
    near(r.getArea(), 144 * 120);
    assert.deepEqual(r.getBounds(), { x: 28, y: 40, width: 144, height: 120 });
    const tri = new Room(0, 0, { polygon: [pt(0, 0), pt(10, 0), pt(0, 10)] });
    near(tri.getArea(), 50);
    const triCw = new Room(0, 0, { polygon: [pt(0, 0), pt(0, 10), pt(10, 0)] });
    near(triCw.getArea(), 50);                                       // winding doesn't matter
    assert.deepEqual(tri.getBounds(), { x: 0, y: 0, width: 10, height: 10 });
});

test('room: rotate wraps into 0..359, narrow-room heuristic', () => {
    const r = new Room(0, 0, { width: 144, height: 144 });
    r.rotate(90); r.rotate(90); r.rotate(90); r.rotate(90); r.rotate(90);
    assert.equal(r.rotation, 90);
    r.rotate(-180); assert.equal(r.rotation, 270);
    assert.equal(new Room(0, 0, { width: 240, height: 96 }).isNarrow(), true);
    assert.equal(new Room(0, 0, { width: 144, height: 144 }).isNarrow(), false);
    assert.equal(new Room(0, 0, { name: 'Balcony', width: 144, height: 144 }).isNarrow(), true);
});

// ---------------------------------------------------------------- columns
test('column: polygon, bounds and hit test follow rotation', () => {
    const c = new Column(100, 100, { width: 9, depth: 15 });
    let b = c.getBounds();
    near(b.width, 9); near(b.height, 15);
    c.rotate(90);
    b = c.getBounds(); near(b.width, 15); near(b.height, 9);
    const xs = c.getPolygon().map(p => p.x), ys = c.getPolygon().map(p => p.y);
    near(Math.max(...xs) - Math.min(...xs), 15); near(Math.max(...ys) - Math.min(...ys), 9);
    assert.ok(c.hitTest(100 + 7, 100, 1));            // inside the (rotated) long side
    assert.ok(!c.hitTest(100, 100 + 20, 1));          // outside the short side
    c.rotate(-90); c.rotate(-90); assert.equal(c.rotation, 270);
    assert.match(new Column(0, 0).name, /^C\d+$/);
});

// ---------------------------------------------------------------- dimensions
test('dimension: offset line is perpendicular and hit-testable', () => {
    const d = new DimensionLine(pt(0, 0), pt(100, 0), 24);
    near(d.getLength(), 100);
    const g = d.getGeometry();
    near(g.p1.x, 0); near(g.p1.y, 24); near(g.p2.x, 100); near(g.p2.y, 24);
    assert.ok(d.hitTest(50, 24 + 3, 1));
    assert.ok(!d.hitTest(50, 24 + 30, 1));
    assert.ok(!d.hitTest(150, 24, 1));                 // beyond the end
    assert.equal(new DimensionLine(pt(5, 5), pt(5, 5)).getGeometry(), null);
});

// ---------------------------------------------------------------- stairs
test('stair: bounds swap with rotation and contain the hit area', () => {
    const s = new Stair({ x: 0, y: 0, type: 'straight', flightWidth: 36, treads: 10, treadDepth: 10 });
    let b = s.getBounds(); near(b.width, 36); near(b.height, 100);
    s.rotation = 90;
    b = s.getBounds(); near(b.width, 100); near(b.height, 36);
    assert.ok(s.hitTest(45, 0)); assert.ok(!s.hitTest(0, 45));
    for (const type of ['straight', 'dogleg', 'open_well', 'l_shape', 'spiral']) {
        const st = new Stair({ type, treads: 16 });
        const d = st.getLocalDimensions();
        assert.ok(d.width > 0 && d.height > 0, type);
    }
});
