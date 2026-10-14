/**
 * annotation_panel.js - Properties panels for text notes, leaders and angular dimensions, plus the dimension-style row.
 * Mixed into HousePlannerApp, so `this` is the app.
 */

import { units } from '../units.js';
import { escapeHtml } from '../util.js';
import { DIM_STYLES, DIM_STYLE_IDS } from '../dimstyles.js';
import { angularGeometry } from '../annotations.js';

export class AnnotationPanelMethods {
    renderAnnotationInspector(panel) {
        const cat = this.selectedCategory, o = this.selectedObject;
        const title = { text: 'Text note', leader: 'Leader', angdim: 'Angular dimension' }[cat];
        const styleRow = (cat === 'angdim') ? `
            <div class="prop-row"><span class="prop-label">Style</span>
                <select id="annStyle" class="prop-input">${DIM_STYLE_IDS.map(id => `<option value="${id}" ${(o.dimStyle || 'standard') === id ? 'selected' : ''}>${escapeHtml(DIM_STYLES[id].name)}</option>`).join('')}</select></div>` : '';
        let body = '';
        if (cat === 'text' || cat === 'leader') {
            body = `
                <div class="prop-row" style="align-items:flex-start;"><span class="prop-label">Text</span>
                    <textarea id="annText" class="prop-input" rows="3" style="width:100%; resize:vertical;">${escapeHtml(o.text)}</textarea></div>
                <div class="prop-row"><span class="prop-label">Height</span><input type="text" id="annHeight" class="prop-input" value="${escapeHtml(units.formatLength(o.height))}"></div>`;
            if (cat === 'text') body += `
                <div class="prop-row"><span class="prop-label">Angle</span><input type="number" id="annRot" class="prop-input" value="${Math.round(o.rotation || 0)}" min="0" max="359"></div>
                <div class="prop-row"><span class="prop-label">Align</span>
                    <select id="annAlign" class="prop-input"><option value="left" ${o.align !== 'center' ? 'selected' : ''}>Left</option><option value="center" ${o.align === 'center' ? 'selected' : ''}>Centre</option></select></div>`;
        } else {
            const g = angularGeometry(o);
            body = `
                <div class="prop-row"><span class="prop-label">Angle</span><span class="prop-val">${g ? escapeHtml(o.label()) : '-'}</span></div>
                <div class="prop-row"><span class="prop-label">Arc radius</span><input type="text" id="annRadius" class="prop-input" value="${escapeHtml(units.formatLength(o.radius))}"></div>
                <div class="prop-row"><span class="prop-label">Own text</span><input type="text" id="annCustom" class="prop-input" value="${escapeHtml(o.customText || '')}" placeholder="blank = measured angle"></div>`;
        }
        panel.innerHTML = `
            <div class="inspector-section">
                <h3>${title}</h3>
                ${body}${styleRow}
                <button class="action-btn danger" id="deleteSelectedBtn" style="margin-top:12px; width:100%;">Delete ${title.toLowerCase()}</button>
            </div>`;

        const dist = (id) => { const v = units.parseInput(document.getElementById(id).value); return v !== null && v > 0 ? v : null; };
        const key = (n) => `${n}:${o.id}`;
        document.getElementById('annText')?.addEventListener('input', (e) => { o.text = e.target.value; this.saveHistoryCoalesced(key('annText')); this.requestRender(); });
        document.getElementById('annHeight')?.addEventListener('change', () => { const v = dist('annHeight'); if (v) { o.height = v; this.saveHistory(); this.requestRender(); } this.updateInspector(); });
        document.getElementById('annRot')?.addEventListener('change', (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) { o.rotation = ((v % 360) + 360) % 360; this.saveHistory(); this.requestRender(); } });
        document.getElementById('annAlign')?.addEventListener('change', (e) => { o.align = e.target.value; this.saveHistory(); this.requestRender(); });
        document.getElementById('annRadius')?.addEventListener('change', () => { const v = dist('annRadius'); if (v) { o.radius = v; this.saveHistory(); this.requestRender(); } this.updateInspector(); });
        document.getElementById('annCustom')?.addEventListener('input', (e) => { o.customText = e.target.value || null; this.saveHistoryCoalesced(key('annCustom')); this.requestRender(); });
        document.getElementById('annStyle')?.addEventListener('change', (e) => { if (e.target.value === 'standard') delete o.dimStyle; else o.dimStyle = e.target.value; this.saveHistory(); this.requestRender(); });
        document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
    }

    /** "Style" row under a selected linear dimension. */
    appendDimStyleSection(panel) {
        const o = this.selectedObject;
        if (!o) return;
        const div = document.createElement('div');
        div.className = 'inspector-section';
        div.innerHTML = `<h3>Dimension style</h3>
            <select id="dimStyleSelect" class="prop-input" style="width:100%;">${DIM_STYLE_IDS.map(id => `<option value="${id}" ${(o.dimStyle || 'standard') === id ? 'selected' : ''}>${escapeHtml(DIM_STYLES[id].name)}</option>`).join('')}</select>
            <p class="hint-text" style="margin-top:6px;">New dimensions use the style set with the DIMSTYLE command.</p>`;
        panel.appendChild(div);
        div.querySelector('#dimStyleSelect').addEventListener('change', (e) => {
            if (e.target.value === 'standard') delete o.dimStyle; else o.dimStyle = e.target.value;
            this.saveHistory(); this.requestRender();
        });
    }
}
