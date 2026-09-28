/**
 * units.js - Unit Conversion and Formatting Engine
 * Internal spatial unit: 1 Unit = 1 Inch
 */

export const UnitSystem = {
    IMPERIAL: 'imperial', // Feet & Inches (e.g., 12' - 6")
    METRIC: 'metric'      // Meters / Millimeters (e.g., 3.81 m / 230 mm)
};

class UnitManager {
    constructor() {
        this.system = UnitSystem.IMPERIAL; // default to Imperial
        this.metricSubUnit = 'm'; // 'm' or 'mm'
    }

    setSystem(system) {
        if (system === UnitSystem.IMPERIAL || system === UnitSystem.METRIC) {
            this.system = system;
        }
    }

    getSystem() {
        return this.system;
    }

    /**
     * Convert inches to formatted text string
     * @param {number} inches 
     * @param {boolean} includeUnit 
     * @returns {string}
     */
    formatLength(inches, includeUnit = true) {
        if (inches === undefined || inches === null || isNaN(inches)) return '0"';
        const absVal = Math.abs(inches);
        const sign = inches < 0 ? '-' : '';

        if (this.system === UnitSystem.IMPERIAL) {
            const totalInches = Math.round(absVal * 10) / 10;
            const feet = Math.floor(totalInches / 12);
            const remainingInches = Math.round((totalInches % 12) * 10) / 10;

            if (feet === 0) {
                return `${sign}${remainingInches}"`;
            } else if (remainingInches === 0) {
                return `${sign}${feet}'`;
            } else {
                return `${sign}${feet}' - ${remainingInches}"`;
            }
        } else {
            // Metric: meters
            const meters = absVal * 0.0254;
            if (meters < 1 && this.metricSubUnit === 'mm') {
                const mm = Math.round(absVal * 25.4);
                return `${sign}${mm}${includeUnit ? ' mm' : ''}`;
            }
            const formatted = meters.toFixed(2);
            return `${sign}${formatted}${includeUnit ? ' m' : ''}`;
        }
    }

    /**
     * Format area from square inches
     * @param {number} sqInches 
     * @returns {{primary: string, secondary: string}}
     */
    formatArea(sqInches) {
        if (!sqInches || isNaN(sqInches) || sqInches <= 0) {
            return { primary: '0 Sq Ft', secondary: '0 Sq M' };
        }
        const sqFt = sqInches / 144;
        const sqM = sqInches * 0.00064516;
        const sqYards = sqFt / 9;

        if (this.system === UnitSystem.IMPERIAL) {
            return {
                primary: `${sqFt.toFixed(1)} Sq. Ft.`,
                secondary: `${sqYards.toFixed(1)} Sq. Yd. (${sqM.toFixed(1)} m²)`
            };
        } else {
            return {
                primary: `${sqM.toFixed(2)} m²`,
                secondary: `${sqFt.toFixed(1)} Sq. Ft.`
            };
        }
    }

    /**
     * Parse text input into internal inches
     * e.g. "30'", "30 ft", "12' 6\"", "25.5", "10m", "230mm", "400cm"
     * @param {string} text 
     * @returns {number|null} inches
     */
    parseInput(text) {
        if (!text || typeof text !== 'string') return null;
        const s = text.trim().toLowerCase();
        if (!s) return null;

        // Check for metric mm
        if (s.endsWith('mm')) {
            const val = parseFloat(s.replace('mm', '').trim());
            return isNaN(val) ? null : val / 25.4;
        }
        // Check for metric cm
        if (s.endsWith('cm')) {
            const val = parseFloat(s.replace('cm', '').trim());
            return isNaN(val) ? null : (val * 10) / 25.4;
        }
        // Check for metric m
        if (s.endsWith('m') && !s.endsWith('mm')) {
            const val = parseFloat(s.replace('m', '').trim());
            return isNaN(val) ? null : (val * 1000) / 25.4;
        }

        // Check for feet and inches format: e.g. 12' 6", 12'6", 12ft 6in
        const ftInRegex = /^(\d+(?:\.\d+)?)\s*(?:'|ft)\s*(?:-?\s*(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/;
        const match = s.match(ftInRegex);
        if (match) {
            const feet = parseFloat(match[1]);
            const inches = match[2] ? parseFloat(match[2]) : 0;
            return (feet * 12) + inches;
        }

        // Check for plain inches: e.g. 36", 36 in
        const inRegex = /^(\d+(?:\.\d+)?)\s*(?:"|in)$/;
        const inMatch = s.match(inRegex);
        if (inMatch) {
            return parseFloat(inMatch[1]);
        }

        // Plain number: interpret according to current system
        const num = parseFloat(s);
        if (isNaN(num)) return null;

        if (this.system === UnitSystem.IMPERIAL) {
            // Assume feet for typed dimension (e.g. "30" means 30 feet)
            return num * 12;
        } else {
            // In metric, default typed "10" means 10 meters
            return (num * 1000) / 25.4;
        }
    }
}

export const units = new UnitManager();
