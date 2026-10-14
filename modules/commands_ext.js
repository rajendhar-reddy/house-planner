/**
 * commands_ext.js - the interactive commands added after the first batch:
 *   measuring (DIST, AREA, ANGLE), zoom window / previous, wall editing (OFFSET, TRIM, EXTEND, FILLET, CHAMFER).
 * Each entry is (commandLine, args) => void and talks to the app through the same small interface as commands.js.
 */

import { units } from './units.js';
import { distanceInfo, polygonArea, polylineLength, angleAt, describeDistance, describeArea, fmtDeg } from './measure.js';
import { offsetWall, trimWall, extendWall, filletWalls, chamferWalls } from './wall_edit.js';
import { HATCH_TYPES } from './hatch.js';
import { DIM_STYLES, DIM_STYLE_IDS, findDimStyle } from './dimstyles.js';
import { parseAngle } from './point_input.js';

export const EXT_COMMANDS = {};
export const EXT_ALIASES = {};
const def = (names, fn) => { for (const n of names) { EXT_COMMANDS[n] = fn; } };

/** Ask for a wall by clicking on it. Errors thrown in onWall are shown and the same question stays open. */
function askWall(cl, prompt, onWall, onEnter) {
    cl.ask({
        kind: 'point', wantsPoint: true, prompt,
        onPoint: (pt) => {
            const wall = cl.app.pickWall(pt);
            if (!wall) throw new Error('There is no wall at that spot - click directly on a wall.');
            onWall(wall, pt);
        },
        onEnter: onEnter || (() => cl.finish())
    });
}

/** Ask for a distance (typed). Empty Enter keeps `fallback` when there is one. */
function askDistance(cl, prompt, fallback, onValue) {
    cl.ask({
        kind: 'choice', prompt: fallback ? `${prompt} <${units.formatLength(fallback)}>:` : `${prompt}:`,
        onChoice: (text) => {
            const v = text ? units.parseInput(text) : fallback;
            if (v === null || v === undefined || !(v > 0)) throw new Error("Type a distance more than zero, such as 12\" or 2'6\".");
            onValue(v);
        }
    });
}

const saved = (cl) => { cl.app.saveHistory?.(); cl.app.requestRender?.(); };
const note = (cl, r, text) => { cl.log(text + (r && r.removed ? ` ${r.removed} door/window${r.removed === 1 ? '' : 's'} that no longer fit ${r.removed === 1 ? 'was' : 'were'} removed.` : '')); };

// ------------------------------------------------------------------ measuring
def(['dist', 'di', 'distance'], (cl) => {
    cl.cancel(false);
    cl.ask({
        kind: 'point', wantsPoint: true, prompt: 'DIST - first point:',
        onPoint: (a) => cl.ask({
            kind: 'point', wantsPoint: true, base: a, prompt: 'DIST - second point:',
            onPoint: (b) => { cl.log(describeDistance(a, b)); cl.finish(); }
        })
    });
});

def(['area', 'aa'], (cl) => {
    cl.cancel(false);
    const pts = [];
    const next = () => cl.ask({
        kind: 'point', wantsPoint: true, base: pts[pts.length - 1] || null, trail: pts, closeTrail: true,
        prompt: pts.length < 3 ? `AREA - point ${pts.length + 1} of the outline (at least 3):` : `AREA - point ${pts.length + 1}, or Enter to finish (${pts.length} so far):`,
        onPoint: (p) => { pts.push(p); next(); },
        onEnter: () => {
            if (pts.length < 3) { cl.log('An area needs at least three points.', 'error'); cl.cancel(false); return; }
            cl.log(describeArea(pts, true)); cl.finish();
        }
    });
    next();
});

def(['angle', 'ang'], (cl) => {
    cl.cancel(false);
    cl.ask({
        kind: 'point', wantsPoint: true, prompt: 'ANGLE - click the corner point (the vertex):',
        onPoint: (v) => cl.ask({
            kind: 'point', wantsPoint: true, base: v, prompt: 'ANGLE - click a point on the first side:',
            onPoint: (p1) => cl.ask({
                kind: 'point', wantsPoint: true, base: v, trail: [p1, v], prompt: 'ANGLE - click a point on the second side:',
                onPoint: (p2) => {
                    const a = angleAt(v, p1, p2);
                    if (a === null) throw new Error('A side has no length - click points away from the corner.');
                    cl.log(`Angle ${fmtDeg(a)}  (the other side is ${fmtDeg(360 - a)})`); cl.finish();
                }
            })
        })
    });
});

