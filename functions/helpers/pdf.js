const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const bwipjs = require('bwip-js');

const PAGE_WIDTH = 288; // 4 inches (72 pts per inch)
const PAGE_HEIGHT = 432; // 6 inches
const MARGIN = 20;
const LINE_HEIGHT = 14;

/**
 * Helper function to generate a branded 4x6 packing slip label.
 * @param {Object} order - Firestore order payload.
 * @returns {Promise<Buffer>} PDF buffer ready for download/print.
 */
async function generateCustomLabelPdf(order) {
    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let { width, height } = page.getSize();
    let cursorY = height - MARGIN;

    const ensureSpace = (requiredLines = 1) => {
        if (cursorY - requiredLines * LINE_HEIGHT < MARGIN + 60) {
            page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            ({ width, height } = page.getSize());
            cursorY = height - MARGIN;
        }
    };

    const drawText = (text, options = {}) => {
        const { font = regularFont, size = 11, color = rgb(0, 0, 0) } = options;
        const lines = wrapText(text, width - MARGIN * 2, font, size);
        lines.forEach((line) => {
            ensureSpace();
            page.drawText(line, {
                x: MARGIN,
                y: cursorY,
                size,
                font,
                color,
            });
            cursorY -= LINE_HEIGHT;
        });
        cursorY -= 2; // small gap after block
    };

    const drawSectionTitle = (title) => {
        ensureSpace();
        page.drawText(title, {
            x: MARGIN,
            y: cursorY,
            size: 14,
            font: boldFont,
            color: rgb(0.16, 0.16, 0.16),
        });
        cursorY -= LINE_HEIGHT;
    };

    // Header
    drawSectionTitle('SecondHandCell Packing Slip');
    drawText(`Order #${order.id}`, { font: boldFont, size: 12 });

    const shippingInfo = order.shippingInfo || {};
    const customerLines = [
        shippingInfo.fullName,
        shippingInfo.streetAddress,
        [shippingInfo.city, shippingInfo.state].filter(Boolean).join(', '),
        shippingInfo.zipCode,
    ].filter(Boolean);

    drawSectionTitle('Ship To');
    customerLines.forEach((line) => drawText(line, { size: 10 }));

    drawSectionTitle('Contact');
    drawText(`Email: ${shippingInfo.email || '—'}`, { size: 10 });
    drawText(`Phone: ${shippingInfo.phone || shippingInfo.phoneNumber || '—'}`, { size: 10 });

    drawSectionTitle('Device Details');
    drawText(`${order.device || 'Device'} • ${order.storage || 'Storage'} • ${order.carrier || 'Carrier'}`, {
        size: 10,
    });
    drawText(`Quoted: $${Number(order.estimatedQuote || 0).toFixed(2)}`, { size: 10 });
    drawText(`Shipping Preference: ${formatValue(order.shippingPreference)}`, { size: 10 });

    if (order.paymentMethod) {
        drawText(`Payment: ${formatValue(order.paymentMethod)}`, { size: 10 });
    }

    const answers = order.answers || {};
    const answerEntries = Object.entries(answers);
    if (answerEntries.length) {
        drawSectionTitle('Condition Notes');
        answerEntries.forEach(([question, answer]) => {
            const label = formatLabel(question);
            drawText(`${label}: ${answer}`, { size: 9 });
        });
    }

    drawSectionTitle('Prep Checklist');
    [
        'Remove SIM cards and accessories.',
        'Factory reset the device & sign out of iCloud/Google.',
        'Place device in provided protective sleeve.',
        'Insert this slip inside the kit before sealing.',
    ].forEach((item) => drawText(`• ${item}`, { size: 9 }));

    ensureSpace(4);
    const barcodeSvg = await buildBarcode(order.id);
    const barcodeImage = await pdfDoc.embedSvg(barcodeSvg);
    const svgWidth = barcodeImage.width;
    const barcodeScale = Math.min(
        (width - MARGIN * 2) / svgWidth,
        1.2
    );
    const dims = barcodeImage.scale(barcodeScale);

    page.drawImage(barcodeImage, {
        x: (width - dims.width) / 2,
        y: Math.max(MARGIN, cursorY - dims.height - 10),
        width: dims.width,
        height: dims.height,
    });

    cursorY = Math.max(MARGIN, cursorY - dims.height - 18);
    drawText('Scan to view order in dashboard', { size: 8, font: boldFont });

    return pdfDoc.save();
}

function formatValue(value) {
    if (!value) return '—';
    return String(value)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatLabel(label = '') {
    return label
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function buildBarcode(data) {
    return new Promise((resolve, reject) => {
        bwipjs.toSVG(
            {
                bcid: 'code128',
                text: data,
                scale: 2.8,
                height: 12,
                includetext: false,
                textxalign: 'center',
            },
            (err, svg) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(svg);
                }
            }
        );
    });
}

function wrapText(text, maxWidth, font, fontSize) {
    if (!text) return [''];
    const words = String(text).split(/\s+/);
    const lines = [];
    let currentLine = '';

    words.forEach((word) => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, fontSize);
        if (width <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.length ? lines : [''];
}

async function mergePdfBuffers(buffers = []) {
    const pdfBuffers = buffers.filter(Boolean);

    if (!pdfBuffers.length) {
        throw new Error('No PDF buffers provided for merging');
    }

    if (pdfBuffers.length === 1) {
        return pdfBuffers[0];
    }

    const mergedPdf = await PDFDocument.create();

    for (const buffer of pdfBuffers) {
        const document = await PDFDocument.load(buffer);
        const copiedPages = await mergedPdf.copyPages(document, document.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    return mergedPdf.save();
}

module.exports = { generateCustomLabelPdf, mergePdfBuffers };
