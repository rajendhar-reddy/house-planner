/**
 * dxf_import.js - read a 2D ASCII DXF file (pure functions, no DOM).
 *
 * Supported: LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC, TEXT, MTEXT.
 * Not supported (counted and reported): SPLINE, ELLIPSE, HATCH, DIMENSION, INSERT (blocks), 3D entities, bulges
 * in polylines (their arcs are drawn as straight chords).
 * Binary DXF and DWG are refused with a message that says how to get an ASCII DXF.
 */

export const LIMITS = { maxEntities: 400000, maxSegments: 60000, maxTexts: 2000, maxBytes: 40 * 1024 * 1024 };

/** Inches per drawing unit for the DXF $INSUNITS codes we understand. */
export const INSUNITS = { 1: 1, 2: 12, 3: 63360, 4: 1 / 25.4, 5: 1 / 2.54, 6: 39.37007874015748, 7: 39370.07874015748, 8: 1 / 25400, 9: 0.001, 10: 36, 14: 3.937007874015748 };

/** Split into [code, value] pairs. Tolerates CRLF, stray blank lines at the end and odd line counts. */
function pairs(text) {
    const lines = text.split(/\r\n|\n|\r/);
    const out = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
        const code = parseInt(lines[i].trim(), 10);
        if (!Number.isInteger(code)) { if (lines[i].trim() === '') { i--; continue; } throw new Error(`This does not look like an ASCII DXF file (line ${i + 1} is not a group code).`); }
        out.push([code, lines[i + 1].trim()]);
    }
    return out;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

/** Plain text of an MTEXT value: \P = new line, formatting codes and braces removed, \U+XXXX decoded. */
export function mtextToPlain(s) {
    return String(s)
        .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\P/gi, '\n').replace(/\\~/g, ' ')
        .replace(/\\[ACFHQTWfhqtwcl][^;]*;/g, '').replace(/\\[LlOoKk]/g, '').replace(/\\\\/g, '\\').replace(/[{}]/g, '')
        .replace(/%%[dD]/g, '\u00b0').replace(/%%[pP]/g, '\u00b1').replace(/%%[cC]/g, '\u00d8');
}
const plainText = (s) => mtextToPlain(s);

