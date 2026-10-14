/**
 * serializer.js - ONE place that knows how to turn the live drawing into plain
 * JSON data and back again.
 *
 * Used by: undo/redo history, localStorage autosave, "Save JSON" / "Open JSON",
 * bundled sample projects and the per-floor snapshots in floors.js.
 *
 * Design notes
 *  - Entities are serialized generically (every own data property), so a field
 *    added to an entity class later is saved automatically and can't be silently
 *    dropped the way it could with hand-written field lists.
 *  - Restoring validates the data first, skips unusable records (with warnings),
 *    repairs duplicate / missing IDs, reserves every ID in the shared generator,
 *    and rolls the drawing back if anything goes wrong half-way.
 */

import { nextId, reserveId } from './ids.js';
import { Wall } from './walls.js';
import { Opening } from './openings.js';
import { Room } from './rooms.js';
import { Column } from './columns.js';
import { FurnitureItem } from './furniture.js';
import { DimensionLine } from './dimensions.js';
import { Road } from './roads.js';
import { Stair } from './stairs.js';
import { sanitizeUnderlay } from './underlay.js';
import { sanitizeReference } from './dxf_import.js';
import { TextNote, Leader, AngularDim } from './annotations.js';

/** Bump when the saved format changes in a way old readers can't handle. */
export const STATE_VERSION = 2;

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPt = (p) => !!p && typeof p === 'object' && isNum(p.x) && isNum(p.y);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Keys that must never be copied from a file onto an object. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Text fields that end up on screen; force them to be strings. */
const TEXT_FIELDS = ['name', 'label', 'slabLabel', 'customText'];

/**
 * Description of every entity collection that is saved.
 *  get/set  - access the live array on the app's managers
 *  make     - build a fresh instance from a (validated) data record
 *  valid    - returns true when the record has the geometry it needs
 */
const ENTITY_SPECS = [
    {
        key: 'walls', prefix: 'wall',
        get: (app) => app.wallManager.walls,
        set: (app, list) => { app.wallManager.walls = list; },
        make: (d) => new Wall(d.start, d.end, d.thickness, d.type),
        valid: (d) => isPt(d.start) && isPt(d.end)
    },
    {
        key: 'openings', prefix: 'op',
        get: (app) => app.openingManager.openings,
        set: (app, list) => { app.openingManager.openings = list; },
        make: (d) => new Opening(d.wallId, d.t, d),
        valid: (d) => typeof d.wallId === 'string' && isNum(d.t)
    },
    {
        key: 'rooms', prefix: 'room',
        get: (app) => app.roomManager.rooms,
        set: (app, list) => { app.roomManager.rooms = list; },
        make: (d) => new Room(d.x, d.y, d),
        valid: (d) => isNum(d.x) && isNum(d.y) &&
            (d.width === undefined || (isNum(d.width) && d.width > 0)) &&
            (d.height === undefined || (isNum(d.height) && d.height > 0))
    },
    {
        key: 'columns', prefix: 'col',
        get: (app) => app.columnManager.columns,
        set: (app, list) => { app.columnManager.columns = list; },
        make: (d) => new Column(d.x, d.y, d),
        valid: (d) => isNum(d.x) && isNum(d.y)
    },
    {
        key: 'furniture', prefix: 'fit',
        get: (app) => app.furnitureManager.items,
        set: (app, list) => { app.furnitureManager.items = list; },
        make: (d) => new FurnitureItem(d.typeId, d.x, d.y, d),
        valid: (d) => typeof d.typeId === 'string' && isNum(d.x) && isNum(d.y)
    },
    {
        key: 'dimensions', prefix: 'dim',
        get: (app) => app.dimensionManager.dimensions,
        set: (app, list) => { app.dimensionManager.dimensions = list; },
        make: (d) => new DimensionLine(d.start, d.end, d.offset, d.customText),
        valid: (d) => isPt(d.start) && isPt(d.end)
    },
    {
        key: 'texts', prefix: 'text',
        get: (app) => app.annotationManager.texts,
        set: (app, list) => { app.annotationManager.texts = list; },
        make: (d) => new TextNote(d.x, d.y, d),
        valid: (d) => isNum(d.x) && isNum(d.y) && typeof d.text === 'string'
    },
    {
        key: 'leaders', prefix: 'lead',
        get: (app) => app.annotationManager.leaders,
        set: (app, list) => { app.annotationManager.leaders = list; },
        make: (d) => new Leader(d.points, d),
        valid: (d) => Array.isArray(d.points) && d.points.length >= 2 && d.points.length <= 50 && d.points.every(isPt) && typeof d.text === 'string'
    },
    {
        key: 'angdims', prefix: 'angd',
        get: (app) => app.annotationManager.angdims,
        set: (app, list) => { app.annotationManager.angdims = list; },
        make: (d) => new AngularDim(d.vertex, d.p1, d.p2, d),
        valid: (d) => isPt(d.vertex) && isPt(d.p1) && isPt(d.p2)
    },
    {
        key: 'stairs', prefix: 'stair',
        get: (app) => app.stairManager.stairs,
        set: (app, list) => { app.stairManager.stairs = list; },
        make: (d) => new Stair(d),
        valid: (d) => (d.x === undefined || isNum(d.x)) && (d.y === undefined || isNum(d.y))
    }
];

