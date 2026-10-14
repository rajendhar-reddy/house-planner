/**
 * annotations.js - text notes, leaders and angular dimensions.
 *
 * All sizes are in world inches (like walls), so annotation scales with the drawing and prints at the right size
 * on a scaled sheet. Angles follow the screen: 0 = east, positive = clockwise on screen (the drawing's Y points down).
 */

import { nextId } from './ids.js';
import { visibleIn, selectableIn, stampLayer } from './layers.js';
import { units } from './units.js';
import { dimStyleOf, drawDimEnd } from './dimstyles.js';

const norm360 = (v) => ((v % 360) + 360) % 360;
const rad = (d) => d * Math.PI / 180;
const COLORS = (isClean, isExport, selected) => ({
    ink: selected ? '#38bdf8' : (isClean ? '#0f172a' : '#e2e8f0'),
    line: selected ? '#38bdf8' : (isClean ? '#334155' : '#94a3b8'),
    paper: isClean ? '#ffffff' : '#0f172a'
});

/** Rough text size in world inches (used for selection boxes before a canvas is available). */
export function textExtent(text, height) {
    const lines = String(text || '').split('\n');
    const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
    return { width: Math.max(1, longest) * height * 0.58, height: height * 1.2 * lines.length };
}

function rotatedBox(x, y, w, h, angleDeg, ascent) {
    // box from (0, -ascent) to (w, h - ascent) in local space, rotated about (x, y)
    const c = Math.cos(rad(angleDeg)), s = Math.sin(rad(angleDeg));
    const pts = [[0, -ascent], [w, -ascent], [w, h - ascent], [0, h - ascent]].map(([lx, ly]) => ({ x: x + lx * c - ly * s, y: y + lx * s + ly * c }));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), pts };
}

