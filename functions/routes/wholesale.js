const express = require('express');
const router = express.Router();
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const axios = require('axios');
const { URLSearchParams } = require('url');
const { DEFAULT_CARRIER_CODE } = require('../helpers/shipengine');

const db = admin.firestore();
const inventoryCollection = db.collection('wholesaleInventory');
const ordersCollection = db.collection('wholesaleOrders');
const offersCollection = db.collection('wholesaleOffers');
const adminsCollection = db.collection('admins');

const STRIPE_API_BASE_URL = 'https://api.stripe.com/v1';
const SHIPENGINE_API_BASE_URL = 'https://api.shipengine.com/v1';
const DEFAULT_IMAGE_BASE = 'https://raw.githubusercontent.com/toratyosef/BuyBacking/main/';
const DEFAULT_SUCCESS_URL = 'https://secondhandcell.com/buy/order-submitted.html?order={ORDER_ID}';
const DEFAULT_CANCEL_URL = 'https://secondhandcell.com/buy/checkout.html?offer={OFFER_ID}';

function readConfigValue(path, fallback = null) {
    try {
        return path.split('.').reduce((current, key) => {
            if (current && Object.prototype.hasOwnProperty.call(current, key)) {
                return current[key];
            }
            return undefined;
        }, functions.config()) ?? fallback;
    } catch (error) {
        return fallback;
    }
}

function getStripeSecretKey() {
    return (
        readConfigValue('stripe.secret') ||
        process.env.STRIPE_SECRET_KEY ||
        process.env.STRIPE_SECRET
    );
}

function getStripePublishableKey() {
    return (
        readConfigValue('stripe.publishable') ||
        process.env.STRIPE_PUBLISHABLE_KEY ||
        process.env.STRIPE_PUBLIC_KEY
    );
}

function getShipEngineKey() {
    return (
        readConfigValue('shipengine.key') ||
        process.env.SHIPENGINE_KEY_TEST
    );
}

function getShipEngineCarrierCode() {
    return (
        readConfigValue('shipengine.sandbox_carrier_code') ||
        process.env.SHIPENGINE_SANDBOX_CARRIER_CODE ||
        DEFAULT_CARRIER_CODE
    );
}

function getShipEngineServiceCode() {
    return (
        readConfigValue('shipengine.sandbox_service_code') ||
        process.env.SHIPENGINE_SANDBOX_SERVICE_CODE ||
        null
    );
}

function getShipFromAddress() {
    const configured = readConfigValue('shipengine.from');
    if (configured && typeof configured === 'object') {
        return configured;
    }
    return {
        name: process.env.SHIPENGINE_FROM_NAME || 'SecondHandCell Warehouse',
        phone: process.env.SHIPENGINE_FROM_PHONE || '2015551234',
        company_name: process.env.SHIPENGINE_FROM_COMPANY || 'SecondHandCell',
        address_line1: process.env.SHIPENGINE_FROM_ADDRESS1 || '1206 McDonald Ave',
        address_line2: process.env.SHIPENGINE_FROM_ADDRESS2 || 'Ste Rear',
        city_locality: process.env.SHIPENGINE_FROM_CITY || 'Brooklyn',
        state_province: process.env.SHIPENGINE_FROM_STATE || 'NY',
        postal_code: process.env.SHIPENGINE_FROM_POSTAL || '11230',
        country_code: process.env.SHIPENGINE_FROM_COUNTRY || 'US'
    };
}

function slugify(value) {
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}

async function authenticate(req) {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.*)$/i);
    if (!match) {
        return null;
    }
    try {
        const decoded = await admin.auth().verifyIdToken(match[1]);
        return decoded;
    } catch (error) {
        console.warn('Failed to verify ID token for wholesale route:', error.message);
        return null;
    }
}

