"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshPricingFromFeeds = refreshPricingFromFeeds;
const firestore_1 = require("firebase-admin/firestore");
const scraper_1 = require("./scraper");
async function refreshPricingFromFeeds() {
    const db = (0, firestore_1.getFirestore)();
    const results = await (0, scraper_1.runDeviceScraper)();
    await db.collection('pricingSnapshots').add({
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        source: 'automated-job',
        results,
    });
}
