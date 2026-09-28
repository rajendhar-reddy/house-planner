/**
 * canvas.js - High-DPI Infinite Viewport & Snapping Engine
 */

import { units, UnitSystem } from './units.js';

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
        this.gridInterval = 12; // 12 inches (1 ft) default

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
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.isSpacePressed && e.target.tagName !== 'INPUT') {
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
     * Compute magnetic snapping point for input cursor
     */
    getSnapPoint(rawWorldX, rawWorldY, snapTargets = [], basePoint = null, forceOrtho = false) {
        let x = rawWorldX;
        let y = rawWorldY;
        this.activeSnap = null;
        this.orthoGuide = null;

        // 1. Orthogonal lock if requested or Shift is held
        if ((this.orthoMode || forceOrtho) && basePoint) {
            const dx = x - basePoint.x;
            const dy = y - basePoint.y;
            const angle = Math.atan2(dy, dx);
            const dist = Math.hypot(dx, dy);

            // Snap to nearest 45-degree increment (0, 45, 90, 135, 180, -45, -90, etc.)
            const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            x = basePoint.x + Math.cos(snapAngle) * dist;
            y = basePoint.y + Math.sin(snapAngle) * dist;

            this.orthoGuide = {
                x1: basePoint.x,
                y1: basePoint.y,
                x2: x,
                y2: y,
                angle: (snapAngle * 180 / Math.PI + 360) % 360
            };
        }

        // Magnetic radius in world units
        const magnetRadius = 16 / this.scale;

        // 2. Snap to geometry points (endpoints, midpoints, corners)
        if (this.snapToPoints && snapTargets.length > 0) {
            let closestDist = magnetRadius;
            let bestSnap = null;

            for (const target of snapTargets) {
                const d = Math.hypot(target.x - x, target.y - y);
                if (d < closestDist) {
                    closestDist = d;
                    bestSnap = target;
                }
            }

            if (bestSnap) {
                this.activeSnap = {
                    x: bestSnap.x,
                    y: bestSnap.y,
                    type: bestSnap.type || 'endpoint'
                };
                return { x: bestSnap.x, y: bestSnap.y, snapped: true };
            }
        }

        // 3. Snap to grid
        if (this.snapToGrid && this.gridInterval > 0) {
            const gx = Math.round(x / this.gridInterval) * this.gridInterval;
            const gy = Math.round(y / this.gridInterval) * this.gridInterval;
            const d = Math.hypot(gx - x, gy - y);

            if (d < magnetRadius) {
                this.activeSnap = { x: gx, y: gy, type: 'grid' };
                return { x: gx, y: gy, snapped: true };
            }
        }

        return { x, y, snapped: false };
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

        // Grid interval selection based on unit system and zoom scale
        let minorStep = 12; // 1 foot (12 inches)
        let majorStep = 60; // 5 feet (60 inches)

        if (units.getSystem() === UnitSystem.METRIC) {
            minorStep = 19.685; // 0.5 meter in inches
            majorStep = 39.37;  // 1.0 meter in inches
        }

        // Scale-dependent LOD for grid lines
        const pixelStep = minorStep * this.scale;
        if (pixelStep < 8) {
            minorStep *= 5;
            majorStep *= 5;
        }

        const isDark = theme === 'blueprint' || theme === 'dark';
        const minorColor = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)';
        const majorColor = isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(0, 0, 0, 0.12)';
        const axisColor = isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(0, 0, 0, 0.35)';

        const startX = Math.floor(topLeft.x / minorStep) * minorStep;
        const endX = Math.ceil(bottomRight.x / minorStep) * minorStep;
        const startY = Math.floor(topLeft.y / minorStep) * minorStep;
        const endY = Math.ceil(bottomRight.y / minorStep) * minorStep;

        // Minor grid
        this.ctx.lineWidth = 1 / this.scale;
        this.ctx.strokeStyle = minorColor;
        this.ctx.beginPath();
        for (let x = startX; x <= endX; x += minorStep) {
            if (Math.abs(x % majorStep) > 0.01) {
                this.ctx.moveTo(x, topLeft.y);
                this.ctx.lineTo(x, bottomRight.y);
            }
        }
        for (let y = startY; y <= endY; y += minorStep) {
            if (Math.abs(y % majorStep) > 0.01) {
                this.ctx.moveTo(topLeft.x, y);
                this.ctx.lineTo(bottomRight.x, y);
            }
        }
        this.ctx.stroke();

        // Major grid
        this.ctx.strokeStyle = majorColor;
        this.ctx.lineWidth = 1.2 / this.scale;
        this.ctx.beginPath();
        for (let x = Math.floor(topLeft.x / majorStep) * majorStep; x <= endX; x += majorStep) {
            this.ctx.moveTo(x, topLeft.y);
            this.ctx.lineTo(x, bottomRight.y);
        }
        for (let y = Math.floor(topLeft.y / majorStep) * majorStep; y <= endY; y += majorStep) {
            this.ctx.moveTo(topLeft.x, y);
            this.ctx.lineTo(bottomRight.x, y);
        }
        this.ctx.stroke();

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