/** Parse an ASCII DXF string. Returns { entities, insunits, extents, skipped, warnings }. Throws a readable Error. */
export function parseDXF(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('The file is empty.');
    if (text.length > LIMITS.maxBytes) throw new Error('This DXF is larger than 40 MB. Simplify it in your CAD program first.');
    if (/^AutoCAD Binary DXF/.test(text)) throw new Error('This is a binary DXF. In your CAD program use "Save As" and choose an ASCII DXF (for example "AutoCAD 2000/LT2000 DXF").');
    if (/^AC10\d\d/.test(text)) throw new Error('This is a DWG file, which cannot be read here. In your CAD program export it as DXF (ASCII) and open that.');
    const P = pairs(text);
    const warnings = [], skipped = {};
    let insunits = null;
    const entities = [];

    // ---- HEADER: only $INSUNITS matters
    for (let i = 0; i < P.length - 1; i++) if (P[i][0] === 9 && P[i][1] === '$INSUNITS' && P[i + 1][0] === 70) { insunits = parseInt(P[i + 1][1], 10); break; }

    // ---- find the ENTITIES section
    let start = -1;
    for (let i = 0; i < P.length - 1; i++) if (P[i][0] === 0 && P[i][1] === 'SECTION' && P[i + 1][0] === 2 && P[i + 1][1] === 'ENTITIES') { start = i + 2; break; }
    if (start < 0) throw new Error('No ENTITIES section was found - this does not look like a drawing DXF.');

    // ---- split into records (an entity starts at each group 0)
    const records = [];
    let cur = null;
    for (let i = start; i < P.length; i++) {
        const [c, v] = P[i];
        if (c === 0) {
            if (v === 'ENDSEC') break;
            cur = { type: v, g: [] }; records.push(cur);
            if (records.length > LIMITS.maxEntities) throw new Error('This drawing has too many objects to import (limit 400,000).');
        } else if (cur) cur.g.push([c, v]);
    }

    const first = (r, code) => { const f = r.g.find(x => x[0] === code); return f ? f[1] : undefined; };
    const all = (r, code) => r.g.filter(x => x[0] === code).map(x => x[1]);
    const layerOf = (r) => first(r, 8) || '0';
    let bulgeWarned = false;

    for (let k = 0; k < records.length; k++) {
        const r = records[k];
        switch (r.type) {
            case 'LINE': {
                const e = { type: 'LINE', layer: layerOf(r), x1: num(first(r, 10)), y1: num(first(r, 20)), x2: num(first(r, 11)), y2: num(first(r, 21)) };
                if ([e.x1, e.y1, e.x2, e.y2].every(Number.isFinite)) entities.push(e); else warnings.push('A LINE with missing coordinates was skipped.');
                break;
            }
            case 'LWPOLYLINE': {
                const pts = []; let curPt = null;
                for (const [c, v] of r.g) { if (c === 10) { curPt = { x: num(v), y: NaN }; pts.push(curPt); } else if (c === 20 && curPt) curPt.y = num(v); else if (c === 42 && Number(v) !== 0 && !bulgeWarned) { bulgeWarned = true; warnings.push('Curved (bulge) polyline segments are drawn as straight lines.'); } }
                const good = pts.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
                if (good.length >= 2) entities.push({ type: 'POLY', layer: layerOf(r), pts: good, closed: (parseInt(first(r, 70) || '0', 10) & 1) === 1 });
                break;
            }
            case 'POLYLINE': {
                const pts = [];
                let j = k + 1;
                for (; j < records.length && records[j].type !== 'SEQEND'; j++) {
                    if (records[j].type !== 'VERTEX') break;
                    const x = num(first(records[j], 10)), y = num(first(records[j], 20));
                    if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
                    if (Number(first(records[j], 42) || 0) !== 0 && !bulgeWarned) { bulgeWarned = true; warnings.push('Curved (bulge) polyline segments are drawn as straight lines.'); }
                }
                k = j;                                                       // skip the VERTEX records and the SEQEND
                if (pts.length >= 2) entities.push({ type: 'POLY', layer: layerOf(r), pts, closed: (parseInt(first(r, 70) || '0', 10) & 1) === 1 });
                break;
            }
            case 'CIRCLE': case 'ARC': {
                const cx = num(first(r, 10)), cy = num(first(r, 20)), rad = num(first(r, 40));
                if (![cx, cy, rad].every(Number.isFinite) || rad <= 0) { warnings.push(`A ${r.type} with a bad centre or radius was skipped.`); break; }
                entities.push({ type: r.type, layer: layerOf(r), cx, cy, r: rad, a1: r.type === 'ARC' ? num(first(r, 50)) : 0, a2: r.type === 'ARC' ? num(first(r, 51)) : 360 });
                break;
            }
            case 'TEXT': case 'MTEXT': {
                const x = num(first(r, 10)), y = num(first(r, 20));
                const body = r.type === 'MTEXT' ? all(r, 3).join('') + (first(r, 1) || '') : (first(r, 1) || '');
                const txt = plainText(body).trim();
                if (Number.isFinite(x) && Number.isFinite(y) && txt) entities.push({ type: 'TEXT', layer: layerOf(r), x, y, height: num(first(r, 40)) || 0, rotation: num(first(r, 50)) || 0, text: txt });
                break;
            }
            case 'VERTEX': case 'SEQEND': case 'ATTRIB': case 'ATTDEF': break;
            default: skipped[r.type] = (skipped[r.type] || 0) + 1;
        }
    }
    for (const [t, n] of Object.entries(skipped)) warnings.push(`${n} ${t} object${n === 1 ? '' : 's'} could not be imported${t === 'INSERT' ? ' (blocks are not expanded)' : ''}.`);
    if (!entities.length) throw new Error('No lines, polylines, circles, arcs or text were found in this DXF.');
    return { entities, insunits, skipped, warnings, extents: extentsOf(entities) };
}

