/**
 * dxf.js - AutoCAD DXF (R12 / AC1009, ASCII) writer.
 *
 * Pure function: buildDXF(projectState) -> string. No DOM, so it can be unit-tested.
 * Drawing units are INCHES (the app's internal unit). The app's Y axis points down,
 * CAD's points up, so every Y is negated and every text rotation is mirrored.
 */

import { units } from './units.js';
import { hatchSegments } from './hatch.js';
import { arcPoints } from './annotations.js';

/** [layer name, AutoCAD colour index]. Every layer used below must be listed here. */
export const DXF_LAYERS = [
    ['ROADS', 8], ['PLOT', 3], ['SLAB_PROJECTION', 5], ['COLUMNS', 1], ['STAIRS', 6],
    ['WALLS_EXTERIOR', 7], ['WALLS_INTERIOR', 9], ['WALLS_COMPOUND', 8], ['WALLS_CENTERLINE', 8],
    ['DOORS', 2], ['WINDOWS', 4], ['GATES', 30], ['LANDSCAPE', 82], ['FURNITURE', 252],
    ['ROOMS', 11], ['DIMENSIONS', 3], ['HATCH', 8], ['ANNOTATION', 2], ['REFERENCE', 8]
];

const LANDSCAPE_TYPES = ['tree_deciduous', 'tree_palm', 'shrub_bush', 'planter_box', 'lawn_patch',
    'driveway_pavers', 'car_suv', 'motorcycle'];

/** Round to 4 decimals and avoid "-0" / float noise such as 143.99999999999997. */
const num = (v) => String(Math.round(v * 1e4) / 1e4 + 0);

/**
 * Make a string safe for a DXF TEXT value: single line, ASCII only (non-ASCII becomes the
 * \U+XXXX escape AutoCAD understands), and "%%" (AutoCAD control codes) neutralised.
 */
