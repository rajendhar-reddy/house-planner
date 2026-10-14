/**
 * snap.js - Pure snapping maths (no DOM), used by CanvasEngine.getSnapPoint.
 *
 * Order of preference (like AutoCAD object snaps):
 *   1. endpoint / midpoint  (points handed in by the caller)
 *   2. intersection         (two lines crossing, or the ortho/polar ray crossing a line)
 *   3. perpendicular        (foot of the perpendicular from the last point onto a line)
 *   4. nearest              (closest point on any line - off by default)
 *   5. grid
 * While ortho or polar tracking holds the cursor on a direction, every snap is kept ON that direction.
 */

export const DEFAULT_SNAP_MODES = { endpoint: true, midpoint: true, intersection: true, perpendicular: true, nearest: false, grid: true };

// ---------------------------------------------------------------- geometry helpers
/** Closest point to p on the segment a-b, with its parameter t (0..1) and distance. */
export function closestPointOnSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    let t = len2 < 1e-12 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    return { x: q.x, y: q.y, t, dist: Math.hypot(p.x - q.x, p.y - q.y) };
}

/** Where segments a-b and c-d cross (inside both), or null. */
export function segmentIntersection(a, b, c, d) {
    const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-9) return null;                                   // parallel or collinear
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return { x: a.x + t * r.x, y: a.y + t * r.y };
}