// ------------------------------------------------------------------ zoom window / previous (called from ZOOM)
export function zoomWindow(cl) {
    cl.cancel(false);
    cl.ask({
        kind: 'point', wantsPoint: true, prompt: 'ZOOM WINDOW - first corner:',
        onPoint: (a) => cl.ask({
            kind: 'point', wantsPoint: true, base: a, prompt: 'ZOOM WINDOW - opposite corner:',
            onPoint: (b) => {
                const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
                if (w < 1 || h < 1) throw new Error('Pick two corners that are apart from each other.');
                cl.app.pushView?.();
                cl.app.canvasEngine.fitToBounds({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: w, height: h }, 20);
                cl.app.requestRender?.();
                cl.finish();
            }
        })
    });
}

// ------------------------------------------------------------------ wall editing
def(['offset', 'of'], (cl) => {
    cl.cancel(false);
    askDistance(cl, 'OFFSET - distance', cl.lastOffset, (dist) => {
        cl.lastOffset = dist;
        const loop = () => askWall(cl, `OFFSET ${units.formatLength(dist)} - click the wall to copy (Enter = done):`, (wall) => {
            cl.ask({
                kind: 'point', wantsPoint: true, base: null, prompt: 'OFFSET - click the side to put the new wall on:',
                onPoint: (side) => {
                    const made = offsetWall(cl.app, wall, dist, side);
                    saved(cl); cl.log(`Wall copied ${units.formatLength(dist)} away.`);
                    if (made) loop(); else cl.finish();
                },
                onEnter: () => loop()
            });
        });
        loop();
    });
});

def(['trim', 'tr'], (cl) => {
    cl.cancel(false);
    askWall(cl, 'TRIM - click the CUTTING wall (the wall to trim up to):', (cutter) => {
        const loop = () => askWall(cl, 'TRIM - click the part of the wall to REMOVE (Enter = done):', (wall, pt) => {
            const r = trimWall(cl.app, wall, cutter, pt);
            saved(cl); note(cl, r, 'Trimmed.'); loop();
        });
        loop();
    });
});

def(['extend', 'ex'], (cl) => {
    cl.cancel(false);
    askWall(cl, 'EXTEND - click the wall to extend UP TO (the boundary):', (boundary) => {
        const loop = () => askWall(cl, 'EXTEND - click the wall, near the end that should grow (Enter = done):', (wall, pt) => {
            const r = extendWall(cl.app, wall, boundary, pt);
            saved(cl); note(cl, r, 'Extended.'); loop();
        });
        loop();
    });
});

def(['fillet', 'fil', 'corner'], (cl) => {
    cl.cancel(false);
    askWall(cl, 'FILLET - click the first wall:', (w1) => askWall(cl, 'FILLET - click the second wall:', (w2) => {
        const r = filletWalls(cl.app, w1, w2);
        saved(cl); note(cl, r, 'Corner made.'); cl.finish();
    }));
});

def(['chamfer', 'cha'], (cl) => {
    cl.cancel(false);
    askDistance(cl, 'CHAMFER - first distance', cl.lastChamfer1, (d1) => {
        askDistance(cl, 'CHAMFER - second distance', d1, (d2) => {
            cl.lastChamfer1 = d1;
            askWall(cl, 'CHAMFER - click the first wall:', (w1) => askWall(cl, 'CHAMFER - click the second wall:', (w2) => {
                const r = chamferWalls(cl.app, w1, w2, d1, d2);
                saved(cl); note(cl, r, `Corner cut ${units.formatLength(d1)} x ${units.formatLength(d2)}.`); cl.finish();
            }));
        });
    });
});

// ------------------------------------------------------------------ floor finish
const HATCH_WORDS = { none: 'none', off: 'none', tile: 'tiles', tiles: 'tiles', square: 'tiles', diag: 'tiles_diag', diagonal: 'tiles_diag', tiles_diag: 'tiles_diag',
    wood: 'wood', planks: 'wood', plank: 'wood', concrete: 'concrete', dots: 'concrete', lines: 'lines', line: 'lines' };

def(['hatch', 'finish'], (cl, args) => {
    const word = (args[0] || '').toLowerCase();
    if (!word) { cl.log('HATCH ' + HATCH_TYPES.map(t => t.id).join(' | ') + '  [size %]   - applies to the selected rooms. Example: HATCH TILES 150'); return; }
    const type = HATCH_WORDS[word];
    if (!type) throw new Error(`Unknown finish "${args[0]}". Choose: ${HATCH_TYPES.map(t => t.id).join(', ')}.`);
    const rooms = cl.app.getSelectionItems().filter(i => i.category === 'room').map(i => i.obj);
    if (!rooms.length) throw new Error('Select one or more rooms first, then run HATCH.');
    let scale = 1;
    if (args[1] !== undefined) {
        const pct = Number(String(args[1]).replace('%', ''));
        if (!Number.isFinite(pct) || pct < 25 || pct > 400) throw new Error('The size is a percentage from 25 to 400.');
        scale = pct / 100;
    }
    for (const r of rooms) {
        if (type === 'none') { delete r.hatch; delete r.hatchScale; } else { r.hatch = type; if (args[1] !== undefined) r.hatchScale = scale; }
    }
    saved(cl);
    cl.log(type === 'none' ? `Finish removed from ${rooms.length} room${rooms.length === 1 ? '' : 's'}.` : `${HATCH_TYPES.find(t => t.id === type).name} applied to ${rooms.length} room${rooms.length === 1 ? '' : 's'}.`);
});

