const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const bwipjs = require('bwip-js');

const PACKING_SLIP_WIDTH = 288; // 4 inches (72 pts per inch)
const PACKING_SLIP_HEIGHT = 432; // 6 inches
const PACKING_SLIP_MARGIN = 20;
const BAG_LABEL_WIDTH = 288; // 4 inches wide
const BAG_LABEL_HEIGHT = 144; // 2 inches tall
const BAG_LABEL_MARGIN_X = 16;
const BAG_LABEL_MARGIN_Y = 12;
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

    let page = pdfDoc.addPage([PACKING_SLIP_WIDTH, PACKING_SLIP_HEIGHT]);
    let { width, height } = page.getSize();
    let cursorY = height - PACKING_SLIP_MARGIN;

    const ensureSpace = (requiredLines = 1) => {
        if (cursorY - requiredLines * LINE_HEIGHT < PACKING_SLIP_MARGIN + 60) {
            page = pdfDoc.addPage([PACKING_SLIP_WIDTH, PACKING_SLIP_HEIGHT]);
            ({ width, height } = page.getSize());
            cursorY = height - PACKING_SLIP_MARGIN;
        }
    };

    const drawText = (text, options = {}) => {
        const { font = regularFont, size = 11, color = rgb(0, 0, 0) } = options;
        const lines = wrapText(text, width - MARGIN * 2, font, size);
        lines.forEach((line) => {
            ensureSpace();
            page.drawText(line, {
                x: PACKING_SLIP_MARGIN,
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
            x: PACKING_SLIP_MARGIN,
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
        y: Math.max(PACKING_SLIP_MARGIN, cursorY - dims.height - 10),
        width: dims.width,
        height: dims.height,
    });

    cursorY = Math.max(PACKING_SLIP_MARGIN, cursorY - dims.height - 18);
    drawText('Scan to view order in dashboard', { size: 8, font: boldFont });

    return pdfDoc.save();
}

async function generateBagLabelPdf(order) {
    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([BAG_LABEL_WIDTH, BAG_LABEL_HEIGHT]);
    const { width, height } = page.getSize();
    const barcodeReserve = BAG_LABEL_MARGIN_Y + 48;
    let cursorY = height - BAG_LABEL_MARGIN_Y;

    const drawLine = (text, options = {}) => {
        const { font = regularFont, size = 10, color = rgb(0, 0, 0), gap = 4 } = options;
        if (!text) {
            cursorY = Math.max(cursorY - gap, barcodeReserve);
            return;
        }
        const lines = wrapText(text, width - BAG_LABEL_MARGIN_X * 2, font, size);
        lines.forEach((line) => {
            cursorY -= LINE_HEIGHT;
            cursorY = Math.max(cursorY, barcodeReserve);
            page.drawText(line, {
                x: BAG_LABEL_MARGIN_X,
                y: cursorY,
                size,
                font,
                color,
            });
        });
        cursorY = Math.max(cursorY - gap, barcodeReserve);
    };

    const shippingInfo = order.shippingInfo || {};
    const contactName = shippingInfo.fullName || shippingInfo.name || 'Customer';
    const contactPhone =
        shippingInfo.phone ||
        shippingInfo.phoneNumber ||
        shippingInfo.phone_number ||
        '';

    const deviceParts = [];
    if (order.brand) deviceParts.push(String(order.brand));
    if (order.device) deviceParts.push(String(order.device));
    const deviceLabel = deviceParts.join(' ');
    const storageLabel = order.storage || order.memory || '';
    const lockLabel = formatValue(order.carrier);
    const conditionSummary = order.condition || order.deviceCondition || buildConditionSummary(order);
    const qualityLabel = conditionSummary && conditionSummary !== '—'
        ? conditionSummary
        : formatValue(order.condition_grade || order.quality);
    const payoutAmount = resolveOrderPayout(order);

    drawLine('SecondHandCell', {
        font: boldFont,
        size: 9,
        color: rgb(0.32, 0.32, 0.36),
        gap: 2,
    });
    drawLine(`Order #${order.id}`, {
        font: boldFont,
        size: 18,
        color: rgb(0.12, 0.16, 0.48),
        gap: 6,
    });

    const deviceLineParts = [];
    if (deviceLabel) deviceLineParts.push(deviceLabel);
    if (storageLabel) deviceLineParts.push(storageLabel);
    drawLine(deviceLineParts.join(' • '), {
        font: boldFont,
        size: 11,
        color: rgb(0.08, 0.08, 0.1),
        gap: 2,
    });

    const specParts = [];
    if (lockLabel && lockLabel !== '—') specParts.push(`Lock: ${lockLabel}`);
    if (qualityLabel && qualityLabel !== '—') specParts.push(`Quality: ${qualityLabel}`);
    drawLine(specParts.join('    '), {
        size: 9,
        color: rgb(0.28, 0.28, 0.32),
        gap: 3,
    });

    const contactParts = [contactName];
    if (contactPhone) contactParts.push(contactPhone);
    const cityLine = [shippingInfo.city, shippingInfo.state]
        .filter(Boolean)
        .join(', ');
    if (cityLine) contactParts.push(cityLine);
    drawLine(contactParts.join(' • '), {
        size: 9,
        color: rgb(0.24, 0.24, 0.28),
        gap: 3,
    });

    drawLine(`Quote: $${formatCurrency(payoutAmount)}`, {
        font: boldFont,
        size: 14,
        color: rgb(0.1, 0.5, 0.26),
        gap: 8,
    });

    drawLine('Attach this label to the device bag.', {
        size: 8,
        color: rgb(0.45, 0.45, 0.45),
        gap: 6,
    });

    const barcodeSvg = await buildBarcode(order.id);
    const barcodeImage = await pdfDoc.embedSvg(barcodeSvg);
    const maxBarcodeWidth = width - BAG_LABEL_MARGIN_X * 2;
    const maxBarcodeHeight = 36;
    const barcodeScale = Math.min(
        maxBarcodeWidth / barcodeImage.width,
        maxBarcodeHeight / barcodeImage.height,
        1.2
    );
    const dims = barcodeImage.scale(barcodeScale);
    const barcodeY = BAG_LABEL_MARGIN_Y + 14;

    page.drawImage(barcodeImage, {
        x: (width - dims.width) / 2,
        y: barcodeY,
        width: dims.width,
        height: dims.height,
    });

    const caption = 'Scan to open this order';
    const captionSize = 8;
    const captionWidth = boldFont.widthOfTextAtSize(caption, captionSize);
    page.drawText(caption, {
        x: (width - captionWidth) / 2,
        y: barcodeY - 10,
        size: captionSize,
        font: boldFont,
        color: rgb(0.35, 0.35, 0.35),
    });

    return pdfDoc.save();
}

function resolveOrderPayout(order = {}) {
    const candidates = [
        order.finalPayoutAmount,
        order.finalPayout,
        order.finalOfferAmount,
        order.finalOffer,
        order.payoutAmount,
        order.payout,
        order.reOffer && order.reOffer.newPrice,
        order.estimatedQuote,
    ];

    for (const value of candidates) {
        if (value === undefined || value === null) {
            continue;
        }
        const numeric = Number(value);
        if (!Number.isNaN(numeric)) {
            return numeric;
        }
    }

    return 0;
}

function formatCurrency(value) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
        return '0.00';
    }
    return numeric.toFixed(2);
}

function buildConditionSummary(order = {}) {
    const segments = [
        order.condition_power_on ? `Powers On: ${formatValue(order.condition_power_on)}` : null,
        order.condition_functional ? `Functional: ${formatValue(order.condition_functional)}` : null,
        order.condition_cosmetic ? `Cosmetic: ${formatValue(order.condition_cosmetic)}` : null,
    ].filter(Boolean);

    return segments.join(' • ');
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

module.exports = { generateCustomLabelPdf, generateBagLabelPdf, mergePdfBuffers };
