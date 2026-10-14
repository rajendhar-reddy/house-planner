/**
 * commands.js - AutoCAD-style command line.
 *
 * Typed point input (same ideas as AutoCAD):
 *     12'            direct distance: that far from the start point, towards the cursor
 *     5',3'          absolute point  (X right, Y DOWN - the same X/Y shown in the status bar)
 *     @5',3'         relative to the last point (Y UP, like AutoCAD)
 *     @12'<30        relative polar: 12 feet at 30 degrees (counter-clockwise from east, like AutoCAD)
 *
 * The interpreter only talks to the app through a small set of methods, so it is unit-tested with a stand-in app.
 */

import { units, UnitSystem } from './units.js';
import { parsePointInput, parseAngle, resolvePoint } from './point_input.js';
import { SELECTABLE } from './transform.js';
import { EXT_COMMANDS, zoomWindow } from './commands_ext.js';

/** Tool name -> aliases (the first one is the full name). */
export const TOOL_COMMANDS = {
    select: ['select', 'v'], wall: ['wall', 'w'], compound_wall: ['compound', 'k', 'boundary'], column: ['column', 'c'],
    door: ['door', 'd'], gate: ['gate', 'g'], window: ['window', 'n', 'win'], room: ['room', 'r'], furniture: ['furniture', 'f'],
    landscape: ['landscape', 'l'], slab: ['slab', 'j'], dimension: ['dimension', 'm', 'dim'], break_wall: ['break', 'b'],
    road: ['road', 'o'], stairs: ['stairs', 's', 'stair'], plot_rect: ['plot', 'p'], pan: ['pan']
};

/** Tools that run on a start point + further points (distance entry works for them). */
export const DRAFT_TOOLS = ['wall', 'compound_wall', 'dimension', 'plot_rect'];

const HELP = [
    'DRAW:  WALL  COMPOUND  COLUMN  DOOR  GATE  WINDOW  ROOM  FURNITURE  STAIRS  DIM  PLOT  ROAD   (or the one-letter keys)',
    'EDIT (select objects first - click, drag a window, or ALL):  MOVE  COPY  ROTATE  MIRROR  ERASE',
    'WALLS: OFFSET  TRIM  EXTEND  FILLET (sharp corner)  CHAMFER      MEASURE: DIST  AREA  ANGLE',
    'VIEW:  ZOOM E | W (window) | P (previous) | IN | OUT | <factor>    ORTHO ON/OFF    SNAP ON/OFF    POLAR ON/OFF/<angle>    OSNAP END MID INT PER NEA',
    'DATA:  LAYER NEW <name> | HIDE <name> | SHOW <name> | LOCK <name> | UNLOCK <name> | SET <name>    LAYERS    SCHEDULE    UNITS IMP|METRIC',
    'OTHER: UNDO (U)  REDO  HELP (?)   Enter on an empty line repeats the last command; Esc cancels.',
    'POINTS: type 12\' (distance towards the cursor)  5\',3\' (absolute)  @5\',3\' (relative, Y up)  @12\'<30 (polar, counter-clockwise)'
];

export { parsePointInput, parseAngle, resolvePoint } from './point_input.js';

const fmtPt = (p) => `${units.formatLength(p.x)}, ${units.formatLength(p.y)}`;

// ---------------------------------------------------------------- the command line
export class CommandLine {
    /**
     * @param app  the application (or a stand-in with the same methods)
     * @param ui   { log(text, kind), setPrompt(text) } - kind is 'echo' | 'info' | 'error'
     */
    constructor(app, ui = {}) {
        this.app = app;
        this.ui = { log() {}, setPrompt() {}, ...ui };
        this.pending = null;
        this.lastCommand = '';
    }

    log(text, kind = 'info') { this.ui.log(text, kind); }
    setPrompt(text) { this.ui.setPrompt(text || 'Command:'); }

    /** True while a command is waiting for a point that the mouse can supply. */
    wantsCanvasPoint() { return !!(this.pending && this.pending.wantsPoint); }

    cancel(message = true) {
        if (this.pending) { this.pending = null; this.setPrompt(); if (message) this.log('*Cancel*'); }
        this.app.requestRender?.();
    }