function distToSegment(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// ------------------------------------------------------------------ text note
export class TextNote {
    constructor(x, y, options = {}) {
        this.id = nextId('text');
        this.x = x; this.y = y;
        this.text = options.text !== undefined ? String(options.text) : 'Text';
        this.height = options.height > 0 ? options.height : 9;
        this.rotation = options.rotation || 0;
        this.align = options.align === 'center' ? 'center' : 'left';
    }
    getBounds() {
        const e = textExtent(this.text, this.height);
        const left = this.align === 'center' ? -e.width / 2 : 0;
        const b = rotatedBox(this.x, this.y, e.width, e.height, this.rotation, this.height);
        if (left) { const c = rotatedBox(this.x + Math.cos(rad(this.rotation)) * left, this.y + Math.sin(rad(this.rotation)) * left, e.width, e.height, this.rotation, this.height); return c; }
        return b;
    }
    hitTest(px, py, scale = 1) {
        const pad = 4 / scale, b = this.getBounds();
        return px >= b.x - pad && px <= b.x + b.width + pad && py >= b.y - pad && py <= b.y + b.height + pad;
    }
}

// ------------------------------------------------------------------ leader
export class Leader {
    /** points[0] = arrow tip, last point = where the note sits. */
    constructor(points, options = {}) {
        this.id = nextId('lead');
        this.points = points.map(p => ({ x: p.x, y: p.y }));
        this.text = options.text !== undefined ? String(options.text) : 'Note';
        this.height = options.height > 0 ? options.height : 9;
    }
    /** Which side the note sits on: +1 right of the last point, -1 left. */
    side() {
        const n = this.points.length;
        if (n < 2) return 1;
        return this.points[n - 1].x >= this.points[n - 2].x ? 1 : -1;
    }
    textOrigin() {
        const last = this.points[this.points.length - 1], e = textExtent(this.text, this.height);
        const landing = this.height * 1.2;
        return { x: this.side() > 0 ? last.x + landing + this.height * 0.3 : last.x - landing - this.height * 0.3 - e.width, y: last.y + this.height * 0.35, landing };
    }
    getBounds() {
        const o = this.textOrigin(), e = textExtent(this.text, this.height);
        const xs = [...this.points.map(p => p.x), o.x, o.x + e.width], ys = [...this.points.map(p => p.y), o.y - this.height, o.y + e.height - this.height];
        return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }
    hitTest(px, py, scale = 1) {
        const tol = 6 / scale;
        for (let i = 1; i < this.points.length; i++) if (distToSegment(px, py, this.points[i - 1], this.points[i]) <= tol) return true;
        const o = this.textOrigin(), e = textExtent(this.text, this.height);
        return px >= o.x - tol && px <= o.x + e.width + tol && py >= o.y - this.height - tol && py <= o.y + e.height - this.height + tol;
    }
}

// ------------------------------------------------------------------ angular dimension
/** Geometry of an angular dimension, or null when the two rays point the same way / have no length. */
export function angularGeometry(d) {
    const a1 = Math.atan2(d.p1.y - d.vertex.y, d.p1.x - d.vertex.x), a2 = Math.atan2(d.p2.y - d.vertex.y, d.p2.x - d.vertex.x);
    if (Math.hypot(d.p1.x - d.vertex.x, d.p1.y - d.vertex.y) < 1e-6 || Math.hypot(d.p2.x - d.vertex.x, d.p2.y - d.vertex.y) < 1e-6) return null;
    let delta = a2 - a1;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    if (Math.abs(delta) < 1e-6) return null;
    const mid = a1 + delta / 2, r = d.radius > 0 ? d.radius : 48;
    return { a1, delta, deg: Math.abs(delta) * 180 / Math.PI, mid, r, textPos: { x: d.vertex.x + Math.cos(mid) * r, y: d.vertex.y + Math.sin(mid) * r } };
}

export class AngularDim {
    constructor(vertex, p1, p2, options = {}) {
        this.id = nextId('angd');
        this.vertex = { x: vertex.x, y: vertex.y };
        this.p1 = { x: p1.x, y: p1.y };
        this.p2 = { x: p2.x, y: p2.y };
        this.radius = options.radius > 0 ? options.radius : 48;
        this.customText = options.customText || null;
    }
    getBounds() {
        const g = angularGeometry(this);
        const pts = [this.vertex, this.p1, this.p2];
        if (g) for (let i = 0; i <= 12; i++) { const a = g.a1 + g.delta * i / 12; pts.push({ x: this.vertex.x + Math.cos(a) * (g.r + 8), y: this.vertex.y + Math.sin(a) * (g.r + 8) }); }
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }
    hitTest(px, py, scale = 1) {
        const g = angularGeometry(this);
        if (!g) return false;
        const tol = 6 / scale, d = Math.hypot(px - this.vertex.x, py - this.vertex.y);
        if (Math.abs(d - g.r) <= tol) {                                    // on the arc, within the swept angle
            let a = Math.atan2(py - this.vertex.y, px - this.vertex.x) - g.a1;
            while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI;
            const t = a / g.delta;
            if (t >= -0.02 && t <= 1.02) return true;
        }
        return Math.hypot(px - g.textPos.x, py - g.textPos.y) <= tol * 3;
    }
    label() { const g = angularGeometry(this); return this.customText || (g ? `${Math.round(g.deg * 10) / 10}\u00b0`.replace('.0\u00b0', '\u00b0') : ''); }
}

// ------------------------------------------------------------------ manager
export class AnnotationManager {
    constructor() {
        this.texts = []; this.leaders = []; this.angdims = [];
        this.selectedId = null;
        this.currentDimStyle = 'standard';
    }
    addText(x, y, options = {}) { const t = stampLayer(this.layers, new TextNote(x, y, options)); this.texts.push(t); return t; }
    addLeader(points, options = {}) { if (points.length < 2) return null; const l = stampLayer(this.layers, new Leader(points, options)); this.leaders.push(l); return l; }
    addAngularDim(vertex, p1, p2, options = {}) {
        const probe = { vertex, p1, p2, radius: options.radius };
        if (!angularGeometry(probe)) return null;
        const d = stampLayer(this.layers, new AngularDim(vertex, p1, p2, options));
        if (this.currentDimStyle !== 'standard') d.dimStyle = this.currentDimStyle;
        this.angdims.push(d); return d;
    }
    removeText(id) { this.texts = this.texts.filter(t => t.id !== id); if (this.selectedId === id) this.selectedId = null; }
    removeLeader(id) { this.leaders = this.leaders.filter(t => t.id !== id); if (this.selectedId === id) this.selectedId = null; }
    removeAngdim(id) { this.angdims = this.angdims.filter(t => t.id !== id); if (this.selectedId === id) this.selectedId = null; }
    clear() { this.texts = []; this.leaders = []; this.angdims = []; this.selectedId = null; }

    getTextAt(x, y, scale) { for (let i = this.texts.length - 1; i >= 0; i--) if (selectableIn(this.layers, this.texts[i], 'text') && this.texts[i].hitTest(x, y, scale)) return this.texts[i]; return null; }
    getLeaderAt(x, y, scale) { for (let i = this.leaders.length - 1; i >= 0; i--) if (selectableIn(this.layers, this.leaders[i], 'leader') && this.leaders[i].hitTest(x, y, scale)) return this.leaders[i]; return null; }
    getAngdimAt(x, y, scale) { for (let i = this.angdims.length - 1; i >= 0; i--) if (selectableIn(this.layers, this.angdims[i], 'angdim') && this.angdims[i].hitTest(x, y, scale)) return this.angdims[i]; return null; }

    render(ctx, scale, isExport = false, style = 'blueprint') {
        const isClean = style === 'clean';
        for (const t of this.texts) if (visibleIn(this.layers, t, 'text')) this.renderText(ctx, t, scale, t.id === this.selectedId && !isExport, isClean);
        for (const l of this.leaders) if (visibleIn(this.layers, l, 'leader')) this.renderLeader(ctx, l, scale, l.id === this.selectedId && !isExport, isClean);
        for (const d of this.angdims) if (visibleIn(this.layers, d, 'angdim')) this.renderAngular(ctx, d, scale, d.id === this.selectedId && !isExport, isClean, isExport);
    }

    drawLines(ctx, lines, x, y, height, align = 'left') {
        ctx.font = `${height}px sans-serif`;
        ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
        lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * height * 1.2));
    }

    renderText(ctx, t, scale, selected, isClean) {
        const c = COLORS(isClean, false, selected);
        ctx.save();
        ctx.translate(t.x, t.y); ctx.rotate(rad(t.rotation));
        ctx.fillStyle = c.ink;
        this.drawLines(ctx, String(t.text).split('\n'), 0, 0, t.height, t.align === 'center' ? 'center' : 'left');
        if (selected) {
            const e = textExtent(t.text, t.height), left = t.align === 'center' ? -e.width / 2 : 0;
            ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1 / scale; ctx.setLineDash([4 / scale, 3 / scale]);
            ctx.strokeRect(left - 2, -t.height - 2, e.width + 4, e.height + 4);
        }
        ctx.restore();
    }

    renderLeader(ctx, l, scale, selected, isClean) {
        const c = COLORS(isClean, false, selected);
        const pts = l.points;
        ctx.save();
        ctx.strokeStyle = c.line; ctx.fillStyle = c.ink; ctx.lineWidth = 1.2 / scale;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        const o = l.textOrigin(), last = pts[pts.length - 1], s = l.side();
        ctx.lineTo(last.x + s * o.landing, last.y);                       // the landing line the note sits on
        ctx.stroke();
        // arrowhead at the tip
        const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, al = Math.max(5, l.height * 0.9), aw = al * 0.3;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[0].x + ux * al - uy * aw, pts[0].y + uy * al + ux * aw); ctx.lineTo(pts[0].x + ux * al + uy * aw, pts[0].y + uy * al - ux * aw); ctx.closePath(); ctx.fill();
        this.drawLines(ctx, String(l.text).split('\n'), o.x, o.y, l.height, 'left');
        ctx.restore();
    }

    renderAngular(ctx, d, scale, selected, isClean, isExport) {
        const g = angularGeometry(d);
        if (!g) return;
        const c = COLORS(isClean, isExport, selected), st = dimStyleOf(d);
        ctx.save();
        ctx.strokeStyle = c.line; ctx.lineWidth = (isExport ? 1.5 : 1) / scale;
        // extension lines: from just off the vertex-side point out past the arc
        for (const [p, a] of [[d.p1, g.a1], [d.p2, g.a1 + g.delta]]) {
            const near = Math.min(Math.hypot(p.x - d.vertex.x, p.y - d.vertex.y), g.r * 0.5), far = g.r + 6 / scale;
            ctx.beginPath(); ctx.moveTo(d.vertex.x + Math.cos(a) * near, d.vertex.y + Math.sin(a) * near); ctx.lineTo(d.vertex.x + Math.cos(a) * far, d.vertex.y + Math.sin(a) * far); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(d.vertex.x, d.vertex.y, g.r, g.a1, g.a1 + g.delta, g.delta < 0); ctx.stroke();
        // ends: tangent direction at each end of the arc
        const size = (isExport ? 9 : 6) / scale * st.textScale ** 0.5;
        const arch = (cx, x, y, ang, sz, col, sc, ex) => { cx.save(); cx.strokeStyle = col; cx.lineWidth = (ex ? 1.8 : 1.4) / sc; cx.beginPath(); cx.moveTo(x - Math.cos(ang + Math.PI / 4) * sz, y - Math.sin(ang + Math.PI / 4) * sz); cx.lineTo(x + Math.cos(ang + Math.PI / 4) * sz, y + Math.sin(ang + Math.PI / 4) * sz); cx.stroke(); cx.restore(); };
        const sgn = g.delta > 0 ? 1 : -1;
        drawDimEnd(ctx, st.tick, d.vertex.x + Math.cos(g.a1) * g.r, d.vertex.y + Math.sin(g.a1) * g.r, g.a1 + sgn * Math.PI / 2, size, c.ink, scale, isExport, arch, -1);
        drawDimEnd(ctx, st.tick, d.vertex.x + Math.cos(g.a1 + g.delta) * g.r, d.vertex.y + Math.sin(g.a1 + g.delta) * g.r, g.a1 + g.delta + sgn * Math.PI / 2, size, c.ink, scale, isExport, arch, 1);
        // text
        const label = d.label(), fs = Math.max(((isExport ? 22 : 11) * st.textScale) / scale, 3);
        ctx.font = `600 ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(label).width, pad = 3 / scale;
        const tp = { x: d.vertex.x + Math.cos(g.mid) * (g.r + fs * 0.9), y: d.vertex.y + Math.sin(g.mid) * (g.r + fs * 0.9) };
        ctx.fillStyle = c.paper; ctx.fillRect(tp.x - tw / 2 - pad, tp.y - fs / 2 - pad, tw + pad * 2, fs + pad * 2);
        ctx.fillStyle = c.ink; ctx.fillText(label, tp.x, tp.y);
        ctx.restore();
    }
}

/** Points along an angular dimension's arc (for DXF / SVG export). */
export function arcPoints(d, steps = 24) {
    const g = angularGeometry(d);
    if (!g) return [];
    const out = [];
    for (let i = 0; i <= steps; i++) { const a = g.a1 + g.delta * i / steps; out.push({ x: d.vertex.x + Math.cos(a) * g.r, y: d.vertex.y + Math.sin(a) * g.r }); }
    return out;
}
