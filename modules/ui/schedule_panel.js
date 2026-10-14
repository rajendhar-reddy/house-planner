/**
 * schedule_panel.js - the Schedules dialog (door/window/gate table and room table) with CSV download.
 * Mixed into HousePlannerApp, so `this` is the app. The tables are built by modules/schedules.js.
 */

import { escapeHtml } from '../util.js';
import { serializeProject } from '../serializer.js';
import { buildSchedules, schedulesToCSV } from '../schedules.js';
import { Exporter } from '../exporter.js';
import { units } from '../units.js';

export class SchedulePanelMethods {
    openSchedulePanel() {
        let modal = document.getElementById('scheduleModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal-backdrop';
            modal.id = 'scheduleModal';
            modal.innerHTML = '<div class="modal-card" style="max-width:820px; width:94vw;"><div id="scheduleCard"></div></div>';
            modal.addEventListener('mousedown', (e) => { if (e.target === modal) this.closeSchedulePanel(); });
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        this.renderSchedulePanel();
    }

    closeSchedulePanel() {
        const modal = document.getElementById('scheduleModal');
        if (modal) modal.style.display = 'none';
    }

    renderSchedulePanel() {
        const card = document.getElementById('scheduleCard');
        if (!card) return;
        const sched = buildSchedules(serializeProject(this));
        const th = 'style="text-align:left; padding:4px 8px; color:var(--text-muted); border-bottom:1px solid var(--border-color);"';
        const td = 'style="padding:4px 8px; border-bottom:1px solid rgba(148,163,184,0.12);"';
        const tdr = 'style="padding:4px 8px; text-align:right; border-bottom:1px solid rgba(148,163,184,0.12);"';

        const openingRows = sched.openings.map(o => `
            <tr><td ${td}><b>${escapeHtml(o.mark)}</b></td><td ${td}>${escapeHtml(o.description)}</td><td ${td}>${escapeHtml(o.widthText)}</td>
                <td ${tdr}>${o.qty}</td><td ${td} class="sch-floors">${escapeHtml(Object.entries(o.byFloor).map(([f, n]) => `${f}: ${n}`).join(', '))}</td></tr>`).join('')
            || `<tr><td ${td} colspan="5" style="color:var(--text-muted);">No doors, windows or gates drawn yet.</td></tr>`;
        const roomRows = sched.rooms.map(r => `
            <tr><td ${td}>${escapeHtml(r.floor)}</td><td ${td}>${escapeHtml(r.name)}${r.isVoid ? ' <i style="color:var(--text-muted)">(void, not counted)</i>' : ''}</td>
                <td ${td}>${escapeHtml(r.sizeText)}</td><td ${tdr}>${escapeHtml(r.areaText)}</td></tr>`).join('')
            || `<tr><td ${td} colspan="4" style="color:var(--text-muted);">No rooms drawn yet.</td></tr>`;
        const t = sched.totals;

        card.innerHTML = `
            <div class="modal-header">
                <div class="modal-title"><span style="font-size:20px;">&#9638;</span><span>Schedules</span></div>
                <button class="modal-close-btn" id="schClose" title="Close">&times;</button>
            </div>
            <div class="modal-body" style="max-height:66vh; overflow:auto;">
                <h4 style="margin:0 0 6px;">Door / Window / Gate schedule</h4>
                <table id="openingSchedule" style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead><tr><th ${th}>Mark</th><th ${th}>Description</th><th ${th}>Width</th><th ${th} style="text-align:right;">Qty</th><th ${th}>By floor</th></tr></thead>
                    <tbody>${openingRows}</tbody>
                </table>
                <p class="hint-text" style="margin:6px 0 16px;">Totals: ${t.doors} doors, ${t.windows} windows, ${t.gates} gates. Same size and type = one line.</p>

                <h4 style="margin:0 0 6px;">Room schedule</h4>
                <table id="roomSchedule" style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead><tr><th ${th}>Floor</th><th ${th}>Room</th><th ${th}>Size</th><th ${th} style="text-align:right;">Nominal area</th></tr></thead>
                    <tbody>${roomRows}</tbody>
                    <tfoot><tr><td ${td} colspan="3"><b>Total (${t.rooms} rooms)</b></td><td ${tdr}><b>${escapeHtml(units.formatArea(t.areaSqFt * 144).primary)}</b></td></tr></tfoot>
                </table>
                <p class="hint-text" style="margin-top:6px;">Nominal area is width &times; height as drawn; wall thickness is not deducted, so it is larger than the usable floor area.</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="schCopy">Copy as text</button>
                <button class="btn btn-primary" id="schCsv">&#11015; Download CSV</button>
            </div>`;

        card.querySelector('#schClose').addEventListener('click', () => this.closeSchedulePanel());
        card.querySelector('#schCsv').addEventListener('click', () => {
            Exporter.triggerDownload(new Blob([schedulesToCSV(sched)], { type: 'text/csv;charset=utf-8' }), 'schedules.csv');
        });
        card.querySelector('#schCopy').addEventListener('click', async () => {
            const text = schedulesToCSV(sched).replace(/^\uFEFF/, '').replace(/,/g, '\t');
            try { await navigator.clipboard.writeText(text); this.setAutosavePill('● Schedules copied', '#38bdf8'); }
            catch (e) { this.setAutosavePill('● Copy is blocked here - use Download CSV', '#f59e0b'); }
        });
    }
}
