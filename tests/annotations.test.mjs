// Text notes, leaders, angular dimensions and dimension styles. Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { TextNote, Leader, AngularDim, AnnotationManager, angularGeometry, arcPoints, textExtent } from '../modules/annotations.js';
import { DIM_STYLES, DIM_STYLE_IDS, dimStyleOf, findDimStyle, drawDimEnd } from '../modules/dimstyles.js';
import { LayerManager } from '../modules/layers.js';
import { DimensionManager } from '../modules/dimensions.js';
import { serializeEntities, restoreEntities } from '../modules/serializer.js';
import { buildDXF } from '../modules/dxf.js';
import { CommandLine } from '../modules/commands.js';
import { units, UnitSystem } from '../modules/units.js';
import { DEFAULT_SNAP_MODES } from '../modules/snap.js';
import { WallManager } from '../modules/walls.js';
import { OpeningManager } from '../modules/openings.js';
import { RoomManager } from '../modules/rooms.js';
import { ColumnManager } from '../modules/columns.js';
import { FurnitureManager } from '../modules/furniture.js';
import { StairManager } from '../modules/stairs.js';

units.setSystem(UnitSystem.IMPERIAL);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const ctxStub = () => { const log = { fillText: 0, arc: 0, fill: 0, stroke: 0, texts: [] }; return new Proxy({ measureText: (t) => ({ width: String(t).length * 5 }), createLinearGradient: () => ({ addColorStop() {} }), getLineDash: () => [], __log: log },
    { get(t, k) { if (k in t) return t[k]; return (...a) => { if (k in log) log[k]++; if (k === 'fillText') log.texts.push(a[0]); }; }, set(t, k, v) { t[k] = v; return true; } }); };
const makeMgr = () => { const lm = new LayerManager(); const m = new AnnotationManager(); m.layers = lm; return { m, lm }; };

test('text: extent, bounds with rotation, hit test', () => {
    const e = textExtent('Living\nRoom 12', 10); near(e.height, 24); assert.ok(e.width > 35 && e.width < 45);
    const t = new TextNote(100, 100, { text: 'Hello', height: 10 });
    const b = t.getBounds(); near(b.x, 100); assert.ok(b.y < 100 && b.y + b.height > 100);                // the baseline sits inside the box
    assert.ok(t.hitTest(110, 98, 1)); assert.ok(!t.hitTest(300, 100, 1)); assert.ok(!t.hitTest(110, 140, 1));
    t.rotation = 90; const r = t.getBounds(); assert.ok(r.height > r.width, 'a quarter turn makes the box tall');
    t.align = 'center'; t.rotation = 0; near(t.getBounds().x + t.getBounds().width / 2, 100, 1e-9);
    assert.equal(new TextNote(0, 0, { height: -4 }).height, 9); assert.equal(new TextNote(0, 0, {}).text, 'Text');
});

test('leader: the note sits on the side the leader points to', () => {
    const l = new Leader([{ x: 0, y: 0 }, { x: 50, y: -30 }], { text: 'Beam', height: 10 });
    assert.equal(l.side(), 1); assert.ok(l.textOrigin().x > 50);
    const left = new Leader([{ x: 0, y: 0 }, { x: -50, y: -30 }], { text: 'Beam' }); assert.equal(left.side(), -1); assert.ok(left.textOrigin().x < -50);
    assert.ok(l.hitTest(25, -15, 1)); assert.ok(l.hitTest(l.textOrigin().x + 5, l.textOrigin().y - 3, 1)); assert.ok(!l.hitTest(500, 500, 1));
    const b = l.getBounds(); assert.ok(b.x <= 0 && b.x + b.width > 50 + 20);
});

