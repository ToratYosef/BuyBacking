const { PDFDocument, rgb } = require('pdf-lib');
const bwipjs = require('bwip-js');

/**
 * NEW: Helper function to generate a custom 4x6 PDF label with device details and a barcode.
 * @param {Object} order - The order document from Firestore.
 * @returns {Promise<Buffer>} The PDF document as a Buffer.
 */
async function generateCustomLabelPdf(order) {
    // Create a new PDF document (4x6 inches)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([432, 288]); // 4x6 inches in points (72 points per inch)
    const { width, height } = page.getSize();
    const fontSize = 12;

    // Title
    page.drawText('SecondHandCell', {
        x: 30,
        y: height - 40,
        size: 24,
        color: rgb(0, 0, 0),
    });

    // Customer and Order Info
    page.drawText(`Order ID: ${order.id}`, {
        x: 30,
        y: height - 70,
        size: 16,
        color: rgb(0, 0, 0),
    });
    page.drawText(`Customer: ${order.shippingInfo.fullName}`, {
        x: 30,
        y: height - 90,
        size: fontSize,
        color: rgb(0, 0, 0),
    });
    page.drawText(`Email: ${order.shippingInfo.email}`, {
        x: 30,
        y: height - 110,
        size: fontSize,
        color: rgb(0, 0, 0),
    });
    page.drawText(`Device: ${order.device} - ${order.storage}`, {
        x: 30,
        y: height - 130,
        size: fontSize,
        color: rgb(0, 0, 0),
    });

    // Device Details (Answers)
    const deviceDetails = order.answers || {};
    let yOffset = height - 150;
    for (const [question, answer] of Object.entries(deviceDetails)) {
        // Format question nicely
        const formattedQuestion = question.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
        page.drawText(`${formattedQuestion}: ${answer}`, {
            x: 30,
            y: yOffset,
            size: fontSize,
            color: rgb(0, 0, 0),
        });
        yOffset -= 15;
        if (yOffset < 80) { // Add a new page if content overflows
            page = pdfDoc.addPage([432, 288]);
            yOffset = height - 40;
        }
    }

    // Barcode
    const barcodeData = order.id;
    const barcodeSvg = await new Promise((resolve, reject) => {
        bwipjs.toSVG({
            bcid: 'code128', // Barcode type
            text: barcodeData, // The text to encode
            scale: 3,
            height: 10,
            includetext: false,
            textxalign: 'center',
        }, (err, svg) => {
            if (err) {
                reject(err);
            } else {
                resolve(svg);
            }
        });
    });

    const barcodeImage = await pdfDoc.embedSvg(barcodeSvg);
    const barcodeDims = barcodeImage.scale(0.5);

    page.drawImage(barcodeImage, {
        x: (width - barcodeDims.width) / 2,
        y: 30,
        width: barcodeDims.width,
        height: barcodeDims.height,
    });

    return await pdfDoc.save();
}

module.exports = { generateCustomLabelPdf };
