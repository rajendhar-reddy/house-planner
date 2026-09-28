/**
 * pdf.js - Pure Client-Side Architectural PDF Generator (ISO PDF-1.4 Standard)
 * Zero external dependencies. Generates print-ready A4, A3, A2, and Custom Fit PDF blueprints.
 */

export class PDFWriter {
    /**
     * Standard Paper Sizes in PostScript Points (72 points = 1 inch)
     */
    static SIZES = {
        a4: { width: 595.28, height: 841.89 },   // 210mm x 297mm
        a3: { width: 841.89, height: 1190.55 },  // 297mm x 420mm
        a2: { width: 1190.55, height: 1683.78 }, // 420mm x 594mm
        letter: { width: 612.0, height: 792.0 }, // 8.5in x 11in
        ledger: { width: 792.0, height: 1224.0 } // 11in x 17in
    };

    /**
     * Create PDF from an HTML5 Canvas element
     * @param {HTMLCanvasElement} canvas
     * @param {Object} options
     * @returns {Promise<Blob>}
     */
    static async createPDFFromCanvas(canvas, options = {}) {
        const paper = options.paperSize || 'a4'; // 'a4' | 'a3' | 'a2' | 'fit'
        const orientation = options.orientation || 'landscape';
        const title = options.title || 'Architectural Floor Plan';
        const client = options.client || '';
        const author = options.author || 'HousePlanner CAD 2D Arch';
        const quality = options.quality !== undefined ? options.quality : 0.95;

        // Paper dimensions
        let pageW, pageH;
        if (paper === 'fit') {
            const aspect = canvas.width / canvas.height;
            if (aspect >= 1) {
                pageW = 841.89;
                pageH = pageW / aspect;
            } else {
                pageH = 595.28;
                pageW = pageH * aspect;
            }
        } else {
            const base = this.SIZES[paper] || this.SIZES.a4;
            if (orientation === 'landscape') {
                pageW = Math.max(base.width, base.height);
                pageH = Math.min(base.width, base.height);
            } else {
                pageW = Math.min(base.width, base.height);
                pageH = Math.max(base.width, base.height);
            }
        }

        // Convert canvas to JPEG blob (native DCTDecode in PDF)
        const jpegBlob = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
        });

        if (!jpegBlob) {
            throw new Error('Failed to generate image buffer from canvas.');
        }

        const arrayBuffer = await jpegBlob.arrayBuffer();
        const jpegBytes = new Uint8Array(arrayBuffer);

        return this.buildPDFDocument(jpegBytes, canvas.width, canvas.height, pageW, pageH, {
            title,
            client,
            author,
            drawBorder: options.drawBorder !== false
        });
    }

    /**
     * Build binary ISO PDF-1.4 with DCTDecode image XObject and strict 20-byte xref table
     */
    static buildPDFDocument(jpegBytes, imgW, imgH, pageW, pageH, meta = {}) {
        const margin = 20.0; // 20 pt (~7mm) standard margin
        const availW = pageW - margin * 2;
        const availH = pageH - margin * 2;

        const scale = Math.min(availW / imgW, availH / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const drawX = margin + (availW - drawW) / 2.0;
        const drawY = margin + (availH - drawH) / 2.0;

        // Page content stream in PostScript PDF syntax
        let content = '';

        // Optional subtle architectural sheet border around the drawing
        if (meta.drawBorder) {
            content += '0.75 w\n';
            content += '0.55 0.65 0.75 RG\n'; // subtle cadet blue border line
            content += `${(drawX - 2).toFixed(2)} ${(drawY - 2).toFixed(2)} ${(drawW + 4).toFixed(2)} ${(drawH + 4).toFixed(2)} re S\n`;
        }

        // Place and scale image (unit square mapped via current transformation matrix 'cm')
        content += 'q\n';
        content += `${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n`;
        content += '/Im1 Do\n';
        content += 'Q\n';

        const encoder = new TextEncoder();
        const parts = [];
        const offsets = [];
        let currentPos = 0;

        function appendString(str) {
            const bytes = encoder.encode(str);
            parts.push(bytes);
            currentPos += bytes.length;
        }

        function appendBytes(bytes) {
            parts.push(bytes);
            currentPos += bytes.length;
        }

        function addObj(headerStr, bodyBytesOrStr = null, footerStr = '\nendobj\n') {
            offsets.push(currentPos);
            const objNum = offsets.length;
            appendString(`${objNum} 0 obj\n${headerStr}`);
            if (typeof bodyBytesOrStr === 'string') {
                appendString(bodyBytesOrStr);
            } else if (bodyBytesOrStr) {
                appendBytes(bodyBytesOrStr);
            }
            appendString(footerStr);
            return objNum;
        }

        // Header: PDF-1.4 + binary marker comment
        appendString('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

        // Obj 1: Catalog
        addObj('<< /Type /Catalog /Pages 2 0 R >>');

        // Obj 2: Pages
        addObj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');

        // Obj 3: Page (MediaBox specifies page width & height in points)
        addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`);

        // Obj 4: Image XObject (embedded DCTDecode JPEG)
        const imgHeader = `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`;
        addObj(imgHeader, jpegBytes, '\nendstream\nendobj\n');

        // Obj 5: Contents stream
        const contentEncoded = encoder.encode(content);
        const contentHeader = `<< /Length ${contentEncoded.length} >>\nstream\n`;
        addObj(contentHeader, contentEncoded, '\nendstream\nendobj\n');

        // Obj 6: Info metadata
        const now = new Date();
        const dateStr = `D:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const cleanTitle = (meta.title || 'Architectural Floor Plan').replace(/[()\\\/]/g, ' ');
        const cleanClient = (meta.client || 'Residential Building').replace(/[()\\\/]/g, ' ');
        const cleanAuthor = (meta.author || 'HousePlanner CAD').replace(/[()\\\/]/g, ' ');

        addObj(`<< /Title (${cleanTitle}) /Subject (${cleanClient}) /Author (${cleanAuthor}) /Creator (HousePlanner CAD 2D Arch) /Producer (HousePlanner CAD Architectural PDF Engine) /CreationDate (${dateStr}) >>`);

        // Strict 20-byte Cross-Reference Table
        const xrefPos = currentPos;
        appendString(`xref\n0 ${offsets.length + 1}\n`);
        appendString('0000000000 65535 f\r\n');
        for (const off of offsets) {
            const offStr = String(off).padStart(10, '0');
            appendString(`${offStr} 00000 n\r\n`);
        }

        // Trailer
        appendString(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

        return new Blob(parts, { type: 'application/pdf' });
    }

    /**
     * Trigger browser file download of PDF blob
     */
    static download(blob, filename = 'house_plan.pdf') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
}
