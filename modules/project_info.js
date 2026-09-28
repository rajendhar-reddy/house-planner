/**
 * project_info.js - Executive CAD Project Title Block & Engineering Stamp
 * Manages project metadata, client info, architectural firm registration,
 * drawing numbers, dates, scale text, and title block rendering.
 */

import { units } from './units.js';

export class ProjectInfoManager {
    constructor(data = {}) {
        this.projectTitle = data.projectTitle || 'PROPOSED RESIDENTIAL BUILDING (G+1)';
        this.drawingTitle = data.drawingTitle || 'GROUND & FIRST FLOOR ARCHITECTURAL PLAN';
        this.clientName = data.clientName || 'Sri. K. Ramesh & Family';
        this.siteDetails = data.siteDetails || 'Plot #42, Royal Palms Layout, Bengaluru';
        this.architectFirm = data.architectFirm || 'Nirman Engineers & Architectural Studio';
        this.engineerRegNo = data.engineerRegNo || 'COA / BBMP Reg. #10482';
        this.drawingNumber = data.drawingNumber || 'DWG-01 / SHT 1';
        this.scaleText = data.scaleText || '1 : 100 / As Shown';
        this.date = data.date || new Date().toLocaleDateString();
        this.northAngle = data.northAngle || 0;
    }

    serialize() {
        return {
            projectTitle: this.projectTitle,
            drawingTitle: this.drawingTitle,
            clientName: this.clientName,
            siteDetails: this.siteDetails,
            architectFirm: this.architectFirm,
            engineerRegNo: this.engineerRegNo,
            drawingNumber: this.drawingNumber,
            scaleText: this.scaleText,
            date: this.date,
            northAngle: this.northAngle
        };
    }

    deserialize(data) {
        if (!data) return;
        this.projectTitle = data.projectTitle || this.projectTitle;
        this.drawingTitle = data.drawingTitle || this.drawingTitle;
        this.clientName = data.clientName || this.clientName;
        this.siteDetails = data.siteDetails || this.siteDetails;
        this.architectFirm = data.architectFirm || this.architectFirm;
        this.engineerRegNo = data.engineerRegNo || this.engineerRegNo;
        this.drawingNumber = data.drawingNumber || this.drawingNumber;
        this.scaleText = data.scaleText || this.scaleText;
        this.date = data.date || this.date;
        this.northAngle = data.northAngle !== undefined ? data.northAngle : this.northAngle;
    }

