/**
 * snap_panel.js - toolbar controls for object snaps and polar tracking.
 * Mixed into HousePlannerApp, so `this` is the app. The snapping rules are in modules/snap.js.
 */

import { DEFAULT_SNAP_MODES } from '../snap.js';

const STORAGE_KEY = 'houseplanner_snap_prefs';
const MODE_LABELS = [
    ['endpoint', 'Endpoint', 'End of a wall or plot corner'],
    ['midpoint', 'Midpoint', 'Middle of a wall or plot edge'],
    ['intersection', 'Intersection', 'Where two walls cross (or where your direction line crosses a wall)'],
    ['perpendicular', 'Perpendicular', 'Square (90\u00b0) to a wall from your last point'],
    ['nearest', 'Nearest', 'Any point along a wall']
];
const POLAR_STEPS = [5, 10, 15, 22.5, 30, 45, 90];

export class SnapPanelMethods {
    initSnapControls() {
        const ce = this.canvasEngine;
        try {                                                               // restore the last session's choices
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (saved && typeof saved === 'object') {
                if (saved.snapModes && typeof saved.snapModes === 'object') for (const k of Object.keys(DEFAULT_SNAP_MODES)) if (typeof saved.snapModes[k] === 'boolean') ce.snapModes[k] = saved.snapModes[k];
                if (typeof saved.snapToPoints === 'boolean') ce.snapToPoints = saved.snapToPoints;
                if (typeof saved.polarMode === 'boolean') ce.polarMode = saved.polarMode;
                if (POLAR_STEPS.includes(saved.polarIncrement)) ce.polarIncrement = saved.polarIncrement;
            }
        } catch (e) { /* damaged preferences are ignored */ }

        document.getElementById('polarBtn')?.addEventListener('click', () => { ce.polarMode = !ce.polarMode; this.syncSnapControls(true); });
        document.getElementById('osnapBtn')?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleSnapPopover(); });
        document.addEventListener('mousedown', (e) => {
            const pop = document.getElementById('snapPopover');
            if (pop && pop.style.display !== 'none' && !pop.contains(e.target) && e.target.id !== 'osnapBtn') pop.style.display = 'none';
        });
        this.syncSnapControls(false);
    }

    /** Keep the buttons, the popover and the saved preferences in step with the canvas engine. */
    syncSnapControls(save = true) {
        const ce = this.canvasEngine;
        const polar = document.getElementById('polarBtn');
        if (polar) {
            polar.classList.toggle('active', !!ce.polarMode);
            const t = polar.querySelector('.btn-text'); if (t) t.textContent = ce.polarMode ? `Polar: ${ce.polarIncrement}\u00b0` : 'Polar: OFF';
        }
        const os = document.getElementById('osnapBtn');
        if (os) {
            os.classList.toggle('active', ce.snapToPoints !== false);
            const t = os.querySelector('.btn-text'); if (t) t.textContent = ce.snapToPoints === false ? 'Snaps: OFF' : 'Snaps';
        }
        const pop = document.getElementById('snapPopover');
        if (pop && pop.style.display !== 'none') this.renderSnapPopover();
        if (save) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ snapModes: ce.snapModes, snapToPoints: ce.snapToPoints, polarMode: ce.polarMode, polarIncrement: ce.polarIncrement })); } catch (e) { /* storage may be blocked */ }
        }
        this.requestRender();
    }

    toggleSnapPopover() {
        let pop = document.getElementById('snapPopover');
        if (!pop) {
            pop = document.createElement('div');
            pop.id = 'snapPopover';
            pop.style.cssText = 'position:fixed; z-index:9000; display:none; min-width:260px; padding:10px 12px; border-radius:8px; background:#0f172a; border:1px solid #334155; box-shadow:0 12px 30px rgba(0,0,0,.5); font-size:12px; color:#e2e8f0;';
            document.body.appendChild(pop);
        }
        if (pop.style.display !== 'none') { pop.style.display = 'none'; return; }
        const b = document.getElementById('osnapBtn').getBoundingClientRect();
        pop.style.left = Math.max(8, Math.min(window.innerWidth - 280, b.left)) + 'px';
        pop.style.top = (b.bottom + 6) + 'px';
        pop.style.display = 'block';
        this.renderSnapPopover();
    }

    renderSnapPopover() {
        const pop = document.getElementById('snapPopover');
        if (!pop) return;
        const ce = this.canvasEngine;
        const row = (id, label, hint, checked, disabled = false) =>
            `<label title="${hint}" style="display:flex; gap:8px; align-items:center; padding:3px 0; ${disabled ? 'opacity:.45;' : ''}"><input type="checkbox" data-snap="${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}> ${label}</label>`;
        pop.innerHTML = `
            <div style="font-weight:600; margin-bottom:6px;">Object snaps</div>
            ${row('master', 'Object snap on', 'Master switch for the snaps below', ce.snapToPoints !== false)}
            <div style="margin:2px 0 8px 14px;">
                ${MODE_LABELS.map(([k, l, h]) => row(k, l, h, ce.snapModes[k] !== false && (k !== 'nearest' || ce.snapModes.nearest), ce.snapToPoints === false)).join('')}
            </div>
            <div style="font-weight:600; margin:6px 0;">Polar tracking</div>
            <div style="display:flex; gap:8px; align-items:center;">
                <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" data-snap="polar" ${ce.polarMode ? 'checked' : ''}> On, every</label>
                <select data-snap="polarStep" class="prop-input" style="width:80px;">${POLAR_STEPS.map(s => `<option value="${s}" ${s === ce.polarIncrement ? 'selected' : ''}>${s}\u00b0</option>`).join('')}</select>
            </div>
            <div style="color:#94a3b8; margin-top:8px;">Hold Shift (or turn Ortho on) to lock to 45\u00b0 steps. Intersection and perpendicular work on walls and plot edges.</div>`;
        pop.querySelectorAll('input[data-snap]').forEach(inp => inp.addEventListener('change', () => {
            const k = inp.dataset.snap;
            if (k === 'master') ce.snapToPoints = inp.checked;
            else if (k === 'polar') ce.polarMode = inp.checked;
            else ce.snapModes[k] = inp.checked;
            this.syncSnapControls(true);
        }));
        pop.querySelector('select[data-snap="polarStep"]').addEventListener('change', (e) => { ce.polarIncrement = Number(e.target.value); ce.polarMode = true; this.syncSnapControls(true); });
    }
}