    // ---- entry points
    /** The user pressed Enter in the command box. */
    submit(raw) {
        const text = String(raw || '').trim();
        try {
            if (this.pending) { this.log(`${this.pending.prompt} ${text}`, 'echo'); this.feed(text); return; }
            if (!text) { this.enterOnEmpty(); return; }
            this.log(`Command: ${text}`, 'echo');
            this.lastCommand = text;
            this.runCommand(text);
        } catch (err) {
            this.log(err.message, 'error');
        }
    }

    /** The user clicked the canvas while a command was waiting for a point. Returns true when the click was used. */
    canvasPoint(point) {
        if (!this.wantsCanvasPoint()) return false;
        try { this.log(`${this.pending.prompt} ${fmtPt(point)}`, 'echo'); this.pending.onPoint(point); }
        catch (err) { this.log(err.message, 'error'); }
        return true;
    }

    enterOnEmpty() {
        const app = this.app;
        if (DRAFT_TOOLS.includes(app.activeTool) && app.draftStart) {      // Enter finishes a chain of walls, like LINE in AutoCAD
            app.draftStart = null; this.log('Done.'); app.requestRender?.(); return;
        }
        if (this.lastCommand) { this.log(`Command: ${this.lastCommand}`, 'echo'); this.runCommand(this.lastCommand); }
    }

    // ---- prompts
    ask(spec) {
        this.pending = spec;
        this.setPrompt(spec.prompt);
        this.app.requestRender?.();
    }
    finish() { this.pending = null; this.setPrompt(); this.app.requestRender?.(); }

    /** Typed text while a prompt is open. */
    feed(text) {
        const p = this.pending;
        if (p.kind === 'text') { p.onText(text); return; }                      // free text: no command words, capitals kept
        if (/^(esc|cancel|x)$/i.test(text)) { this.cancel(); return; }
        if (p.kind === 'point') {
            if (!text) { if (p.onEnter) p.onEnter(); else this.cancel(); return; }
            const input = parsePointInput(text);
            if (!input) throw new Error(`"${text}" is not a point. Try 5',3'  or  @5',3'  or  @12'<30  or a distance such as 12'.`);
            p.onPoint(resolvePoint(input, { base: p.base || null, cursor: this.app.draftCurrent || null }));
        } else if (p.kind === 'angle') {
            if (/^c(opy)?$/i.test(text) && p.allowCopy) { p.copy = true; this.log('Copy mode: the original is kept.'); return; }
            if (!text) { this.cancel(); return; }
            const a = parseAngle(text);
            if (a !== null) { p.onAngle(a); return; }
            const input = parsePointInput(text);
            if (input && p.base) { const pt = resolvePoint(input, { base: p.base, cursor: this.app.draftCurrent }); p.onPoint(pt); return; }
            throw new Error('Type an angle in degrees (counter-clockwise), for example 90.');
        } else if (p.kind === 'choice') {
            p.onChoice(text.toLowerCase());
        }
    }

    // ---- commands
    runCommand(text) {
        const [head, ...rest] = text.trim().split(/\s+/);
        const name = head.toLowerCase();
        const args = rest;
        const app = this.app;

        // 1. tools
        for (const [tool, aliases] of Object.entries(TOOL_COMMANDS)) {
            if (aliases.includes(name)) { this.cancel(false); app.setTool(tool); this.log(`${aliases[0].toUpperCase()} - click to draw, or type a point / distance.`); return; }
        }
        // 2. direct distance / coordinates while drafting
        const asPoint = parsePointInput(text);
        if (asPoint && DRAFT_TOOLS.includes(app.activeTool)) { this.draftTyped(asPoint); return; }

        // 3. everything else
        const table = {
            move: () => this.startMoveCopy(false), mv: () => this.startMoveCopy(false),
            copy: () => this.startMoveCopy(true), co: () => this.startMoveCopy(true), cp: () => this.startMoveCopy(true),
            rotate: () => this.startRotate(), ro: () => this.startRotate(),
            mirror: () => this.startMirror(), mi: () => this.startMirror(),
            erase: () => this.erase(), e: () => this.erase(), del: () => this.erase(), delete: () => this.erase(),
            all: () => this.selectAll(), sel: () => this.selectCmd(args), selectall: () => this.selectAll(),
            undo: () => this.undo(), u: () => this.undo(), redo: () => { app.redo(); this.log('Redo.'); },
            zoom: () => this.zoom(args), z: () => this.zoom(args),
            ortho: () => this.toggle(args, (on) => app.setOrtho(on), () => app.canvasEngine.orthoMode, 'Ortho'),
            snap: () => this.toggle(args, (on) => app.setGridSnap(on), () => app.canvasEngine.snapToGrid, 'Grid snap'),
            polar: () => this.polar(args), osnap: () => this.osnap(args), os: () => this.osnap(args),
            units: () => this.units(args),
            layer: () => this.layer(args), la: () => this.layer(args),
            layers: () => { app.openLayersPanel?.(); this.log('Layers dialog opened.'); },
            schedule: () => { app.openSchedulePanel?.(); this.log('Schedules opened.'); }, sch: () => { app.openSchedulePanel?.(); },
            underlay: () => this.underlay(args),
            help: () => HELP.forEach(l => this.log(l)), '?': () => HELP.forEach(l => this.log(l))
        };
        if (table[name]) { table[name](); return; }
        if (EXT_COMMANDS[name]) { EXT_COMMANDS[name](this, args); return; }
        throw new Error(`Unknown command "${head}". Type HELP for the list.`);
    }

