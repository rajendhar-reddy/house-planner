/**
 * blocks.js - user blocks: save a selection as a named, reusable symbol and insert copies of it.
 *
 * A block stores plain data for its objects (positions relative to the block's base point) plus the doors/windows
 * of any walls it contains. Inserting rebuilds ordinary, independent, editable objects (like "exploded" blocks).
 */

import { duplicateEntity, isEntityDataValid } from './serializer.js';
import { SELECTABLE, moveItems, rotateItems, addToApp } from './transform.js';

export const MAX_BLOCK_OBJECTS = 2000;
export const MAX_BLOCKS = 200;

const clone = (v) => JSON.parse(JSON.stringify(v));

/** A tidy block name; throws a readable message when the name is unusable. */
export function sanitizeBlockName(name) {
    const clean = String(name === null || name === undefined ? '' : name).replace(/[^\p{L}\p{N} _().\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!clean) throw new Error('Give the block a name (letters, numbers, spaces and - _ ( ) are fine).');
    return clean;
}

/** Find a block by name ignoring capitals; returns the stored key or null. */
export function findBlockName(blocks, name) {
    const w = String(name || '').trim().toLowerCase();
    return Object.keys(blocks || {}).find(k => k.toLowerCase() === w) || null;
}

/**
 * Build a block from the selected items. `base` becomes the block's origin (the point you place when inserting).
 * Doors/windows that sit on the selected walls are included automatically.
 */
export function makeBlock(app, items, name, base) {
    const clean = sanitizeBlockName(name);
    const objs = items.filter(i => SELECTABLE.includes(i.category) && i.category !== 'opening');
    if (!objs.length) throw new Error('Select walls, rooms, furniture or other objects first - a door or window alone cannot be a block.');
    const wallIds = new Set(objs.filter(i => i.category === 'wall').map(i => i.obj.id));
    const clones = objs.map(i => ({ category: i.category, obj: duplicateEntity(i.category, i.obj), source: i.obj }));
    const idMap = new Map(clones.filter(c => c.category === 'wall').map(c => [c.source.id, c.obj.id]));
    const ops = app.openingManager.openings.filter(o => wallIds.has(o.wallId)).map(o => { const c = duplicateEntity('opening', o); c.wallId = idMap.get(o.wallId); return { category: 'opening', obj: c }; });
    const all = [...clones.map(c => ({ category: c.category, obj: c.obj })), ...ops];
    if (all.length > MAX_BLOCK_OBJECTS) throw new Error(`A block can hold at most ${MAX_BLOCK_OBJECTS} objects.`);
    moveItems(app, all, -base.x, -base.y);                                      // positions relative to the base point
    return { name: clean, count: all.length, objects: all.map(i => ({ category: i.category, data: clone(i.obj) })) };
}

/**
 * Insert a copy of the block with its base point at `at`, turned by `rotationDeg` (screen-clockwise positive).
 * Returns the new items (already registered with the app).
 */
export function insertBlock(app, block, at, rotationDeg = 0) {
    const valid = (block.objects || []).filter(o => SELECTABLE.includes(o.category) && isEntityDataValid(o.category, o.data));
    if (!valid.length) throw new Error('This block has no usable objects.');
    const idMap = new Map();
    const made = [];
    for (const o of valid.filter(o => o.category !== 'opening')) {
        const e = duplicateEntity(o.category, o.data);
        if (o.category === 'wall') idMap.set(o.data.id, e.id);
        made.push({ category: o.category, obj: addToApp(app, o.category, e) });
    }
    for (const o of valid.filter(o => o.category === 'opening')) {
        if (!idMap.has(o.data.wallId)) continue;                                // a door whose wall is not in the block is dropped
        const e = duplicateEntity('opening', o.data); e.wallId = idMap.get(o.data.wallId);
        made.push({ category: 'opening', obj: addToApp(app, 'opening', e) });
    }
    if (rotationDeg) rotateItems(app, made, rotationDeg, { x: 0, y: 0 });
    moveItems(app, made, at.x, at.y);
    return made;
}

/** Size of a block's contents in inches (for the list), or null. */
export function blockSize(block) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const eat = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } };
    for (const { data: d } of block.objects || []) {
        if (d.start) { eat(d.start.x, d.start.y); eat(d.end.x, d.end.y); }
        else if (d.points) d.points.forEach(p => eat(p.x, p.y));
        else if (d.vertex) { eat(d.vertex.x, d.vertex.y); eat(d.p1.x, d.p1.y); eat(d.p2.x, d.p2.y); }
        else if (typeof d.x === 'number') { eat(d.x - (d.width || 0) / 2, d.y - (d.height || d.depth || 0) / 2); eat(d.x + (d.width || 0) / 2, d.y + (d.height || d.depth || 0) / 2); }
    }
    return Number.isFinite(minX) ? { width: maxX - minX, height: maxY - minY } : null;
}

/** Clean a block table from a project file / the library: unknown shapes are dropped. */
export function sanitizeBlocks(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const key of Object.keys(raw).slice(0, MAX_BLOCKS)) {
        const b = raw[key];
        if (!b || typeof b !== 'object' || !Array.isArray(b.objects)) continue;
        let name; try { name = sanitizeBlockName(key); } catch (e) { continue; }
        const objects = b.objects.slice(0, MAX_BLOCK_OBJECTS).filter(o => o && SELECTABLE.includes(o.category) && isEntityDataValid(o.category, o.data)).map(o => ({ category: o.category, data: clone(o.data) }));
        if (objects.length) out[name] = { name, count: objects.length, objects };
    }
    return out;
}