    /**
     * Render professional Executive Title Block Stamp onto an export canvas
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width Sheet width in pixels
     * @param {number} height Sheet height in pixels
     * @param {string} style 'clean' | 'blueprint'
     * @param {Object} projectState
     */
    renderTitleBlock(ctx, width, height, style = 'clean', projectState = {}) {
        const isClean = style === 'clean';
        const tbScale = width / 2400;
        const tbHeight = Math.round(112 * tbScale);
        const marginX = Math.round(24 * tbScale);
        const marginY = Math.round(20 * tbScale);
        const y = height - tbHeight - marginY;
        const w = width - marginX * 2;

        ctx.save();

        // 1. Title block background
        ctx.fillStyle = isClean ? '#ffffff' : 'rgba(15, 23, 42, 0.96)';
        ctx.fillRect(marginX, y, w, tbHeight);

        // 2. Outer border
        ctx.strokeStyle = isClean ? '#0f172a' : '#38bdf8';
        ctx.lineWidth = Math.max(2, Math.round(2.5 * tbScale));
        ctx.strokeRect(marginX, y, w, tbHeight);

        // 3. Grid Columns
        // Col 1: Firm & Registration (26% width)
        // Col 2: Project & Drawing Title (36% width)
        // Col 3: Client & Location (20% width)
        // Col 4: Sheet #, Scale & Date (18% width)
        const col1W = w * 0.26;
        const col2W = w * 0.36;
        const col3W = w * 0.20;
        const col4W = w - (col1W + col2W + col3W);

        const x1 = marginX;
        const x2 = x1 + col1W;
        const x3 = x2 + col2W;
        const x4 = x3 + col3W;

        // Divider lines
        ctx.strokeStyle = isClean ? 'rgba(15, 23, 42, 0.25)' : 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = Math.max(1, Math.round(1.2 * tbScale));
        [x2, x3, x4].forEach(divX => {
            ctx.beginPath();
            ctx.moveTo(divX, y);
            ctx.lineTo(divX, y + tbHeight);
            ctx.stroke();
        });

        // Horizontal sub-divider in Col 4
        ctx.beginPath();
        ctx.moveTo(x4, y + tbHeight * 0.50);
        ctx.lineTo(x4 + col4W, y + tbHeight * 0.50);
        ctx.stroke();

        // Typography settings
        ctx.textBaseline = 'middle';

        // ================= COLUMN 1: ARCHITECT / ENGINEERING FIRM =================
        const pad = Math.round(16 * tbScale);
        ctx.textAlign = 'left';

        // Engineering stamp icon / emblem
        ctx.fillStyle = isClean ? '#0284c7' : '#38bdf8';
        ctx.font = `bold ${Math.round(11 * tbScale)}px sans-serif`;
        ctx.fillText('ENGINEERING & ARCHITECTURAL CONSULTANT', x1 + pad, y + Math.round(24 * tbScale));

        ctx.font = `bold ${Math.round(17 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#0f172a' : '#f8fafc';
        ctx.fillText(this.architectFirm.toUpperCase(), x1 + pad, y + Math.round(52 * tbScale));

        ctx.font = `${Math.round(12 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#64748b' : '#94a3b8';
        ctx.fillText(`Reg: ${this.engineerRegNo}`, x1 + pad, y + Math.round(82 * tbScale));

        // ================= COLUMN 2: PROJECT & DRAWING TITLE =================
        ctx.font = `bold ${Math.round(11 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#0284c7' : '#38bdf8';
        ctx.fillText('PROJECT TITLE', x2 + pad, y + Math.round(24 * tbScale));

        ctx.font = `bold ${Math.round(18 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#0f172a' : '#f8fafc';
        ctx.fillText(this.projectTitle.toUpperCase(), x2 + pad, y + Math.round(52 * tbScale));

        ctx.font = `600 ${Math.round(13 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#334155' : '#cbd5e1';
        ctx.fillText(this.drawingTitle, x2 + pad, y + Math.round(82 * tbScale));

        // ================= COLUMN 3: CLIENT & SITE DETAILS =================
        ctx.font = `bold ${Math.round(11 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#0284c7' : '#38bdf8';
        ctx.fillText('CLIENT & SITE', x3 + pad, y + Math.round(24 * tbScale));

        ctx.font = `bold ${Math.round(14 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#0f172a' : '#f8fafc';
        ctx.fillText(this.clientName, x3 + pad, y + Math.round(50 * tbScale));

        ctx.font = `${Math.round(11 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#64748b' : '#94a3b8';
        ctx.fillText(this.siteDetails, x3 + pad, y + Math.round(76 * tbScale));

        // ================= COLUMN 4: DWG NUMBER, DATE, SCALE =================
        // Top half: Drawing Number
        ctx.font = `bold ${Math.round(10 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#64748b' : '#94a3b8';
        ctx.fillText('DWG NO.', x4 + pad, y + Math.round(16 * tbScale));

        ctx.font = `bold ${Math.round(17 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#0284c7' : '#38bdf8';
        ctx.fillText(this.drawingNumber, x4 + pad, y + Math.round(36 * tbScale));

        // Bottom half: Date & Scale
        ctx.font = `${Math.round(11 * tbScale)}px sans-serif`;
        ctx.fillStyle = isClean ? '#334155' : '#cbd5e1';
        ctx.fillText(`Scale: ${this.scaleText}`, x4 + pad, y + Math.round(68 * tbScale));
        ctx.fillText(`Date: ${this.date}`, x4 + pad, y + Math.round(92 * tbScale));

        ctx.restore();
    }
}