async function requireAdmin(req) {
    const bypassToken =
        readConfigValue('wholesale.admin_token') || process.env.WHOLESALE_ADMIN_TOKEN || null;
    if (bypassToken && req.headers['x-admin-token'] === bypassToken) {
        return { uid: 'token-bypass' };
    }
    const decoded = await authenticate(req);
    if (!decoded?.uid) {
        return null;
    }
    try {
        const adminDoc = await adminsCollection.doc(decoded.uid).get();
        if (!adminDoc.exists) {
            return null;
        }
        return decoded;
    } catch (error) {
        console.error('Error verifying admin membership:', error);
        return null;
    }
}

function normalizeInventoryItem(raw = {}, imageBasePath = DEFAULT_IMAGE_BASE) {
    const brand = (raw.brand || '').toString().trim();
    const model = (raw.model || '').toString().trim();
    const id = raw.id || slugify(`${brand}-${model}` || `device-${Date.now()}`);
    const highlights = Array.isArray(raw.highlights) ? raw.highlights.map((entry) => entry.toString()) : [];
    const storages = Array.isArray(raw.storages)
        ? raw.storages.map((variant, index) => ({
              variant: variant.variant || `Variant ${index + 1}`,
              asking: variant.asking || {},
              stock: variant.stock || {}
          }))
        : [];
    const image = raw.image || (raw.imagePath ? `${imageBasePath}${raw.imagePath}` : null);

    return {
        id,
        brand,
        model,
        tagline: raw.tagline || '',
        image,
        highlights,
        storages
    };
}

function buildPackageList({ boxCount, weightPerBox, dimensions }) {
    const count = Number(boxCount) || 1;
    const weight = Number(weightPerBox) || 1;
    const dims = dimensions || {};
    const length = Number(dims.length) || 12;
    const width = Number(dims.width) || 10;
    const height = Number(dims.height) || 8;
    return Array.from({ length: Math.max(count, 1) }).map(() => ({
        weight: { value: weight, unit: 'pound' },
        dimensions: {
            length,
            width,
            height,
            unit: 'inch'
        }
    }));
}

