/**
 * canvas.js - High-DPI Infinite Viewport & Snapping Engine
 */

import { units, UnitSystem } from './units.js';
import { computeSnap, DEFAULT_SNAP_MODES } from './snap.js';

export class CanvasEngine {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');

        // Viewport state (scale: screen px per world inch)
        // e.g. 1 ft = 12 inches -> at scale 1.0, 1 ft = 12 px. At scale 2.5, 1 ft = 30 px.
        this.scale = 2.0; 
        this.offsetX = 0; // screen translation
        this.offsetY = 0;

        // Snapping settings
        this.snapToGrid = true;
        this.snapToPoints = true;
        this.orthoMode = false; // toggle or Shift key
        // Object snaps (like AutoCAD OSNAP) and polar tracking
        this.snapModes = { ...DEFAULT_SNAP_MODES };
        this.polarMode = false;        // snap the direction to multiples of polarIncrement when close to one
        this.polarIncrement = 45;      // degrees
        this.segmentProvider = null;   // () => [{ a, b }] lines for intersection / perpendicular / nearest snaps

        // Dynamic snap indicators
        this.activeSnap = null; // { x, y, type: 'endpoint'|'midpoint'|'grid'|'intersection' }
        this.orthoGuide = null; // { x1, y1, x2, y2, angle }

        // Interaction state
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.isSpacePressed = false;

