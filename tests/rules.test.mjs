// Tests for: setbacks following the road side, stair rise/tread counts. Run:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlotManager } from '../modules/plot.js';
import { Stair } from '../modules/stairs.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);

function plotWithRoads(roads, setbacks = { front: 60, rear: 36, left: 24, right: 12 }) {
    const pm = new PlotManager();
    pm.createRectangularPlot(0, 0, 600, 800, setbacks);
    pm.roadSidesProvider = () => roads;
    return pm;
}

test('setbacks: with no road (or the road at the bottom) nothing changes from the original behaviour', () => {
    for (const roads of [[], [{ side: 'front', width: 240 }]]) {
        const pm = plotWithRoads(roads);
        assert.deepEqual(pm.getPhysicalSetbacks(), { top: 36, bottom: 60, left: 24, right: 12 });
        assert.deepEqual(pm.getBuildableBounds(), { x: 24, y: 36, width: 600 - 36, height: 800 - 96 });
    }
});

test('setbacks: the front setback follows the road to the top, left and right edges', () => {
    // entered: front 60, rear 36, left 24, right 12  (left/right as seen standing on the road facing the plot)
    assert.deepEqual(plotWithRoads([{ side: 'rear', width: 240 }]).getPhysicalSetbacks(), { top: 60, bottom: 36, left: 12, right: 24 });
    assert.deepEqual(plotWithRoads([{ side: 'left', width: 240 }]).getPhysicalSetbacks(), { top: 24, bottom: 12, left: 60, right: 36 });
    assert.deepEqual(plotWithRoads([{ side: 'right', width: 240 }]).getPhysicalSetbacks(), { top: 12, bottom: 24, left: 36, right: 60 });
});

test('setbacks: the buildable area is the plot minus the physical setbacks, whatever the road side', () => {
    for (const side of ['front', 'rear', 'left', 'right']) {
        const pm = plotWithRoads([{ side, width: 240 }]);
        const bb = pm.getBuildableBounds(), ph = pm.getPhysicalSetbacks();
        near(bb.x, ph.left); near(bb.y, ph.top);
        near(bb.width, 600 - ph.left - ph.right); near(bb.height, 800 - ph.top - ph.bottom);
        near(ph.top + ph.bottom + ph.left + ph.right, 60 + 36 + 24 + 12);        // nothing lost or invented
    }
});

test('setbacks: the widest standard road is the main road; custom roads are ignored', () => {
    const pm = plotWithRoads([{ side: 'left', width: 240 }, { side: 'rear', width: 360 }, { side: 'custom', width: 999 }]);
    assert.equal(pm.getFrontEdge(), 'rear');
    assert.equal(plotWithRoads([{ side: 'custom', width: 500 }]).getFrontEdge(), 'front');
});

test('setbacks: a setback of 0 stays 0 (it used to be shown/treated as 36 or 60)', () => {
    const pm = plotWithRoads([], { front: 0, rear: 0, left: 0, right: 0 });
    assert.deepEqual(pm.getPhysicalSetbacks(), { top: 0, bottom: 0, left: 0, right: 0 });
    assert.deepEqual(pm.getBuildableBounds(), { x: 0, y: 0, width: 600, height: 800 });
    const edges = pm.getSetbackEdges();
    assert.deepEqual(edges.map(e => e.value), [0, 0, 0, 0]);
});

test('setbacks: edge labels keep the entered names but move to the physical edge', () => {
    const e = plotWithRoads([{ side: 'left', width: 240 }]).getSetbackEdges();
    assert.deepEqual(e.map(x => [x.label, x.edge, x.value]), [['Front', 'left', 60], ['Rear', 'right', 36], ['L', 'top', 24], ['R', 'bottom', 12]]);
});

test('stairs: rises = treads + 1, and the counts match what each layout can draw', () => {
    const t = (o) => new Stair(o).getTreadSummary();
    assert.deepEqual(t({ type: 'dogleg', treads: 16, landingSteps: 3 }), { treads: 15, rises: 16 });   // the default stair: 6+6+3
    assert.deepEqual(t({ type: 'dogleg', treads: 17, landingSteps: 3 }), { treads: 17, rises: 18 });   // 7+7+3
    assert.deepEqual(t({ type: 'dogleg', treads: 16, landingSteps: 0 }), { treads: 16, rises: 17 });   // 8+8 + flat landing
    assert.deepEqual(t({ type: 'straight', treads: 16 }), { treads: 15, rises: 16 });
    assert.deepEqual(t({ type: 'open_well', treads: 16, middleTreads: 3 }), { treads: 15, rises: 16 }); // 6+6+3
    assert.deepEqual(t({ type: 'l_shape', treads: 16 }), { treads: 16, rises: 17 });                    // 7+7+2
    assert.deepEqual(t({ type: 'spiral', treads: 12 }), { treads: 12, rises: 13 });
    assert.equal(new Stair({ type: 'dogleg', treads: 16, landingSteps: 3 }).getCountLabel(), '16 RISES / 15 TREADS');
});

test('stairs: the summary never reports more treads than the layout is built from', () => {
    for (const type of ['straight', 'dogleg', 'open_well', 'l_shape', 'spiral']) for (let treads = 6; treads <= 30; treads++) for (const landingSteps of [0, 2, 3]) {
        const s = new Stair({ type, treads, landingSteps });
        const sum = s.getTreadSummary();
        assert.ok(sum.treads >= 1 && sum.treads <= treads + 1, `${type}/${treads}/${landingSteps}: ${sum.treads}`);
        assert.equal(sum.rises, sum.treads + 1);
        assert.ok(Math.abs(sum.treads - treads) <= 1 || type === 'l_shape' || type === 'open_well', `${type}/${treads}: drawn ${sum.treads}`);
    }
});

/** Count the single-line tread strokes a stair really draws (winder treads are drawn as shapes, not lines). */
function drawnTreadLines(stair) {
    let segs = 0, lines = 0, lw = 0;
    const t = { measureText: () => ({ width: 5 }), createLinearGradient: () => ({ addColorStop() {} }), getLineDash: () => [] };
    const ctx = new Proxy(t, {
        get(o, k) {
            if (k in o) return o[k];
            if (k === 'beginPath') return () => { segs = 0; };
            if (k === 'moveTo' || k === 'lineTo') return () => { segs++; };
            if (k === 'stroke') return () => { if (segs === 2 && Math.abs(lw - 1.2 / 2) < 1e-9) lines++; };
            return () => {};
        },
        set(o, k, v) { o[k] = v; if (k === 'lineWidth') lw = v; return true; }
    });
    stair.render(ctx, 2, false);
    return lines;
}

test('stairs: the label matches the tread lines that are actually drawn', () => {
    for (const treads of [10, 12, 16, 20]) {
        const s = new Stair({ type: 'straight', treads, showBreakLine: false });
        assert.equal(drawnTreadLines(s), s.getTreadSummary().treads, `straight ${treads}`);
    }
    for (const treads of [14, 16, 17, 20]) for (const landingSteps of [0, 2, 3]) {
        const s = new Stair({ type: 'dogleg', treads, landingSteps, showBreakLine: false });
        assert.equal(drawnTreadLines(s) + landingSteps, s.getTreadSummary().treads, `dogleg ${treads}/${landingSteps}`);
    }
});