const CATEGORY_KEY = { wall: 'walls', opening: 'openings', room: 'rooms', column: 'columns', furniture: 'furniture', dimension: 'dimensions', stair: 'stairs', text: 'texts', leader: 'leaders', angdim: 'angdims' };

/** A detached copy of one drawing object with a brand-new id (used by Copy / Paste style commands). */
export function duplicateEntity(category, obj) {
    const spec = ENTITY_SPECS.find(sp => sp.key === CATEGORY_KEY[category]);
    if (!spec) throw new Error(`Cannot duplicate a "${category}"`);
    const data = clone(obj);
    const entity = spec.make(data);
    assignSafe(entity, data);
    entity.id = nextId(spec.prefix);
    return entity;
}

/** Is `data` a usable record for this kind of object? (used for saved blocks) */
export function isEntityDataValid(category, data) {
    const spec = ENTITY_SPECS.find(sp => sp.key === CATEGORY_KEY[category]);
    return !!spec && isObj(data) && spec.valid(data);
}

/** Roads belong to the site, not to a floor, so they are handled separately. */
const ROAD_SPEC = {
    key: 'roads', prefix: 'road',
    get: (app) => app.roadManager.roads,
    set: (app, list) => { app.roadManager.roads = list; },
    make: (d) => new Road(d),
    valid: (d) => isObj(d)
};

/** Copy `data` onto `target`, skipping dangerous keys. */
function assignSafe(target, data) {
    for (const k of Object.keys(data)) {
        if (FORBIDDEN_KEYS.has(k)) continue;
        target[k] = data[k];
    }
}

/** Build the live objects for one entity collection from saved records. */
function buildEntities(spec, records, warnings) {
    const out = [];
    const seen = new Set();
    if (!Array.isArray(records)) return out;

    records.forEach((rec, index) => {
        if (!isObj(rec) || !spec.valid(rec)) {
            warnings.push(`Skipped invalid ${spec.key} entry #${index + 1}.`);
            return;
        }
        const data = clone(rec); // never share nested objects with history snapshots
        const entity = spec.make(data);
        assignSafe(entity, data);

        for (const f of TEXT_FIELDS) {
            // only real data fields: a class METHOD that happens to share the name (AngularDim.label) must be left alone
            if (Object.prototype.hasOwnProperty.call(entity, f) && entity[f] !== undefined && entity[f] !== null && typeof entity[f] !== 'string') {
                entity[f] = String(entity[f]);
            }
        }

        // Repair missing / duplicate IDs, then reserve the ID in the generator.
        if (typeof entity.id !== 'string' || !entity.id || seen.has(entity.id)) {
            if (typeof entity.id === 'string' && seen.has(entity.id)) {
                warnings.push(`Duplicate ${spec.prefix} id "${entity.id}" was given a new id.`);
            }
            entity.id = nextId(spec.prefix);
        }
        seen.add(entity.id);
        reserveId(entity.id);
        out.push(entity);
    });
    return out;
}