    // ---- direct distance entry while drafting
    draftTyped(input) {
        const app = this.app, tool = app.activeTool;
        const pt = resolvePoint(input, { base: app.draftStart || null, cursor: app.draftCurrent || null });
        const ok = app.addDraftPoint(tool, pt);
        if (ok === false) { this.log('That point is too close to the start point.', 'error'); return; }
        const last = app.draftStart;
        this.log(last ? `Point set at ${fmtPt(pt)}. Type another distance, or press Enter to finish.` : `Done.`);
        app.requestRender?.();
    }

    // ---- editing commands
    needSelection() {
        const items = this.app.getSelectionItems();
        if (!items.length) throw new Error('Select objects first (click, Shift+click, drag a window, or type ALL), then run the command.');
        return items;
    }

    startMoveCopy(copy) {
        const items = this.needSelection();
        this.cancel(false);
        const name = copy ? 'COPY' : 'MOVE';
        this.log(`${name}: ${items.length} object${items.length === 1 ? '' : 's'}.`);
        const doIt = (dx, dy) => { this.app.runTransform('move', { dx, dy, copy }); };
        this.ask({
            kind: 'point', wantsPoint: true, prompt: `${name} - specify base point:`,
            onPoint: (base) => {
                this.ask({
                    kind: 'point', wantsPoint: true, base, prompt: `${name} - specify second point (distance, @x,y or click):`,
                    onPoint: (p2) => {
                        doIt(p2.x - base.x, p2.y - base.y);
                        if (copy) {                                    // COPY repeats until Enter / Esc
                            this.log(`Copied. Specify another point, or press Enter to finish.`);
                            this.pending.onEnter = () => this.finish();
                            this.app.setSelection?.(items);              // the original objects stay the source
                        } else this.finish();
                    },
                    onEnter: () => this.cancel()
                });
            }
        });
    }

    startRotate() {
        const items = this.needSelection();
        this.cancel(false);
        this.log(`ROTATE: ${items.length} object${items.length === 1 ? '' : 's'}.`);
        const askAngle = (pivot) => {
            const spec = {
                kind: 'angle', wantsPoint: true, base: pivot, allowCopy: true, copy: false,
                prompt: 'ROTATE - angle in degrees (counter-clockwise), or click a direction. C = copy:',
                onAngle: (deg) => { this.app.runTransform('rotate', { degrees: -deg, pivot, copy: spec.copy }); this.finish(); },
                onPoint: (pt) => { const deg = (Math.atan2(-(pt.y - pivot.y), pt.x - pivot.x) * 180) / Math.PI; this.app.runTransform('rotate', { degrees: -deg, pivot, copy: spec.copy }); this.finish(); }
            };
            this.ask(spec);
        };
        this.ask({
            kind: 'point', wantsPoint: true, prompt: 'ROTATE - specify base point (Enter = centre of the selection):',
            onPoint: askAngle,
            onEnter: () => askAngle(this.app.selectionCenter ? this.app.selectionCenter() : null)
        });
    }

