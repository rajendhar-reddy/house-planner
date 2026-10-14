/**
 * selection_panels.js - UI for multi-selection and layers:
 *   - the group Properties panel (Move / Copy / Rotate / Mirror / Layer / Delete for 2+ objects)
 *   - the "Layer" row shown under a single object's properties
 *   - the Layers manager dialog
 * These methods are mixed into HousePlannerApp (see app.js), so `this` is the app.
 */

import { units } from '../units.js';
import { escapeHtml } from '../util.js';
import { defaultLayerId } from '../layers.js';
import { SELECTABLE, describeSelection, selectionBounds, forEachObject } from '../transform.js';
import { HATCH_TYPES } from '../hatch.js';

export class SelectionPanelMethods {
    // ------------------------------------------------------------------ group panel
    renderGroupInspector(panel) {
        const items = this.selection;
        const layerOptions = ['<option value="">By type</option>']
            .concat(this.layerManager.layers.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`)).join('');
        panel.innerHTML = `
            <div class="inspector-section">
                <h3>Selection: ${items.length} objects</h3>
                <p class="hint-text">${escapeHtml(describeSelection(items))}. Doors and windows travel with their wall.</p>

                <div style="font-size:11px; color:var(--text-muted); margin:10px 0 4px;">Move / Copy by distance (Y: + is down)</div>
                <div class="input-grid">
                    <div><label>X</label><input type="text" id="grpDx" value="0"></div>
                    <div><label>Y</label><input type="text" id="grpDy" value="0"></div>
                </div>
                <div style="display:flex; gap:8px; margin-top:8px;">
                    <button class="action-btn" id="grpMove" style="flex:1;">Move</button>
                    <button class="action-btn" id="grpCopy" style="flex:1;">Copy</button>
                </div>

                <div style="font-size:11px; color:var(--text-muted); margin:14px 0 4px;">Rotate about the centre of the selection</div>
                <div class="input-grid">
                    <div><label>Angle (degrees)</label><input type="text" id="grpAngle" value="90"></div>
                    <div><label>&nbsp;</label><label style="font-size:11px;"><input type="checkbox" id="grpKeep"> Keep original (copy)</label></div>
                </div>
                <div style="display:flex; gap:8px; margin-top:8px;">
                    <button class="action-btn" id="grpRotL" style="flex:1;" title="Counter-clockwise">&#8634; Left</button>
                    <button class="action-btn" id="grpRotR" style="flex:1;" title="Clockwise">&#8635; Right</button>
                </div>

                <div style="font-size:11px; color:var(--text-muted); margin:14px 0 4px;">Mirror across the centre of the selection</div>
                <div style="display:flex; gap:8px;">
                    <button class="action-btn" id="grpMirLR" style="flex:1;">&#8596; Left-right</button>
                    <button class="action-btn" id="grpMirTB" style="flex:1;">&#8597; Top-bottom</button>
                </div>
                <p class="hint-text" style="margin-top:6px;">Tick "Keep original" above to mirror a copy instead.</p>

                <div style="font-size:11px; color:var(--text-muted); margin:14px 0 4px;">Layer</div>
                <select id="grpLayer" class="prop-input" style="width:100%;">${layerOptions}</select>

                <button class="action-btn" id="grpBlock" style="margin-top:14px; width:100%;" title="Keep these objects as a reusable symbol">Save as block&hellip;</button>
                <button class="action-btn danger" id="grpDelete" style="margin-top:8px; width:100%;">Delete ${items.length} objects</button>
            </div>`;

        const val = (id) => document.getElementById(id).value;
        const keep = () => document.getElementById('grpKeep').checked;
        const run = (fn) => { try { fn(); } catch (err) { alert(err.message); } };
        const distance = (id) => { const v = units.parseInput(val(id)); if (v === null || !Number.isFinite(v)) throw new Error('Type a distance such as 6\' or 1.5m (a plain number means feet / metres).'); return v; };
        const center = () => { const b = selectionBounds(this, items); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

        document.getElementById('grpMove').addEventListener('click', () => run(() => this.runTransform('move', { dx: distance('grpDx'), dy: distance('grpDy') })));
        document.getElementById('grpCopy').addEventListener('click', () => run(() => this.runTransform('move', { dx: distance('grpDx'), dy: distance('grpDy'), copy: true })));
        const angle = () => { const a = parseFloat(val('grpAngle')); if (!Number.isFinite(a)) throw new Error('Type an angle in degrees.'); return a; };
        document.getElementById('grpRotL').addEventListener('click', () => run(() => this.runTransform('rotate', { degrees: -angle(), copy: keep() })));
        document.getElementById('grpRotR').addEventListener('click', () => run(() => this.runTransform('rotate', { degrees: angle(), copy: keep() })));
        document.getElementById('grpMirLR').addEventListener('click', () => run(() => { const c = center(); this.runTransform('mirror', { p1: { x: c.x, y: c.y - 1 }, p2: { x: c.x, y: c.y + 1 }, copy: keep() }); }));
        document.getElementById('grpMirTB').addEventListener('click', () => run(() => { const c = center(); this.runTransform('mirror', { p1: { x: c.x - 1, y: c.y }, p2: { x: c.x + 1, y: c.y }, copy: keep() }); }));
        document.getElementById('grpLayer').addEventListener('change', (e) => {
            for (const it of items) it.obj.layer = e.target.value || null;
            this.saveHistory(); this.updateInspector(); this.requestRender();
        });
        document.getElementById('grpBlock').addEventListener('click', () => run(() => {
            const name = window.prompt('Name for this block (e.g. Bathroom set):', '');
            if (name === null) return;
            const r = this.saveSelectionAsBlock(name);
            if (this.commandLine) this.commandLine.log(`Block "${r.block.name}" ${r.replaced ? 'replaced' : 'saved'} (${r.block.count} objects). Use INSERT ${r.block.name}.`);
        }));
        document.getElementById('grpDelete').addEventListener('click', () => this.deleteSelected());
    }

    // ------------------------------------------------------------------ layer row under a single object
    appendLayerSection(panel) {
        const cat = this.selectedCategory, obj = this.selectedObject;
        if (!obj || !SELECTABLE.includes(cat)) return;
        const lm = this.layerManager;
        const own = obj.layer && lm.get(obj.layer) ? obj.layer : '';
        const defName = (lm.get(defaultLayerId(cat, obj)) || { name: '' }).name;
        const div = document.createElement('div');
        div.className = 'inspector-section';
        div.innerHTML = `
            <h3>Layer</h3>
            <select id="objLayerSelect" class="prop-input" style="width:100%;">
                <option value="">By type (${escapeHtml(defName)})</option>
                ${lm.layers.map(l => `<option value="${escapeHtml(l.id)}" ${own === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
            </select>`;
        panel.appendChild(div);
        div.querySelector('#objLayerSelect').addEventListener('change', (e) => {
            obj.layer = e.target.value || null;
            this.saveHistory(); this.requestRender();
            this.updateInspector();
        });
    }

    // ------------------------------------------------------------------ floor finish (hatch) row under a room
    appendRoomFinishSection(panel) {
        const room = this.selectedObject;
        if (!room) return;
        const div = document.createElement('div');
        div.className = 'inspector-section';
        const cur = room.hatch || 'none', sc = Math.round((room.hatchScale || 1) * 100);
        div.innerHTML = `
            <h3>Floor finish</h3>
            <select id="roomHatchSelect" class="prop-input" style="width:100%;">
                ${HATCH_TYPES.map(t => `<option value="${t.id}" ${cur === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
            </select>
            <div class="prop-row" style="margin-top:8px;"><span class="prop-label">Pattern size</span>
                <input type="range" id="roomHatchScale" min="25" max="400" step="5" value="${sc}" style="flex:1;" ${cur === 'none' ? 'disabled' : ''}>
                <span class="prop-val" id="roomHatchScaleVal">${sc}%</span></div>`;
        panel.appendChild(div);
        div.querySelector('#roomHatchSelect').addEventListener('change', (e) => {
            if (e.target.value === 'none') delete room.hatch; else room.hatch = e.target.value;
            this.saveHistory(); this.requestRender(); this.updateInspector();
        });
        div.querySelector('#roomHatchScale').addEventListener('input', (e) => {
            room.hatchScale = Number(e.target.value) / 100;
            div.querySelector('#roomHatchScaleVal').textContent = `${e.target.value}%`;
            this.saveHistoryCoalesced('roomHatchScale:' + room.id); this.requestRender();
        });
    }

    // ------------------------------------------------------------------ Layers dialog
    openLayersPanel() {
        let modal = document.getElementById('layersModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal-backdrop';
            modal.id = 'layersModal';
            modal.innerHTML = '<div class="modal-card" style="max-width:640px; width:92vw;"><div id="layersCard"></div></div>';
            modal.addEventListener('mousedown', (e) => { if (e.target === modal) this.closeLayersPanel(); });
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        this.renderLayersPanel();
    }

    closeLayersPanel() {
        const modal = document.getElementById('layersModal');
        if (modal) modal.style.display = 'none';
    }

    renderLayersPanel() {
        const card = document.getElementById('layersCard');
        if (!card) return;
        const lm = this.layerManager;
        const counts = {};
        forEachObject(this, (cat, obj) => { const id = lm.layerIdOf(obj, cat); counts[id] = (counts[id] || 0) + 1; });
        const rows = lm.layers.map(l => `
            <tr data-id="${escapeHtml(l.id)}">
                <td style="text-align:center;"><input type="radio" name="curLayer" class="ly-cur" title="Draw new objects on this layer" ${lm.currentId === l.id ? 'checked' : ''}></td>
                <td style="text-align:center;"><input type="checkbox" class="ly-vis" title="Show / hide" ${l.visible ? 'checked' : ''}></td>
                <td style="text-align:center;"><input type="checkbox" class="ly-lock" title="Lock (visible, but cannot be picked or edited)" ${l.locked ? 'checked' : ''}></td>
                <td><input type="color" class="ly-color" value="${escapeHtml(l.color)}" style="width:34px; height:24px; padding:0; border:none; background:none;"></td>
                <td><input type="text" class="ly-name form-input" value="${escapeHtml(l.name)}" style="width:100%;"></td>
                <td style="text-align:right; color:var(--text-muted);">${counts[l.id] || 0}</td>
                <td style="text-align:center;">${l.builtin ? '' : '<button class="action-btn danger ly-del" style="padding:2px 8px;" title="Delete layer (its objects return to their default layers)">&#10005;</button>'}</td>
            </tr>`).join('');
        card.innerHTML = `
            <div class="modal-header">
                <div class="modal-title"><span style="font-size:20px;">&#9636;</span><span>Layers</span></div>
                <button class="modal-close-btn" id="layersClose" title="Close">&times;</button>
            </div>
            <div class="modal-body" style="max-height:60vh; overflow:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead><tr style="color:var(--text-muted); text-align:left;">
                        <th title="Current layer for new objects">Draw on</th><th>Show</th><th>Lock</th><th>Colour</th><th>Name</th><th style="text-align:right;">Objects</th><th></th></tr></thead>
                    <tbody>
                        <tr><td style="text-align:center;"><input type="radio" name="curLayer" class="ly-cur-none" ${lm.currentId === null ? 'checked' : ''}></td>
                            <td colspan="6" style="color:var(--text-muted);">By type &mdash; each new object goes on its own default layer</td></tr>
                        ${rows}
                    </tbody>
                </table>
                <div style="display:flex; gap:8px; margin-top:14px; align-items:center;">
                    <input type="text" id="newLayerName" class="form-input" placeholder="New layer name, e.g. Electrical" style="flex:1;">
                    <input type="color" id="newLayerColor" value="#f59e0b" style="width:38px; height:30px; padding:0; border:none; background:none;">
                    <button class="btn btn-primary" id="newLayerAdd">Add layer</button>
                </div>
                <p class="hint-text" style="margin-top:10px;">Hidden layers are not drawn, picked or exported. Locked layers are drawn but cannot be picked or edited. The colour is used for the layer in DXF export. Select objects and use the Layer box in Properties to move them to a layer.</p>
            </div>`;

        const changed = (redrawPanel = true) => { this.saveHistory(); this.requestRender(); if (redrawPanel) this.renderLayersPanel(); };
        const fail = (fn) => { try { fn(); } catch (err) { alert(err.message); this.renderLayersPanel(); } };
        card.querySelector('#layersClose').addEventListener('click', () => this.closeLayersPanel());
        card.querySelector('.ly-cur-none').addEventListener('change', () => { lm.setCurrent(null); changed(false); });
        card.querySelectorAll('tr[data-id]').forEach(tr => {
            const id = tr.dataset.id;
            tr.querySelector('.ly-cur').addEventListener('change', () => { lm.setCurrent(id); changed(false); });
            tr.querySelector('.ly-vis').addEventListener('change', (e) => { lm.setVisible(id, e.target.checked); this.clearSelection(); changed(false); });
            tr.querySelector('.ly-lock').addEventListener('change', (e) => { lm.setLocked(id, e.target.checked); this.clearSelection(); changed(false); });
            tr.querySelector('.ly-color').addEventListener('change', (e) => { lm.setColor(id, e.target.value); changed(false); });
            tr.querySelector('.ly-name').addEventListener('change', (e) => fail(() => { lm.rename(id, e.target.value); changed(); }));
            const del = tr.querySelector('.ly-del');
            if (del) del.addEventListener('click', () => fail(() => {
                const all = []; forEachObject(this, (c, o) => all.push(o));
                lm.remove(id, all); changed();
            }));
        });
        card.querySelector('#newLayerAdd').addEventListener('click', () => fail(() => {
            lm.add(card.querySelector('#newLayerName').value, card.querySelector('#newLayerColor').value); changed();
        }));
        card.querySelector('#newLayerName').addEventListener('keydown', (e) => { if (e.key === 'Enter') card.querySelector('#newLayerAdd').click(); e.stopPropagation(); });
    }
}
