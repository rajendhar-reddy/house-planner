/**
 * wall_edit.js - OFFSET / TRIM / EXTEND / FILLET / CHAMFER for walls (pure geometry on the app's managers).
 *
 * Doors and windows keep their place in the world when a wall is shortened or lengthened: they are re-measured
 * along the new wall, and any that no longer fit on it are removed (the result says how many).
 */

import { segmentIntersection, rayHitsSegment, closestPointOnSegment } from './snap.js';

const MIN_WALL = 1;     // inches: shorter than this a wall is considered gone

export function lineIntersection(p1, p2, p3, p4) {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y, d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    const det = d1x * d2y - d1y * d2x;
    if (Math.abs(det) < 1e-9) return null;
    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / det;
    return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a, b) => { const d = dist(a, b); return d < 1e-12 ? { x: 0, y: 0 } : { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };

/**
 * Give `wall` new end points, keeping its doors/windows where they are in the world.
 * @returns {{removed: number}} how many openings no longer fit and were deleted
 */
export function reshapeWall(app, wall, newStart, newEnd) {
    if (dist(newStart, newEnd) < MIN_WALL) throw new Error('That would leave nothing of the wall.');
    const ops = app.openingManager.openings.filter(o => o.wallId === wall.id);
    const world = ops.map(o => ({ o, x: wall.start.x + o.t * (wall.end.x - wall.start.x), y: wall.start.y + o.t * (wall.end.y - wall.start.y) }));
    wall.start = { x: newStart.x, y: newStart.y };
    wall.end = { x: newEnd.x, y: newEnd.y };
    const len = wall.getLength();
    const dx = (wall.end.x - wall.start.x) / len, dy = (wall.end.y - wall.start.y) / len;
    let removed = 0;
    for (const w of world) {
        const along = (w.x - wall.start.x) * dx + (w.y - wall.start.y) * dy;
        const half = w.o.width / 2;
        if (along - half < 0 || along + half > len) { app.openingManager.removeOpening(w.o.id); removed++; continue; }
        w.o.t = along / len;
    }
    return { removed };
}

/** A parallel copy of `wall`, `distance` inches away, on the side of `sidePoint`. */
export function offsetWall(app, wall, distance, sidePoint) {
    if (!(distance > 0)) throw new Error('The offset distance must be more than zero.');
    const u = unit(wall.start, wall.end);
    if (u.x === 0 && u.y === 0) throw new Error('That wall has no length.');
    const n = { x: -u.y, y: u.x };
    const side = ((sidePoint.x - wall.start.x) * n.x + (sidePoint.y - wall.start.y) * n.y) >= 0 ? 1 : -1;
    const o = { x: n.x * side * distance, y: n.y * side * distance };
    const made = app.wallManager.addWall({ x: wall.start.x + o.x, y: wall.start.y + o.y }, { x: wall.end.x + o.x, y: wall.end.y + o.y }, wall.thickness, wall.type);
    if (made && wall.layer) made.layer = wall.layer;
    return made;
}

/** Cut `wall` back to the line of `cutter`, removing the part on the side of `pick`. */
export function trimWall(app, wall, cutter, pick) {
    if (wall === cutter) throw new Error('Pick two different walls.');
    const P = segmentIntersection(wall.start, wall.end, cutter.start, cutter.end);
    if (!P) throw new Error('These two walls do not cross, so there is nothing to trim. (Use EXTEND to make a wall reach another one.)');
    const pc = closestPointOnSegment(pick, wall.start, wall.end);
    const tP = closestPointOnSegment(P, wall.start, wall.end).t;
    const removeStartSide = pc.t < tP;
    const r = removeStartSide ? reshapeWall(app, wall, P, wall.end) : reshapeWall(app, wall, wall.start, P);
    return { point: P, ...r };
}

/** Lengthen the end of `wall` that is nearer to `pick` until it meets `boundary`. */
export function extendWall(app, wall, boundary, pick) {
    if (wall === boundary) throw new Error('Pick two different walls.');
    const endKey = dist(pick, wall.start) <= dist(pick, wall.end) ? 'start' : 'end';
    const from = wall[endKey], other = endKey === 'start' ? wall.end : wall.start;
    const dir = unit(other, from);                                      // pointing away from the wall's body
    const P = rayHitsSegment(from, dir, boundary.start, boundary.end);
    if (!P) throw new Error('That end does not run into the other wall. Pick the end nearest to the wall you want to reach.');
    if (dist(P, from) < 1e-6) throw new Error('That end already touches the other wall.');
    const r = endKey === 'start' ? reshapeWall(app, wall, P, wall.end) : reshapeWall(app, wall, wall.start, P);
    return { point: P, ...r };
}

function nearEnd(wall, P) { return dist(P, wall.start) <= dist(P, wall.end) ? 'start' : 'end'; }

/** Join two walls in a sharp corner: each is trimmed or extended to where their lines meet. */
export function filletWalls(app, w1, w2) {
    if (w1 === w2) throw new Error('Pick two different walls.');
    const P = lineIntersection(w1.start, w1.end, w2.start, w2.end);
    if (!P) throw new Error('These walls are parallel and never meet.');
    const plan = [w1, w2].map(w => {
        const e = nearEnd(w, P), far = e === 'start' ? w.end : w.start;
        const u = unit(far, P);                                           // from the far end towards P
        const v = unit(far, w[e]);
        if ((u.x * v.x + u.y * v.y) < 0 || dist(far, P) < MIN_WALL) throw new Error('The corner would fall behind one of the walls - pick walls that point towards each other.');
        return { w, e };
    });
    let removed = 0;
    for (const { w, e } of plan) {
        const r = e === 'start' ? reshapeWall(app, w, P, w.end) : reshapeWall(app, w, w.start, P);
        removed += r.removed;
    }
    return { point: P, removed };
}

/** Cut a corner: both walls end `d1` / `d2` inches before the corner and a short new wall joins them. */
export function chamferWalls(app, w1, w2, d1, d2) {
    if (w1 === w2) throw new Error('Pick two different walls.');
    if (!(d1 > 0) || !(d2 > 0)) throw new Error('The chamfer distances must be more than zero.');
    const P = lineIntersection(w1.start, w1.end, w2.start, w2.end);
    if (!P) throw new Error('These walls are parallel and never meet.');
    const info = [[w1, d1], [w2, d2]].map(([w, d]) => {
        const e = nearEnd(w, P), far = e === 'start' ? w.end : w.start;
        const u = unit(P, far);                                           // from the corner along the wall
        if (dist(far, P) <= d + MIN_WALL) throw new Error(`A wall is too short for a ${Math.round(d * 10) / 10} inch chamfer.`);
        return { w, e, point: { x: P.x + u.x * d, y: P.y + u.y * d } };
    });
    let removed = 0;
    for (const { w, e, point } of info) {
        const r = e === 'start' ? reshapeWall(app, w, point, w.end) : reshapeWall(app, w, w.start, point);
        removed += r.removed;
    }
    const made = app.wallManager.addWall(info[0].point, info[1].point, w1.thickness, w1.type);
    if (made && w1.layer) made.layer = w1.layer;
    return { point: P, removed, wall: made };
}
