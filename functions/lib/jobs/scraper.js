"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDeviceScraper = runDeviceScraper;
const axios_1 = __importDefault(require("axios"));
const firestore_1 = require("firebase-admin/firestore");
async function runDeviceScraper() {
    const response = await axios_1.default.get('https://example.com/pricing-feed.json', { validateStatus: () => true });
    const results = (response.data?.results ?? []);
    const db = (0, firestore_1.getFirestore)();
    await Promise.all(results.map((result) => db.collection('devices').doc(result.slug).set({
        listings: {
            wholesale: result.offer,
        },
        lastScrapedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true })));
    return results;
}
