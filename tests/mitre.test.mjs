// Mitred wall-corner geometry tests (no browser). Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Wall, WallManager, joinWalls } from '../modules/walls.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i].x * p[j].y - p[j].x * p[i].y; } return Math.abs(a) / 2; };
const ring = (pts, t = 10, type = 'exterior') => pts.map((a, i) => new Wall(a, pts[(i + 1) % pts.length], t, type));
/** perpendicular distance from point to the infinite line through the wall's centreline */
const lineDist = (w, p) => { const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y; return Math.abs((p.x - w.start.x) * dy - (p.y - w.start.y) * dx) / Math.hypot(dx, dy); };

test('mitre: a closed rectangular ring of walls tiles exactly (area = outer - inner)', () => {
    const walls = ring([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 250 }, { x: 100, y: 250 }], 10);
    const j = joinWalls(walls);
    const total = walls.reduce((s, w) => s + area(j.get(w.id).pts), 0);
    near(total, 210 * 160 - 190 * 140);
    for (const w of walls) { const e = j.get(w.id); assert.ok(e.startJoined && e.endJoined); }
});

test('mitre: outer corners are sharp and shared by both walls', () => {
    const [top, right] = ring([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 250 }, { x: 100, y: 250 }], 10);
    const j = joinWalls([top, right]);
    const t = j.get(top.id).pts, r = j.get(right.id).pts;
    const key = (p) => `${Math.round(p.x * 1e4) / 1e4},${Math.round(p.y * 1e4) / 1e4}`;
    const tk = t.map(key), rk = r.map(key);
    assert.ok(tk.includes('305,95') || tk.includes('305,105'));            // a corner at the building's outer/inner corner
    const shared = tk.filter(k => rk.includes(k));
    assert.deepEqual(shared.sort(), ['295,105', '305,95'].sort());          // inner + outer corner points are common
});

test('mitre: free ends stay flat and are not marked joined; collinear splits stay flat', () => {
    const a = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 'interior');
    const j1 = joinWalls([a]).get(a.id);
    assert.equal(j1.startJoined, false); assert.equal(j1.endJoined, false);
    assert.deepEqual(j1.pts, a.getPolygon());
    const b = new Wall({ x: 100, y: 0 }, { x: 200, y: 0 }, 10, 'interior');
    const j2 = joinWalls([a, b]);
    assert.equal(j2.get(a.id).endJoined, true);
    assert.deepEqual(j2.get(a.id).pts, a.getPolygon());                     // straight-on join needs no mitre
});

test('mitre: T and cross junctions keep flat ends but count as joined', () => {
    const left = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 }, 10), right = new Wall({ x: 100, y: 0 }, { x: 200, y: 0 }, 10);
    const stem = new Wall({ x: 100, y: 0 }, { x: 100, y: 80 }, 5);
    const j = joinWalls([left, right, stem]);
    assert.deepEqual(j.get(stem.id).pts, stem.getPolygon());
    assert.equal(j.get(stem.id).startJoined, true);
});

test('mitre: every outline vertex lies on its own wall faces, for any corner angle and thickness', () => {
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 400; i++) {
        const ang = (35 + rnd() * 110) * Math.PI / 180;              // 35..145 degrees between the walls
        const flip = rnd() < 0.5 ? -1 : 1;
        const tA = 3 + rnd() * 12, tB = 3 + rnd() * 12;
        const P = { x: rnd() * 100, y: rnd() * 100 };
        const a = new Wall(P, { x: P.x + 120, y: P.y }, tA);
        const b = new Wall(P, { x: P.x + Math.cos(flip * ang) * 120, y: P.y + Math.sin(flip * ang) * 120 }, tB);
        const j = joinWalls([a, b]);
        for (const w of [a, b]) {
            const pts = j.get(w.id).pts;
            // the 4 vertices must be on the +face / -face lines of THIS wall
            near(lineDist(w, pts[0]), w.thickness / 2, 1e-6); near(lineDist(w, pts[1]), w.thickness / 2, 1e-6);
            near(lineDist(w, pts[2]), w.thickness / 2, 1e-6); near(lineDist(w, pts[3]), w.thickness / 2, 1e-6);
        }
        // and the two walls must agree on the corner points
        const ka = j.get(a.id).pts.map(p => `${p.x.toFixed(5)},${p.y.toFixed(5)}`), kb = j.get(b.id).pts.map(p => `${p.x.toFixed(5)},${p.y.toFixed(5)}`);
        assert.equal(ka.filter(k => kb.includes(k)).length, 2, `walls must share exactly the 2 corner points (angle ${(ang * 180 / Math.PI).toFixed(1)})`);
    }
});

test('mitre: wall direction does not matter', () => {
    const a = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 }, 10), b = new Wall({ x: 100, y: 0 }, { x: 100, y: 100 }, 10);
    const b2 = new Wall({ x: 100, y: 100 }, { x: 100, y: 0 }, 10);                 // same wall, drawn the other way
    const area1 = area(joinWalls([a, b]).get(a.id).pts), area2 = area(joinWalls([a, b2]).get(a.id).pts);
    near(area1, area2); near(area1, ((105 + 95) / 2) * 10);                          // mitred end = trapezoid (105 outer, 95 inner)
});

test('mitre: very sharp angles fall back to a flat end instead of a long spike', () => {
    const a = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    const b = new Wall({ x: 0, y: 0 }, { x: Math.cos(0.12) * 100, y: Math.sin(0.12) * 100 }, 10);   // ~7 degrees
    const j = joinWalls([a, b]);
    assert.deepEqual(j.get(a.id).pts, a.getPolygon());
});

test('mitre: compound walls are left alone; rounded style returns no joins', () => {
    const c = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 }, 6, 'compound');
    assert.equal(joinWalls([c]).has(c.id), false);
    const m = new WallManager(); m.addWall({ x: 0, y: 0 }, { x: 10, y: 0 });
    assert.ok(m.getJoinedPolygons() instanceof Map);
    m.cornerStyle = 'round'; assert.equal(m.getJoinedPolygons(), null);
});

test('mitre: a corner of two different thicknesses still tiles (areas add up)', () => {
    const a = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 }, 9), b = new Wall({ x: 100, y: 0 }, { x: 100, y: 100 }, 4.5);
    const j = joinWalls([a, b]);
    // Together they cover the L-shaped union exactly once: sum of areas == union area (computed independently)
    const sum = area(j.get(a.id).pts) + area(j.get(b.id).pts);
    const expected = (100 + 2.25) * 9 + (100 - 4.5) * 4.5;
    near(sum, expected, 1e-6);
});