    startMirror() {
        const items = this.needSelection();
        this.cancel(false);
        this.log(`MIRROR: ${items.length} object${items.length === 1 ? '' : 's'}.`);
        this.ask({
            kind: 'point', wantsPoint: true, prompt: 'MIRROR - first point of the mirror line:',
            onPoint: (p1) => this.ask({
                kind: 'point', wantsPoint: true, base: p1, prompt: 'MIRROR - second point of the mirror line:',
                onPoint: (p2) => {
                    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1e-6) throw new Error('The two mirror points must be different.');
                    this.ask({
                        kind: 'choice', prompt: 'Erase source objects? [Yes/No] <No>:',
                        onChoice: (ans) => {
                            const erase = /^y(es)?$/.test(ans);
                            if (ans && !erase && !/^n(o)?$/.test(ans)) throw new Error('Type Y or N.');
                            this.app.runTransform('mirror', { p1, p2, copy: !erase });
                            this.finish();
                        }
                    });
                }
            })
        });
    }

    erase() {
        const items = this.needSelection();
        this.app.deleteSelected();
        this.log(`${items.length} object${items.length === 1 ? '' : 's'} erased.`);
    }

    selectAll() { this.app.selectAll(); this.log(`${this.app.getSelectionItems().length} objects selected.`); }
    selectCmd(args) {
        if (args[0] && args[0].toLowerCase() === 'all') return this.selectAll();
        throw new Error('Use SELECT ALL, or click / drag on the drawing. (Ctrl+A also selects everything.)');
    }
    undo() { this.app.undo(); this.log('Undo.'); }

    // ---- view / settings
    zoom(args) {
        const a = (args[0] || 'e').toLowerCase();
        const ce = this.app.canvasEngine;
        if (['w', 'window'].includes(a)) { zoomWindow(this); return; }
        if (['p', 'previous'].includes(a)) { if (!this.app.zoomPrevious || !this.app.zoomPrevious()) throw new Error('There is no earlier view to go back to.'); this.log('Previous view.'); return; }
        this.app.pushView?.();
        if (['e', 'extents', 'all', 'a', 'fit', 'f'].includes(a)) { this.app.zoomExtents(); this.log('Zoomed to extents.'); return; }
        let factor = a === 'in' ? 1.5 : a === 'out' ? 1 / 1.5 : Number(a.replace(/x$/, ''));
        if (!Number.isFinite(factor) || factor <= 0) throw new Error('ZOOM E (extents), IN, OUT or a factor such as 2 or 0.5.');
        ce.scale = Math.min(30, Math.max(0.1, ce.scale * factor));
        this.app.requestRender?.();
        this.log(`Zoom ${Math.round(ce.scale * 100)}%.`);
    }

    toggle(args, set, get, label) {
        const a = (args[0] || '').toLowerCase();
        const on = a === 'on' ? true : a === 'off' ? false : !get();
        set(on);
        this.log(`${label} ${on ? 'ON' : 'OFF'}.`);
    }

    polar(args) {
        const ce = this.app.canvasEngine, a = (args[0] || '').toLowerCase();
        if (a === 'on' || a === 'off') { ce.polarMode = a === 'on'; this.app.syncSnapControls?.(); this.log(`Polar tracking ${a.toUpperCase()} (${ce.polarIncrement}\u00b0).`); return; }
        if (a === '') { ce.polarMode = !ce.polarMode; this.app.syncSnapControls?.(); this.log(`Polar tracking ${ce.polarMode ? 'ON' : 'OFF'} (${ce.polarIncrement}\u00b0).`); return; }
        const inc = Number(a);
        if (![5, 10, 15, 22.5, 30, 45, 90].includes(inc)) throw new Error('POLAR ON, OFF, or an angle step: 5, 10, 15, 22.5, 30, 45 or 90.');
        ce.polarIncrement = inc; ce.polarMode = true; this.app.syncSnapControls?.();
        this.log(`Polar tracking ON every ${inc}\u00b0.`);
    }

    osnap(args) {
        const ce = this.app.canvasEngine;
        const modes = { end: 'endpoint', endpoint: 'endpoint', mid: 'midpoint', midpoint: 'midpoint', int: 'intersection', intersection: 'intersection',
            per: 'perpendicular', perpendicular: 'perpendicular', nea: 'nearest', nearest: 'nearest' };
        if (!args.length) { this.log('Object snaps: ' + Object.entries(ce.snapModes).map(([k, v]) => `${k} ${v ? 'ON' : 'OFF'}`).join(', ')); return; }
        if (['on', 'off'].includes(args[0].toLowerCase())) { ce.snapToPoints = args[0].toLowerCase() === 'on'; this.app.syncSnapControls?.(); this.log(`Object snap ${ce.snapToPoints ? 'ON' : 'OFF'}.`); return; }
        const wanted = new Set();
        for (const w of args.join(' ').toLowerCase().split(/[\s,]+/).filter(Boolean)) {
            if (w === 'none') continue;
            if (!modes[w]) throw new Error(`Unknown snap "${w}". Use END, MID, INT, PER, NEA, NONE.`);
            wanted.add(modes[w]);
        }
        for (const k of Object.keys(ce.snapModes)) if (k !== 'grid') ce.snapModes[k] = wanted.has(k);
        ce.snapToPoints = true; this.app.syncSnapControls?.();
        this.log('Object snaps: ' + ([...wanted].join(', ') || 'none') + '.');
    }

    units(args) {
        const a = (args[0] || '').toLowerCase();
        if (['imp', 'imperial', 'ft', 'feet'].includes(a)) this.app.setUnits?.(UnitSystem.IMPERIAL);
        else if (['metric', 'm', 'mm', 'meter', 'metre'].includes(a)) this.app.setUnits?.(UnitSystem.METRIC);
        else throw new Error('UNITS IMPERIAL or UNITS METRIC.');
        this.log(`Units: ${units.getSystem()}.`);
    }

    underlay(args) {
        const a = (args[0] || '').toLowerCase();
        const app = this.app;
        if (a === '' || a === 'panel') { app.openUnderlayPanel(); return; }
        if (a === 'load') { app.openUnderlayPicker(); this.log('Choose a picture to trace over.'); return; }
        if (a === 'scale') { app.startUnderlayCalibration(); return; }
        if (a === 'remove') { app.removeUnderlay(); this.log('Underlay removed.'); return; }
        const done = { lock: 'locked', unlock: 'unlocked', hide: 'hidden', show: 'shown' }[a];
        if (done) { app.setUnderlayFlag(a); this.log(`Underlay ${done}.`); return; }
        throw new Error('UNDERLAY (dialog) | LOAD | SCALE | LOCK | UNLOCK | HIDE | SHOW | REMOVE.');
    }

    layer(args) {
        const lm = this.app.layerManager;
        const sub = (args[0] || '').toLowerCase();
        const name = args.slice(1).join(' ').trim();
        const find = () => {
            const l = lm.layers.find(x => x.name.toLowerCase() === name.toLowerCase() || x.id.toLowerCase() === name.toLowerCase());
            if (!l) throw new Error(`No layer called "${name}". Type LAYERS to see them.`);
            return l;
        };
        const changed = () => { this.app.clearSelection?.(); this.app.saveHistory?.(); this.app.requestRender?.(); };
        switch (sub) {
            case '': case 'list': this.log('Layers: ' + lm.layers.map(l => `${l.name}${l.visible ? '' : ' (hidden)'}${l.locked ? ' (locked)' : ''}`).join(', ')); return;
            case 'new': case 'make': { const l = lm.add(name); this.log(`Layer "${l.name}" created.`); changed(); return; }
            case 'hide': case 'off': { const l = find(); lm.setVisible(l.id, false); this.log(`Layer "${l.name}" hidden.`); changed(); return; }
            case 'show': case 'on': { const l = find(); lm.setVisible(l.id, true); this.log(`Layer "${l.name}" shown.`); changed(); return; }
            case 'lock': { const l = find(); lm.setLocked(l.id, true); this.log(`Layer "${l.name}" locked.`); changed(); return; }
            case 'unlock': { const l = find(); lm.setLocked(l.id, false); this.log(`Layer "${l.name}" unlocked.`); changed(); return; }
            case 'set': case 'current': { const l = find(); lm.setCurrent(l.id); this.log(`New objects will be drawn on "${l.name}".`); this.app.saveHistory?.(); return; }
            case 'bytype': lm.setCurrent(null); this.log('New objects go on their default layers.'); this.app.saveHistory?.(); return;
            case 'assign': {
                const items = this.needSelection(); const l = find();
                for (const it of items) it.obj.layer = l.id;
                this.log(`${items.length} object${items.length === 1 ? '' : 's'} moved to "${l.name}".`); this.app.saveHistory?.(); this.app.requestRender?.(); return;
            }
            default: throw new Error('LAYER NEW <name> | HIDE <name> | SHOW <name> | LOCK <name> | UNLOCK <name> | SET <name> | ASSIGN <name> | BYTYPE');
        }
    }
}

export { SELECTABLE };
