/**
 * sheet_panel.js - the "Print at scale" dialog: choose paper, scale and area, see a preview, export a PDF/PNG that is
 * physically to scale. Mixed into HousePlannerApp, so `this` is the app. Maths in modules/sheet.js, drawing in sheet_render.js.
 */

import { escapeHtml } from '../util.js';
import { Exporter } from '../exporter.js';
import { PDFWriter } from '../pdf.js';
import { PAPERS, PAPER_IDS, STANDARD_SCALES, computeSheetLayout, scaleLabel, mmToPt } from '../sheet.js';
import { renderSheet, sheetRegion } from '../sheet_render.js';

export class SheetPanelMethods {
    openSheetPanel() {
        let modal = document.getElementById('sheetModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal-backdrop'; modal.id = 'sheetModal';
            modal.innerHTML = '<div class="modal-card" style="max-width:760px; width:94vw;"><div id="sheetCard"></div></div>';
            modal.addEventListener('mousedown', (e) => { if (e.target === modal) this.closeSheetPanel(); });
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        this.sheetOpts = this.sheetOpts || { paper: 'a3', orientation: 'landscape', scale: 100, area: 'drawing', style: 'clean' };
        this.renderSheetPanel();
    }

    closeSheetPanel() { const m = document.getElementById('sheetModal'); if (m) m.style.display = 'none'; }

    renderSheetPanel() {
        const card = document.getElementById('sheetCard');
        if (!card) return;
        const o = this.sheetOpts;
        card.innerHTML = `
            <div class="modal-header"><div class="modal-title"><span style="font-size:20px;">&#128209;</span><span>Print at scale</span></div><button class="modal-close-btn" id="shClose" title="Close">&times;</button></div>
            <div class="modal-body" style="max-height:72vh; overflow:auto;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px 14px;">
                    <div class="form-group"><label class="form-label">Paper</label><select class="form-select" id="shPaper">${PAPER_IDS.map(id => `<option value="${id}" ${o.paper === id ? 'selected' : ''}>${escapeHtml(PAPERS[id].name)}</option>`).join('')}</select></div>
                    <div class="form-group"><label class="form-label">Orientation</label><select class="form-select" id="shOrient"><option value="landscape" ${o.orientation === 'landscape' ? 'selected' : ''}>Landscape</option><option value="portrait" ${o.orientation === 'portrait' ? 'selected' : ''}>Portrait</option></select></div>
                    <div class="form-group"><label class="form-label">Scale</label><select class="form-select" id="shScale">${STANDARD_SCALES.map(s => `<option value="${s}" ${o.scale === s ? 'selected' : ''}>${escapeHtml(scaleLabel(s))}</option>`).join('')}<option value="custom" ${STANDARD_SCALES.includes(o.scale) ? '' : 'selected'}>Custom 1:${STANDARD_SCALES.includes(o.scale) ? '' : o.scale}</option></select></div>
                    <div class="form-group"><label class="form-label">Print</label><select class="form-select" id="shArea"><option value="drawing" ${o.area === 'drawing' ? 'selected' : ''}>The whole drawing</option><option value="view" ${o.area === 'view' ? 'selected' : ''}>What is on screen now</option></select></div>
                    <div class="form-group"><label class="form-label">Look</label><select class="form-select" id="shStyle"><option value="clean" ${o.style === 'clean' ? 'selected' : ''}>Clean (black on white)</option><option value="blueprint" ${o.style === 'blueprint' ? 'selected' : ''}>Blueprint</option></select></div>
                    <div class="form-group"><label class="form-label">Custom scale 1 :</label><input class="form-input" id="shCustom" type="number" min="1" max="5000" step="1" placeholder="e.g. 80" value="${STANDARD_SCALES.includes(o.scale) ? '' : o.scale}"></div>
                </div>
                <div id="shNote" class="hint-text" style="margin:8px 0;"></div>
                <div style="background:#334155; padding:8px; border-radius:6px; text-align:center;"><canvas id="shPreview" style="max-width:100%; background:#fff; box-shadow:0 4px 14px rgba(0,0,0,.5);"></canvas></div>
            </div>
            <div class="modal-footer"><button class="btn btn-secondary" id="shPng">Save PNG</button><button class="btn btn-primary" id="shPdf">&#11015; Download PDF at scale</button></div>`;

        const $ = (id) => card.querySelector(id);
        $('#shClose').addEventListener('click', () => this.closeSheetPanel());
        const read = () => {
            o.paper = $('#shPaper').value; o.orientation = $('#shOrient').value; o.area = $('#shArea').value; o.style = $('#shStyle').value;
            const custom = Number($('#shCustom').value), sel = $('#shScale').value;
            o.scale = custom > 0 && (sel === 'custom' || !STANDARD_SCALES.includes(Number(sel))) ? Math.round(custom) : (sel === 'custom' ? o.scale : Number(sel));
        };
        for (const id of ['#shPaper', '#shOrient', '#shArea', '#shStyle', '#shScale']) $(id).addEventListener('change', () => { read(); if (id === '#shScale') $('#shCustom').value = ''; this.refreshSheetPreview(); });
        $('#shCustom').addEventListener('input', () => { const v = Number($('#shCustom').value); if (v > 0) { $('#shScale').value = 'custom'; o.scale = Math.round(v); } this.refreshSheetPreview(); });
        $('#shPdf').addEventListener('click', () => this.exportSheet('pdf'));
        $('#shPng').addEventListener('click', () => this.exportSheet('png'));
        this.refreshSheetPreview();
    }

    /** Layout of the current choices (or an error text). */
    sheetLayoutNow() {
        const o = this.sheetOpts, region = sheetRegion(this, o.area);
        if (!region) return { error: 'There is nothing to print yet.' };
        try { return { layout: computeSheetLayout({ paper: o.paper, orientation: o.orientation, scale: o.scale, region }), region }; }
        catch (err) { return { error: err.message }; }
    }

    refreshSheetPreview() {
        const card = document.getElementById('sheetCard');
        if (!card) return;
        const note = card.querySelector('#shNote'), cv = card.querySelector('#shPreview');
        const pdf = card.querySelector('#shPdf'), png = card.querySelector('#shPng');
        const r = this.sheetLayoutNow();
        if (r.error) { note.innerHTML = `<span style="color:#f87171;">${escapeHtml(r.error)}</span>`; pdf.disabled = png.disabled = true; cv.width = cv.height = 0; return; }
        const L = r.layout, o = this.sheetOpts;
        const dw = (L.drawMm.w).toFixed(0), dh = (L.drawMm.h).toFixed(0);
        if (!L.fits) {
            note.innerHTML = `<span style="color:#f87171;">The drawing would be ${dw} &times; ${dh} mm at 1:${o.scale}, which does not fit the ${escapeHtml(PAPERS[o.paper].name)} drawing area (${L.area.w.toFixed(0)} &times; ${L.area.h.toFixed(0)} mm).</span> ${L.suggestedScale ? `<button class="action-btn" id="shSuggest" style="margin-left:6px;">Use 1:${L.suggestedScale}</button>` : 'Choose a larger sheet.'}`;
            card.querySelector('#shSuggest')?.addEventListener('click', () => { o.scale = L.suggestedScale; this.renderSheetPanel(); });
            pdf.disabled = png.disabled = true; cv.width = cv.height = 0; return;
        }
        note.innerHTML = `The drawing is <b>${dw} &times; ${dh} mm</b> on the sheet at <b>1:${o.scale}</b> &mdash; 100 mm on the paper = ${(o.scale / 10).toLocaleString('en-US')} m in real life. Print at 100% (not "fit to page").`;
        pdf.disabled = png.disabled = false;
        try { renderSheet(cv, this, { ...o, region: r.region, dpi: 60 }); } catch (err) { note.innerHTML = `<span style="color:#f87171;">${escapeHtml(err.message)}</span>`; }
    }

    exportSheet(kind) {
        const o = this.sheetOpts, r = this.sheetLayoutNow();
        if (r.error || !r.layout.fits) { alert(r.error || 'The drawing does not fit at this scale.'); return; }
        const cv = document.createElement('canvas');
        const title = (this.projectInfo && this.projectInfo.projectTitle ? this.projectInfo.projectTitle : 'house_plan').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'house_plan';
        const name = `${title}_${o.paper}_1-${o.scale}`;
        try { renderSheet(cv, this, { ...o, region: r.region, dpi: 200 }); }
        catch (err) { alert(err.message); return; }
        if (kind === 'png') { cv.toBlob((b) => Exporter.triggerDownload(b, `${name}.png`), 'image/png'); return; }
        PDFWriter.createPDFFromCanvas(cv, { pageSizePt: { w: mmToPt(r.layout.page.w), h: mmToPt(r.layout.page.h) }, fullPage: true, title: `${title} (1:${o.scale})`, quality: 0.95 })
            .then(blob => PDFWriter.download(blob, `${name}.pdf`))
            .catch(err => alert(err.message));
    }
}