        this.initViewport();
        this.setupEvents();
    }

    initViewport() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Center the viewport initially (origin slightly offset to leave room)
        this.offsetX = this.canvas.width / (2 * (window.devicePixelRatio || 1)) - 100;
        this.offsetY = this.canvas.height / (2 * (window.devicePixelRatio || 1)) - 100;
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        this.dpr = dpr;
    }

    setupEvents() {
        // Keyboard spacebar for temporary pan
        const isTypingTarget = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
            el.tagName === 'SELECT' || el.isContentEditable);

        window.addEventListener('keydown', (e) => {
            if (e.code !== 'Space' || isTypingTarget(e.target)) return;
            // Space is "hold to pan": stop it from scrolling the page or "clicking" a focused button.
            e.preventDefault();
            if (!this.isSpacePressed) {
                this.isSpacePressed = true;
                this.canvas.style.cursor = 'grab';
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.isSpacePressed = false;
                this.canvas.style.cursor = 'crosshair';
            }
        });

        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (this.onBeforeViewChange) this.onBeforeViewChange();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
            const newScale = Math.min(Math.max(this.scale * zoomFactor, 0.1), 30.0);

            // Zoom centered on mouse position
            this.offsetX = mouseX - (mouseX - this.offsetX) * (newScale / this.scale);
            this.offsetY = mouseY - (mouseY - this.offsetY) * (newScale / this.scale);
            this.scale = newScale;

            if (this.onViewChange) this.onViewChange();
        }, { passive: false });

        // Multi-touch gestures: 2-finger pinch-to-zoom & 2-finger pan
        this.touchStartDist = 0;
        this.touchStartScale = this.scale;
        this.touchStartMid = null;
        this.touchStartOffset = null;
        this.isTouchPinching = false;

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                this.isTouchPinching = true;
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const rect = this.canvas.getBoundingClientRect();
                this.touchStartDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                this.touchStartScale = this.scale;
                this.touchStartMid = {
                    x: (t1.clientX + t2.clientX) / 2 - rect.left,
                    y: (t1.clientY + t2.clientY) / 2 - rect.top
                };
                this.touchStartOffset = { x: this.offsetX, y: this.offsetY };
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && this.isTouchPinching) {
                e.preventDefault();
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const rect = this.canvas.getBoundingClientRect();
                const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                const currentMid = {
                    x: (t1.clientX + t2.clientX) / 2 - rect.left,
                    y: (t1.clientY + t2.clientY) / 2 - rect.top
                };

                if (this.touchStartDist > 0) {
                    const ratio = currentDist / this.touchStartDist;
                    const newScale = Math.min(Math.max(this.touchStartScale * ratio, 0.1), 30.0);

                    const midX = this.touchStartMid.x;
                    const midY = this.touchStartMid.y;

                    const deltaX = currentMid.x - this.touchStartMid.x;
                    const deltaY = currentMid.y - this.touchStartMid.y;

                    this.offsetX = midX - (midX - this.touchStartOffset.x) * (newScale / this.touchStartScale) + deltaX;
                    this.offsetY = midY - (midY - this.touchStartOffset.y) * (newScale / this.touchStartScale) + deltaY;
                    this.scale = newScale;

                    if (this.onViewChange) this.onViewChange();
                }
            }
        }, { passive: false });

        const endTouch = (e) => {
            if (e.touches.length < 2) {
                this.isTouchPinching = false;
                this.touchStartDist = 0;
            }
        };
        this.canvas.addEventListener('touchend', endTouch);
        this.canvas.addEventListener('touchcancel', endTouch);
    }

    // Coordinate conversion
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.offsetX) / this.scale,
            y: (screenY - this.offsetY) / this.scale
        };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: (worldX * this.scale) + this.offsetX,
            y: (worldY * this.scale) + this.offsetY
        };
    }

    /**
     * Grid spacing in world inches for the active unit system.
     * Imperial: 1 ft minor / 5 ft major.  Metric: 0.5 m minor / 1 m major.
     * With `lod` the minor step is coarsened when zoomed far out (drawing only).
     * `ratio` is the exact (integer) number of minor cells per major cell.
     */
    getGridSteps(lod = false) {
        let minor = 12;  // 1 foot
        let major = 60;  // 5 feet
        if (units.getSystem() === UnitSystem.METRIC) {
            minor = 19.685; // 0.5 m
            major = 39.37;  // 1.0 m
        }
        const ratio = Math.max(1, Math.round(major / minor));
        if (lod && minor * this.scale < 8) minor *= 5;
        return { minor, major: minor * ratio, ratio };
    }

    /** Plain nearest-grid-point (no magnet radius), in the active unit system. */
    getGridSnap(x, y) {
        const g = this.getGridSteps().minor;
        return { x: Math.round(x / g) * g, y: Math.round(y / g) * g };
    }

    /**
     * Compute the snapped cursor position (see modules/snap.js for the rules).
     * Updates activeSnap / orthoGuide, which the overlay uses to draw the snap marker and direction guide.
     */
    getSnapPoint(rawWorldX, rawWorldY, snapTargets = [], basePoint = null, forceOrtho = false) {
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const r = computeSnap({
            x: rawWorldX, y: rawWorldY, targets: snapTargets, basePoint, forceOrtho,
            segments: this.segmentProvider ? this.segmentProvider() : [],
            radius: (isTouch ? 24 : 16) / this.scale,              // magnet radius in world units (generous on touch screens)
            gridStep: this.getGridSteps().minor,
            settings: { orthoMode: this.orthoMode, polarMode: this.polarMode, polarIncrement: this.polarIncrement,
                        snapToGrid: this.snapToGrid, snapToPoints: this.snapToPoints, snapModes: this.snapModes }
        });
        this.activeSnap = r.snap;
        this.orthoGuide = r.guide;
        return { x: r.x, y: r.y, snapped: r.snapped };
    }

    /**
     * Clear and prepare canvas with high DPI transform
     */
    beginFrame() {
        const dpr = this.dpr || 1;
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply DPI scaling and viewport pan/zoom
        this.ctx.scale(dpr, dpr);
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);
    }

    /**
     * Restore canvas state and draw overlays in screen space
     */
    endFrame() {
        // Restore to screen coordinates for crisp overlays
        this.ctx.restore();

        // Draw snap indicators and orthogonal guide lines in screen space
        this.drawSnapIndicators();

        this.ctx.restore();
    }

    /**
     * Draw CAD background grid
     */
    drawGrid(theme = 'blueprint') {
        const width = this.canvas.width / (this.dpr || 1);
        const height = this.canvas.height / (this.dpr || 1);

        const topLeft = this.screenToWorld(0, 0);
        const bottomRight = this.screenToWorld(width, height);

        const { minor: minorStep, major: majorStep, ratio } = this.getGridSteps(true);

        const isDark = theme === 'blueprint' || theme === 'dark';
        const minorColor = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)';
        const majorColor = isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(0, 0, 0, 0.12)';
        const axisColor = isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(0, 0, 0, 0.35)';

        // Lines come from integer indices (i * step) so floating-point steps (metric)
        // never drift and major/minor classification is exact.
        const ctx = this.ctx;
        const iMinX = Math.floor(topLeft.x / minorStep), iMaxX = Math.ceil(bottomRight.x / minorStep);
        const iMinY = Math.floor(topLeft.y / minorStep), iMaxY = Math.ceil(bottomRight.y / minorStep);

        // Minor grid (skip every line that is also a major line)
        ctx.lineWidth = 1 / this.scale;
        ctx.strokeStyle = minorColor;
        ctx.beginPath();
        for (let i = iMinX; i <= iMaxX; i++) {
            if (i % ratio === 0) continue;
            ctx.moveTo(i * minorStep, topLeft.y);
            ctx.lineTo(i * minorStep, bottomRight.y);
        }
        for (let j = iMinY; j <= iMaxY; j++) {
            if (j % ratio === 0) continue;
            ctx.moveTo(topLeft.x, j * minorStep);
            ctx.lineTo(bottomRight.x, j * minorStep);
        }
        ctx.stroke();

        // Major grid
        ctx.strokeStyle = majorColor;
        ctx.lineWidth = 1.2 / this.scale;
        ctx.beginPath();
        for (let i = Math.floor(topLeft.x / majorStep), end = Math.ceil(bottomRight.x / majorStep); i <= end; i++) {
            ctx.moveTo(i * majorStep, topLeft.y);
            ctx.lineTo(i * majorStep, bottomRight.y);
        }
        for (let j = Math.floor(topLeft.y / majorStep), end = Math.ceil(bottomRight.y / majorStep); j <= end; j++) {
            ctx.moveTo(topLeft.x, j * majorStep);
            ctx.lineTo(bottomRight.x, j * majorStep);
        }
        ctx.stroke();

        // Origin axes (0,0)
        this.ctx.strokeStyle = axisColor;
        this.ctx.lineWidth = 1.8 / this.scale;
        this.ctx.beginPath();
        this.ctx.moveTo(0, topLeft.y);
        this.ctx.lineTo(0, bottomRight.y);
        this.ctx.moveTo(topLeft.x, 0);
        this.ctx.lineTo(bottomRight.x, 0);
        this.ctx.stroke();
    }

    /**
     * Draw snap point indicators & ortho guides in screen space
     */
    drawSnapIndicators() {
        if (this.orthoGuide) {
            const p1 = this.worldToScreen(this.orthoGuide.x1, this.orthoGuide.y1);
            const p2 = this.worldToScreen(this.orthoGuide.x2, this.orthoGuide.y2);

            this.ctx.save();
            this.ctx.strokeStyle = '#06b6d4'; // cyan
            this.ctx.lineWidth = 1.5;
            this.ctx.setLineDash([4, 4]);
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
            this.ctx.restore();
        }

        if (this.activeSnap) {
            const screen = this.worldToScreen(this.activeSnap.x, this.activeSnap.y);
            this.ctx.save();
            this.ctx.lineWidth = 2;

            if (this.activeSnap.type === 'endpoint') {
                // Green square
                this.ctx.strokeStyle = '#22c55e';
                this.ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
                this.ctx.strokeRect(screen.x - 6, screen.y - 6, 12, 12);
                this.ctx.fillRect(screen.x - 6, screen.y - 6, 12, 12);
            } else if (this.activeSnap.type === 'midpoint') {
                // Green triangle
                this.ctx.strokeStyle = '#06b6d4';
                this.ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
                this.ctx.beginPath();
                this.ctx.moveTo(screen.x, screen.y - 7);
                this.ctx.lineTo(screen.x + 6, screen.y + 5);
                this.ctx.lineTo(screen.x - 6, screen.y + 5);
                this.ctx.closePath();
                this.ctx.stroke();
                this.ctx.fill();
            } else if (this.activeSnap.type === 'intersection') {
                // X mark
                this.ctx.strokeStyle = '#f472b6';
                this.ctx.beginPath();
                this.ctx.moveTo(screen.x - 6, screen.y - 6); this.ctx.lineTo(screen.x + 6, screen.y + 6);
                this.ctx.moveTo(screen.x + 6, screen.y - 6); this.ctx.lineTo(screen.x - 6, screen.y + 6);
                this.ctx.stroke();
            } else if (this.activeSnap.type === 'perpendicular') {
                // right-angle mark
                this.ctx.strokeStyle = '#fb923c';
                this.ctx.beginPath();
                this.ctx.moveTo(screen.x - 6, screen.y + 6); this.ctx.lineTo(screen.x - 6, screen.y - 6); this.ctx.lineTo(screen.x + 6, screen.y - 6);
                this.ctx.moveTo(screen.x - 6, screen.y); this.ctx.lineTo(screen.x, screen.y); this.ctx.lineTo(screen.x, screen.y - 6);
                this.ctx.stroke();
            } else if (this.activeSnap.type === 'nearest') {
                // hourglass
                this.ctx.strokeStyle = '#a78bfa';
                this.ctx.beginPath();
                this.ctx.moveTo(screen.x - 6, screen.y - 6); this.ctx.lineTo(screen.x + 6, screen.y - 6);
                this.ctx.lineTo(screen.x - 6, screen.y + 6); this.ctx.lineTo(screen.x + 6, screen.y + 6); this.ctx.closePath();
                this.ctx.stroke();
            } else {
                // Grid / other: small cross
                this.ctx.strokeStyle = '#eab308';
                this.ctx.beginPath();
                this.ctx.moveTo(screen.x - 5, screen.y);
                this.ctx.lineTo(screen.x + 5, screen.y);
                this.ctx.moveTo(screen.x, screen.y - 5);
                this.ctx.lineTo(screen.x, screen.y + 5);
                this.ctx.stroke();
            }

            this.ctx.restore();
        }
    }

    /**
     * Center viewport on a bounding box
     */
    fitToBounds(bounds, padding = 60) {
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
        const width = this.canvas.width / (this.dpr || 1);
        const height = this.canvas.height / (this.dpr || 1);

        const availableW = width - padding * 2;
        const availableH = height - padding * 2;

        const scaleX = availableW / bounds.width;
        const scaleY = availableH / bounds.height;
        this.scale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 15.0);

        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;

        this.offsetX = (width / 2) - (centerX * this.scale);
        this.offsetY = (height / 2) - (centerY * this.scale);
    }
}