// ------------------------------------------------------------------ annotation
const unescapeNewlines = (t) => String(t).replace(/\\n/g, '\n');
const select = (cl, category, obj) => { cl.app.setSelection?.([{ category, obj }]); };

def(['text', 'note', 'tx'], (cl, args) => {
    cl.cancel(false);
    const inline = args.join(' ').trim();
    const make = (p, text) => {
        const t = cl.app.annotationManager.addText(p.x, p.y, { text: unescapeNewlines(text), height: cl.lastTextHeight || 9 });
        saved(cl); select(cl, 'text', t); cl.log('Text added. Drag it to move it; edit it in Properties.'); cl.finish();
    };
    cl.ask({
        kind: 'point', wantsPoint: true, prompt: inline ? `TEXT "${inline}" - click where it goes:` : 'TEXT - click where the text starts:',
        onPoint: (p) => {
            if (inline) { make(p, inline); return; }
            cl.ask({ kind: 'text', prompt: 'TEXT - type the note (\\n starts a new line):', onText: (txt) => { if (!txt.trim()) { cl.cancel(); return; } make(p, txt); } });
        }
    });
});

def(['textheight', 'th'], (cl, args) => {
    const v = args.length ? units.parseInput(args.join(' ')) : null;
    if (v === null) { cl.log(`Text height is ${units.formatLength(cl.lastTextHeight || 9)}. Type TEXTHEIGHT 6" to change it (new text and leaders use it).`); return; }
    if (!(v >= 1 && v <= 240)) throw new Error('The text height must be between 1" and 20\'.');
    cl.lastTextHeight = v; cl.log(`Text height set to ${units.formatLength(v)}.`);
});

def(['leader', 'lead', 'ld'], (cl, args) => {
    cl.cancel(false);
    const inline = args.join(' ').trim();
    cl.ask({
        kind: 'point', wantsPoint: true, prompt: 'LEADER - click the thing you are pointing at (arrow tip):',
        onPoint: (tip) => cl.ask({
            kind: 'point', wantsPoint: true, base: tip, prompt: 'LEADER - click where the note goes:',
            onPoint: (end) => {
                if (Math.hypot(end.x - tip.x, end.y - tip.y) < 1) throw new Error('Click a second point away from the arrow tip.');
                const make = (txt) => {
                    const l = cl.app.annotationManager.addLeader([tip, end], { text: unescapeNewlines(txt), height: cl.lastTextHeight || 9 });
                    saved(cl); select(cl, 'leader', l); cl.finish();
                };
                if (inline) make(inline);
                else cl.ask({ kind: 'text', prompt: 'LEADER - type the note:', onText: (txt) => { if (!txt.trim()) { cl.cancel(); return; } make(txt); } });
            }
        })
    });
});

def(['dimangular', 'dan', 'angdim', 'dimang'], (cl) => {
    cl.cancel(false);
    cl.ask({
        kind: 'point', wantsPoint: true, prompt: 'DIMANGULAR - click the corner (vertex) of the angle:',
        onPoint: (v) => cl.ask({
            kind: 'point', wantsPoint: true, base: v, prompt: 'DIMANGULAR - click a point on the first side:',
            onPoint: (p1) => cl.ask({
                kind: 'point', wantsPoint: true, base: v, trail: [p1, v], prompt: 'DIMANGULAR - click a point on the second side:',
                onPoint: (p2) => {
                    const r = Math.min(120, Math.max(24, Math.min(Math.hypot(p1.x - v.x, p1.y - v.y), Math.hypot(p2.x - v.x, p2.y - v.y)) * 0.6));
                    const d = cl.app.annotationManager.addAngularDim(v, p1, p2, { radius: r });
                    if (!d) throw new Error('Those two sides point the same way - click points that form an angle.');
                    saved(cl); select(cl, 'angdim', d); cl.log(`Angular dimension ${d.label()} added.`); cl.finish();
                }
            })
        })
    });
});

