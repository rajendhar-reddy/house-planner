/**
 * transform.js - Multi-object selection and the Move / Copy / Rotate / Mirror / Delete operations.
 *
 * A "selection" is a list of items { category, obj } where category is one of SELECTABLE.
 * Everything here works on the managers of the app (app.wallManager, ...) and has no DOM code,
 * so it is unit-tested directly.
 *
 * Rules worth knowing:
 *  - Doors/windows/gates are attached to a wall: they move, rotate, mirror and copy WITH their wall.
 *    A door selected on its own is left alone by Move / Rotate / Mirror.
 *  - Rooms are axis-aligned rectangles: a 90-degree turn swaps their width and height; other angles move
 *    the room's centre but keep it axis-aligned.
 *  - Mirroring reflects positions; furniture, columns and stairs are assumed symmetric about their own
 *    centre line, so their artwork is not flipped (stairs also swap their turn direction).
 */

import { duplicateEntity } from './serializer.js';
import { selectableIn } from './layers.js';

export const SELECTABLE = ['wall', 'opening', 'room', 'column', 'furniture', 'stair', 'dimension', 'text', 'leader', 'angdim'];

const LISTS = {
    wall: ['wallManager', 'walls'],
    opening: ['openingManager', 'openings'],
    room: ['roomManager', 'rooms'],
    column: ['columnManager', 'columns'],
    furniture: ['furnitureManager', 'items'],
    stair: ['stairManager', 'stairs'],
    dimension: ['dimensionManager', 'dimensions'],
    text: ['annotationManager', 'texts'],
    leader: ['annotationManager', 'leaders'],
    angdim: ['annotationManager', 'angdims']
};
const REMOVE = { wall: 'removeWall', opening: 'removeOpening', room: 'removeRoom', column: 'removeColumn', furniture: 'removeItem', stair: 'removeStair', dimension: 'removeDimension', text: 'removeText', leader: 'removeLeader', angdim: 'removeAngdim' };

const norm360 = (v) => ((v % 360) + 360) % 360;
const rad = (d) => (d * Math.PI) / 180;

// ---------------------------------------------------------------- bounds
export function boundsOf(app, item) {
    const o = item.obj;
    switch (item.category) {
        case 'wall': {
            const h = (o.thickness || 0) / 2;
            const x1 = Math.min(o.start.x, o.end.x) - h, x2 = Math.max(o.start.x, o.end.x) + h;
            const y1 = Math.min(o.start.y, o.end.y) - h, y2 = Math.max(o.start.y, o.end.y) + h;
            return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
        }
        case 'opening': {
            const wall = app.wallManager.getWallById(o.wallId);
            const g = wall && o.getGeometry(wall);
            if (!g) return null;
            const c = Math.abs(Math.cos(g.angle)), s = Math.abs(Math.sin(g.angle));
            const w = o.width * c + g.thickness * s, h = o.width * s + g.thickness * c;
            return { x: g.center.x - w / 2, y: g.center.y - h / 2, width: w, height: h };
        }
        case 'dimension': {
            const g = o.getGeometry();
            const pts = [o.start, o.end, ...(g ? [g.p1, g.p2] : [])];
            const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
            return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
        }
        default:
            return o.getBounds();
    }
}

export function selectionBounds(app, items) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
        const b = boundsOf(app, it);
        if (!b) continue;
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
    }
    return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}

export function centerOf(app, items) {
    const b = selectionBounds(app, items);
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 0, y: 0 };
}

// ---------------------------------------------------------------- picking
/** Every object on the active floor that the user can pick (hidden / locked layers excluded). */
export function allSelectable(app) {
    const out = [];
    for (const category of SELECTABLE) {
        const [mgr, list] = LISTS[category];
        if (!app[mgr]) continue;
        for (const obj of app[mgr][list]) {
            if (!selectableIn(app.layerManager, obj, category)) continue;
            if (category === 'opening') {
                const wall = app.wallManager.getWallById(obj.wallId);
                if (!wall || (app.layerManager && !app.layerManager.isVisible(wall, 'wall'))) continue;   // a locked wall is fine, a hidden one is not
            }
            out.push({ category, obj });
        }
    }
    return out;
}