/** Foot of the perpendicular from p onto the segment a-b if it lies on the segment, else null. */
export function perpendicularFoot(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return null;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    if (t < 0 || t > 1) return null;
    return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Where the ray origin + s*dir (s >= 0) meets the segment a-b, or null. */
export function rayHitsSegment(origin, dir, a, b) {
    const sx = b.x - a.x, sy = b.y - a.y;
    const den = dir.x * sy - dir.y * sx;
    if (Math.abs(den) < 1e-9) return null;
    const s = ((a.x - origin.x) * sy - (a.y - origin.y) * sx) / den;
    const u = ((a.x - origin.x) * dir.y - (a.y - origin.y) * dir.x) / den;
    if (s < 0 || u < -1e-9 || u > 1 + 1e-9) return null;
    return { x: origin.x + dir.x * s, y: origin.y + dir.y * s };
}

const wrapDeg = (d) => ((d + 540) % 360) - 180;

// ---------------------------------------------------------------- the snap computation
/**
 * @param o.x,o.y       raw cursor position (world)
 * @param o.targets     [{x, y, type}] endpoint / midpoint style points
 * @param o.segments    [{a:{x,y}, b:{x,y}}] lines available for intersection / perpendicular / nearest
 * @param o.basePoint   last point (start of the thing being drawn) or null
 * @param o.forceOrtho  Shift held
 * @param o.radius      magnet radius in WORLD units
 * @param o.gridStep    grid spacing in world units
 * @param o.settings    { orthoMode, polarMode, polarIncrement, snapToGrid, snapToPoints, snapModes }
 * @returns {{x, y, snapped, snap, guide}}  snap = {x,y,type} | null ; guide = {x1,y1,x2,y2,angle} | null
 */
export function computeSnap(o) {
    const st = o.settings;
    const modes = { ...DEFAULT_SNAP_MODES, ...(st.snapModes || {}) };
    const base = o.basePoint;
    let x = o.x, y = o.y;
    let guide = null, ray = null;

    // 1. direction lock ------------------------------------------------------
    if ((st.orthoMode || o.forceOrtho) && base) {
        const dx = x - base.x, dy = y - base.y, dist = Math.hypot(dx, dy);
        const snapAngle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);      // 0/45/90... like the original ortho
        ray = { ox: base.x, oy: base.y, ux: Math.cos(snapAngle), uy: Math.sin(snapAngle) };
        if (Math.abs(ray.ux) < 1e-9) ray.ux = 0;
        if (Math.abs(ray.uy) < 1e-9) ray.uy = 0;
        x = base.x + ray.ux * dist; y = base.y + ray.uy * dist;
        guide = { x1: base.x, y1: base.y, x2: x, y2: y, angle: (snapAngle * 180 / Math.PI + 360) % 360 };
    } else if (st.polarMode && base) {
        const dx = x - base.x, dy = y - base.y, dist = Math.hypot(dx, dy);
        const inc = st.polarIncrement || 45;
        if (dist > 1e-6) {
            const ang = Math.atan2(dy, dx) * 180 / Math.PI;
            const nearest = Math.round(ang / inc) * inc;
            if (Math.abs(wrapDeg(ang - nearest)) <= Math.min(4, inc / 3)) {               // within a few degrees of a tracking angle
                const r = nearest * Math.PI / 180;
                ray = { ox: base.x, oy: base.y, ux: Math.cos(r), uy: Math.sin(r) };
                if (Math.abs(ray.ux) < 1e-9) ray.ux = 0;
                if (Math.abs(ray.uy) < 1e-9) ray.uy = 0;
                x = base.x + ray.ux * dist; y = base.y + ray.uy * dist;
                guide = { x1: base.x, y1: base.y, x2: x, y2: y, angle: (nearest + 360) % 360 };
            }
        }
    }
    const result = (px, py, snap) => {
        if (guide && snap) { guide.x2 = px; guide.y2 = py; }
        return { x: px, y: py, snapped: !!snap, snap, guide };
    };

    const R = o.radius;
    const objectSnaps = st.snapToPoints !== false;

    // 2. endpoint / midpoint ---------------------------------------------------
    if (objectSnaps && o.targets && o.targets.length) {
        let closest = R, best = null;
        for (const target of o.targets) {
            const type = target.type || 'endpoint';
            if (modes[type] === false) continue;
            let tx = target.x, ty = target.y;
            if (ray) {
                const rx = tx - ray.ox, ry = ty - ray.oy;
                const along = rx * ray.ux + ry * ray.uy, perp = Math.abs(-rx * ray.uy + ry * ray.ux);
                if (along < 0 || perp > R) continue;
                tx = ray.ox + ray.ux * along; ty = ray.oy + ray.uy * along;
            }
            const d = Math.hypot(tx - x, ty - y);
            if (d < closest) { closest = d; best = { x: tx, y: ty, type }; }
        }
        if (best) return result(best.x, best.y, best);
    }

    // 3. geometry snaps from lines ---------------------------------------------
    const segs = objectSnaps && o.segments ? o.segments : [];
    if (segs.length) {
        const here = { x, y };
        // lines that pass close to the cursor are the only ones that can produce a nearby snap
        const near = segs.filter(s => closestPointOnSegment(here, s.a, s.b).dist <= R);

        if (modes.intersection && near.length) {
            let closest = R, best = null;
            const consider = (p) => { if (!p) return; const d = Math.hypot(p.x - x, p.y - y); if (d < closest) { closest = d; best = { x: p.x, y: p.y, type: 'intersection' }; } };
            if (ray) {
                for (const s of near) consider(rayHitsSegment({ x: ray.ox, y: ray.oy }, { x: ray.ux, y: ray.uy }, s.a, s.b));
            } else {
                for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) consider(segmentIntersection(near[i].a, near[i].b, near[j].a, near[j].b));
            }
            if (best) return result(best.x, best.y, best);
        }

        if (modes.perpendicular && base && !ray) {
            let closest = R, best = null;
            for (const s of segs) {
                const f = perpendicularFoot(base, s.a, s.b);
                if (!f) continue;
                const d = Math.hypot(f.x - x, f.y - y);
                if (d < closest && Math.hypot(f.x - base.x, f.y - base.y) > 1e-6) { closest = d; best = { x: f.x, y: f.y, type: 'perpendicular' }; }
            }
            if (best) return result(best.x, best.y, best);
        }

        if (modes.nearest && near.length && !ray) {
            let closest = R, best = null;
            for (const s of near) { const c = closestPointOnSegment(here, s.a, s.b); if (c.dist < closest) { closest = c.dist; best = { x: c.x, y: c.y, type: 'nearest' }; } }
            if (best) return result(best.x, best.y, best);
        }
    }

    // 4. grid --------------------------------------------------------------------
    if (st.snapToGrid && modes.grid !== false) {
        const g = o.gridStep;
        let gx, gy;
        if (ray) {
            if (Math.abs(ray.ux) >= Math.abs(ray.uy)) { gx = Math.round(x / g) * g; gy = ray.oy + (gx - ray.ox) * (ray.uy / ray.ux); }
            else { gy = Math.round(y / g) * g; gx = ray.ox + (gy - ray.oy) * (ray.ux / ray.uy); }
            if ((gx - ray.ox) * ray.ux + (gy - ray.oy) * ray.uy < 0) { gx = x; gy = y; }
        } else {
            gx = Math.round(x / g) * g; gy = Math.round(y / g) * g;
        }
        if (Math.hypot(gx - x, gy - y) < R) return result(gx, gy, { x: gx, y: gy, type: 'grid' });
    }

    return { x, y, snapped: false, snap: null, guide };
}
