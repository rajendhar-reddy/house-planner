/**
 * layers.js - AutoCAD-style layers.
 *
 * Every drawing object has an optional `layer` property (a layer id). When it is null/undefined the
 * object lives on the default layer for its kind (walls, doors & windows, rooms, ...). A layer can be
 * hidden (not drawn, not selectable, not exported) or locked (drawn, but cannot be selected or edited).
 */

/** The built-in layers. They can be hidden/locked/recoloured but not deleted. */
export const DEFAULT_LAYERS = [
    { id: 'walls', name: 'Walls', color: '#94a3b8' },
    { id: 'openings', name: 'Doors & Windows', color: '#fbbf24' },
    { id: 'rooms', name: 'Rooms', color: '#38bdf8' },
    { id: 'columns', name: 'Columns', color: '#f87171' },
    { id: 'stairs', name: 'Stairs', color: '#c084fc' },
    { id: 'furniture', name: 'Furniture', color: '#a3e635' },
    { id: 'landscape', name: 'Landscape', color: '#4ade80' },
    { id: 'dimensions', name: 'Dimensions', color: '#22d3ee' },
    { id: 'annotation', name: 'Annotation', color: '#fbbf24' }
];

const LANDSCAPE_TYPES = new Set(['tree_deciduous', 'tree_palm', 'shrub_bush', 'planter_box', 'lawn_patch',
    'driveway_pavers', 'car_suv', 'motorcycle', 'car_sedan']);

/** The built-in layer an object belongs to when it has no explicit `layer`. */
export function defaultLayerId(category, obj) {
    switch (category) {
        case 'wall': return 'walls';
        case 'opening': return 'openings';
        case 'room': return 'rooms';
        case 'column': return 'columns';
        case 'stair': return 'stairs';
        case 'dimension': return 'dimensions';
        case 'text': case 'leader': case 'angdim': return 'annotation';
        case 'furniture': return obj && LANDSCAPE_TYPES.has(obj.type || obj.typeId) ? 'landscape' : 'furniture';
        default: return 'walls';
    }
}

export class LayerManager {
    constructor() {
        this.reset();
    }

    reset() {
        this.layers = DEFAULT_LAYERS.map(l => ({ ...l, visible: true, locked: false, builtin: true }));
        /** Layer new objects are drawn on. null = "by type" (each kind goes on its own default layer). */
        this.currentId = null;
    }

    get(id) { return this.layers.find(l => l.id === id) || null; }

    /** The layer id an object is actually on (an unknown/deleted id falls back to the default). */
    layerIdOf(obj, category) {
        const def = defaultLayerId(category, obj);
        const id = obj && obj.layer;
        return id && this.get(id) ? id : def;
    }

    isVisible(obj, category) { const l = this.get(this.layerIdOf(obj, category)); return !l || l.visible; }
    isLocked(obj, category) { const l = this.get(this.layerIdOf(obj, category)); return !!(l && l.locked); }
    /** Can the user pick/edit this object? */
    isSelectable(obj, category) { const l = this.get(this.layerIdOf(obj, category)); return !l || (l.visible && !l.locked); }

    /** Layer id to stamp on a newly created object (null = leave on its default layer). */
    layerForNew() {
        return this.currentId && this.get(this.currentId) ? this.currentId : null;
    }

    add(name, color = '#e2e8f0') {
        const clean = String(name || '').trim().slice(0, 40);
        if (!clean) throw new Error('A layer needs a name.');
        if (this.layers.some(l => l.name.toLowerCase() === clean.toLowerCase())) throw new Error(`A layer called "${clean}" already exists.`);
        let n = 1; while (this.get('L' + n)) n++;
        const layer = { id: 'L' + n, name: clean, color, visible: true, locked: false, builtin: false };
        this.layers.push(layer);
        return layer;
    }

    rename(id, name) {
        const l = this.get(id); const clean = String(name || '').trim().slice(0, 40);
        if (!l) throw new Error('No such layer.');
        if (!clean) throw new Error('A layer needs a name.');
        if (this.layers.some(o => o !== l && o.name.toLowerCase() === clean.toLowerCase())) throw new Error(`A layer called "${clean}" already exists.`);
        l.name = clean;
    }

    /** Delete a custom layer; objects on it go back to their default layers. `allObjects` = iterable of objects. */
    remove(id, allObjects = []) {
        const l = this.get(id);
        if (!l) return false;
        if (l.builtin) throw new Error('Built-in layers cannot be deleted.');
        for (const o of allObjects) if (o && o.layer === id) o.layer = null;
        this.layers = this.layers.filter(x => x.id !== id);
        if (this.currentId === id) this.currentId = null;
        return true;
    }

    setVisible(id, v) { const l = this.get(id); if (l) l.visible = !!v; }
    setLocked(id, v) { const l = this.get(id); if (l) l.locked = !!v; }
    setColor(id, c) { const l = this.get(id); if (l && /^#[0-9a-fA-F]{6}$/.test(c)) l.color = c; }
    setCurrent(id) { this.currentId = id && this.get(id) ? id : null; }

    serialize() {
        return {
            currentId: this.currentId,
            layers: this.layers.map(l => ({ id: l.id, name: l.name, color: l.color, visible: l.visible, locked: l.locked, builtin: !!l.builtin }))
        };
    }

    /** Restore from saved data; unknown / malformed entries are ignored, built-ins are always present. */
    deserialize(data) {
        this.reset();
        if (!data || !Array.isArray(data.layers)) return;
        for (const s of data.layers) {
            if (!s || typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,20}$/.test(s.id)) continue;
            let l = this.get(s.id);
            if (!l) {
                if (typeof s.name !== 'string' || !s.name.trim()) continue;
                l = { id: s.id, name: s.name.trim().slice(0, 40), color: '#e2e8f0', visible: true, locked: false, builtin: false };
                this.layers.push(l);
            } else if (l.builtin && typeof s.name === 'string' && s.name.trim()) {
                l.name = s.name.trim().slice(0, 40);
            }
            if (typeof s.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color)) l.color = s.color;
            l.visible = s.visible !== false;
            l.locked = !!s.locked;
        }
        this.currentId = data.currentId && this.get(data.currentId) ? data.currentId : null;
    }
}

/** Is `obj` drawn? (true when no layer manager is attached) */
export function visibleIn(layers, obj, category) { return !layers || layers.isVisible(obj, category); }
/** Can `obj` be picked/edited? (false when hidden or locked) */
export function selectableIn(layers, obj, category) { return !layers || layers.isSelectable(obj, category); }
/** Put a newly created object on the current layer (no-op when the current layer is "by type"). */
export function stampLayer(layers, obj) { const id = layers ? layers.layerForNew() : null; if (id) obj.layer = id; return obj; }