test('angular geometry: the interior angle, the arc and where the label goes', () => {
    const g = angularGeometry({ vertex: { x: 0, y: 0 }, p1: { x: 100, y: 0 }, p2: { x: 0, y: -100 }, radius: 40 });             // east and north (up the screen)
    near(g.deg, 90, 1e-9); near(g.r, 40); near(g.textPos.x, 40 * Math.cos(g.mid)); assert.ok(g.delta < 0 && g.textPos.y < 0, 'arc sweeps counter-clockwise between the two sides');
    near(angularGeometry({ vertex: { x: 0, y: 0 }, p1: { x: 100, y: 0 }, p2: { x: 100, y: 100 } }).deg, 45, 1e-9);
    near(angularGeometry({ vertex: { x: 0, y: 0 }, p1: { x: 100, y: 0 }, p2: { x: -100, y: 1e-9 } }).deg, 180, 1e-4);
    near(angularGeometry({ vertex: { x: 0, y: 0 }, p1: { x: 100, y: 0 }, p2: { x: 100, y: 100 }, radius: 0 }).r, 48);              // missing radius -> default
    assert.equal(angularGeometry({ vertex: { x: 0, y: 0 }, p1: { x: 10, y: 0 }, p2: { x: 20, y: 0 } }), null);                       // same direction
    assert.equal(angularGeometry({ vertex: { x: 0, y: 0 }, p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 } }), null);                        // no length
    for (let n = 0; n < 200; n++) { const a = (n * 37) % 360 - 180, b = (n * 91) % 360 - 180;                                         // never more than 180 whatever the order
        const gg = angularGeometry({ vertex: { x: 0, y: 0 }, p1: { x: Math.cos(a * Math.PI / 180) * 50, y: Math.sin(a * Math.PI / 180) * 50 }, p2: { x: Math.cos(b * Math.PI / 180) * 50, y: Math.sin(b * Math.PI / 180) * 50 } });
        if (gg) assert.ok(gg.deg > 0 && gg.deg <= 180 + 1e-9, `${a},${b} -> ${gg.deg}`); }
});

