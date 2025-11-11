const express = require('express');

function createOrdersRouter({
  axios,
  admin,
  ordersCollection,
  adminsCollection,
  writeOrderBoth,
  updateOrderBoth,
  generateNextOrderNumber,
  stateAbbreviations,
  templates,
  notifications,
  pdf,
  shipEngine,
  createShipEngineLabel,
  transporter,
}) {
  const router = express.Router();

  const {
    ORDER_RECEIVED_EMAIL_HTML,
    ORDER_PLACED_ADMIN_EMAIL_HTML,
    SHIPPING_KIT_EMAIL_HTML,
    SHIPPING_LABEL_EMAIL_HTML,
  } = templates;
  const { sendAdminPushNotification, addAdminFirestoreNotification } = notifications;
  const { generateCustomLabelPdf, generateBagLabelPdf, mergePdfBuffers } = pdf;
  const {
    cloneShipEngineLabelMap,
    buildLabelIdList,
    isLabelPendingVoid,
    handleLabelVoid,
    sendVoidNotificationEmail,
  } = shipEngine;

  const PRINT_QUEUE_STATUSES = [
    'shipping_kit_requested',
    'kit_needs_printing',
    'needs_printing',
  ];

  const PRINT_BUNDLE_ALLOWED_ORIGINS = new Set([
    'https://toratyosef.github.io',
    'https://buyback-a0f05.web.app',
    'https://secondhandcell.com',
    'https://www.secondhandcell.com',
  ]);

  const PRINT_BUNDLE_ALLOWED_METHODS = 'GET,POST,OPTIONS';
  const PRINT_BUNDLE_ALLOWED_HEADERS = 'Authorization, Content-Type, X-Requested-With';
  const firestore = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  let storageBucket = null;

  try {
    storageBucket = admin.storage().bucket();
  } catch (error) {
    console.warn('Bulk print storage bucket unavailable:', error?.message || error);
  }

  function applyPrintBundleCorsHeaders(res, origin) {
    if (origin && PRINT_BUNDLE_ALLOWED_ORIGINS.has(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');
    }

    res.header('Access-Control-Allow-Methods', PRINT_BUNDLE_ALLOWED_METHODS);
    res.header('Access-Control-Allow-Headers', PRINT_BUNDLE_ALLOWED_HEADERS);
    res.header(
      'Access-Control-Expose-Headers',
      'X-Printed-Order-Ids, X-Kit-Sent-Order-Ids, X-Bulk-Print-Folder, X-Bulk-Print-Job-Id'
    );
  }

  function handlePrintBundlePreflight(req, res) {
    applyPrintBundleCorsHeaders(res, req.headers.origin);
    res.sendStatus(204);
  }

  function toMillis(value) {
    if (!value) return null;
    if (typeof value === 'number') return value;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value === 'object') {
      const seconds = value._seconds ?? value.seconds ?? null;
      if (typeof seconds === 'number') {
        const nanos = value._nanoseconds ?? value.nanoseconds ?? 0;
        return seconds * 1000 + Math.floor(nanos / 1e6);
      }
    }
    return null;
  }

  function resolveCreatedAtMillis(order = {}) {
    const candidates = [
      order.createdAt,
      order.created_at,
      order.createdAtMillis,
      order.createdAtMs,
      order.created_at_ms,
      order.created_at_millis,
    ];

    for (const candidate of candidates) {
      const millis = toMillis(candidate);
      if (millis) {
        return millis;
      }
    }

    if (typeof order.createdAtSeconds === 'number') {
      return order.createdAtSeconds * 1000;
    }

    return null;
  }

  function normaliseBuffer(data) {
    if (!data) return null;
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  }

  function collectLabelUrlCandidates(order = {}) {
    const urls = new Set();
    const pushUrl = (value) => {
      if (!value) return;
      const stringValue = String(value).trim();
      if (!stringValue) return;
      if (/^https?:\/\//i.test(stringValue)) {
        urls.add(stringValue);
      }
    };

    pushUrl(order.outboundLabelUrl);
    pushUrl(order.inboundLabelUrl);
    pushUrl(order.uspsLabelUrl);

    Object.keys(order)
      .filter((key) => key && key.toLowerCase().includes('label') && key.toLowerCase().includes('url'))
      .forEach((key) => pushUrl(order[key]));

    const collections = [order.shipEngineLabels, order.labelRecords, order.labels, order.labelUrls];

    collections.forEach((collection) => {
      if (!collection) return;
      if (Array.isArray(collection)) {
        collection.forEach((entry) => {
          if (!entry) return;
          if (typeof entry === 'string') {
            pushUrl(entry);
            return;
          }
          if (typeof entry === 'object') {
            Object.values(entry).forEach((value) => pushUrl(value));
            if (entry.label_download && typeof entry.label_download === 'object') {
              Object.values(entry.label_download).forEach((value) => pushUrl(value));
            }
          }
        });
      } else if (typeof collection === 'object') {
        Object.values(collection).forEach((entry) => {
          if (!entry) return;
          if (typeof entry === 'string') {
            pushUrl(entry);
            return;
          }
          if (typeof entry === 'object') {
            Object.values(entry).forEach((value) => pushUrl(value));
            if (entry.label_download && typeof entry.label_download === 'object') {
              Object.values(entry.label_download).forEach((value) => pushUrl(value));
            }
          }
        });
      }
    });

    return urls;
  }

  async function fetchPrintQueueOrders(orderIds = []) {
    const results = new Map();

    if (Array.isArray(orderIds) && orderIds.length) {
      const docs = await Promise.all(
        orderIds.map((id) =>
          ordersCollection
            .doc(String(id))
            .get()
            .catch((error) => {
              console.error(`Failed to load order ${id} for print queue:`, error);
              return null;
            })
        )
      );

      docs.forEach((doc) => {
        if (doc && doc.exists) {
          results.set(doc.id, { id: doc.id, ...doc.data() });
        }
      });
    } else {
      await Promise.all(
        PRINT_QUEUE_STATUSES.map(async (status) => {
          try {
            const snapshot = await ordersCollection.where('status', '==', status).get();
            snapshot.docs.forEach((doc) => {
              results.set(doc.id, { id: doc.id, ...doc.data() });
            });
          } catch (error) {
            console.error(`Failed to load ${status} orders for print queue:`, error);
          }
        })
      );
    }

    const orders = Array.from(results.values());
    orders.sort((a, b) => {
      const aMillis = resolveCreatedAtMillis(a) ?? Number.MAX_SAFE_INTEGER;
      const bMillis = resolveCreatedAtMillis(b) ?? Number.MAX_SAFE_INTEGER;
      return aMillis - bMillis;
    });
    return orders;
  }

  function serialisePrintQueueOrder(order = {}) {
    const shippingInfo = order.shippingInfo || {};
    const labelUrls = Array.from(collectLabelUrlCandidates(order));

    return {
      id: order.id,
      status: order.status || null,
      shippingPreference: order.shippingPreference || null,
      shippingInfo: {
        fullName: shippingInfo.fullName || shippingInfo.name || '',
        email: shippingInfo.email || '',
        phone:
          shippingInfo.phone ||
          shippingInfo.phoneNumber ||
          shippingInfo.phone_number ||
          shippingInfo.contactPhone ||
          '',
        city: shippingInfo.city || '',
        state: shippingInfo.state || '',
      },
      device: order.device || '',
      brand: order.brand || '',
      storage: order.storage || order.memory || '',
      carrier: order.carrier || '',
      estimatedQuote:
        typeof order.estimatedQuote === 'number'
          ? order.estimatedQuote
          : Number(order.estimatedQuote) || null,
      createdAtMillis: resolveCreatedAtMillis(order),
      labelUrls,
    };
  }

  async function downloadPdfBuffer(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }

  function sanitisePathSegment(value) {
    return String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-');
  }

  async function collectOrderPrintParts(order) {
    const parts = [];
    const seenUrls = new Set();

    async function pushLabelPart(url, kind) {
      if (!url) {
        return;
      }

      const stringUrl = String(url).trim();
      if (!stringUrl || seenUrls.has(stringUrl)) {
        return;
      }

      try {
        const buffer = await downloadPdfBuffer(stringUrl);
        if (buffer && buffer.length) {
          parts.push({ kind, buffer, sourceUrl: stringUrl });
          seenUrls.add(stringUrl);
        }
      } catch (error) {
        console.error(`Failed to download label for order ${order?.id} from ${stringUrl}:`, error.message || error);
      }
    }

    let hasInboundLabel = false;

    await pushLabelPart(order.outboundLabelUrl, 'outbound');

    if (order.inboundLabelUrl) {
      await pushLabelPart(order.inboundLabelUrl, 'inbound');
      hasInboundLabel = true;
    }

    if (order.uspsLabelUrl) {
      if (!hasInboundLabel) {
        await pushLabelPart(order.uspsLabelUrl, 'inbound');
        hasInboundLabel = true;
      } else {
        await pushLabelPart(order.uspsLabelUrl, 'extra');
      }
    }

    const labelUrls = Array.from(collectLabelUrlCandidates(order));
    for (const url of labelUrls) {
      if (seenUrls.has(url)) {
        continue;
      }
      const nextKind = hasInboundLabel ? 'extra' : 'inbound';
      await pushLabelPart(url, nextKind);
      if (nextKind === 'inbound') {
        hasInboundLabel = true;
      }
    }

    try {
      const infoLabel = await generateCustomLabelPdf(order);
      const infoBuffer = normaliseBuffer(infoLabel);
      if (infoBuffer && infoBuffer.length) {
        parts.push({ kind: 'info', buffer: infoBuffer });
      }
    } catch (error) {
      console.error(`Failed to generate info label PDF for order ${order.id}:`, error);
    }

    try {
      const bagLabel = await generateBagLabelPdf(order);
      const bagBuffer = normaliseBuffer(bagLabel);
      if (bagBuffer && bagBuffer.length) {
        parts.push({ kind: 'bag', buffer: bagBuffer });
      }
    } catch (error) {
      console.error(`Failed to generate bag label PDF for order ${order.id}:`, error);
    }

    return parts;
  }

  function createSuffixResolver(parts = []) {
    const used = new Set();
    const baseSuffixes = new Map([
      ['outbound', '1'],
      ['inbound', '2'],
      ['info', '3'],
      ['bag', '4'],
    ]);
    let fallbackIndex = 1;

    return (part = {}) => {
      const base = baseSuffixes.get(part.kind);
      if (base && !used.has(base)) {
        used.add(base);
        return base;
      }

      while (used.has(String(fallbackIndex))) {
        fallbackIndex += 1;
      }

      const suffix = String(fallbackIndex);
      used.add(suffix);
      fallbackIndex += 1;
      return suffix;
    };
  }

  async function persistBulkPrintAssets(context, plans = []) {
    if (!context || !context.folderName || !Array.isArray(plans) || !plans.length) {
      return null;
    }

    if (!storageBucket) {
      return null;
    }

    const uploads = [];

    plans.forEach(({ order, parts }) => {
      if (!order?.id || !Array.isArray(parts) || !parts.length) {
        return;
      }

      const orderId = String(order.id).trim();
      if (!orderId) {
        return;
      }

      const suffixResolver = createSuffixResolver(parts);

      parts.forEach((part) => {
        if (!part?.buffer) {
          return;
        }

        const suffix = suffixResolver(part);
        const filePath = `${context.folderName}/${sanitisePathSegment(orderId)}-${suffix}.pdf`;

        uploads.push(
          storageBucket
            .file(filePath)
            .save(part.buffer, { contentType: 'application/pdf' })
            .catch((error) => {
              console.error(`Failed to upload bulk print asset ${filePath}:`, error);
            })
        );
      });
    });

    if (uploads.length) {
      await Promise.all(uploads);
    }

    return null;
  }

  async function reserveBulkPrintContext(orderIds = []) {
    if (!firestore) {
      return null;
    }

    const counterRef = firestore.collection('adminCounters').doc('bulkPrint');
    let sequence = 0;

    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(counterRef);
      const current = snapshot.exists && typeof snapshot.data()?.sequence === 'number'
        ? snapshot.data().sequence
        : 0;
      sequence = current + 1;
      transaction.set(counterRef, { sequence }, { merge: true });
    });

    const folderName = `bulk-print-${sequence}`;
    let jobId = null;

    try {
      const jobRef = firestore.collection('bulkPrintJobs').doc();
      jobId = jobRef.id;
      await jobRef.set({
        createdAt: FieldValue.serverTimestamp(),
        orderIds,
        folder: folderName,
        sequence,
      });
    } catch (error) {
      console.error('Failed to record bulk print job metadata:', error);
    }

    return { folderName, sequence, jobId };
  }

  async function buildPrintBundleResponse({ orderIds = [], res, origin, allowEmptySelection = false }) {
    const cleanedOrderIds = Array.isArray(orderIds)
      ? orderIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (!cleanedOrderIds.length && !allowEmptySelection) {
      return res.status(400).json({ error: 'At least one order ID must be provided.' });
    }

    applyPrintBundleCorsHeaders(res, origin);

    const orders = await fetchPrintQueueOrders(cleanedOrderIds);
    if (!orders.length) {
      return res.status(404).json({ error: 'No printable orders available for the requested selection.' });
    }

    const printableOrderIds = [];
    const printableOrders = [];
    const mergedParts = [];
    const bulkPlans = [];

    for (const order of orders) {
      const parts = await collectOrderPrintParts(order);
      if (!parts.length) {
        console.warn(`No printable documents generated for order ${order.id}`);
        continue;
      }
      printableOrderIds.push(order.id);
      printableOrders.push(order);
      parts.forEach((part) => {
        if (part?.buffer) {
          mergedParts.push(part.buffer);
        }
      });
      bulkPlans.push({ order, parts });
    }

    if (!mergedParts.length) {
      return res
        .status(404)
        .json({ error: 'No printable documents available for the requested orders.' });
    }

    const mergedPdf = await mergePdfBuffers(mergedParts);
    const mergedBuffer = normaliseBuffer(mergedPdf);

    let bulkContext = null;
    if (printableOrderIds.length) {
      try {
        const context = await reserveBulkPrintContext(printableOrderIds);
        if (context) {
          await persistBulkPrintAssets(context, bulkPlans);
          bulkContext = context;
        }
      } catch (storageError) {
        console.error('Failed to persist bulk print assets:', storageError);
      }
    }

    let kitSentOrderIds = [];
    try {
      kitSentOrderIds = await markOrdersKitSent(printableOrders);
    } catch (updateError) {
      console.error('Failed to update kit sent status after bundle:', updateError);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="print-queue-bundle.pdf"');
    res.setHeader('X-Printed-Order-Ids', JSON.stringify(printableOrderIds));
    res.setHeader('X-Kit-Sent-Order-Ids', JSON.stringify(kitSentOrderIds));
    if (bulkContext?.folderName) {
      res.setHeader('X-Bulk-Print-Folder', bulkContext.folderName);
    }
    if (bulkContext?.jobId) {
      res.setHeader('X-Bulk-Print-Job-Id', bulkContext.jobId);
    }
    res.send(mergedBuffer);

    return null;
  }

  async function markOrdersKitSent(orders = []) {
    if (!Array.isArray(orders) || !orders.length) {
      return [];
    }

    const results = await Promise.all(
      orders.map(async (order) => {
        if (!order || !order.id) {
          return null;
        }

        try {
          const updatePayload = {
            status: 'kit_sent',
          };

          if (!order.kitSentAt) {
            updatePayload.kitSentAt = admin.firestore.FieldValue.serverTimestamp();
          }

          await updateOrderBoth(order.id, updatePayload);
          return order.id;
        } catch (error) {
          console.error(`Failed to mark order ${order.id} as kit sent after bundle:`, error);
          return null;
        }
      })
    );

    return results.filter(Boolean);
  }

  router.post('/fetch-pdf', async (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'PDF URL is required.' });
    }

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
      });

      const base64Data = Buffer.from(response.data).toString('base64');

      res.json({
        base64: base64Data,
        mimeType: response.headers['content-type'] || 'application/pdf',
      });
    } catch (error) {
      console.error('Error fetching external PDF:', error.message);
      if (error.response) {
        console.error('External API Response Status:', error.response.status);
        console.error(
          'External API Response Data (partial):',
          error.response.data
            ? Buffer.from(error.response.data)
                .toString('utf-8')
                .substring(0, 200)
            : 'No data'
        );
        return res.status(error.response.status).json({
          error: `Failed to fetch PDF from external service. Status: ${error.response.status}`,
          details: error.message,
        });
      }
      res.status(500).json({ error: 'Internal server error during PDF proxy fetch.' });
    }
  });

  router.get('/orders', async (req, res) => {
    try {
      const snapshot = await ordersCollection.get();
      const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      res.json(orders);
    } catch (err) {
      console.error('Error fetching orders:', err);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  router.get('/orders/needs-printing', async (req, res) => {
    try {
      const orders = await fetchPrintQueueOrders();
      const payload = orders.map(serialisePrintQueueOrder);
      res.json({ orders: payload });
    } catch (error) {
      console.error('Failed to load print queue orders:', error);
      res.status(500).json({ error: 'Failed to load print queue orders' });
    }
  });

  router.post('/orders/needs-printing/bundle', async (req, res) => {
    try {
      const orderIds = Array.isArray(req.body?.orderIds)
        ? req.body.orderIds.filter(Boolean)
        : [];

      await buildPrintBundleResponse({
        orderIds,
        res,
        origin: req.headers.origin,
        allowEmptySelection: true,
      });
    } catch (error) {
      console.error('Failed to generate print queue bundle:', error);
      res.status(500).json({ error: 'Failed to build print queue bundle' });
    }
  });

  router.options('/orders/needs-printing/bundle', handlePrintBundlePreflight);

  router.post('/merge-print', async (req, res) => {
    try {
      const orderIds = Array.isArray(req.body?.orderIds)
        ? req.body.orderIds.filter(Boolean)
        : [];

      await buildPrintBundleResponse({
        orderIds,
        res,
        origin: req.headers.origin,
        allowEmptySelection: false,
      });
    } catch (error) {
      console.error('Failed to generate merge print bundle (POST):', error);
      res.status(500).json({ error: 'Failed to merge print documents' });
    }
  });

  router.options('/merge-print', handlePrintBundlePreflight);

  router.get('/merge-print/:orderIds', async (req, res) => {
    try {
      const rawIds = String(req.params.orderIds || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      await buildPrintBundleResponse({
        orderIds: rawIds,
        res,
        origin: req.headers.origin,
        allowEmptySelection: false,
      });
    } catch (error) {
      console.error('Failed to generate merge print bundle:', error);
      res.status(500).json({ error: 'Failed to merge print documents' });
    }
  });

  router.options('/merge-print/:orderIds', handlePrintBundlePreflight);

  router.get('/orders/:id', async (req, res) => {
    try {
      const docRef = ordersCollection.doc(req.params.id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
      console.error('Error fetching single order:', err);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  router.get('/orders/find', async (req, res) => {
    try {
      const { identifier } = req.query;
      if (!identifier) {
        return res
          .status(400)
          .json({ error: 'Identifier query parameter is required.' });
      }

      let orderDoc;
      if (identifier.match(/^SHC-\d{5}$/)) {
        orderDoc = await ordersCollection.doc(identifier).get();
      } else if (identifier.length === 26 && identifier.match(/^\d+$/)) {
        const snapshot = await ordersCollection
          .where('externalId', '==', identifier)
          .limit(1)
          .get();
        if (!snapshot.empty) {
          orderDoc = snapshot.docs[0];
        }
      }

      if (!orderDoc || !orderDoc.exists) {
        return res
          .status(404)
          .json({ error: 'Order not found with provided identifier.' });
      }

      res.json({ id: orderDoc.id, ...orderDoc.data() });
    } catch (err) {
      console.error('Error finding order:', err);
      res.status(500).json({ error: 'Failed to find order' });
    }
  });

  router.get('/orders/by-user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
      }

      const snapshot = await ordersCollection
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();
      const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      res.json(orders);
    } catch (err) {
      console.error("Error fetching user's orders:", err);
      res.status(500).json({ error: "Failed to fetch user orders" });
    }
  });

  router.post('/submit-order', async (req, res) => {
    try {
      const orderData = req.body;
      if (!orderData?.shippingInfo || (typeof orderData.estimatedQuote === 'undefined' && typeof orderData.totalPayout === 'undefined')) {
        return res.status(400).json({ error: 'Invalid order data' });
      }

      const normalizeAmount = (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      };

      const normalizedOriginal = normalizeAmount(orderData.originalQuote);
      const normalizedTotal = normalizeAmount(orderData.totalPayout);
      const normalizedEstimated = normalizeAmount(orderData.estimatedQuote);

      const payoutToPersist =
        normalizedTotal ?? normalizedEstimated ?? normalizedOriginal ?? 0;
      const originalToPersist =
        normalizedOriginal ?? normalizedEstimated ?? normalizedTotal ?? payoutToPersist;

      orderData.originalQuote = originalToPersist;
      orderData.totalPayout = payoutToPersist;
      orderData.estimatedQuote = payoutToPersist;

      if (typeof orderData.shippingKitFee !== 'undefined') {
        const normalizedFee = normalizeAmount(orderData.shippingKitFee);
        orderData.shippingKitFee = normalizedFee ?? 0;
      }

      const fullStateName = orderData.shippingInfo.state;
      if (fullStateName && stateAbbreviations[fullStateName]) {
        orderData.shippingInfo.state = stateAbbreviations[fullStateName];
      } else {
        console.warn(
          `Could not find abbreviation for state: ${fullStateName}. Assuming it is already an abbreviation or is invalid.`
        );
      }

      const orderId = await generateNextOrderNumber();

      let shippingInstructions = '';
      let newOrderStatus = 'order_pending';

      if (orderData.shippingPreference === 'Shipping Kit Requested') {
        shippingInstructions = `
        <p style="margin-top: 24px;">Please note: You requested a shipping kit, which will be sent to you shortly. When it arrives, you'll find a return label inside to send us your device.</p>
        <p>If you have any questions, please reply to this email.</p>
      `;
        newOrderStatus = 'shipping_kit_requested';
      } else {
        shippingInstructions = `
        <p style="margin-top: 24px;">We will send your shipping label shortly.</p>
        <p>If you have any questions, please reply to this email.</p>
      `;
      }

      const customerEmailHtml = ORDER_RECEIVED_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, orderData.shippingInfo.fullName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*DEVICE_NAME\*\*/g, `${orderData.device} ${orderData.storage}`)
        .replace(/\*\*SHIPPING_INSTRUCTION\*\*/g, shippingInstructions);

      const adminEmailHtml = ORDER_PLACED_ADMIN_EMAIL_HTML
        .replace(/\*\*CUSTOMER_NAME\*\*/g, orderData.shippingInfo.fullName)
        .replace(/\*\*ORDER_ID\*\*/g, orderId)
        .replace(/\*\*DEVICE_NAME\*\*/g, `${orderData.device} ${orderData.storage}`)
        .replace(/\*\*ESTIMATED_QUOTE\*\*/g, orderData.estimatedQuote.toFixed(2))
        .replace(/\*\*SHIPPING_PREFERENCE\*\*/g, orderData.shippingPreference);

      const customerMailOptions = {
        from: process.env.EMAIL_USER,
        to: orderData.shippingInfo.email,
        subject: `Your SecondHandCell Order #${orderId} Has Been Received!`,
        html: customerEmailHtml,
      };

      const adminMailOptions = {
        from: process.env.EMAIL_USER,
        to: 'sales@secondhandcell.com',
        subject: `${orderData.shippingInfo.fullName} - placed an order for a ${orderData.device}`,
        html: adminEmailHtml,
      };

      const notificationPromises = [
        transporter.sendMail(customerMailOptions),
        transporter.sendMail(adminMailOptions),
        sendAdminPushNotification(
          '⚡ New Order Placed!',
          `Order #${orderId} for ${orderData.device} from ${orderData.shippingInfo.fullName}.`,
          {
            orderId: orderId,
            userId: orderData.userId || 'guest',
            relatedDocType: 'order',
            relatedDocId: orderId,
            relatedUserId: orderData.userId,
          }
        ).catch((e) => console.error('FCM Send Error (New Order):', e)),
      ];

      const adminsSnapshot = await adminsCollection.get();
      adminsSnapshot.docs.forEach((adminDoc) => {
        notificationPromises.push(
          addAdminFirestoreNotification(
            adminDoc.id,
            `New Order: #${orderId} from ${orderData.shippingInfo.fullName}.`,
            'order',
            orderId,
            orderData.userId
          ).catch((e) =>
            console.error('Firestore Notification Error (New Order):', e)
          )
        );
      });

      await Promise.all(notificationPromises);

      const toSave = {
        ...orderData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: newOrderStatus,
        id: orderId,
      };
      await writeOrderBoth(orderId, toSave);

      res.status(201).json({ message: 'Order submitted', orderId: orderId });
    } catch (err) {
      console.error('Error submitting order:', err);
      res.status(500).json({ error: 'Failed to submit order' });
    }
  });

  router.post('/generate-label/:id', async (req, res) => {
    try {
      const doc = await ordersCollection.doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ error: 'Order not found' });

      const order = { id: doc.id, ...doc.data() };
      const buyerShippingInfo = order.shippingInfo;
      const orderIdForLabel = order.id || 'N/A';
      const nowTimestamp = admin.firestore.Timestamp.now();
      const statusTimestamp = nowTimestamp;
      const labelRecords = cloneShipEngineLabelMap(order.shipEngineLabels);
      const generatedStatus =
        order.shippingPreference === 'Shipping Kit Requested'
          ? 'needs_printing'
          : 'label_generated';

      const outboundPackageData = {
        service_code: 'usps_first_class_mail',
        dimensions: { unit: 'inch', height: 2, width: 4, length: 6 },
        weight: { ounces: 4, unit: 'ounce' },
      };

      const inboundPackageData = {
        service_code: 'usps_first_class_mail',
        dimensions: { unit: 'inch', height: 2, width: 4, length: 6 },
        weight: { ounces: 8, unit: 'ounce' },
      };

      const swiftBuyBackAddress = {
        name: 'SHC Returns',
        company_name: 'SecondHandCell',
        phone: '3475591707',
        address_line1: '1602 MCDONALD AVE STE REAR ENTRANCE',
        city_locality: 'Brooklyn',
        state_province: 'NY',
        postal_code: '11230-6336',
        country_code: 'US',
      };

      const buyerAddress = {
        name: buyerShippingInfo.fullName,
        phone: '3475591707',
        address_line1: buyerShippingInfo.streetAddress,
        city_locality: buyerShippingInfo.city,
        state_province: buyerShippingInfo.state,
        postal_code: buyerShippingInfo.zipCode,
        country_code: 'US',
      };

      let customerLabelData;
      let updateData = {
        status: generatedStatus,
        labelGeneratedAt: statusTimestamp,
        lastStatusUpdateAt: statusTimestamp,
      };
      if (generatedStatus === 'needs_printing') {
        updateData.needsPrintingAt = statusTimestamp;
      }
      let customerEmailSubject = '';
      let customerEmailHtml = '';
      let customerMailOptions;

      if (order.shippingPreference === 'Shipping Kit Requested') {
        const outboundLabelData = await createShipEngineLabel(
          swiftBuyBackAddress,
          buyerAddress,
          `${orderIdForLabel}-OUTBOUND-KIT`,
          outboundPackageData
        );

        const inboundLabelData = await createShipEngineLabel(
          buyerAddress,
          swiftBuyBackAddress,
          `${orderIdForLabel}-INBOUND-DEVICE`,
          inboundPackageData
        );

        customerLabelData = outboundLabelData;

        labelRecords.outbound = {
          id:
            outboundLabelData.label_id ||
            outboundLabelData.labelId ||
            outboundLabelData.shipengine_label_id ||
            null,
          trackingNumber: outboundLabelData.tracking_number || null,
          downloadUrl: outboundLabelData.label_download?.pdf || null,
          carrierCode:
            outboundLabelData.shipment?.carrier_id ||
            outboundLabelData.carrier_code ||
            null,
          serviceCode:
            outboundLabelData.shipment?.service_code ||
            outboundPackageData.service_code ||
            null,
          generatedAt: nowTimestamp,
          createdAt: nowTimestamp,
          status: 'active',
          voidStatus: 'active',
          message: null,
          displayName: 'Outbound Shipping Label',
          labelReference: `${orderIdForLabel}-OUTBOUND-KIT`,
        };

        labelRecords.inbound = {
          id:
            inboundLabelData.label_id ||
            inboundLabelData.labelId ||
            inboundLabelData.shipengine_label_id ||
            null,
          trackingNumber: inboundLabelData.tracking_number || null,
          downloadUrl: inboundLabelData.label_download?.pdf || null,
          carrierCode:
            inboundLabelData.shipment?.carrier_id ||
            inboundLabelData.carrier_code ||
            null,
          serviceCode:
            inboundLabelData.shipment?.service_code ||
            inboundPackageData.service_code ||
            null,
          generatedAt: nowTimestamp,
          createdAt: nowTimestamp,
          status: 'active',
          voidStatus: 'active',
          message: null,
          displayName: 'Inbound Shipping Label',
          labelReference: `${orderIdForLabel}-INBOUND-DEVICE`,
        };

        updateData = {
          ...updateData,
          outboundLabelUrl: outboundLabelData.label_download?.pdf,
          outboundTrackingNumber: outboundLabelData.tracking_number,
          inboundLabelUrl: inboundLabelData.label_download?.pdf,
          inboundTrackingNumber: inboundLabelData.tracking_number,
          uspsLabelUrl: inboundLabelData.label_download?.pdf,
          trackingNumber: inboundLabelData.tracking_number,
        };

        customerEmailSubject = `Your SecondHandCell Shipping Kit for Order #${order.id} is on its Way!`;
        customerEmailHtml = SHIPPING_KIT_EMAIL_HTML
          .replace(/\*\*CUSTOMER_NAME\*\*/g, order.shippingInfo.fullName)
          .replace(/\*\*ORDER_ID\*\*/g, order.id)
          .replace(
            /\*\*TRACKING_NUMBER\*\*/g,
            customerLabelData.tracking_number || 'N/A'
          );

        customerMailOptions = {
          from: process.env.EMAIL_USER,
          to: order.shippingInfo.email,
          subject: customerEmailSubject,
          html: customerEmailHtml,
        };
      } else if (order.shippingPreference === 'Email Label Requested') {
        customerLabelData = await createShipEngineLabel(
          buyerAddress,
          swiftBuyBackAddress,
          `${orderIdForLabel}-INBOUND-DEVICE`,
          inboundPackageData
        );

        const labelDownloadLink = customerLabelData.label_download?.pdf;
        if (!labelDownloadLink) {
          console.error(
            'ShipEngine did not return a downloadable label PDF for order:',
            order.id,
            customerLabelData
          );
          throw new Error('Label PDF link not available from ShipEngine.');
        }

        labelRecords.email = {
          id:
            customerLabelData.label_id ||
            customerLabelData.labelId ||
            customerLabelData.shipengine_label_id ||
            null,
          trackingNumber: customerLabelData.tracking_number || null,
          downloadUrl: labelDownloadLink,
          carrierCode:
            customerLabelData.shipment?.carrier_id ||
            customerLabelData.carrier_code ||
            null,
          serviceCode:
            customerLabelData.shipment?.service_code ||
            inboundPackageData.service_code ||
            null,
          generatedAt: nowTimestamp,
          createdAt: nowTimestamp,
          status: 'active',
          voidStatus: 'active',
          message: null,
          displayName: 'Email Shipping Label',
          labelReference: `${orderIdForLabel}-INBOUND-DEVICE`,
        };

        updateData = {
          ...updateData,
          uspsLabelUrl: labelDownloadLink,
          trackingNumber: customerLabelData.tracking_number,
        };

        customerEmailSubject = `Your SecondHandCell Shipping Label for Order #${order.id}`;
        customerEmailHtml = SHIPPING_LABEL_EMAIL_HTML
          .replace(/\*\*CUSTOMER_NAME\*\*/g, order.shippingInfo.fullName)
          .replace(/\*\*ORDER_ID\*\*/g, order.id)
          .replace(
            /\*\*TRACKING_NUMBER\*\*/g,
            customerLabelData.tracking_number || 'N/A'
          )
          .replace(/\*\*LABEL_DOWNLOAD_LINK\*\*/g, labelDownloadLink);

        customerMailOptions = {
          from: process.env.EMAIL_USER,
          to: order.shippingInfo.email,
          subject: customerEmailSubject,
          html: customerEmailHtml,
        };
      } else {
        throw new Error(`Unknown shipping preference: ${order.shippingPreference}`);
      }

      const labelIds = buildLabelIdList(labelRecords);
      const hasActive = Object.values(labelRecords).some((entry) =>
        entry && entry.id ? isLabelPendingVoid(entry) : false
      );

      updateData = {
        ...updateData,
        shipEngineLabels: labelRecords,
        shipEngineLabelIds: labelIds,
        shipEngineLabelsLastUpdatedAt: nowTimestamp,
        hasShipEngineLabel: labelIds.length > 0,
        hasActiveShipEngineLabel: hasActive,
        shipEngineLabelId:
          labelRecords.inbound?.id ||
          labelRecords.email?.id ||
          labelIds[0] ||
          null,
        labelVoidStatus: labelIds.length ? 'active' : order.labelVoidStatus || null,
        labelVoidMessage: null,
      };

      await updateOrderBoth(req.params.id, updateData);

      await transporter.sendMail(customerMailOptions);

      res.json({ message: 'Label(s) generated successfully', orderId: order.id, ...updateData });
    } catch (err) {
      console.error('Error generating label:', err.response?.data || err.message || err);
      res.status(500).json({ error: 'Failed to generate label' });
    }
  });

  router.post('/orders/:id/void-label', async (req, res) => {
    try {
      const orderId = req.params.id;
      const labels = Array.isArray(req.body?.labels) ? req.body.labels : [];
      if (!labels.length) {
        return res
          .status(400)
          .json({ error: 'Please select at least one label to void.' });
      }

      const doc = await ordersCollection.doc(orderId).get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const order = { id: doc.id, ...doc.data() };
      const { results } = await handleLabelVoid(order, labels, {
        reason: 'manual',
      });

      try {
        await sendVoidNotificationEmail(order, results, { reason: 'manual' });
      } catch (notificationError) {
        console.error(
          `Failed to send manual void notification for order ${orderId}:`,
          notificationError
        );
      }

      res.json({ orderId, results });
    } catch (error) {
      console.error('Error voiding label(s):', error);
      res.status(500).json({
        error: error.message || 'Failed to void the selected label(s).',
      });
    }
  });

  router.get('/packing-slip/:id', async (req, res) => {
    try {
      const doc = await ordersCollection.doc(req.params.id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const order = { id: doc.id, ...doc.data() };
      const pdfData = await generateCustomLabelPdf(order);
      const buffer = Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="packing-slip-${order.id}.pdf"`
      );
      res.send(buffer);
    } catch (error) {
      console.error('Failed to generate packing slip PDF:', error);
      res.status(500).json({ error: 'Failed to generate packing slip PDF' });
    }
  });

  router.get('/print-bundle/:id', async (req, res) => {
    try {
      const doc = await ordersCollection.doc(req.params.id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const order = { id: doc.id, ...doc.data() };
      const labelUrlCandidates = [];

      if (order.shippingPreference === 'Shipping Kit Requested') {
        labelUrlCandidates.push(order.outboundLabelUrl, order.inboundLabelUrl);
      } else if (order.uspsLabelUrl) {
        labelUrlCandidates.push(order.uspsLabelUrl);
      } else {
        labelUrlCandidates.push(order.outboundLabelUrl, order.inboundLabelUrl);
      }

      const uniqueLabelUrls = Array.from(
        new Set(labelUrlCandidates.filter(Boolean))
      );

      const downloadedLabels = await Promise.all(
        uniqueLabelUrls.map(async (url) => {
          try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            return Buffer.from(response.data);
          } catch (downloadError) {
            console.error(
              `Failed to download label from ${url}:`,
              downloadError.message || downloadError
            );
            return null;
          }
        })
      );

      const bagLabelData = await generateBagLabelPdf(order);

      const pdfParts = [
        ...downloadedLabels.filter(Boolean),
        Buffer.isBuffer(bagLabelData) ? bagLabelData : Buffer.from(bagLabelData),
      ].filter(Boolean);

      const merged = await mergePdfBuffers(pdfParts);
      const mergedBuffer = Buffer.isBuffer(merged) ? merged : Buffer.from(merged);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="print-bundle-${order.id}.pdf"`
      );
      res.send(mergedBuffer);
    } catch (error) {
      console.error('Failed to generate print bundle:', error);
      res.status(500).json({ error: 'Failed to prepare print bundle' });
    }
  });

  return router;
}

module.exports = createOrdersRouter;
