/**
 * hatch.js - floor-finish patterns for rooms (pure geometry, no drawing).
 * hatchSegments() returns the pattern as line segments clipped to a rectangle, so the same lines can be drawn on
 * the canvas and written to DXF / SVG.
 */

export const HATCH_TYPES = [
    { id: 'none', name: 'None', base: 0 },
    { id: 'tiles', name: 'Square tiles', base: 24 },
    { id: 'tiles_diag', name: 'Diagonal tiles', base: 24 },
    { id: 'wood', name: 'Wood planks', base: 6 },
    { id: 'concrete', name: 'Concrete (dots)', base: 10 },
    { id: 'lines', name: 'Diagonal lines', base: 12 }
];
export const HATCH_IDS = HATCH_TYPES.map(t => t.id);

/** Never produce more than this many segments for one room (the spacing is widened automatically). */
export const MAX_SEGMENTS = 12000;

/** Part of the line through (px,py) with direction (dx,dy) that lies inside the rectangle, or null. */
export function clipLineToRect(px, py, dx, dy, r) {
    let t0 = -1e9, t1 = 1e9;
    const x2 = r.x + r.width, y2 = r.y + r.height;
    const clip = (p, q) => { if (Math.abs(p) < 1e-12) return q >= 0; const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
    if (!clip(-dx, px - r.x) || !clip(dx, x2 - px) || !clip(-dy, py - r.y) || !clip(dy, y2 - py)) return null;
    if (t1 - t0 < 1e-9) return null;
    return { x1: px + dx * t0, y1: py + dy * t0, x2: px + dx * t1, y2: py + dy * t1 };
}

const hash = (i, j, k = 0) => { let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function estimate(type, w, h, sp) {
    switch (type) {
        case 'tiles': return (w + h) / sp;
        case 'tiles_diag': return (w + h) * 2 / (sp * Math.SQRT2);
        case 'lines': return (w + h) / (sp * Math.SQRT2);
        case 'wood': return (h / sp) * (1 + w / (sp * 8));
        case 'concrete': return (w * h) / (sp * sp) * 0.7;
        default: return 0;
    }
}

const cache = new Map();

/**
 * @param type   one of HATCH_IDS
 * @param rect   { x, y, width, height } world inches
 * @param scale  pattern size multiplier (1 = default tile size)
 */
export function hatchSegments(type, rect, scale = 1) {
    const info = HATCH_TYPES.find(t => t.id === type);
    if (!info || info.base === 0 || !(rect.width > 0) || !(rect.height > 0)) return [];
    const key = `${type}|${scale}|${rect.x}|${rect.y}|${rect.width}|${rect.height}`;
    const hit = cache.get(key);
    if (hit) return hit;

    let sp = Math.min(240, Math.max(1, info.base * (Number.isFinite(scale) && scale > 0 ? scale : 1)));
    for (let i = 0; i < 8 && estimate(type, rect.width, rect.height, sp) > MAX_SEGMENTS; i++) sp *= 1.5;      // keep drawing fast on huge rooms
    const out = [];
    const add = (s) => { if (s && out.length < MAX_SEGMENTS) out.push(s); };
    const { x, y, width: w, height: h } = rect;

    if (type === 'tiles') {
        for (let k = 1; k * sp < w; k++) add({ x1: x + k * sp, y1: y, x2: x + k * sp, y2: y + h });
        for (let k = 1; k * sp < h; k++) add({ x1: x, y1: y + k * sp, x2: x + w, y2: y + k * sp });
    } else if (type === 'tiles_diag' || type === 'lines') {
        const step = sp * Math.SQRT2;
        for (let c = -h; c <= w; c += step) add(clipLineToRect(x + c, y, 1, 1, rect));                          // lines of constant (x - y)
        if (type === 'tiles_diag') for (let c = 0; c <= w + h; c += step) add(clipLineToRect(x + c, y, -1, 1, rect));   // lines of constant (x + y)
    } else if (type === 'wood') {
        const L = sp * 8;                                                                                     // plank length
        for (let k = 0, yy = y; yy < y + h; k++, yy += sp) {
            if (k > 0) add({ x1: x, y1: yy, x2: x + w, y2: yy });
            const off = (((k * 0.37) % 1) + 1) % 1 * L;
            for (let xx = x + off; xx < x + w; xx += L) if (xx > x) add({ x1: xx, y1: yy, x2: xx, y2: Math.min(yy + sp, y + h) });
        }
    } else if (type === 'concrete') {
        const nx = Math.ceil(w / sp), ny = Math.ceil(h / sp);
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
            if (hash(i, j, 1) > 0.7) continue;
            const px = x + (i + hash(i, j, 2)) * sp, py = y + (j + hash(i, j, 3)) * sp;
            if (px > x + w - 0.5 || py > y + h) continue;
            add({ x1: px, y1: py, x2: px + 0.6, y2: py });
        }
    }
    if (cache.size > 400) cache.clear();
    cache.set(key, out);
    return out;
}

/** Draw hatch segments on a canvas context (one path, one stroke). */
export function drawHatch(ctx, segments, color, lineWidth) {
    if (!segments.length) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (const s of segments) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
    ctx.stroke();
    ctx.restore();
}