// ---------------------------------------------------------------------------
// Entities only (the part that differs per floor)
// ---------------------------------------------------------------------------

/** Plain-data snapshot of every per-floor entity collection. */
export function serializeEntities(app) {
    const data = {};
    for (const spec of ENTITY_SPECS) data[spec.key] = clone(spec.get(app)) || [];
    return data;
}

/** Replace the live per-floor entities with the ones in `data`. Returns warnings. */
export function restoreEntities(app, data) {
    const warnings = [];
    const built = {};
    for (const spec of ENTITY_SPECS) built[spec.key] = buildEntities(spec, data && data[spec.key], warnings);

    // Openings must belong to an existing wall, otherwise rendering them fails.
    const wallIds = new Set(built.walls.map(w => w.id));
    const before = built.openings.length;
    built.openings = built.openings.filter(o => wallIds.has(o.wallId));
    if (built.openings.length !== before) {
        warnings.push(`Removed ${before - built.openings.length} door/window(s) whose wall no longer exists.`);
    }

    for (const spec of ENTITY_SPECS) spec.set(app, built[spec.key]);
    return warnings;
}

// ---------------------------------------------------------------------------
// Whole project
// ---------------------------------------------------------------------------

/** Plain-data snapshot of the entire project (JSON-safe, fully detached). */
export function serializeProject(app) {
    const pm = app.plotManager;
    const state = {
        version: STATE_VERSION,
        plot: clone(pm.plot) || null,
        northAngle: pm.northAngle,
        wallCornerStyle: app.wallManager.cornerStyle,
        roadSide: pm.roadSide,
        roadWidth: pm.roadWidth,
        showChainedDimensions: pm.showChainedDimensions !== false,
        showCornerMarkers: pm.showCornerMarkers !== false,
        showSetbackShading: pm.showSetbackShading !== false,
        showSlabProjection: app.slabManager ? app.slabManager.enabled : !!pm.showSlabProjection,
        slabProjectionOffset: app.slabManager ? app.slabManager.uniformOffset : (pm.slabProjectionOffset ?? 18),
        slab: app.slabManager ? app.slabManager.serialize() : null,
        showLandscapeWash: !!pm.showLandscapeWash,
        ...serializeEntities(app),
        roads: clone(ROAD_SPEC.get(app)) || [],
        floorManager: app.floorManager ? clone(app.floorManager.serialize()) : null,
        projectInfo: app.projectInfo ? clone(app.projectInfo.serialize()) : null,
        layers: app.layerManager ? app.layerManager.serialize() : null,
        underlay: app.underlay ? clone(app.underlay) : null,
        blocks: app.blocks ? clone(app.blocks) : {},
        refGeometry: app.refGeometry || null                       // large and never edited in place: shared, not copied, by undo history
    };
    return state;
}

/**
 * Check that `state` looks like a project file. Throws an Error with a message
 * that is safe to show to the user.
 */
export function validateProjectState(state) {
    if (!isObj(state)) throw new Error('The file does not contain a project (expected a JSON object).');
    if (state.version !== undefined && (!isNum(state.version) || state.version > STATE_VERSION)) {
        throw new Error('This project was saved by a newer version of the app and cannot be opened safely.');
    }
    const looksLikeProject = ['walls', 'rooms', 'plot', 'floorManager', 'openings', 'furniture']
        .some(k => k in state);
    if (!looksLikeProject) throw new Error('This file does not look like a House Planner project.');

    for (const k of ['walls', 'openings', 'rooms', 'columns', 'furniture', 'dimensions', 'roads', 'stairs', 'texts', 'leaders', 'angdims']) {
        if (state[k] !== undefined && state[k] !== null && !Array.isArray(state[k])) {
            throw new Error(`Invalid project: "${k}" must be a list.`);
        }
    }
    if (state.plot !== undefined && state.plot !== null) {
        const v = state.plot.vertices;
        if (!isObj(state.plot) || !Array.isArray(v) || v.length < 3 || !v.every(isPt)) {
            throw new Error('Invalid project: the plot boundary is damaged.');
        }
    }
    if (state.floorManager !== undefined && state.floorManager !== null) {
        const fm = state.floorManager;
        if (!isObj(fm) || (fm.floors !== undefined && !Array.isArray(fm.floors))) {
            throw new Error('Invalid project: the multi-floor data is damaged.');
        }
    }
}