def(['dimstyle', 'dst'], (cl, args) => {
    const am = cl.app.annotationManager;
    if (!args.length) { cl.log(`Dimension styles: ${DIM_STYLE_IDS.map(id => DIM_STYLES[id].name + (id === am.currentDimStyle ? ' (current)' : '')).join(', ')}. Type DIMSTYLE <name>.`); return; }
    const id = findDimStyle(args.join(' '));
    if (!id) throw new Error(`No dimension style called "${args.join(' ')}". Choose: ${DIM_STYLE_IDS.map(i => DIM_STYLES[i].name).join(', ')}.`);
    am.currentDimStyle = id;
    const targets = cl.app.getSelectionItems().filter(i => i.category === 'dimension' || i.category === 'angdim');
    for (const t of targets) { if (id === 'standard') delete t.obj.dimStyle; else t.obj.dimStyle = id; }
    if (targets.length) saved(cl);
    cl.log(`Dimension style: ${DIM_STYLES[id].name}${targets.length ? ` (also applied to ${targets.length} selected dimension${targets.length === 1 ? '' : 's'})` : ''}.`);
});

// ------------------------------------------------------------------ blocks
def(['block', 'bl'], (cl, args) => {
    const app = cl.app;
    if ((args[0] || '').toLowerCase() === 'delete') {
        const key = app.deleteBlockByName(args.slice(1).join(' ')); cl.log(`Block "${key}" deleted.`); return;
    }
    cl.cancel(false);
    cl.needSelection();
    const save = (name) => cl.ask({
        kind: 'point', wantsPoint: true, prompt: `BLOCK "${name}" - click the base point (the spot you will place when inserting), or Enter for the centre:`,
        onPoint: (base) => done(name, base),
        onEnter: () => done(name, null)
    });
    const done = (name, base) => {
        const r = app.saveSelectionAsBlock(name, base);
        cl.log(`Block "${r.block.name}" ${r.replaced ? 'replaced' : 'saved'} (${r.block.count} objects).${r.inLibrary ? '' : ' (Could not store it in the shared library - it is saved with this project.)'} Use INSERT ${r.block.name}.`);
        cl.finish();
    };
    const name = args.join(' ').trim();
    if (name) save(name);
    else cl.ask({ kind: 'text', prompt: 'BLOCK - name for the new block:', onText: (t) => { if (!t.trim()) { cl.cancel(); return; } save(t); } });
});

def(['blocks'], (cl, args) => {
    const app = cl.app;
    const names = Object.keys(app.allBlocks());
    if (!args.length && app.openBlocksPanel) { app.openBlocksPanel(); }
    cl.log(names.length ? `Blocks: ${names.join(', ')}.` : 'There are no blocks yet. Select objects and type BLOCK <name>.');
});

def(['insert', 'ins', 'i'], (cl, args) => {
    const app = cl.app;
    const name = args.join(' ').trim();
    if (!name) { const names = Object.keys(app.allBlocks()); cl.log(names.length ? `INSERT <name>. Blocks: ${names.join(', ')}.` : 'There are no blocks yet. Select objects and type BLOCK <name>.'); if (app.openBlocksPanel) app.openBlocksPanel(); return; }
    const block = app.findBlock(name);
    if (!block) throw new Error(`There is no block called "${name}". Type BLOCKS to see the list.`);
    cl.cancel(false);
    cl.ask({
        kind: 'choice', prompt: `INSERT "${block.name}" - rotation angle in degrees, counter-clockwise <0>:`,
        onChoice: (text) => {
            const deg = text ? parseAngle(text) : 0;
            if (deg === null) throw new Error('Type an angle in degrees, for example 90, or press Enter for 0.');
            const place = () => cl.ask({
                kind: 'point', wantsPoint: true, prompt: `INSERT "${block.name}" - click where it goes (Enter = done):`,
                onPoint: (pt) => { app.insertBlockByName(block.name, pt, -deg); cl.log(`"${block.name}" inserted.`); place(); },
                onEnter: () => cl.finish()
            });
            place();
        }
    });
});

// ------------------------------------------------------------------ DXF import / reference lines
def(['importdxf', 'dxfin', 'impdxf'], (cl) => { cl.app.openDxfImportPicker(); cl.log('Choose a DXF file to import.'); });

def(['reference', 'ref'], (cl, args) => {
    const a = (args[0] || '').toLowerCase();
    if (!['hide', 'show', 'remove'].includes(a)) throw new Error('REFERENCE HIDE | SHOW | REMOVE  (the lines imported from a DXF). Use IMPORTDXF to import.');
    cl.app.setReferenceFlag(a);
    cl.log(a === 'remove' ? 'Reference lines removed.' : a === 'hide' ? 'Reference lines hidden.' : 'Reference lines shown.');
});

// ------------------------------------------------------------------ print at scale
def(['sheet', 'printscale', 'layout'], (cl) => { cl.app.openSheetPanel(); cl.log('Print at scale: choose paper and scale, then download the PDF.'); });
