// Snapping tests (no browser). Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSnap, closestPointOnSegment, segmentIntersection, perpendicularFoot, rayHitsSegment, DEFAULT_SNAP_MODES } from '../modules/snap.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const P = (x, y) => ({ x, y });
const S = (x1, y1, x2, y2) => ({ a: P(x1, y1), b: P(x2, y2) });
const base = { radius: 10, gridStep: 12, settings: { orthoMode: false, polarMode: false, polarIncrement: 45, snapToGrid: false, snapToPoints: true } };
const snap = (over) => computeSnap({ ...base, targets: [], segments: [], basePoint: null, forceOrtho: false, ...over, settings: { ...base.settings, ...(over.settings || {}) } });

test('geometry: closest point, crossing, perpendicular foot, ray hit', () => {
    const c = closestPointOnSegment(P(5, 8), P(0, 0), P(10, 0)); near(c.x, 5); near(c.y, 0); near(c.dist, 8); near(c.t, 0.5);
    near(closestPointOnSegment(P(-5, 3), P(0, 0), P(10, 0)).x, 0);                  // clamped to the end
    assert.deepEqual(segmentIntersection(P(0, 0), P(10, 10), P(0, 10), P(10, 0)), P(5, 5));
    assert.equal(segmentIntersection(P(0, 0), P(4, 0), P(6, -5), P(6, 5)), null);    // lines would meet, segments do not
    assert.equal(segmentIntersection(P(0, 0), P(10, 0), P(0, 1), P(10, 1)), null);   // parallel
    assert.deepEqual(perpendicularFoot(P(3, 9), P(0, 0), P(10, 0)), P(3, 0));
    assert.equal(perpendicularFoot(P(30, 9), P(0, 0), P(10, 0)), null);               // foot lies beyond the segment
    assert.deepEqual(rayHitsSegment(P(0, 0), P(1, 0), P(7, -3), P(7, 3)), P(7, 0));
    assert.equal(rayHitsSegment(P(0, 0), P(-1, 0), P(7, -3), P(7, 3)), null);         // behind the ray
});

test('snap: endpoints and midpoints win over everything else; modes can be switched off', () => {
    const targets = [{ x: 50, y: 50, type: 'endpoint' }, { x: 52, y: 50, type: 'midpoint' }];
    const r = snap({ x: 49, y: 51, targets, segments: [S(0, 0, 100, 100), S(0, 100, 100, 0)] });
    assert.equal(r.snap.type, 'endpoint'); near(r.x, 50);
    const r2 = snap({ x: 53, y: 50, targets, settings: { snapModes: { ...DEFAULT_SNAP_MODES, midpoint: false, endpoint: false } } });
    assert.equal(r2.snapped, false);
    const r3 = snap({ x: 49, y: 51, targets, settings: { snapToPoints: false } });
    assert.equal(r3.snapped, false);
    assert.equal(snap({ x: 200, y: 200, targets }).snapped, false);                      // outside the magnet radius
});

test('snap: intersection of two lines', () => {
    const segs = [S(0, 0, 100, 100), S(0, 100, 100, 0)];
    const r = snap({ x: 53, y: 48, segments: segs });
    assert.equal(r.snap.type, 'intersection'); near(r.x, 50); near(r.y, 50);
    const off = snap({ x: 53, y: 48, segments: segs, settings: { snapModes: { ...DEFAULT_SNAP_MODES, intersection: false, perpendicular: false } } });
    assert.equal(off.snapped, false);
});

test('snap: perpendicular foot from the last point', () => {
    const r = snap({ x: 32, y: 3, basePoint: P(30, 80), segments: [S(0, 0, 100, 0)] });
    assert.equal(r.snap.type, 'perpendicular'); near(r.x, 30); near(r.y, 0);
    const none = snap({ x: 32, y: 3, basePoint: null, segments: [S(0, 0, 100, 0)] });
    assert.equal(none.snapped, false);                                                      // needs a last point
    assert.equal(snap({ x: 200, y: 3, basePoint: P(300, 80), segments: [S(0, 0, 100, 0)] }).snapped, false);   // foot is off the end of the line
});

