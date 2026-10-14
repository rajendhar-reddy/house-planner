/**
 * schedules.js - Door / window / gate schedule and room schedule, plus CSV export.
 *
 * Pure functions over the saved project data (the object returned by serializeProject), so every floor is
 * covered and nothing here touches the DOM. Dimensions are in inches (the app's internal unit); text is
 * formatted with the active unit system.
 */

import { units } from './units.js';

const SUBTYPE_NAMES = {
    door: { single: 'Single-swing door', double: 'Double-swing door', sliding: 'Sliding door', arch: 'Arch opening (no door)', archway: 'Arch opening (no door)' },
    window: { standard: 'Casement window', sliding: 'Sliding window', fixed: 'Fixed glass window' },
    gate: { sliding: 'Sliding gate', swing: 'Double-swing gate', double: 'Double-swing gate' }
};
const PREFIX = { door: 'D', window: 'W', gate: 'G' };
const FLOOR_NAMES = { ground: 'Ground', first: 'First', terrace: 'Terrace' };

const SQ_IN_PER_SQ_FT = 144;
const SQ_M_PER_SQ_IN = 0.00064516;

/** The per-floor object lists of a project (falls back to the top-level lists for a single-floor file). */
export function floorsOf(state) {
    const floors = state && state.floorManager && Array.isArray(state.floorManager.floors) ? state.floorManager.floors : null;
    if (floors && floors.some(f => (f.walls && f.walls.length) || (f.openings && f.openings.length) || (f.rooms && f.rooms.length))) {
        return floors.map(f => ({ id: f.id, name: FLOOR_NAMES[f.id] || f.name || f.id, openings: f.openings || [], rooms: f.rooms || [] }));
    }
    return [{ id: 'ground', name: 'Ground', openings: (state && state.openings) || [], rooms: (state && state.rooms) || [] }];
}

function roomArea(r) {
    if (Array.isArray(r.polygon) && r.polygon.length >= 3) {
        let a = 0;
        for (let i = 0; i < r.polygon.length; i++) { const j = (i + 1) % r.polygon.length; a += r.polygon[i].x * r.polygon[j].y - r.polygon[j].x * r.polygon[i].y; }
        return Math.abs(a) / 2;
    }
    return (Number(r.width) || 144) * (Number(r.height) || 144);
}

/**
 * @returns {{ openings: Array, rooms: Array, floors: Array, totals: object }}
 *  openings: rows { mark, kind, description, width, widthText, qty, byFloor }  grouped by kind + type + width
 *  rooms:    rows { floor, name, width, height, sizeText, areaSqFt, areaSqM, areaText, isVoid }
 */
export function buildSchedules(state) {
    const floors = floorsOf(state);

    // ---- doors / windows / gates, grouped
    const groups = new Map();
    for (const f of floors) {
        for (const o of f.openings) {
            const kind = o.type === 'window' ? 'window' : (o.type === 'gate' ? 'gate' : 'door');
            const subtype = o.subtype || (kind === 'door' ? 'single' : kind === 'gate' ? 'sliding' : 'standard');
            const width = Math.round((Number(o.width) || 0) * 10) / 10;
            const key = `${kind}|${subtype}|${width}`;
            if (!groups.has(key)) groups.set(key, { kind, subtype, width, qty: 0, byFloor: {} });
            const g = groups.get(key);
            g.qty++; g.byFloor[f.name] = (g.byFloor[f.name] || 0) + 1;
        }
    }
    const order = { door: 0, window: 1, gate: 2 };
    const sorted = [...groups.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.width - b.width || a.subtype.localeCompare(b.subtype));
    const counters = { door: 0, window: 0, gate: 0 };
    const openings = sorted.map(g => ({
        mark: `${PREFIX[g.kind]}${++counters[g.kind]}`,
        kind: g.kind,
        description: (SUBTYPE_NAMES[g.kind] && SUBTYPE_NAMES[g.kind][g.subtype]) || `${g.kind} (${g.subtype})`,
        width: g.width,
        widthText: units.formatLength(g.width),
        qty: g.qty,
        byFloor: g.byFloor
    }));

    // ---- rooms
    const rooms = [];
    for (const f of floors) {
        for (const r of f.rooms) {
            const area = roomArea(r);
            const w = Number(r.width) || 144, h = Number(r.height) || 144;
            rooms.push({
                floor: f.name,
                name: String(r.name || 'Room'),
                width: w, height: h,
                sizeText: `${units.formatLength(w)} x ${units.formatLength(h)}`,
                areaSqFt: area / SQ_IN_PER_SQ_FT,
                areaSqM: area * SQ_M_PER_SQ_IN,
                areaText: units.formatArea(area).primary,
                isVoid: !!r.isVoid
            });
        }
    }

    const counted = rooms.filter(r => !r.isVoid);
    const perFloor = {};
    for (const r of counted) perFloor[r.floor] = (perFloor[r.floor] || 0) + r.areaSqFt;
    const totals = {
        doors: openings.filter(o => o.kind === 'door').reduce((s, o) => s + o.qty, 0),
        windows: openings.filter(o => o.kind === 'window').reduce((s, o) => s + o.qty, 0),
        gates: openings.filter(o => o.kind === 'gate').reduce((s, o) => s + o.qty, 0),
        rooms: counted.length,
        areaSqFt: counted.reduce((s, r) => s + r.areaSqFt, 0),
        areaSqM: counted.reduce((s, r) => s + r.areaSqM, 0),
        areaByFloorSqFt: perFloor
    };
    return { openings, rooms, floors: floors.map(f => f.name), totals };
}

// ---------------------------------------------------------------- CSV
/** One CSV cell: quoted when needed, and neutralised against spreadsheet formula injection (=, +, -, @). */
export function csvCell(value) {
    let s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;       // a typed room name must never run as a formula
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvRow = (cells) => cells.map(csvCell).join(',');

/** The schedules as one CSV document (UTF-8 with BOM so Excel reads non-Latin names correctly). */
export function schedulesToCSV(sched) {
    const fl = sched.floors;
    const lines = [];
    lines.push(csvRow(['DOOR / WINDOW / GATE SCHEDULE']));
    lines.push(csvRow(['Mark', 'Description', 'Width (in)', 'Width', 'Total qty', ...fl]));
    for (const o of sched.openings) lines.push(csvRow([o.mark, o.description, o.width, o.widthText, o.qty, ...fl.map(f => o.byFloor[f] || 0)]));
    lines.push(csvRow(['Total doors', sched.totals.doors, 'Total windows', sched.totals.windows, 'Total gates', sched.totals.gates]));
    lines.push('');
    lines.push(csvRow(['ROOM SCHEDULE (nominal area = width x height; wall thickness is not deducted)']));
    lines.push(csvRow(['Floor', 'Room', 'Size', 'Width (in)', 'Height (in)', 'Area (sq ft)', 'Area (sq m)', 'Note']));
    for (const r of sched.rooms) lines.push(csvRow([r.floor, r.name, r.sizeText, r.width, r.height, r.areaSqFt.toFixed(1), r.areaSqM.toFixed(2), r.isVoid ? 'Void / open to below (not counted)' : '']));
    lines.push(csvRow(['Total', '', '', '', '', sched.totals.areaSqFt.toFixed(1), sched.totals.areaSqM.toFixed(2), `${sched.totals.rooms} rooms`]));
    for (const [floor, a] of Object.entries(sched.totals.areaByFloorSqFt)) lines.push(csvRow([`${floor} floor`, '', '', '', '', a.toFixed(1), (a * SQ_IN_PER_SQ_FT * SQ_M_PER_SQ_IN).toFixed(2), '']));
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
