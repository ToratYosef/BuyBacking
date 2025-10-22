// This Node.js script uses the Firebase Admin SDK to perform a batch update
// on Firestore documents based on specific criteria.

// 1. Install Dependencies:
//    Ensure you have Node.js installed. Then run:
//    npm install firebase-admin

// 2. Configure Your Service Account:
//    Place your actual Firebase service account key JSON file in the same directory
//    as this script and name it 'serviceAccountKey.json'.

// We are switching to granular ES Module imports to resolve the 'Cannot read properties of undefined' error.
// We import core app functions (initializeApp, cert) and Firestore functions (getFirestore) separately.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Helper to get __dirname in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the service account key using file system module in an ESM context
let serviceAccount;
try {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    const serviceAccountJson = fs.readFileSync(serviceAccountPath, 'utf8');
    serviceAccount = JSON.parse(serviceAccountJson);
} catch (error) {
    console.error("Error loading 'serviceAccountKey.json'. Please ensure it exists and is valid JSON:", error.message);
    process.exit(1);
}

// Initialize Firebase Admin SDK
try {
    // FIX: Use the directly imported 'initializeApp' and 'cert' functions
    initializeApp({
        credential: cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
    // Check if the error is due to the app already being initialized (which is fine)
    if (!/already exists/.test(error.message)) {
        console.error("Error initializing Firebase Admin SDK:", error.message);
        // Exit if initialization fails
        process.exit(1);
    }
}

// FIX: Use the directly imported 'getFirestore' function
const db = getFirestore();

/**
 * Finds orders matching the criteria and updates their status to 'kit_sent'.
 */
async function updateOrdersStatus() {
    // Define the specific query criteria
    const collectionPath = 'orders';
    const targetShippingPreference = 'Shipping Kit Requested';
    const targetStatus = 'label_generated';
    const newStatus = 'kit_sent';

    console.log(`\n--- Starting Order Update Process ---`);
    console.log(`Looking in collection: /${collectionPath}`);
    console.log(`Criteria: shippingPreference = '${targetShippingPreference}' AND status = '${targetStatus}'`);
    console.log(`Action: Set status to '${newStatus}'`);

    try {
        // Build the query
        const querySnapshot = await db.collection(collectionPath)
            .where('shippingPreference', '==', targetShippingPreference)
            .where('status', '==', targetStatus)
            .get();

        if (querySnapshot.empty) {
            console.log('\n✅ Success: No orders found matching the criteria. Nothing to update.');
            return;
        }

        console.log(`\nFound ${querySnapshot.size} orders to update.`);

        // Create a batch operation
        const batch = db.batch();
        let updateCount = 0;

        // Iterate through the documents and add updates to the batch
        querySnapshot.forEach(doc => {
            const orderRef = doc.ref;
            batch.update(orderRef, { status: newStatus });
            updateCount++;
            // Optional: Log the ID of the document being updated
            console.log(`Preparing update for document ID: ${doc.id}`);
        });

        // Commit the batch
        await batch.commit();

        console.log(`\n✅ Success: Completed batch update. ${updateCount} orders have been updated to status '${newStatus}'.`);

    } catch (error) {
        console.error('\n❌ An error occurred during the update process:', error);
    }
}

// Execute the main function
updateOrdersStatus();
