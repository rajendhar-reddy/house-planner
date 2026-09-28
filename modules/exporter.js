/**
 * exporter.js - Multi-Format Export Engine (PNG, SVG, DXF, JSON)
 */

import { units } from './units.js';
import { PDFWriter } from './pdf.js';

export class Exporter {
    /**
     * Export complete project state as downloadable JSON file
     */
    static exportJSON(projectState, filename = 'house_plan.json') {
        const jsonStr = JSON.stringify(projectState, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        this.triggerDownload(blob, filename);
    }

    /**
     * Export high-resolution PNG with Title Block
     */
    static exportPNG(canvas, projectState, options = {}) {
        const style = options.style || 'blueprint'; // 'blueprint' | 'clean'
        const title = options.title || 'RESIDENTIAL HOUSE PLAN';
        const client = options.client || 'Custom Plan';

        // Compute total project bounds
        let bounds;
        if (projectState.floorManager && projectState.floorManager.viewMode === 'side_by_side') {
            bounds = projectState.floorManager.getSideBySideTotalBounds();
        } else {
            bounds = this.getProjectBounds(projectState);
        }
        if (!bounds) {
            alert('No elements to export.');
            return;
        }

        // Padding around drawing in inches
        const pad = 48; // 4 feet
        const totalW = bounds.width + pad * 2;
        const totalH = bounds.height + pad * 2 + 80; // space for title block

        // Target image resolution: 3200px wide for print-ready ultra-sharp clarity
        const targetW = 3200;
        const exportScale = targetW / totalW;
        const targetH = Math.round(totalH * exportScale);

        const offCanvas = document.createElement('canvas');
        offCanvas.width = targetW;
        offCanvas.height = targetH;
        const ctx = offCanvas.getContext('2d');

        // Enable crisp high-quality rendering & smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Background
        if (style === 'blueprint') {
            ctx.fillStyle = '#0f172a'; // dark slate blueprint
        } else {
            ctx.fillStyle = '#ffffff'; // clean white paper
        }
        ctx.fillRect(0, 0, targetW, targetH);

        // Drawing transform
        ctx.save();
        ctx.scale(exportScale, exportScale);
        ctx.translate(-bounds.x + pad, -bounds.y + pad);

        // Render project layers
        if (projectState.floorManager && projectState.floorManager.viewMode === 'side_by_side') {
            if (projectState.roadManager && projectState.plotManager) {
                projectState.roadManager.render(ctx, exportScale, projectState.plotManager.getBounds(), true, style);
            }
            if (projectState.plotManager) {
                projectState.plotManager.render(ctx, exportScale, false, projectState.wallManager, style, true);
            }
            projectState.floorManager.render(ctx, exportScale, true, style);
        } else {
            if (projectState.roadManager && projectState.plotManager) {
                projectState.roadManager.render(ctx, exportScale, projectState.plotManager.getBounds(), true, style);
            }
            if (projectState.plotManager) {
                projectState.plotManager.render(ctx, exportScale, false, projectState.wallManager, style, true);
            }
            if (projectState.roomManager) {
                projectState.roomManager.render(ctx, exportScale, true, style);
            }
            if (projectState.stairManager) {
                projectState.stairManager.render(ctx, exportScale);
            }
            if (projectState.wallManager) {
                projectState.wallManager.render(ctx, exportScale, projectState.openingManager);
            }
            if (projectState.columnManager) {
                projectState.columnManager.render(ctx, exportScale, true, style);
            }
            if (projectState.openingManager) {
                projectState.openingManager.render(ctx, exportScale, projectState.wallManager);
            }
            if (projectState.furnitureManager) {
                projectState.furnitureManager.render(ctx, exportScale);
            }
            if (projectState.dimensionManager) {
                projectState.dimensionManager.render(ctx, exportScale, true, style);
            }
            if (projectState.floorManager) {
                const active = projectState.floorManager.getActiveFloor();
                if (active) {
                    projectState.floorManager.renderFloorTitleBanner(ctx, active, { x: 0, y: 0 }, exportScale, style === 'clean');
                }
            }
        }

        ctx.restore();

        // Render Architectural Title Block at bottom
        this.renderTitleBlock(ctx, targetW, targetH, style, title, client, projectState);

        // Download PNG
        offCanvas.toBlob((blob) => {
            if (blob) {
                this.triggerDownload(blob, `${title.toLowerCase().replace(/\s+/g, '_')}.png`);
            }
        }, 'image/png');
    }

    /**
     * Export Architectural PDF (Print-Ready A4, A3, A2, or Custom Fit)
     */
    static async exportPDF(projectState, options = {}) {
        const style = options.style || 'clean';
        const paperSize = options.paperSize || 'a4';
        const orientation = options.orientation || 'landscape';
        const title = options.title || (projectState.projectInfo ? projectState.projectInfo.projectTitle : 'RESIDENTIAL HOUSE PLAN');
        const client = options.client || (projectState.projectInfo ? projectState.projectInfo.clientName : 'Custom Plan');
        const filename = options.filename || `${title.toLowerCase().replace(/\s+/g, '_')}.pdf`;

        const renderW = (paperSize === 'a3' || paperSize === 'a2') ? 4000 : 3200;
        const offCanvas = document.createElement('canvas');
        const rendered = this.renderToCanvas(offCanvas, projectState, {
            style,
            title,
            client,
            width: renderW
        });

        if (!rendered) {
            alert('No elements to export.');
            return null;
        }

        try {
            const pdfBlob = await PDFWriter.createPDFFromCanvas(offCanvas, {
                paperSize,
                orientation,
                title,
                client,
                drawBorder: options.drawBorder !== false
            });

            if (options.download !== false) {
                PDFWriter.download(pdfBlob, filename);
            }
            return { blob: pdfBlob, filename, canvas: offCanvas };
        } catch (err) {
            console.error('PDF Export Error:', err);
            alert('Failed to generate PDF: ' + err.message);
            return null;
        }
    }

    /**
     * Render full architectural drawing sheet onto a specified canvas
     */
    static renderToCanvas(targetCanvas, projectState, options = {}) {
        const style = options.style || 'clean';
        const title = options.title || 'RESIDENTIAL HOUSE PLAN';
        const client = options.client || 'Custom Plan';

        let bounds;
        if (projectState.floorManager && projectState.floorManager.viewMode === 'side_by_side') {
            bounds = projectState.floorManager.getSideBySideTotalBounds();
        } else {
            bounds = this.getProjectBounds(projectState);
        }
        if (!bounds) return null;

        const pad = 48;
        const totalW = bounds.width + pad * 2;
        const totalH = bounds.height + pad * 2 + 80;

        const targetW = options.width || 2800;
        const exportScale = targetW / totalW;
        const targetH = Math.round(totalH * exportScale);

        targetCanvas.width = targetW;
        targetCanvas.height = targetH;
        const ctx = targetCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        if (style === 'blueprint') {
            ctx.fillStyle = '#0f172a';
        } else {
            ctx.fillStyle = '#ffffff';
        }
        ctx.fillRect(0, 0, targetW, targetH);

        ctx.save();
        ctx.scale(exportScale, exportScale);
        ctx.translate(-bounds.x + pad, -bounds.y + pad);

        if (projectState.floorManager && projectState.floorManager.viewMode === 'side_by_side') {
            if (projectState.roadManager && projectState.plotManager) {
                projectState.roadManager.render(ctx, exportScale, projectState.plotManager.getBounds(), true, style);
            }
            if (projectState.plotManager) {
                projectState.plotManager.render(ctx, exportScale, false, projectState.wallManager, style, true);
            }
            projectState.floorManager.render(ctx, exportScale, true, style);
        } else {
            if (projectState.roadManager && projectState.plotManager) {
                projectState.roadManager.render(ctx, exportScale, projectState.plotManager.getBounds(), true, style);
            }
            if (projectState.plotManager) {
                projectState.plotManager.render(ctx, exportScale, false, projectState.wallManager, style, true);
            }
            if (projectState.roomManager) {
                projectState.roomManager.render(ctx, exportScale, true, style);
            }
            if (projectState.stairManager) {
                projectState.stairManager.render(ctx, exportScale);
            }
            if (projectState.wallManager) {
                projectState.wallManager.render(ctx, exportScale, projectState.openingManager, style);
            }
            if (projectState.columnManager) {
                projectState.columnManager.render(ctx, exportScale, true, style);
            }
            if (projectState.openingManager) {
                projectState.openingManager.render(ctx, exportScale, projectState.wallManager);
            }
            if (projectState.furnitureManager) {
                projectState.furnitureManager.render(ctx, exportScale);
            }
            if (projectState.dimensionManager) {
                projectState.dimensionManager.render(ctx, exportScale, true, style);
            }
            if (projectState.floorManager) {
                const active = projectState.floorManager.getActiveFloor();
                if (active) {
                    projectState.floorManager.renderFloorTitleBanner(ctx, active, { x: 0, y: 0 }, exportScale, style === 'clean');
                }
            }
        }

        ctx.restore();

        this.renderTitleBlock(ctx, targetW, targetH, style, title, client, projectState);
        return targetCanvas;
    }

    /**
     * Render Title Block at bottom of exported drawing
     */
    static renderTitleBlock(ctx, width, height, style, title, client, projectState) {
        if (projectState && projectState.projectInfo && typeof projectState.projectInfo.renderTitleBlock === 'function') {
            projectState.projectInfo.renderTitleBlock(ctx, width, height, style, projectState);
            return;
        }

        const tbScale = width / 2400;
        const tbHeight = Math.round(96 * tbScale);
        const y = height - tbHeight - Math.round(18 * tbScale);
        const x = Math.round(24 * tbScale);
        const w = width - x * 2;

        ctx.save();
        const isDark = style === 'blueprint';
        ctx.fillStyle = isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(241, 245, 249, 0.95)';
        ctx.fillRect(x, y, w, tbHeight);

        ctx.strokeStyle = isDark ? '#38bdf8' : '#0284c7';
        ctx.lineWidth = Math.max(2, Math.round(2 * tbScale));
        ctx.strokeRect(x, y, w, tbHeight);

        // Columns
        const col1 = x + Math.round(24 * tbScale);
        const col2 = x + w * 0.45;
        const col3 = x + w * 0.75;

        // Column 1: Title & Client
        ctx.font = `bold ${Math.round(22 * tbScale)}px sans-serif`;
        ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
        ctx.fillText(title.toUpperCase(), col1, y + Math.round(38 * tbScale));

        ctx.font = `${Math.round(14 * tbScale)}px sans-serif`;
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.fillText(`Client / Project: ${client}`, col1, y + Math.round(68 * tbScale));

        // Column 2: Date & Unit System
        const today = new Date().toLocaleDateString();
        ctx.fillText(`Date: ${today}`, col2, y + Math.round(38 * tbScale));
        ctx.fillText(`Units: ${units.getSystem().toUpperCase()}`, col2, y + Math.round(68 * tbScale));

        // Column 3: Area details
        let plotAreaText = 'N/A';
        if (projectState.plotManager && projectState.plotManager.plot) {
            plotAreaText = units.formatArea(projectState.plotManager.getArea()).primary;
        }
        ctx.font = `bold ${Math.round(15 * tbScale)}px sans-serif`;
        ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
        ctx.fillText(`Plot Area: ${plotAreaText}`, col3, y + Math.round(38 * tbScale));

        ctx.font = `${Math.round(13 * tbScale)}px sans-serif`;
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.fillText('Generated with 2D House Planner CAD', col3, y + Math.round(68 * tbScale));

        ctx.restore();
    }

    /**
     * Export vector SVG markup
     */
    static exportSVG(projectState, filename = 'house_plan.svg') {
        const bounds = this.getProjectBounds(projectState);
        if (!bounds) return;

        const pad = 48;
        const minX = bounds.x - pad;
        const minY = bounds.y - pad;
        const width = bounds.width + pad * 2;
        const height = bounds.height + pad * 2;

        let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">\n`;
        svg += `<style>
            .plot { stroke: #eab308; stroke-width: 2; fill: rgba(234, 179, 8, 0.05); stroke-dasharray: 8, 4; }
            .wall-ext { fill: #334155; stroke: #0f172a; stroke-width: 1.5; }
            .wall-int { fill: #475569; stroke: #1e293b; stroke-width: 1.5; }
            .opening { stroke: #38bdf8; stroke-width: 1.5; fill: none; }
            .room-text { font-family: sans-serif; font-size: 14px; font-weight: bold; fill: #0f172a; text-anchor: middle; }
            .dim-text { font-family: sans-serif; font-size: 11px; font-weight: 600; fill: #334155; text-anchor: middle; }
        </style>\n`;

        // Background
        svg += `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f8fafc" />\n`;

        // 0. Roads Layer
        if (projectState.roadManager && projectState.plotManager && projectState.plotManager.plot) {
            const pb = projectState.plotManager.getBounds();
            if (pb && projectState.roadManager.roads.length > 0) {
                svg += `<g id="roads">\n`;
                for (const r of projectState.roadManager.roads) {
                    const g = r.getGeometry(pb);
                    if (g && g.bounds) {
                        const b = g.bounds;
                        const cl = g.centerLine;
                        svg += `  <rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#475569" opacity="0.3" stroke="#64748b" stroke-width="1.5" />\n`;
                        svg += `  <line x1="${cl.x1}" y1="${cl.y1}" x2="${cl.x2}" y2="${cl.y2}" stroke="#eab308" stroke-width="1.5" stroke-dasharray="12, 8" />\n`;
                    }
                }
                svg += `</g>\n`;
            }
        }

        // 1. Plot Layer
        if (projectState.plotManager && projectState.plotManager.plot) {
            const v = projectState.plotManager.plot.vertices;
            const pts = v.map(p => `${p.x},${p.y}`).join(' ');
            svg += `<g id="plot"><polygon points="${pts}" class="plot" /></g>\n`;
        }

        // 2. Walls Layer
        if (projectState.wallManager) {
            svg += `<g id="walls">\n`;
            for (const wall of projectState.wallManager.walls) {
                const p = wall.getPolygon();
                if (p.length === 4) {
                    const cls = wall.type === 'exterior' ? 'wall-ext' : 'wall-int';
                    svg += `<polygon points="${p[0].x},${p[0].y} ${p[1].x},${p[1].y} ${p[2].x},${p[2].y} ${p[3].x},${p[3].y}" class="${cls}" />\n`;
                }
            }
            svg += `</g>\n`;
        }

        // 2b. Columns Layer
        if (projectState.columnManager && projectState.columnManager.columns.length > 0) {
            svg += `<g id="columns">\n`;
            for (const col of projectState.columnManager.columns) {
                const pts = col.getPolygon();
                const polyStr = pts.map(p => `${p.x},${p.y}`).join(' ');
                svg += `  <polygon points="${polyStr}" fill="#0f172a" stroke="#000000" stroke-width="1.5" />\n`;
                svg += `  <line x1="${pts[0].x}" y1="${pts[0].y}" x2="${pts[2].x}" y2="${pts[2].y}" stroke="#ffffff" stroke-width="0.8" opacity="0.6" />\n`;
                svg += `  <line x1="${pts[1].x}" y1="${pts[1].y}" x2="${pts[3].x}" y2="${pts[3].y}" stroke="#ffffff" stroke-width="0.8" opacity="0.6" />\n`;
                if (col.showLabel) {
                    svg += `  <text x="${col.x}" y="${col.y + col.depth / 2 + 10}" font-family="sans-serif" font-size="9" font-weight="bold" fill="#0f172a" text-anchor="middle">${col.name}</text>\n`;
                }
            }
            svg += `</g>\n`;
        }

        // 3. Rooms Layer
        if (projectState.roomManager) {
            svg += `<g id="rooms">\n`;
            for (const r of projectState.roomManager.rooms) {
                const metrics = r.getBadgeMetrics(1.0, false);
                const areaSqInches = r.getArea();
                const areaFormatted = units.formatArea(areaSqInches);
                const dimFormatted = `${units.formatLength(r.width)} × ${units.formatLength(r.height)}`;
                const rot = r.rotation || 0;
                const rotAttr = rot ? ` transform="rotate(${rot} ${r.x} ${r.y})"` : '';
                const hw = metrics.badgeW / 2;
                const hh = metrics.badgeH / 2;

                svg += `  <g${rotAttr}>\n`;
                svg += `    <rect x="${r.x - hw}" y="${r.y - hh}" width="${metrics.badgeW}" height="${metrics.badgeH}" rx="4" fill="rgba(15, 23, 42, 0.92)" stroke="#38bdf8" stroke-width="1" />\n`;

                if (metrics.linesCount === 3) {
                    svg += `    <text x="${r.x}" y="${r.y - metrics.lineSpacing * 1.05}" font-family="sans-serif" font-size="${Math.round(metrics.titleSize)}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${(r.name || 'Room').toUpperCase()}</text>\n`;
                    svg += `    <text x="${r.x}" y="${r.y}" font-family="sans-serif" font-size="${Math.round(metrics.subSize)}" font-weight="600" fill="#f1f5f9" text-anchor="middle" dominant-baseline="central">${dimFormatted}</text>\n`;
                    svg += `    <text x="${r.x}" y="${r.y + metrics.lineSpacing * 1.05}" font-family="sans-serif" font-size="${Math.round(metrics.subSize)}" font-weight="600" fill="#38bdf8" text-anchor="middle" dominant-baseline="central">${areaFormatted.primary}</text>\n`;
                } else if (metrics.linesCount === 2) {
                    const secondText = metrics.showDim ? dimFormatted : areaFormatted.primary;
                    const secondColor = metrics.showDim ? '#f1f5f9' : '#38bdf8';
                    svg += `    <text x="${r.x}" y="${r.y - metrics.lineSpacing * 0.55}" font-family="sans-serif" font-size="${Math.round(metrics.titleSize)}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${(r.name || 'Room').toUpperCase()}</text>\n`;
                    svg += `    <text x="${r.x}" y="${r.y + metrics.lineSpacing * 0.55}" font-family="sans-serif" font-size="${Math.round(metrics.subSize)}" font-weight="600" fill="${secondColor}" text-anchor="middle" dominant-baseline="central">${secondText}</text>\n`;
                } else {
                    svg += `    <text x="${r.x}" y="${r.y}" font-family="sans-serif" font-size="${Math.round(metrics.titleSize)}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${(r.name || 'Room').toUpperCase()}</text>\n`;
                }
                svg += `  </g>\n`;
            }
            svg += `</g>\n`;
        }

        // 4. Stairs Layer
        if (projectState.stairManager) {
            svg += `<g id="stairs">\n`;
            for (const s of projectState.stairManager.stairs) {
                const dim = s.getLocalDimensions();
                svg += `  <g transform="translate(${s.x}, ${s.y}) rotate(${s.rotation})">\n`;
                svg += `    <rect x="${-dim.width / 2}" y="${-dim.height / 2}" width="${dim.width}" height="${dim.height}" fill="#334155" fill-opacity="0.4" stroke="#94a3b8" stroke-width="2" />\n`;
                svg += `    <text x="0" y="0" font-family="sans-serif" font-size="10" font-weight="bold" fill="#38bdf8" text-anchor="middle">STAIRS (${s.treads} STEPS)</text>\n`;
                svg += `  </g>\n`;
            }
            svg += `</g>\n`;
        }

        svg += `</svg>`;

        const blob = new Blob([svg], { type: 'image/svg+xml' });
        this.triggerDownload(blob, filename);
    }

    /**
     * Export AutoCAD DXF Format (ASCII DXF R12 standard)
     */
    static exportDXF(projectState, filename = 'house_plan.dxf') {
        let dxf = '';
        // Header
        dxf += '0\nSECTION\n2\nHEADER\n';
        dxf += '9\n$ACADVER\n1\nAC1009\n'; // AutoCAD R12
        dxf += '0\nENDSEC\n';

        // Tables: Layers
        dxf += '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n8\n';
        const layers = ['ROADS', 'PLOT', 'COLUMNS', 'STAIRS', 'WALLS_EXTERIOR', 'WALLS_INTERIOR', 'WALLS_COMPOUND', 'DOORS', 'WINDOWS', 'GATES', 'LANDSCAPE', 'FURNITURE', 'DIMENSIONS'];
        for (const lyr of layers) {
            dxf += '0\nLAYER\n2\n' + lyr + '\n70\n0\n62\n7\n6\nCONTINUOUS\n';
        }
        dxf += '0\nENDTAB\n0\nENDSEC\n';

        // Entities section
        dxf += '0\nSECTION\n2\nENTITIES\n';

        // Roads
        if (projectState.roadManager && projectState.plotManager && projectState.plotManager.plot) {
            const pb = projectState.plotManager.getBounds();
            if (pb) {
                for (const r of projectState.roadManager.roads) {
                    const g = r.getGeometry(pb);
                    if (g && g.bounds) {
                        const b = g.bounds;
                        const pts = [
                            { x: b.x, y: b.y },
                            { x: b.x + b.width, y: b.y },
                            { x: b.x + b.width, y: b.y + b.height },
                            { x: b.x, y: b.y + b.height }
                        ];
                        for (let i = 0; i < 4; i++) {
                            const p1 = pts[i];
                            const p2 = pts[(i + 1) % 4];
                            dxf += `0\nLINE\n8\nROADS\n10\n${p1.x}\n20\n${-p1.y}\n30\n0.0\n11\n${p2.x}\n21\n${-p2.y}\n31\n0.0\n`;
                        }
                    }
                }
            }
        }

        // Columns
        if (projectState.columnManager && projectState.columnManager.columns.length > 0) {
            for (const col of projectState.columnManager.columns) {
                const pts = col.getPolygon();
                for (let i = 0; i < pts.length; i++) {
                    const p1 = pts[i];
                    const p2 = pts[(i + 1) % pts.length];
                    dxf += `0\nLINE\n8\nCOLUMNS\n10\n${p1.x}\n20\n${-p1.y}\n30\n0.0\n11\n${p2.x}\n21\n${-p2.y}\n31\n0.0\n`;
                }
                // Structural cross lines
                dxf += `0\nLINE\n8\nCOLUMNS\n10\n${pts[0].x}\n20\n${-pts[0].y}\n30\n0.0\n11\n${pts[2].x}\n21\n${-pts[2].y}\n31\n0.0\n`;
                dxf += `0\nLINE\n8\nCOLUMNS\n10\n${pts[1].x}\n20\n${-pts[1].y}\n30\n0.0\n11\n${pts[3].x}\n21\n${-pts[3].y}\n31\n0.0\n`;
            }
        }

        // Stairs
        if (projectState.stairManager) {
            for (const s of projectState.stairManager.stairs) {
                const b = s.getBounds();
                const pts = [
                    { x: b.x, y: b.y },
                    { x: b.x + b.width, y: b.y },
                    { x: b.x + b.width, y: b.y + b.height },
                    { x: b.x, y: b.y + b.height }
                ];
                for (let i = 0; i < 4; i++) {
                    const p1 = pts[i];
                    const p2 = pts[(i + 1) % 4];
                    dxf += `0\nLINE\n8\nSTAIRS\n10\n${p1.x}\n20\n${-p1.y}\n30\n0.0\n11\n${p2.x}\n21\n${-p2.y}\n31\n0.0\n`;
                }
            }
        }

        // Plot
        if (projectState.plotManager && projectState.plotManager.plot) {
            const v = projectState.plotManager.plot.vertices;
            for (let i = 0; i < v.length; i++) {
                const p1 = v[i];
                const p2 = v[(i + 1) % v.length];
                dxf += `0\nLINE\n8\nPLOT\n10\n${p1.x}\n20\n${-p1.y}\n30\n0.0\n11\n${p2.x}\n21\n${-p2.y}\n31\n0.0\n`;
            }
        }

        // Walls
        if (projectState.wallManager) {
            for (const wall of projectState.wallManager.walls) {
                const layer = wall.type === 'exterior' ? 'WALLS_EXTERIOR' : (wall.type === 'compound' ? 'WALLS_COMPOUND' : 'WALLS_INTERIOR');
                // Centerline
                dxf += `0\nLINE\n8\n${layer}\n10\n${wall.start.x}\n20\n${-wall.start.y}\n30\n0.0\n11\n${wall.end.x}\n21\n${-wall.end.y}\n31\n0.0\n`;
            }
        }

        // Openings (Doors / Windows / Gates)
        if (projectState.openingManager && projectState.wallManager) {
            for (const op of projectState.openingManager.openings) {
                const wall = projectState.wallManager.getWallById(op.wallId);
                if (!wall) continue;
                const geom = op.getGeometry(wall);
                if (!geom) continue;
                const layer = op.type === 'gate' ? 'GATES' : (op.type === 'door' ? 'DOORS' : 'WINDOWS');
                dxf += `0\nLINE\n8\n${layer}\n10\n${geom.center.x - op.width / 2}\n20\n${-geom.center.y}\n30\n0.0\n11\n${geom.center.x + op.width / 2}\n21\n${-geom.center.y}\n31\n0.0\n`;
            }
        }

        // Furniture & Landscape
        if (projectState.furnitureManager && projectState.furnitureManager.items) {
            const landscapeTypes = ['tree_deciduous', 'tree_palm', 'shrub_bush', 'planter_box', 'lawn_patch', 'driveway_pavers', 'car_suv', 'motorcycle'];
            for (const item of projectState.furnitureManager.items) {
                const layer = landscapeTypes.includes(item.type) ? 'LANDSCAPE' : 'FURNITURE';
                const b = item.getBounds ? item.getBounds() : { x: item.x - (item.width || 24)/2, y: item.y - (item.height || 24)/2, width: item.width || 24, height: item.height || 24 };
                const pts = [
                    { x: b.x, y: b.y },
                    { x: b.x + b.width, y: b.y },
                    { x: b.x + b.width, y: b.y + b.height },
                    { x: b.x, y: b.y + b.height }
                ];
                for (let i = 0; i < 4; i++) {
                    const p1 = pts[i];
                    const p2 = pts[(i + 1) % 4];
                    dxf += `0\nLINE\n8\n${layer}\n10\n${p1.x}\n20\n${-p1.y}\n30\n0.0\n11\n${p2.x}\n21\n${-p2.y}\n31\n0.0\n`;
                }
            }
        }

        // Dimensions
        if (projectState.dimensionManager) {
            for (const dim of projectState.dimensionManager.dimensions) {
                const geom = dim.getGeometry();
                if (geom) {
                    dxf += `0\nLINE\n8\nDIMENSIONS\n10\n${geom.p1.x}\n20\n${-geom.p1.y}\n30\n0.0\n11\n${geom.p2.x}\n21\n${-geom.p2.y}\n31\n0.0\n`;
                }
            }
        }

        // End Entities & File
        dxf += '0\nENDSEC\n0\nEOF\n';

        const blob = new Blob([dxf], { type: 'application/dxf' });
        this.triggerDownload(blob, filename);
    }

    /**
     * Compute bounding box enclosing all project objects
     */
    static getProjectBounds(projectState) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasElements = false;

        if (projectState.plotManager && projectState.plotManager.plot) {
            const b = (typeof projectState.plotManager.getBoundsWithDimensions === 'function')
                ? projectState.plotManager.getBoundsWithDimensions()
                : projectState.plotManager.getBounds();
            if (b) {
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
                hasElements = true;
            }
        }

        if (projectState.wallManager && projectState.wallManager.walls) {
            for (const w of projectState.wallManager.walls) {
                minX = Math.min(minX, w.start.x, w.end.x);
                minY = Math.min(minY, w.start.y, w.end.y);
                maxX = Math.max(maxX, w.start.x, w.end.x);
                maxY = Math.max(maxY, w.start.y, w.end.y);
                hasElements = true;
            }
        }

        if (projectState.columnManager && projectState.columnManager.columns) {
            for (const c of projectState.columnManager.columns) {
                const b = c.getBounds();
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
                hasElements = true;
            }
        }

        if (projectState.roomManager && projectState.roomManager.rooms) {
            for (const r of projectState.roomManager.rooms) {
                const b = r.getBounds();
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
                hasElements = true;
            }
        }

        if (projectState.stairManager && projectState.stairManager.stairs) {
            for (const s of projectState.stairManager.stairs) {
                const b = s.getBounds();
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
                hasElements = true;
            }
        }

        if (projectState.roadManager && projectState.roadManager.roads.length > 0 && projectState.plotManager && projectState.plotManager.plot) {
            const pb = projectState.plotManager.getBounds();
            if (pb) {
                for (const r of projectState.roadManager.roads) {
                    const g = r.getGeometry(pb);
                    if (g && g.bounds) {
                        minX = Math.min(minX, g.bounds.x);
                        minY = Math.min(minY, g.bounds.y);
                        maxX = Math.max(maxX, g.bounds.x + g.bounds.width);
                        maxY = Math.max(maxY, g.bounds.y + g.bounds.height);
                        hasElements = true;
                    }
                }
            }
        }

        if (projectState.furnitureManager && projectState.furnitureManager.items) {
            for (const f of projectState.furnitureManager.items) {
                const b = f.getBounds ? f.getBounds() : { x: f.x - (f.width || 24) / 2, y: f.y - (f.height || 24) / 2, width: f.width || 24, height: f.height || 24 };
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
                hasElements = true;
            }
        }

        if (!hasElements) return null;

        return {
            x: minX,
            y: minY,
            width: Math.max(maxX - minX, 100),
            height: Math.max(maxY - minY, 100)
        };
    }

    static triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
