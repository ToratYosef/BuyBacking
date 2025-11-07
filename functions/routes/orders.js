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
      if (!orderData?.shippingInfo || !orderData?.estimatedQuote) {
        return res.status(400).json({ error: 'Invalid order data' });
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
        bcc: ['saulsetton16@gmail.com'],
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

  router.post('/print-bundle/bulk', async (req, res) => {
    try {
      const rawIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
      const orderIds = rawIds
        .map((id) => (typeof id === 'string' ? id.trim() : String(id || '').trim()))
        .filter(Boolean);

      if (!orderIds.length) {
        return res.status(400).json({ error: 'orderIds array is required.' });
      }

      const uniqueIds = Array.from(new Set(orderIds));
      const pdfBuffers = [];
      const printed = [];
      const skipped = [];

      for (const orderId of uniqueIds) {
        try {
          const doc = await ordersCollection.doc(orderId).get();
          if (!doc.exists) {
            skipped.push({ id: orderId, reason: 'not_found' });
            continue;
          }

          const order = { id: doc.id, ...doc.data() };
          const preference = (order.shippingPreference || '').toString().toLowerCase();
          if (preference !== 'shipping kit requested') {
            skipped.push({ id: orderId, reason: 'not_kit_order' });
            continue;
          }

          const labelUrls = [order.outboundLabelUrl, order.inboundLabelUrl]
            .filter((url) => typeof url === 'string' && url.trim());

          if (labelUrls.length < 2) {
            skipped.push({ id: orderId, reason: 'missing_labels' });
            continue;
          }

          const downloadedLabels = await Promise.all(
            labelUrls.map(async (url) => {
              try {
                const response = await axios.get(url, { responseType: 'arraybuffer' });
                return Buffer.from(response.data);
              } catch (downloadError) {
                console.error(
                  `Failed to download label for order ${orderId} from ${url}:`,
                  downloadError.message || downloadError
                );
                return null;
              }
            })
          );

          const validLabels = downloadedLabels.filter(Boolean);
          if (!validLabels.length) {
            skipped.push({ id: orderId, reason: 'label_download_failed' });
            continue;
          }

          const bagLabelData = await generateBagLabelPdf(order);
          const bagBuffer = Buffer.isBuffer(bagLabelData) ? bagLabelData : Buffer.from(bagLabelData);

          pdfBuffers.push(...validLabels, bagBuffer);
          printed.push(orderId);
        } catch (orderError) {
          console.error(
            `Failed to prepare bundle for order ${orderId}:`,
            orderError.message || orderError
          );
          skipped.push({ id: orderId, reason: 'processing_error' });
        }
      }

      if (!pdfBuffers.length) {
        return res.status(400).json({
          error: 'No valid orders were provided for bulk printing.',
          printed,
          skipped,
        });
      }

      const merged = await mergePdfBuffers(pdfBuffers);
      const mergedBuffer = Buffer.isBuffer(merged) ? merged : Buffer.from(merged);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="bulk-print-bundle.pdf"');
      res.send(mergedBuffer);
    } catch (error) {
      console.error('Failed to generate bulk print bundle:', error);
      res.status(500).json({ error: 'Failed to prepare bulk print bundle' });
    }
  });

  return router;
}

module.exports = createOrdersRouter;