test('snap: nearest point is off by default and works when enabled', () => {
    const segs = [S(0, 0, 100, 0)];
    assert.equal(snap({ x: 40, y: 4, segments: segs }).snapped, false);
    const r = snap({ x: 40, y: 4, segments: segs, settings: { snapModes: { ...DEFAULT_SNAP_MODES, nearest: true } } });
    assert.equal(r.snap.type, 'nearest'); near(r.x, 40); near(r.y, 0);
});

test('snap: grid is the last resort', () => {
    const r = snap({ x: 25, y: 13, settings: { snapToGrid: true } });
    assert.deepEqual([r.x, r.y, r.snap.type], [24, 12, 'grid']);
    assert.equal(computeSnap({ ...base, radius: 5, x: 6, y: 6, targets: [], segments: [], basePoint: null, settings: { ...base.settings, snapToGrid: true } }).snapped, false);   // 8.5 from the nearest grid point, magnet is 5
    assert.equal(snap({ x: 25, y: 13, settings: { snapToGrid: true, snapModes: { ...DEFAULT_SNAP_MODES, grid: false } } }).snapped, false);   // grid mode switched off
});

test('ortho (unchanged behaviour): locks to 45 degree steps, stays on its ray even beside a snap target', () => {
    const r = snap({ x: 100, y: 3, basePoint: P(0, 0), settings: { orthoMode: true } });
    near(r.y, 0); assert.equal(r.guide.angle, 0);
    const t = snap({ x: 100, y: 3, basePoint: P(0, 0), forceOrtho: true, targets: [{ x: 101, y: 6, type: 'endpoint' }] });
    near(t.y, 0); near(t.x, 101); assert.equal(t.snap.type, 'endpoint');                    // the target is slid onto the axis
    const g = snap({ x: 98, y: 2, basePoint: P(0, 0), forceOrtho: true, settings: { snapToGrid: true } });
    near(g.y, 0); near(g.x % 12, 0);                                                         // grid snap along the ray
    const diag = snap({ x: 50, y: 53, basePoint: P(0, 0), forceOrtho: true });
    near(diag.x, diag.y);
});

test('ortho + geometry: the ray snaps to where it crosses a line', () => {
    const r = snap({ x: 98, y: 1, basePoint: P(0, 0), forceOrtho: true, segments: [S(100, -50, 100, 50)] });
    assert.equal(r.snap.type, 'intersection'); near(r.x, 100); near(r.y, 0);
});

test('polar tracking: locks within a few degrees of a tracking angle, free otherwise', () => {
    const s = { polarMode: true, polarIncrement: 30 };
    const lock = snap({ x: 100 * Math.cos(31 * Math.PI / 180), y: 100 * Math.sin(31 * Math.PI / 180), basePoint: P(0, 0), settings: s });
    near(Math.atan2(lock.y, lock.x) * 180 / Math.PI, 30, 1e-9); near(Math.hypot(lock.x, lock.y), 100, 1e-9);
    assert.equal(lock.guide.angle, 30);
    const free = snap({ x: 100 * Math.cos(38 * Math.PI / 180), y: 100 * Math.sin(38 * Math.PI / 180), basePoint: P(0, 0), settings: s });
    near(Math.atan2(free.y, free.x) * 180 / Math.PI, 38, 1e-9); assert.equal(free.guide, null);
    const neg = snap({ x: 100, y: -59, basePoint: P(0, 0), settings: { polarMode: true, polarIncrement: 15 } });           // -30.5 degrees -> -30
    near(Math.atan2(neg.y, neg.x) * 180 / Math.PI, -30, 1e-9);
    assert.equal(snap({ x: 100, y: 31, basePoint: null, settings: s }).guide, null);        // no start point, nothing to track from
    const off = snap({ x: 100, y: 3, basePoint: P(0, 0), settings: { polarMode: false } });
    near(off.y, 3);
});

test('polar tracking also tracks to endpoints that lie on the tracking line', () => {
    const r = snap({ x: 118, y: 2, basePoint: P(0, 0), settings: { polarMode: true, polarIncrement: 15 }, targets: [{ x: 120, y: 1, type: 'endpoint' }] });
    assert.equal(r.snap.type, 'endpoint'); near(r.y, 0); near(r.x, 120);
});