function segmentHitsRect(a, b, r) {
    // Liang-Barsky clipping of segment ab against rectangle r {x1,y1,x2,y2}
    let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
    const clip = (p, q) => { if (p === 0) return q >= 0; const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
    return clip(-dx, a.x - r.x1) && clip(dx, r.x2 - a.x) && clip(-dy, a.y - r.y1) && clip(dy, r.y2 - a.y);
}

/**
 * Objects inside / touching a rectangle.
 * mode 'window'   : objects entirely inside the rectangle
 * mode 'crossing' : objects inside OR touching the rectangle
 */
export function pickRect(app, rect, mode = 'window') {
    const r = { x1: Math.min(rect.x1, rect.x2), y1: Math.min(rect.y1, rect.y2), x2: Math.max(rect.x1, rect.x2), y2: Math.max(rect.y1, rect.y2) };
    const inside = (p) => p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2;
    const result = [];
    for (const it of allSelectable(app)) {
        if (it.category === 'wall') {
            const w = it.obj;
            if (mode === 'window' ? (inside(w.start) && inside(w.end)) : segmentHitsRect(w.start, w.end, r)) result.push(it);
            continue;
        }
        const b = boundsOf(app, it);
        if (!b) continue;
        const bx2 = b.x + b.width, by2 = b.y + b.height;
        const fully = b.x >= r.x1 && bx2 <= r.x2 && b.y >= r.y1 && by2 <= r.y2;
        const touches = b.x <= r.x2 && bx2 >= r.x1 && b.y <= r.y2 && by2 >= r.y1;
        if (mode === 'window' ? fully : touches) result.push(it);
    }
    return result;
}

// ---------------------------------------------------------------- helpers
/** Walls that are part of the selection, as a Set of ids (openings on them travel with them). */
const wallIds = (items) => new Set(items.filter(i => i.category === 'wall').map(i => i.obj.id));
const movable = (items) => items.filter(i => i.category !== 'opening');

function mapPoint(p, fn) { const q = fn(p); p.x = q.x; p.y = q.y; }

// ---------------------------------------------------------------- operations
export function moveItems(app, items, dx, dy) {
    const shift = (p) => ({ x: p.x + dx, y: p.y + dy });
    for (const { category, obj } of movable(items)) {
        if (category === 'wall') { mapPoint(obj.start, shift); mapPoint(obj.end, shift); }
        else if (category === 'dimension') { mapPoint(obj.start, shift); mapPoint(obj.end, shift); }
        else if (category === 'leader') obj.points.forEach(p => mapPoint(p, shift));
        else if (category === 'angdim') { mapPoint(obj.vertex, shift); mapPoint(obj.p1, shift); mapPoint(obj.p2, shift); }
        else {
            obj.x += dx; obj.y += dy;
            if (category === 'room' && Array.isArray(obj.polygon)) obj.polygon.forEach(p => mapPoint(p, shift));
        }
    }
}

export function rotateItems(app, items, degrees, pivot) {
    const c = Math.cos(rad(degrees)), s = Math.sin(rad(degrees));
    const rot = (p) => ({ x: pivot.x + (p.x - pivot.x) * c - (p.y - pivot.y) * s, y: pivot.y + (p.x - pivot.x) * s + (p.y - pivot.y) * c });
    const quarter = Math.round(degrees / 90);
    const isQuarter = Math.abs(degrees - quarter * 90) < 1e-6;
    for (const { category, obj } of movable(items)) {
        if (category === 'wall' || category === 'dimension') { mapPoint(obj.start, rot); mapPoint(obj.end, rot); continue; }
        if (category === 'leader') { obj.points.forEach(p => mapPoint(p, rot)); continue; }
        if (category === 'angdim') { mapPoint(obj.vertex, rot); mapPoint(obj.p1, rot); mapPoint(obj.p2, rot); continue; }
        const q = rot({ x: obj.x, y: obj.y }); obj.x = q.x; obj.y = q.y;
        if (category === 'room') {
            if (Array.isArray(obj.polygon)) obj.polygon.forEach(p => mapPoint(p, rot));
            if (isQuarter && Math.abs(quarter) % 2 === 1) { const w = obj.width; obj.width = obj.height; obj.height = w; }
        } else {
            obj.rotation = norm360((obj.rotation || 0) + degrees);       // column, furniture, stair
        }
    }
}

export function mirrorItems(app, items, p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y, len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) throw new Error('The two mirror points must be different.');
    const phi = Math.atan2(dy, dx) * 180 / Math.PI;
    const refl = (p) => {
        const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / len2;
        const fx = p1.x + t * dx, fy = p1.y + t * dy;
        return { x: 2 * fx - p.x, y: 2 * fy - p.y };
    };
    const walls = wallIds(items);
    for (const { category, obj } of movable(items)) {
        if (category === 'wall') { mapPoint(obj.start, refl); mapPoint(obj.end, refl); continue; }
        if (category === 'dimension') {
            mapPoint(obj.start, refl); mapPoint(obj.end, refl);
            obj.offset = -(obj.offset || 0);                        // the reflected dimension stays on the same physical side
            continue;
        }
        if (category === 'leader') { obj.points.forEach(p => mapPoint(p, refl)); continue; }
        if (category === 'angdim') { mapPoint(obj.vertex, refl); mapPoint(obj.p1, refl); mapPoint(obj.p2, refl); continue; }
        const q = refl({ x: obj.x, y: obj.y }); obj.x = q.x; obj.y = q.y;
        if (category === 'text') {                                       // text is never flipped; it keeps reading left to right
            let r = norm360(2 * phi - (obj.rotation || 0));
            if (r > 90 && r < 270) r = norm360(r + 180);
            obj.rotation = r; continue;
        }
        if (category === 'room') { if (Array.isArray(obj.polygon)) obj.polygon.forEach(p => mapPoint(p, refl)); continue; }
        obj.rotation = norm360(2 * phi - (obj.rotation || 0) + 180);     // see header: symmetric artwork
        if (category === 'stair') obj.turnDirection = obj.turnDirection === 'right' ? 'left' : 'right';
    }
    // doors/windows on mirrored walls: the swing side is reflected, the hinge stays at the same end
    for (const op of app.openingManager.openings) if (walls.has(op.wallId)) op.flipSwing = !op.flipSwing;
}

