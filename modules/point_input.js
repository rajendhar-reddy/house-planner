/**
 * point_input.js - typed point / angle grammar shared by the command modules.
 *
 *     12'            direct distance: that far from the start point, towards the cursor
 *     5',3'          absolute point  (X right, Y DOWN - the same X/Y shown in the status bar)
 *     @5',3'         relative to the last point (Y UP, like AutoCAD)
 *     @12'<30        relative polar: 12 feet at 30 degrees (counter-clockwise from east, like AutoCAD)
 */

import { units } from './units.js';

/**
 * Parse typed point input. Returns
 *   { kind: 'abs', x, y } | { kind: 'rel', dx, dy } | { kind: 'polar', dist, angle } | { kind: 'distance', dist }
 * or null when the text is not a point.
 */
export function parsePointInput(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    const rel = s.startsWith('@');
    const body = rel ? s.slice(1).trim() : s;
    if (!body) return null;

    if (body.includes('<')) {                                       // [@]distance<angle
        const [d, a, extra] = body.split('<');
        if (extra !== undefined) return null;
        const dist = units.parseInput(d), angle = parseAngle(a);
        if (dist === null || angle === null) return null;
        return { kind: 'polar', dist, angle };
    }
    const parts = body.split(',');
    if (parts.length === 2) {                                       // [@]x,y
        const a = units.parseInput(parts[0]), b = units.parseInput(parts[1]);
        if (a === null || b === null) return null;
        return rel ? { kind: 'rel', dx: a, dy: b } : { kind: 'abs', x: a, y: b };
    }
    if (parts.length === 1) {                                       // distance
        const dist = units.parseInput(body);
        if (dist === null) return null;
        return { kind: 'distance', dist };
    }
    return null;
}

/** Degrees from text such as "45", "-30", "12.5" or "90°". null when not an angle. */
export function parseAngle(text) {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*$/.exec(String(text || ''));
    return m ? Number(m[1]) : null;
}

/**
 * Turn parsed input into a world point.
 * `base` = the last point, `cursor` = where the mouse is (gives the direction for a bare distance).
 * Angles and relative Y follow AutoCAD (Y up, counter-clockwise); the drawing's own Y axis points down.
 */
export function resolvePoint(input, { base = null, cursor = null } = {}) {
    switch (input.kind) {
        case 'abs': return { x: input.x, y: input.y };
        case 'rel':
            if (!base) throw new Error('There is no previous point to measure from.');
            return { x: base.x + input.dx, y: base.y - input.dy };
        case 'polar': {
            if (!base) throw new Error('There is no previous point to measure from.');
            const a = (input.angle * Math.PI) / 180;
            return { x: base.x + input.dist * Math.cos(a), y: base.y - input.dist * Math.sin(a) };
        }
        case 'distance': {
            if (!base) throw new Error('Pick a start point first (click, or type x,y).');
            const dx = cursor ? cursor.x - base.x : 0, dy = cursor ? cursor.y - base.y : 0;
            const len = Math.hypot(dx, dy);
            if (len < 1e-6) throw new Error('Move the cursor away from the start point to show which way the distance goes.');
            return { x: base.x + (dx / len) * input.dist, y: base.y + (dy / len) * input.dist };
        }
        default: throw new Error('Unknown point input.');
    }
}