export function dxfText(value) {
    let s = String(value === null || value === undefined ? '' : value);
    s = s.replace(/[\r\n\t]+/g, ' ').replace(/%%/g, '% %');
    let out = '';
    for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp < 32 || cp === 127) continue;
        if (cp > 126) {
            if (cp > 0xFFFF) {
                // astral characters: encode as a UTF-16 surrogate pair
                const hi = Math.floor((cp - 0x10000) / 0x400) + 0xD800, lo = ((cp - 0x10000) % 0x400) + 0xDC00;
                out += `\\U+${hi.toString(16).toUpperCase().padStart(4, '0')}\\U+${lo.toString(16).toUpperCase().padStart(4, '0')}`;
            } else {
                out += `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
            }
        } else {
            out += ch;
        }
    }
    return out;
}

function shownIn(ps, list, category) {
    return ps.layerManager ? list.filter(e => ps.layerManager.isVisible(e, category)) : list;
}

/** Nearest AutoCAD colour index (1-7) for a #rrggbb colour. */
export function hexToAci(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return 7;
    const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
    const ACI = { 1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255], 5: [0, 0, 255], 6: [255, 0, 255], 7: [255, 255, 255] };
    let best = 7, bd = Infinity;
    for (const [k, [R, G, B]] of Object.entries(ACI)) { const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (d < bd) { bd = d; best = Number(k); } }
    return best;
}

/** A user layer name made safe for DXF (upper-case letters, digits, _ - $; at most 31 characters). */
export function dxfLayerName(name) {
    const clean = String(name || '').toUpperCase().replace(/[^A-Z0-9_$-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31);
    return clean || 'LAYER';
}

export function buildDXF(projectState) {
    // Built-in DXF layers + one per user-created layer (so CAD shows the layer names and colours you set)
    const lm = projectState.layerManager || null;
    const layerTable = DXF_LAYERS.map(l => [...l]);
    const customDxf = new Map();                                   // app layer id -> dxf layer name
    if (lm) {
        for (const l of lm.layers) {
            if (l.builtin) continue;
            let name = dxfLayerName(l.name), n = 2;
            while (layerTable.some(t => t[0] === name)) name = dxfLayerName(l.name).slice(0, 28) + '_' + n++;
            customDxf.set(l.id, name);
            layerTable.push([name, hexToAci(l.color)]);
        }
    }
    /** DXF layer for an object: its user layer when it is on one, otherwise the built-in DXF layer. */
    const dl = (obj, category, fallback) => {
        if (!lm) return fallback;
        return customDxf.get(lm.layerIdOf(obj, category)) || fallback;
    };
    const layerNames = new Set(layerTable.map(l => l[0]));
    let ents = '';

    const line = (layer, p1, p2) => {
        if (!layerNames.has(layer)) throw new Error(`DXF layer "${layer}" is not declared`);
        ents += `0\nLINE\n8\n${layer}\n10\n${num(p1.x)}\n20\n${num(-p1.y)}\n30\n0.0\n11\n${num(p2.x)}\n21\n${num(-p2.y)}\n31\n0.0\n`;
    };
    const loop = (layer, pts) => {
        for (let i = 0; i < pts.length; i++) line(layer, pts[i], pts[(i + 1) % pts.length]);
    };
    /** Centred TEXT. `rotation` is the on-screen angle in degrees (clockwise-positive, y-down). */
    const text = (layer, x, y, height, str, rotation = 0) => {
        if (!layerNames.has(layer)) throw new Error(`DXF layer "${layer}" is not declared`);
        const s = dxfText(str);
        if (!s.trim()) return;
        const cx = num(x), cy = num(-y);
        const rot = num(((-rotation % 360) + 360) % 360);
        ents += `0\nTEXT\n8\n${layer}\n10\n${cx}\n20\n${cy}\n30\n0.0\n40\n${num(height)}\n1\n${s}\n50\n${rot}\n72\n1\n73\n2\n11\n${cx}\n21\n${cy}\n31\n0.0\n`;
    };
    /** Left- or centre-aligned TEXT with its baseline at (x, y); several lines are stacked downwards. */
    const textAt = (layer, x, y, height, str, rotation = 0, align = 'left') => {
        if (!layerNames.has(layer)) throw new Error(`DXF layer "${layer}" is not declared`);
        const r = (rotation * Math.PI) / 180, rot = num(((-rotation % 360) + 360) % 360);
        String(str === null || str === undefined ? '' : str).split('\n').forEach((ln, i) => {
            const s = dxfText(ln);
            if (!s.trim()) return;
            const ox = x - Math.sin(r) * height * 1.2 * i, oy = y + Math.cos(r) * height * 1.2 * i;      // "down" the text's own axis
            const px = num(ox), py = num(-oy);
            ents += `0\nTEXT\n8\n${layer}\n10\n${px}\n20\n${py}\n30\n0.0\n40\n${num(height)}\n1\n${s}\n50\n${rot}\n`;
            ents += align === 'center' ? `72\n1\n11\n${px}\n21\n${py}\n31\n0.0\n` : '';
        });
    };
    /** Rectangle (w x h, centred on cx,cy, rotated by rotDeg) as 4 points. */
    const rectPts = (cx, cy, w, h, rotDeg) => {
        const r = (rotDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
        return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
            .map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
    };
    const boxPts = (b) => [
        { x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
        { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }
    ];

    const ps = projectState;

    // Roads
    if (ps.roadManager && ps.plotManager && ps.plotManager.plot) {
        const pb = ps.plotManager.getBounds();
        if (pb) {
            for (const r of ps.roadManager.roads) {
                const g = r.getGeometry(pb);
                if (g && g.bounds) loop('ROADS', boxPts(g.bounds));
            }
        }
    }

    // Plot boundary
    if (ps.plotManager && ps.plotManager.plot) loop('PLOT', ps.plotManager.plot.vertices);

    // Walls: both faces + end caps (real thickness), plus the centreline on its own layer
    if (ps.wallManager) {
        const joins = ps.wallManager.getJoinedPolygons ? ps.wallManager.getJoinedPolygons(shownIn(ps, ps.wallManager.walls, 'wall')) : null;
        for (const wall of shownIn(ps, ps.wallManager.walls, 'wall')) {
            const layer = dl(wall, 'wall', wall.type === 'exterior' ? 'WALLS_EXTERIOR' : (wall.type === 'compound' ? 'WALLS_COMPOUND' : 'WALLS_INTERIOR'));
            const joined = joins ? joins.get(wall.id) : null;
            if (joined) {
                // Mitred corners: draw the two faces and any free end only, so joints have no seam line
                const q = joined.pts;
                line(layer, q[0], q[1]);
                line(layer, q[3], q[2]);
                if (!joined.startJoined) line(layer, q[0], q[3]);
                if (!joined.endJoined) line(layer, q[1], q[2]);
            } else {
                const poly = wall.getPolygon();
                if (poly.length === 4) loop(layer, poly);
            }
            line('WALLS_CENTERLINE', wall.start, wall.end);
        }
    }

    // Doors / windows / gates: a box through the wall, oriented along the wall, with the opening's axis
    if (ps.openingManager && ps.wallManager) {
        for (const op of shownIn(ps, ps.openingManager.openings, 'opening')) {
            const wall = ps.wallManager.getWallById(op.wallId);
            if (!wall) continue;
            const geom = op.getGeometry(wall);
            if (!geom) continue;
            const layer = dl(op, 'opening', op.type === 'gate' ? 'GATES' : (op.type === 'door' ? 'DOORS' : 'WINDOWS'));
            const deg = (geom.angle * 180) / Math.PI;
            loop(layer, rectPts(geom.center.x, geom.center.y, op.width, wall.thickness, deg));
            const ux = Math.cos(geom.angle) * op.width / 2, uy = Math.sin(geom.angle) * op.width / 2;
            line(layer, { x: geom.center.x - ux, y: geom.center.y - uy }, { x: geom.center.x + ux, y: geom.center.y + uy });
        }
    }

    // Columns (+ optional label)
    if (ps.columnManager) {
        for (const col of shownIn(ps, ps.columnManager.columns, 'column')) {
            const pts = col.getPolygon();
            const cl = dl(col, 'column', 'COLUMNS');
            loop(cl, pts);
            line(cl, pts[0], pts[2]);
            line(cl, pts[1], pts[3]);
            if (col.showLabel && col.name) text(cl, col.x, col.y + col.depth / 2 + 5, 4, col.name, 0);
        }
    }

    // Stairs (bounding outline)
    if (ps.stairManager) {
        for (const s of shownIn(ps, ps.stairManager.stairs, 'stair')) {
            const sl = dl(s, 'stair', 'STAIRS');
            loop(sl, boxPts(s.getBounds()));
            text(sl, s.x, s.y, 5, `STAIRS (${s.getCountLabel()})`, 0);
        }
    }

    // Furniture & landscape: the real (rotated) rectangle
    if (ps.furnitureManager && ps.furnitureManager.items) {
        for (const item of shownIn(ps, ps.furnitureManager.items, 'furniture')) {
            const layer = dl(item, 'furniture', LANDSCAPE_TYPES.includes(item.type) ? 'LANDSCAPE' : 'FURNITURE');
            loop(layer, rectPts(item.x, item.y, item.width || 24, item.height || 24, item.rotation || 0));
        }
    }

    // Rooms: outline + name / dimensions / area (respecting the room's own show flags)
    if (ps.roomManager && ps.roomManager.rooms) {
        for (const r of shownIn(ps, ps.roomManager.rooms, 'room')) {
            const b = r.getBounds();
            const rl = dl(r, 'room', 'ROOMS');
            loop(rl, (r.polygon && r.polygon.length >= 3) ? r.polygon : boxPts(b));
            // floor finish pattern as plain lines (rectangular rooms; a polygon room's pattern is not exported)
            if (r.hatch && r.hatch !== 'none' && !r.isVoid && !(r.polygon && r.polygon.length >= 3)) {
                for (const sg of hatchSegments(r.hatch, b, r.hatchScale || 1)) line('HATCH', { x: sg.x1, y: sg.y1 }, { x: sg.x2, y: sg.y2 });
            }
            const title = Math.max(3, Math.min(8, Math.min(b.width, b.height) * 0.07));
            const sub = title * 0.7;
            const rows = [{ str: (r.name || 'Room').toUpperCase(), h: title }];
            if (r.showDimensions !== false) rows.push({ str: `${units.formatLength(b.width)} x ${units.formatLength(b.height)}`, h: sub });
            if (r.showArea !== false) rows.push({ str: units.formatArea(r.getArea()).primary, h: sub });
            const gap = title * 1.5;
            const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
            const rot = ((r.rotation || 0) * Math.PI) / 180;
            rows.forEach((row, i) => {
                const off = (i - (rows.length - 1) / 2) * gap;       // stack along the label's own "down" axis
                text(rl, cx - Math.sin(rot) * off, cy + Math.cos(rot) * off, row.h, row.str, r.rotation || 0);
            });
        }
    }

    // Dimensions: dimension line, extension lines and the measured text
    if (ps.dimensionManager) {
        for (const dim of shownIn(ps, ps.dimensionManager.dimensions, 'dimension')) {
            const g = dim.getGeometry();
            if (!g) continue;
            const dmL = dl(dim, 'dimension', 'DIMENSIONS');
            line(dmL, g.p1, g.p2);
            line(dmL, dim.start, g.p1);
            line(dmL, dim.end, g.p2);
            let deg = (g.angle * 180) / Math.PI;
            if (deg > 90) deg -= 180; else if (deg <= -90) deg += 180;        // keep the text readable
            const sgn = dim.offset < 0 ? -1 : 1;                                    // keep the text on the outer side
            const mx = (g.p1.x + g.p2.x) / 2 + g.nx * 4 * sgn, my = (g.p1.y + g.p2.y) / 2 + g.ny * 4 * sgn;
            text(dmL, mx, my, 4, dim.customText || units.formatLength(g.len), deg);
        }
    }

    // Annotation: text notes, leaders and angular dimensions
    if (ps.annotationManager) {
        const am = ps.annotationManager;
        for (const t of shownIn(ps, am.texts, 'text')) textAt(dl(t, 'text', 'ANNOTATION'), t.x, t.y, t.height, t.text, t.rotation || 0, t.align);
        for (const l of shownIn(ps, am.leaders, 'leader')) {
            const lay = dl(l, 'leader', 'ANNOTATION'), o = l.textOrigin(), last = l.points[l.points.length - 1];
            for (let i = 1; i < l.points.length; i++) line(lay, l.points[i - 1], l.points[i]);
            line(lay, last, { x: last.x + l.side() * o.landing, y: last.y });
            const dx = l.points[1].x - l.points[0].x, dy = l.points[1].y - l.points[0].y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, al = Math.max(5, l.height * 0.9), aw = al * 0.3;
            line(lay, l.points[0], { x: l.points[0].x + ux * al - uy * aw, y: l.points[0].y + uy * al + ux * aw });
            line(lay, l.points[0], { x: l.points[0].x + ux * al + uy * aw, y: l.points[0].y + uy * al - ux * aw });
            textAt(lay, o.x, o.y, l.height, l.text, 0, 'left');
        }
        for (const d of shownIn(ps, am.angdims, 'angdim')) {
            const lay = dl(d, 'angdim', 'ANNOTATION'), pts = arcPoints(d);
            for (let i = 1; i < pts.length; i++) line(lay, pts[i - 1], pts[i]);
            if (pts.length) {
                line(lay, d.vertex, pts[0]); line(lay, d.vertex, pts[pts.length - 1]);
                const m = pts[Math.floor(pts.length / 2)];
                textAt(lay, m.x, m.y, 5, d.label(), 0, 'center');
            }
        }
    }

    // Imported reference lines
    if (ps.refGeometry && ps.refGeometry.visible) for (const s of ps.refGeometry.segments) line('REFERENCE', { x: s[0], y: s[1] }, { x: s[2], y: s[3] });

    // Roof slab projection
    const slab = ps.slabManager;
    if (slab && slab.enabled) {
        const poly = slab.getSlabPolygon(ps.wallManager, ps.plotManager);
        if (poly && poly.length >= 3) loop('SLAB_PROJECTION', poly);
    }

    // ---- assemble the file
    let dxf = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n';
    dxf += '0\nSECTION\n2\nTABLES\n';
    dxf += '0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n0\nENDTAB\n';
    dxf += `0\nTABLE\n2\nLAYER\n70\n${layerTable.length}\n`;
    for (const [name, color] of layerTable) dxf += `0\nLAYER\n2\n${name}\n70\n0\n62\n${color}\n6\nCONTINUOUS\n`;
    dxf += '0\nENDTAB\n0\nENDSEC\n';
    dxf += '0\nSECTION\n2\nENTITIES\n' + ents + '0\nENDSEC\n0\nEOF\n';
    return dxf;
}