/**
 * Duplicate the selection (plus every door/window on the selected walls) and register the copies in
 * their managers. Returns the new selection (the copies). The copies sit exactly on top of the originals;
 * follow with moveItems / rotateItems / mirrorItems on the returned list.
 */
export function copyItems(app, items) {
    const out = []; const idMap = new Map();
    for (const it of movable(items)) {
        const clone = duplicateEntity(it.category, it.obj);
        app[LISTS[it.category][0]][LISTS[it.category][1]].push(clone);
        if (it.category === 'wall') idMap.set(it.obj.id, clone.id);
        out.push({ category: it.category, obj: clone });
    }
    for (const op of [...app.openingManager.openings]) {
        if (!idMap.has(op.wallId)) continue;
        const clone = duplicateEntity('opening', op);
        clone.wallId = idMap.get(op.wallId);
        app.openingManager.openings.push(clone);
        out.push({ category: 'opening', obj: clone });
    }
    return out;
}

export function deleteItems(app, items) {
    const doomedWalls = wallIds(items);
    if (doomedWalls.size) app.openingManager.openings = app.openingManager.openings.filter(o => !doomedWalls.has(o.wallId));
    for (const { category, obj } of items) app[LISTS[category][0]][REMOVE[category]](obj.id);
}

/** "3 walls, 2 doors/windows, 1 room" style summary. */
export function describeSelection(items) {
    const n = {}; for (const it of items) n[it.category] = (n[it.category] || 0) + 1;
    const names = { wall: ['wall', 'walls'], opening: ['door/window', 'doors/windows'], room: ['room', 'rooms'], column: ['column', 'columns'], furniture: ['fixture', 'fixtures'], stair: ['staircase', 'staircases'], dimension: ['dimension', 'dimensions'], text: ['text note', 'text notes'], leader: ['leader', 'leaders'], angdim: ['angular dimension', 'angular dimensions'] };
    return Object.entries(n).map(([k, v]) => `${v} ${names[k][v === 1 ? 0 : 1]}`).join(', ');
}

/** Put an already-built object into the app's list for its kind (used when inserting blocks). */
export function addToApp(app, category, obj) {
    const [mgr, list] = LISTS[category];
    app[mgr][list].push(obj);
    return obj;
}

/** Call fn(category, obj) for every layered object of the active floor (hidden/locked included). */
export function forEachObject(app, fn) {
    for (const category of SELECTABLE) {
        const [mgr, list] = LISTS[category];
        if (!app[mgr]) continue;
        for (const obj of app[mgr][list]) fn(category, obj);
    }
}

/**
 * Apply Move / Rotate / Mirror to `items`, optionally on copies. Pure (no selection / history side effects).
 *  kind 'move'   : { dx, dy, copy }
 *  kind 'rotate' : { degrees, pivot?, copy }       (screen-clockwise positive; pivot defaults to the selection centre)
 *  kind 'mirror' : { p1, p2, copy }
 * Returns the objects that were transformed (the copies when copy is true).
 */
export function applyTransform(app, items, kind, p = {}) {
    const pivot = p.pivot || centerOf(app, items);
    const targets = p.copy ? copyItems(app, items) : items;
    if (kind === 'move') moveItems(app, targets, p.dx, p.dy);
    else if (kind === 'rotate') rotateItems(app, targets, p.degrees, pivot);
    else if (kind === 'mirror') mirrorItems(app, targets, p.p1, p.p2);
    else throw new Error(`Unknown transform "${kind}"`);
    return targets;
}