test('angular dimension: label, hit test on the arc, bounds, arc points', () => {
    const d = new AngularDim({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -100 }, { radius: 50 });
    assert.equal(d.label(), '45\u00b0'); d.customText = 'ALPHA'; assert.equal(d.label(), 'ALPHA'); d.customText = null;
    const g = angularGeometry(d);
    assert.ok(d.hitTest(Math.cos(g.mid) * 50, Math.sin(g.mid) * 50, 1)); assert.ok(!d.hitTest(Math.cos(g.mid) * 120, Math.sin(g.mid) * 120, 1)); assert.ok(!d.hitTest(-50, 50, 1));
    const b = d.getBounds(); assert.ok(b.width >= 100 && b.height >= 50);
    const pts = arcPoints(d, 10); assert.equal(pts.length, 11); for (const p of pts) near(Math.hypot(p.x, p.y), 50, 1e-9);
    assert.deepEqual(arcPoints({ vertex: { x: 0, y: 0 }, p1: { x: 1, y: 0 }, p2: { x: 2, y: 0 } }), []);
    assert.equal(new AngularDim({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { radius: 33.3 }).label(), '90\u00b0');
});

test('manager: add / remove / pick, layers, and rejected angular dimensions', () => {
    const { m, lm } = makeMgr();
    const t = m.addText(0, 0, { text: 'A' }), l = m.addLeader([{ x: 10, y: 10 }, { x: 40, y: 10 }], { text: 'B' }), a = m.addAngularDim({ x: 0, y: 100 }, { x: 50, y: 100 }, { x: 0, y: 50 });
    assert.equal(m.addLeader([{ x: 1, y: 1 }]), null); assert.equal(m.addAngularDim({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 0 }), null);
    assert.equal(m.getTextAt(2, -3, 1), t); assert.equal(m.getLeaderAt(25, 10, 1), l); assert.equal(m.getAngdimAt(Math.cos(angularGeometry(a).mid) * 48, 100 + Math.sin(angularGeometry(a).mid) * 48, 1), a);
    assert.equal(new Set([t.id, l.id, a.id]).size, 3);
    lm.setLocked('annotation', true); assert.equal(m.getTextAt(2, -3, 1), null);
    lm.setLocked('annotation', false); lm.setVisible('annotation', false);
    const c = ctxStub(); m.render(c, 2, false, 'blueprint'); assert.equal(c.__log.fillText, 0, 'hidden layer draws nothing'); assert.equal(m.getLeaderAt(25, 10, 1), null);
    lm.setVisible('annotation', true);
    const d = ctxStub(); m.render(d, 2, false, 'blueprint'); assert.ok(d.__log.texts.includes('A') && d.__log.texts.includes('B') && d.__log.texts.includes('90\u00b0'), d.__log.texts.join('|'));
    m.selectedId = t.id; m.removeText(t.id); assert.equal(m.selectedId, null); m.removeLeader(l.id); m.removeAngdim(a.id); assert.equal(m.texts.length + m.leaders.length + m.angdims.length, 0);
    const e = ctxStub(); const { m: m2 } = makeMgr(); m2.addText(0, 0, { text: 'L1\nL2' }); m2.render(e, 2, true, 'clean'); assert.deepEqual(e.__log.texts, ['L1', 'L2']);
});

test('dimension styles: presets, lookup by name, size and end marks', () => {
    assert.deepEqual(DIM_STYLE_IDS, ['standard', 'large', 'small', 'arrows', 'dots']);
    assert.equal(dimStyleOf({}).name, 'Standard'); assert.equal(dimStyleOf({ dimStyle: 'large' }).textScale, 1.6); assert.equal(dimStyleOf({ dimStyle: 'nonsense' }).name, 'Standard'); assert.equal(dimStyleOf(null).name, 'Standard');
    assert.equal(findDimStyle('Large'), 'large'); assert.equal(findDimStyle('large text'), 'large'); assert.equal(findDimStyle('arrow'), 'arrows'); assert.equal(findDimStyle('dots'), 'dots'); assert.equal(findDimStyle('zzz'), null); assert.equal(findDimStyle(''), null);
    const calls = []; const arch = () => calls.push('arch'); const c = ctxStub();
    drawDimEnd(c, 'arch', 0, 0, 0, 5, '#000', 1, false, arch); assert.deepEqual(calls, ['arch']);
    drawDimEnd(c, 'arrow', 0, 0, 0, 5, '#000', 1, false, arch, -1); assert.ok(c.__log.fill >= 1); drawDimEnd(c, 'dot', 0, 0, 0, 5, '#000', 1, false, arch); assert.ok(c.__log.arc >= 1); assert.equal(calls.length, 1);
    // a linear dimension draws bigger text and different ends in another style
    const dm = new DimensionManager(); const dim = dm.addDimension({ x: 0, y: 0 }, { x: 144, y: 0 }, 24);
    const fonts = []; const cc = new Proxy({ measureText: () => ({ width: 30 }), createLinearGradient: () => ({ addColorStop() {} }), getLineDash: () => [] }, { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { if (k === 'font') fonts.push(v); t[k] = v; return true; } });
    dm.render(cc, 2, false, 'blueprint'); const std = parseFloat(/(\d+(\.\d+)?)px/.exec(fonts.at(-1))[1]);
    dim.dimStyle = 'large'; dm.render(cc, 2, false, 'blueprint'); const big = parseFloat(/(\d+(\.\d+)?)px/.exec(fonts.at(-1))[1]);
    near(big / std, 1.6, 1e-6);
    const am = new AnnotationManager(); dm.styleSource = () => 'arrows'; assert.equal(dm.addDimension({ x: 0, y: 0 }, { x: 50, y: 0 }).dimStyle, 'arrows');
    dm.styleSource = () => 'standard'; assert.equal(dm.addDimension({ x: 0, y: 0 }, { x: 50, y: 0 }).dimStyle, undefined);
    am.currentDimStyle = 'small'; assert.equal(am.addAngularDim({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }).dimStyle, 'small');
});

function appFor() {
    const lm = new LayerManager();
    const app = { layerManager: lm, annotationManager: new AnnotationManager(), wallManager: new WallManager(), openingManager: new OpeningManager(), roomManager: new RoomManager(), columnManager: new ColumnManager(),
        furnitureManager: new FurnitureManager(), dimensionManager: new DimensionManager(), stairManager: new StairManager() };
    app.annotationManager.layers = lm; return app;
}
test('save and load: annotation survives, bad records are skipped and ids repaired', () => {
    const a = appFor(); const m = a.annotationManager;
    const t = m.addText(5, 6, { text: 'Café ☕ "quoted" <b>', height: 7, rotation: 30, align: 'center' }); t.layer = 'annotation';
    const l = m.addLeader([{ x: 0, y: 0 }, { x: 30, y: 10 }, { x: 60, y: 10 }], { text: 'Two\nlines' }); const d = m.addAngularDim({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: -50 }, { radius: 35 }); d.dimStyle = 'arrows'; d.customText = 'X';
    const data = JSON.parse(JSON.stringify(serializeEntities(a)));
    const b = appFor(); const warnings = restoreEntities(b, data);
    assert.deepEqual(warnings, []);
    assert.deepEqual(JSON.parse(JSON.stringify(b.annotationManager.texts[0])), JSON.parse(JSON.stringify(t)));
    assert.deepEqual(JSON.parse(JSON.stringify(b.annotationManager.leaders[0])), JSON.parse(JSON.stringify(l)));
    assert.deepEqual(JSON.parse(JSON.stringify(b.annotationManager.angdims[0])), JSON.parse(JSON.stringify(d)));
    assert.ok(b.annotationManager.angdims[0] instanceof AngularDim && b.annotationManager.leaders[0] instanceof Leader);
    const bad = appFor(); const w = restoreEntities(bad, { texts: [{ x: 1, y: 2, text: 'ok', id: 'text_5' }, { x: 'a', y: 2, text: 'no' }, { x: 1, y: 2, text: 99 }, { x: 1, y: 2, text: 'dup', id: 'text_5' }],
        leaders: [{ points: [{ x: 0, y: 0 }], text: 'short' }, { points: 'zz', text: 'x' }, { points: Array.from({ length: 80 }, (_, i) => ({ x: i, y: 0 })), text: 'long' }], angdims: [{ vertex: { x: 0, y: 0 }, p1: { x: 1, y: 0 } }, { vertex: { x: 0, y: 0 }, p1: { x: 1, y: 0 }, p2: { x: 0, y: 1 } }] });
    assert.equal(bad.annotationManager.texts.length, 2); assert.notEqual(bad.annotationManager.texts[0].id, bad.annotationManager.texts[1].id);
    assert.equal(bad.annotationManager.leaders.length, 0); assert.equal(bad.annotationManager.angdims.length, 1); assert.ok(w.length >= 6);
});

test('DXF: text, multi-line text, leader and angular dimension become TEXT / LINE entities on the ANNOTATION layer', () => {
    const a = appFor(); const m = a.annotationManager; const lm = a.layerManager;
    m.addText(10, 20, { text: 'Line one\nLine two', height: 8, rotation: 0 }); m.addText(0, 0, { text: 'Pooja \u0915', align: 'center' });
    m.addLeader([{ x: 0, y: 0 }, { x: 40, y: -20 }], { text: 'Beam B1' }); m.addAngularDim({ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 0, y: -60 }, { radius: 30 });
    let dxf = buildDXF(a);
    assert.ok(/ANNOTATION\n70\n0\n62\n2\n/.test(dxf));
    const texts = [...dxf.matchAll(/0\nTEXT\n8\nANNOTATION\n10\n([-\d.]+)\n20\n([-\d.]+)\n30\n0.0\n40\n([\d.]+)\n1\n([^\n]*)\n50\n([-\d.]+)/g)].map(x => ({ x: +x[1], y: +x[2], h: +x[3], s: x[4] }));
    assert.deepEqual(texts.map(t => t.s).sort(), ['90\u00b0'.replace('\u00b0', '\\U+00B0'), 'Beam B1', 'Line one', 'Line two', 'Pooja \\U+0915'].sort());
    const one = texts.find(t => t.s === 'Line one'), two = texts.find(t => t.s === 'Line two'); near(one.x, 10); near(one.y, -20); near(two.y, -20 - 8 * 1.2, 1e-6);             // second line is below the first (Y flipped in DXF)
    assert.ok((dxf.match(/0\nLINE\n8\nANNOTATION\n/g) || []).length >= 24 + 2 + 3, 'arc segments + extension lines + leader');
    assert.ok(!/[^\x00-\x7F]/.test(dxf), 'pure ASCII');
    lm.setVisible('annotation', false); dxf = buildDXF(a); assert.doesNotMatch(dxf, /8\nANNOTATION\n/);
});

function cmdApp() {
    const a = appFor(); const out = []; const log = { sel: null, hist: 0 };
    const app = Object.assign(a, { activeTool: 'select', draftStart: null, draftCurrent: null, selection: [], canvasEngine: { snapModes: { ...DEFAULT_SNAP_MODES }, scale: 2 }, requestRender() {}, saveHistory() { log.hist++; }, setTool() {},
        getSelectionItems() { return this.selection; }, setSelection(items) { this.selection = items; log.sel = items; } });
    const cl = new CommandLine(app, { log: (t, k) => out.push([k || 'info', t]), setPrompt() {} });
    return { app, cl, out, log };
}
test('TEXT command: click, then type (capitals and "x" are kept); inline text skips the question', () => {
    const { app, cl, out, log } = cmdApp(); const m = app.annotationManager;
    cl.submit('text'); cl.canvasPoint({ x: 100, y: 50 }); assert.equal(cl.pending.kind, 'text');
    cl.submit('X Living Room\\nGround'); assert.equal(m.texts.length, 1); assert.equal(m.texts[0].text, 'X Living Room\nGround'); assert.equal(m.texts[0].height, 9); assert.equal(log.hist, 1); assert.equal(log.sel[0].category, 'text');
    cl.submit('Text Kitchen'); cl.canvasPoint({ x: 0, y: 0 }); assert.equal(m.texts[1].text, 'Kitchen');                                    // the word "Text" is the command, the rest is the note
    cl.submit('textheight 6"'); cl.submit('text Hall'); cl.canvasPoint({ x: 0, y: 0 }); assert.equal(m.texts[2].height, 6);
    cl.submit('textheight 100\''); assert.equal(out.at(-1)[0], 'error'); cl.submit('textheight'); assert.match(out.at(-1)[1], /Text height is 6"/);
    cl.submit('text'); cl.canvasPoint({ x: 1, y: 1 }); cl.submit('   '); assert.equal(cl.pending, null); assert.equal(m.texts.length, 3);                // an empty note is cancelled
});
test('LEADER and DIMANGULAR commands', () => {
    const { app, cl, out } = cmdApp(); const m = app.annotationManager;
    cl.submit('leader'); cl.canvasPoint({ x: 0, y: 0 }); cl.canvasPoint({ x: 60, y: -40 }); cl.submit('Fire door'); assert.equal(m.leaders.length, 1); assert.equal(m.leaders[0].text, 'Fire door'); assert.deepEqual(m.leaders[0].points[1], { x: 60, y: -40 });
    cl.submit('leader'); cl.canvasPoint({ x: 5, y: 5 }); cl.canvasPoint({ x: 5, y: 5 }); assert.match(out.at(-1)[1], /away from the arrow tip/); assert.ok(cl.pending); cl.cancel(false);
    cl.submit('leader Beam'); cl.canvasPoint({ x: 0, y: 0 }); cl.canvasPoint({ x: -50, y: -10 }); assert.equal(m.leaders[1].text, 'Beam');
    cl.submit('dan'); cl.canvasPoint({ x: 0, y: 0 }); cl.canvasPoint({ x: 100, y: 0 }); cl.canvasPoint({ x: 100, y: -100 });
    assert.equal(m.angdims.length, 1); assert.equal(m.angdims[0].label(), '45\u00b0'); near(m.angdims[0].radius, 60);
    cl.submit('dimangular'); cl.canvasPoint({ x: 0, y: 0 }); cl.canvasPoint({ x: 100, y: 0 }); cl.canvasPoint({ x: 200, y: 0 }); assert.match(out.at(-1)[1], /point the same way/); assert.ok(cl.pending);
});
test('DIMSTYLE command: lists, sets the current style, restyles selected dimensions', () => {
    const { app, cl, out } = cmdApp(); const m = app.annotationManager;
    cl.submit('dimstyle'); assert.match(out.at(-1)[1], /Standard \(current\)/);
    const dim = app.dimensionManager.addDimension({ x: 0, y: 0 }, { x: 100, y: 0 }); const ang = m.addAngularDim({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 });
    app.selection = [{ category: 'dimension', obj: dim }, { category: 'angdim', obj: ang }, { category: 'wall', obj: {} }];
    cl.submit('dimstyle large'); assert.equal(m.currentDimStyle, 'large'); assert.equal(dim.dimStyle, 'large'); assert.equal(ang.dimStyle, 'large'); assert.match(out.at(-1)[1], /also applied to 2/);
    cl.submit('dimstyle standard'); assert.equal(dim.dimStyle, undefined);
    cl.submit('dst nonsense'); assert.equal(out.at(-1)[0], 'error');
});

test('loading never replaces an object method with a string (AngularDim.label regression)', () => {
    const a = appFor(); a.annotationManager.addAngularDim({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: -50 });
    const b = appFor(); restoreEntities(b, JSON.parse(JSON.stringify(serializeEntities(a))));
    const d = b.annotationManager.angdims[0];
    assert.equal(typeof d.label, 'function'); assert.equal(Object.prototype.hasOwnProperty.call(d, 'label'), false); assert.equal(d.label(), '90\u00b0');
    const c = ctxStub(); b.annotationManager.render(c, 2, false, 'blueprint'); assert.ok(c.__log.texts.includes('90\u00b0'));
});

test('export / fit area includes annotation, even when it is the only thing on the page', async () => {
    const { Exporter } = await import('../modules/exporter.js');
    const a = appFor(); assert.equal(Exporter.getProjectBounds(a), null);
    a.annotationManager.addText(100, 200, { text: 'Only a note', height: 10 });
    const b = Exporter.getProjectBounds(a); assert.ok(b && b.x <= 100 && b.y < 200 && b.width > 40 && b.height > 5, JSON.stringify(b));
    a.annotationManager.addLeader([{ x: 500, y: 500 }, { x: 600, y: 400 }], { text: 'Far away' });
    const c = Exporter.getProjectBounds(a); assert.ok(c.x + c.width >= 600 + 20 && c.y + c.height >= 500, JSON.stringify(c));
    a.layerManager.setVisible('annotation', false); assert.equal(Exporter.getProjectBounds(a), null, 'hidden annotation does not stretch the area');
});
