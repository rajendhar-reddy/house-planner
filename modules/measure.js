/**
 * measure.js - distance / area / angle measuring (pure functions).
 * Angles follow AutoCAD: counter-clockwise from east, with Y UP (the drawing's own Y axis points down).
 */

import { units } from './units.js';

const SQ_IN_PER_SQ_FT = 144;
const SQ_M_PER_SQ_IN = 0.00064516;

/** Distance, the X/Y offsets (Y up) and the direction of a -> b. */
export function distanceInfo(a, b) {
    const dx = b.x - a.x, dy = -(b.y - a.y);
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return { dist: Math.hypot(dx, dy), dx, dy, angle: Math.abs(angle - 360) < 1e-9 ? 0 : angle };
}

/** Area (square inches) of a closed polygon, whatever its winding. */
export function polygonArea(pts) {
    if (!pts || pts.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; }
    return Math.abs(a) / 2;
}

/** Perimeter (inches); `closed` adds the closing edge. */
export function polylineLength(pts, closed = false) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (closed && pts.length > 2) len += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
    return len;
}

/** The angle (0..180 degrees) at `vertex` between the rays to p1 and p2. null when a ray has no length. */
export function angleAt(vertex, p1, p2) {
    const ax = p1.x - vertex.x, ay = p1.y - vertex.y, bx = p2.x - vertex.x, by = p2.y - vertex.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) return null;
    const c = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    return Math.acos(c) * 180 / Math.PI;
}

export const fmtDeg = (d) => `${(Math.round(d * 100) / 100).toFixed(d % 1 === 0 ? 0 : 2).replace(/\.?0+$/, '')}\u00b0`;

/** "12' - 6" (3.81 m)" style text for the measuring commands. */
export function describeDistance(a, b) {
    const d = distanceInfo(a, b);
    return `Distance ${units.formatLength(d.dist)}   angle ${fmtDeg(d.angle)}   dX ${units.formatLength(d.dx)}  dY ${units.formatLength(d.dy)}`;
}

export function describeArea(pts, closed = true) {
    const a = polygonArea(pts), p = polylineLength(pts, closed);
    return `Area ${units.formatArea(a).primary} (${(a * SQ_M_PER_SQ_IN).toFixed(2)} m\u00b2)   perimeter ${units.formatLength(p)}`;
}

export { SQ_IN_PER_SQ_FT, SQ_M_PER_SQ_IN };
