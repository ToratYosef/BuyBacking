const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();

const ordersCollection = db.collection("orders");
const usersCollection = db.collection("users");
const adminsCollection = db.collection("admins");

/**
 * Write & update in BOTH locations:
 * 1) Top-level /orders/{orderId}
 * 2) If userId present: /users/{userId}/orders/{orderId}
 */
async function writeOrderBoth(orderId, data) {
    // Hard write (no merge) for initial creation
    await ordersCollection.doc(orderId).set(data);
    if (data.userId) {
        await usersCollection.doc(data.userId).collection("orders").doc(orderId).set(data);
    }
}

async function updateOrderBoth(orderId, partialData) {
    // Merge update and return updated order snapshot
    const orderRef = ordersCollection.doc(orderId);
    await orderRef.set(partialData, { merge: true });

    const snap = await orderRef.get();
    const base = snap.data() || {};
    const userId = base.userId;

    if (userId) {
        await usersCollection.doc(userId).collection("orders").doc(orderId).set(partialData, { merge: true });
    }

    return { order: { id: orderId, ...base, ...partialData }, userId };
}

module.exports = { writeOrderBoth, updateOrderBoth, ordersCollection, usersCollection, adminsCollection };