function extentsOf(entities) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const eat = (x, y) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
    for (const e of entities) {
        if (e.type === 'LINE') { eat(e.x1, e.y1); eat(e.x2, e.y2); }
        else if (e.type === 'POLY') e.pts.forEach(p => eat(p.x, p.y));
        else if (e.type === 'CIRCLE' || e.type === 'ARC') { eat(e.cx - e.r, e.cy - e.r); eat(e.cx + e.r, e.cy + e.r); }
        else if (e.type === 'TEXT') eat(e.x, e.y);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Best guess of inches-per-unit: from $INSUNITS, else mm for very large drawings, else null (ask the user). */
export function guessUnitScale(parsed) {
    if (parsed.insunits && INSUNITS[parsed.insunits]) return { scale: INSUNITS[parsed.insunits], from: 'file' };
    const big = Math.max(parsed.extents.width, parsed.extents.height);
    if (big >= 5000) return { scale: 1 / 25.4, from: 'guess-mm' };
    return { scale: null, from: 'unknown' };
}

/** Straight chords for an arc / circle (angles in degrees, counter-clockwise, Y up). */
export function arcToPoints(cx, cy, r, a1, a2) {
    let sweep = a2 - a1; while (sweep <= 0) sweep += 360;
    if (Math.abs(a2 - a1 - 360) < 1e-9) sweep = 360;
    const steps = Math.max(4, Math.min(180, Math.ceil(sweep / 7.5)));
    const pts = [];
    for (let i = 0; i <= steps; i++) { const a = (a1 + sweep * i / steps) * Math.PI / 180; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
    return pts;
}

/**
 * Turn a parsed DXF into app geometry.
 * options: { scale (inches per unit, required), mode: 'reference' | 'walls', wallThickness (inches), recenter: true }
 * Returns { segments: [[x1,y1,x2,y2]...], walls: [[x1,y1,x2,y2]...], texts: [{x,y,text,height,rotation}], width, height, warnings }.
 * Y is flipped (DXF Y points up, the app's points down). With recenter the drawing's top-left corner is placed at (0, 0).
 */
export function convertDXF(parsed, options) {
    const k = options.scale;
    if (!(k > 0)) throw new Error('Choose the units the drawing was made in.');
    const warnings = [...parsed.warnings];

    // 1. everything as plain line segments in DXF units (circles / arcs become chords)
    const raw = [];
    const add = (x1, y1, x2, y2) => { if (raw.length < LIMITS.maxSegments) raw.push([x1, y1, x2, y2]); };
    for (const e of parsed.entities) {
        if (e.type === 'LINE') add(e.x1, e.y1, e.x2, e.y2);
        else if (e.type === 'POLY') { for (let i = 1; i < e.pts.length; i++) add(e.pts[i - 1].x, e.pts[i - 1].y, e.pts[i].x, e.pts[i].y); if (e.closed && e.pts.length > 2) add(e.pts[e.pts.length - 1].x, e.pts[e.pts.length - 1].y, e.pts[0].x, e.pts[0].y); }
        else if (e.type === 'CIRCLE' || e.type === 'ARC') { const p = arcToPoints(e.cx, e.cy, e.r, e.a1, e.a2); for (let i = 1; i < p.length; i++) add(p[i - 1].x, p[i - 1].y, p[i].x, p[i].y); }
    }
    if (raw.length >= LIMITS.maxSegments) warnings.push(`Only the first ${LIMITS.maxSegments.toLocaleString('en-US')} line segments were imported.`);
    const textsIn = parsed.entities.filter(e => e.type === 'TEXT').slice(0, LIMITS.maxTexts);

    // 2. the real extents of what will be imported (not the conservative box used to guess units)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const eat = (x, y) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
    for (const s of raw) { eat(s[0], s[1]); eat(s[2], s[3]); }
    for (const t of textsIn) eat(t.x, t.y);
    const ox = options.recenter === false ? 0 : minX, oy = options.recenter === false ? 0 : maxY;
    const X = (x) => Math.round((x - ox) * k * 100) / 100, Y = (y) => Math.round(-(y - oy) * k * 100) / 100 + 0;

    // 3. scale, flip Y, drop zero-length and duplicate segments (CAD files are full of them)
    const seen = new Set(), clean = [];
    for (const r of raw) {
        const s = [X(r[0]), Y(r[1]), X(r[2]), Y(r[3])];
        if (Math.hypot(s[2] - s[0], s[3] - s[1]) < 0.05) continue;
        const key = s[0] < s[2] || (s[0] === s[2] && s[1] <= s[3]) ? s.join(',') : [s[2], s[3], s[0], s[1]].join(',');
        if (seen.has(key)) continue; seen.add(key); clean.push(s);
    }
    const texts = textsIn.map(e => ({ x: X(e.x), y: Y(e.y), text: e.text, height: Math.min(60, Math.max(3, (e.height || 0) * k || 9)), rotation: ((-e.rotation % 360) + 360) % 360 }));
    return { segments: options.mode === 'walls' ? [] : clean, walls: options.mode === 'walls' ? clean : [], texts, width: Number.isFinite(minX) ? (maxX - minX) * k : 0, height: Number.isFinite(minY) ? (maxY - minY) * k : 0, warnings };
}

/** Check a reference-geometry record from a project file; returns a safe copy or null. */
export function sanitizeReference(ref) {
    if (!ref || typeof ref !== 'object' || !Array.isArray(ref.segments)) return null;
    const segs = [];
    for (const s of ref.segments) {
        if (segs.length >= LIMITS.maxSegments) break;
        if (Array.isArray(s) && s.length === 4 && s.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e7)) segs.push(s);
    }
    if (!segs.length) return null;
    return { name: typeof ref.name === 'string' ? ref.name.slice(0, 80) : 'Imported DXF', visible: ref.visible !== false, segments: segs };
}