async function estimateShippingRate(shipping, packages) {
    const key = getShipEngineKey();
    if (!key || !shipping || shipping.preference === 'pickup') {
        return null;
    }
    const carrierCode = getShipEngineCarrierCode();
    const serviceCode = getShipEngineServiceCode();
    try {
        const response = await axios.post(
            `${SHIPENGINE_API_BASE_URL}/rates/estimate`,
            {
                carrier_code: carrierCode,
                service_code: serviceCode || undefined,
                ship_to: {
                    name: shipping.contact?.name || shipping.company || 'Wholesale Buyer',
                    phone: shipping.contact?.phone || shipping.phone || '0000000000',
                    company_name: shipping.company || shipping.contact?.company || 'Wholesale Buyer',
                    address_line1: shipping.address?.line1,
                    address_line2: shipping.address?.line2 || undefined,
                    city_locality: shipping.address?.city,
                    state_province: shipping.address?.state,
                    postal_code: shipping.address?.postalCode,
                    country_code: shipping.address?.country || 'US'
                },
                ship_from: getShipFromAddress(),
                packages
            },
            {
                headers: {
                    'API-Key': key,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );
        const data = response.data;
        if (Array.isArray(data) && data.length) {
            return data[0];
        }
        return data || null;
    } catch (error) {
        console.error('ShipEngine estimate failed:', error.response?.data || error.message);
        return null;
    }
}

async function createStripeCheckoutSession({
    orderId,
    offerId,
    buyer,
    items,
    shipping,
    amount,
    shippingAmount,
    metadata = {}
}) {
    const secretKey = getStripeSecretKey();
    if (!secretKey) {
        throw new Error('Stripe secret key not configured');
    }
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', (shipping.successUrl || DEFAULT_SUCCESS_URL).replace('{ORDER_ID}', orderId));
    params.append('cancel_url', (shipping.cancelUrl || DEFAULT_CANCEL_URL).replace('{OFFER_ID}', offerId));
    params.append('customer_email', buyer?.email || '');
    params.append('metadata[order_id]', orderId);
    params.append('metadata[offer_id]', offerId);
    params.append('metadata[user_id]', buyer?.uid || '');

    items.forEach((item, index) => {
        const quantity = Math.max(Number(item.quantity) || 0, 1);
        const unitAmount = Math.max(
            Math.round(Number(item.acceptedPrice || item.counterPrice || item.offerPrice || 0) * 100),
            1
        );
        params.append(`line_items[${index}][quantity]`, quantity.toString());
        params.append(`line_items[${index}][price_data][currency]`, 'usd');
        params.append(`line_items[${index}][price_data][product_data][name]`, `${item.brand} ${item.model} · ${item.storageVariant} · Grade ${item.grade}`);
        params.append(`line_items[${index}][price_data][unit_amount]`, unitAmount.toString());
    });

    if (shippingAmount && shippingAmount > 0) {
        const index = items.length;
        params.append(`line_items[${index}][quantity]`, '1');
        params.append(`line_items[${index}][price_data][currency]`, 'usd');
        params.append(`line_items[${index}][price_data][product_data][name]`, 'Estimated shipping');
        params.append(`line_items[${index}][price_data][unit_amount]`, Math.round(shippingAmount * 100).toString());
    }

    Object.entries(metadata).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        params.append(`metadata[${key}]`, value.toString());
    });

    const response = await axios.post(`${STRIPE_API_BASE_URL}/checkout/sessions`, params, {
        headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    return response.data;
}

router.get('/inventory', async (req, res) => {
    try {
        const snapshot = await inventoryCollection.orderBy('brand').get();
        const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        res.json({ items, imageBase: DEFAULT_IMAGE_BASE, publishableKey: getStripePublishableKey() });
    } catch (error) {
        console.error('Failed to load wholesale inventory:', error);
        res.status(500).json({ error: 'Failed to load wholesale inventory' });
    }
});

router.post('/inventory/import', async (req, res) => {
    const adminUser = await requireAdmin(req);
    if (!adminUser) {
        return res.status(403).json({ error: 'Admin authentication required' });
    }
    const { items = [], imageBasePath } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
        return res.status(400).json({ error: 'Provide an array of inventory items' });
    }
    const imageBase = imageBasePath || DEFAULT_IMAGE_BASE;
    const batch = db.batch();
    const normalizedItems = items.map((item) => normalizeInventoryItem(item, imageBase));
    normalizedItems.forEach((item) => {
        const docRef = inventoryCollection.doc(item.id);
        batch.set(docRef, item, { merge: true });
    });
    try {
        await batch.commit();
        res.json({ message: 'Inventory imported', items: normalizedItems });
    } catch (error) {
        console.error('Failed to import inventory:', error);
        res.status(500).json({ error: 'Failed to import inventory' });
    }
});

router.post('/orders/checkout', async (req, res) => {
    const decoded = await authenticate(req);
    if (!decoded?.uid) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const payload = req.body || {};
    const { offerId, items, totals, shipping, buyer } = payload;
    if (!offerId || !Array.isArray(items) || !items.length) {
        return res.status(400).json({ error: 'Offer details are required' });
    }
    if (!shipping || !shipping.address) {
        return res.status(400).json({ error: 'Shipping details are required' });
    }

    const packages = buildPackageList({
        boxCount: shipping.boxCount,
        weightPerBox: shipping.weightPerBox,
        dimensions: shipping.dimensions
    });

    const shippingEstimate = await estimateShippingRate(shipping, packages);
    const shippingAmount = shippingEstimate?.shipping_amount?.amount || 0;

    const offerTotal = totals?.offerTotal || items.reduce((sum, line) => {
        const price = Number(line.acceptedPrice || line.counterPrice || line.offerPrice || 0);
        return sum + price * (Number(line.quantity) || 0);
    }, 0);

    const orderRef = ordersCollection.doc();
    const orderId = orderRef.id;

    try {
        const session = await createStripeCheckoutSession({
            orderId,
            offerId,
            buyer: {
                uid: decoded.uid,
                email: buyer?.email || decoded.email || '',
                name: buyer?.name || decoded.name || ''
            },
            items,
            shipping,
            amount: offerTotal,
            shippingAmount,
            metadata: {
                shipping_preference: shipping.preference || '',
                box_count: shipping.boxCount || '',
                weight_per_box: shipping.weightPerBox || ''
            }
        });

        await orderRef.set({
            offerId,
            userId: decoded.uid,
            buyer: {
                uid: decoded.uid,
                email: buyer?.email || decoded.email || '',
                name: buyer?.name || decoded.name || ''
            },
            items,
            totals: {
                units: totals?.units || items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
                offerTotal,
                shippingEstimate: shippingAmount
            },
            shipping,
            packages,
            shippingEstimate,
            stripe: {
                sessionId: session.id,
                url: session.url,
                paymentIntentId: session.payment_intent || null,
                publishableKey: getStripePublishableKey()
            },
            status: 'payment_pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (payload.saveOfferSnapshot) {
            await offersCollection.doc(offerId).set({
                ...payload.saveOfferSnapshot,
                userId: decoded.uid,
                orderId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        res.json({
            orderId,
            checkoutUrl: session.url,
            shippingEstimate,
            publishableKey: getStripePublishableKey()
        });
    } catch (error) {
        console.error('Failed to create checkout session:', error.response?.data || error.message);
        res.status(500).json({ error: 'Unable to create Stripe checkout session' });
    }
});

router.get('/orders', async (req, res) => {
    const adminUser = await requireAdmin(req);
    if (!adminUser) {
        return res.status(403).json({ error: 'Admin authentication required' });
    }
    try {
        const snapshot = await ordersCollection.orderBy('createdAt', 'desc').limit(100).get();
        const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        res.json({ orders });
    } catch (error) {
        console.error('Failed to list wholesale orders:', error);
        res.status(500).json({ error: 'Failed to list orders' });
    }
});

router.post('/orders/:orderId/label', async (req, res) => {
    const adminUser = await requireAdmin(req);
    if (!adminUser) {
        return res.status(403).json({ error: 'Admin authentication required' });
    }
    const { orderId } = req.params;
    const orderRef = ordersCollection.doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
        return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderDoc.data();
    const shipengineKey = getShipEngineKey();
    if (!shipengineKey) {
        return res.status(500).json({ error: 'ShipEngine key not configured' });
    }
    const carrierCode = req.body?.carrierCode || getShipEngineCarrierCode();
    const serviceCode = req.body?.serviceCode || getShipEngineServiceCode();
    const packages = req.body?.packages || order.packages || buildPackageList({});
    const shipTo = req.body?.shipTo || {
        name: order.shipping?.contact?.name || order.shipping?.company || 'Wholesale Buyer',
        phone: order.shipping?.contact?.phone || order.shipping?.phone || '0000000000',
        company_name: order.shipping?.company || 'Wholesale Buyer',
        address_line1: order.shipping?.address?.line1,
        address_line2: order.shipping?.address?.line2,
        city_locality: order.shipping?.address?.city,
        state_province: order.shipping?.address?.state,
        postal_code: order.shipping?.address?.postalCode,
        country_code: order.shipping?.address?.country || 'US'
    };

    try {
        const response = await axios.post(
            `${SHIPENGINE_API_BASE_URL}/labels`,
            {
                carrier_code: carrierCode,
                service_code: serviceCode || undefined,
                ship_to: shipTo,
                ship_from: getShipFromAddress(),
                packages
            },
            {
                headers: {
                    'API-Key': shipengineKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        const label = response.data;
        await orderRef.update({
            shippingLabel: label,
            trackingNumber: label.tracking_number,
            shipEngineLabelId: label.label_id,
            labelPurchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: order.status === 'payment_pending' ? 'fulfillment_in_progress' : order.status
        });

        res.json({ label });
    } catch (error) {
        console.error('Failed to create ShipEngine label:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to create shipping label' });
    }
});

module.exports = router;