/** Apply an already-validated state to the app (no rollback here). */
function applyState(app, state) {
    const warnings = [];
    const pm = app.plotManager;

    app.clearSelection();

    // Site
    pm.plot = state.plot ? clone(state.plot) : null;
    pm.northAngle = isNum(state.northAngle) ? state.northAngle : 0;
    // Files saved before this setting existed leave the current choice untouched
    if (state.wallCornerStyle === 'round' || state.wallCornerStyle === 'mitre') app.wallManager.cornerStyle = state.wallCornerStyle;
    if (typeof state.roadSide === 'string') pm.roadSide = state.roadSide;
    if (isNum(state.roadWidth)) pm.roadWidth = state.roadWidth;
    if (state.showChainedDimensions !== undefined) pm.showChainedDimensions = !!state.showChainedDimensions;
    if (state.showCornerMarkers !== undefined) pm.showCornerMarkers = !!state.showCornerMarkers;
    if (state.showSetbackShading !== undefined) pm.showSetbackShading = !!state.showSetbackShading;
    pm.showLandscapeWash = !!state.showLandscapeWash;

    // Slab projection (new files carry a full "slab" block; older ones the two flat fields)
    if (state.slab && app.slabManager) {
        app.slabManager.deserialize(clone(state.slab));
        pm.showSlabProjection = app.slabManager.enabled;
        pm.slabProjectionOffset = app.slabManager.uniformOffset;
    } else {
        pm.showSlabProjection = !!state.showSlabProjection;
        if (app.slabManager) app.slabManager.enabled = !!state.showSlabProjection;
        if (isNum(state.slabProjectionOffset)) {
            pm.slabProjectionOffset = state.slabProjectionOffset;
            if (app.slabManager) app.slabManager.setUniformOffset(state.slabProjectionOffset);
        }
    }

    // Layers (files from before layers existed simply get the default layers)
    if (app.layerManager) app.layerManager.deserialize(state.layers);

    // Imported DXF reference lines
    app.refGeometry = sanitizeReference(state.refGeometry);
    if (state.refGeometry && !app.refGeometry) warnings.push('The imported reference lines in this file could not be used and were skipped.');

    // User blocks (symbols)
    if (typeof app.restoreBlocks === 'function') app.restoreBlocks(state.blocks);

    // Background picture for tracing (a damaged or unsafe one is dropped, with a warning)
    app.underlay = sanitizeUnderlay(state.underlay);
    if (state.underlay && !app.underlay) warnings.push('The background picture in this file could not be used and was skipped.');
    if (!app.underlay) app.underlayEditing = false;

    // Entities
    warnings.push(...restoreEntities(app, state));
    ROAD_SPEC.set(app, buildEntities(ROAD_SPEC, state.roads, warnings));

    // Multi-floor + title block
    if (app.floorManager) {
        // Always start from blank floors so the previous project's upper floors can't leak in.
        app.floorManager.reset();
        if (state.floorManager) app.floorManager.deserialize(clone(state.floorManager));
    }
    if (state.projectInfo && app.projectInfo) app.projectInfo.deserialize(clone(state.projectInfo));

    return warnings;
}

/**
 * Replace the whole project with `state`.
 * Validates first; if applying fails part-way, the previous drawing is restored
 * and the error is re-thrown. Returns a list of non-fatal warnings.
 */
export function restoreProject(app, state) {
    validateProjectState(state);
    const backup = serializeProject(app);
    try {
        const warnings = applyState(app, state);
        if (warnings.length) console.warn('Project loaded with warnings:', warnings);
        return warnings;
    } catch (err) {
        console.error('Project restore failed, rolling back:', err);
        try { applyState(app, backup); } catch (e2) { console.error('Rollback failed:', e2); }
        throw err;
    }
}
