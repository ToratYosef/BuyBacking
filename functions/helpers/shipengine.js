const axios = require('axios');

const DEFAULT_CARRIER_CODE = 'stamps_com';

const IN_TRANSIT_CODES = new Set(['IT', 'OF', 'AC', 'AT', 'NY', 'UN']);
const IN_TRANSIT_KEYWORDS = [
    'in transit',
    'out for delivery',
    'arrived at',
    'departed',
    'processed',
    'picked up',
    'en route',
    'accept',
    'moving through network',
];

const STATUS_PRIORITY = new Map([
    ['order_pending', 5],
    ['shipping_kit_requested', 10],
    ['kit_needs_printing', 15],
    ['needs_printing', 18],
    ['kit_sent', 20],
    ['kit_on_the_way_to_customer', 30],
    ['kit_delivered', 40],
    ['kit_on_the_way_to_us', 50],
    ['label_generated', 55],
    ['emailed', 56],
    ['phone_on_the_way', 60],
    ['delivered_to_us', 70],
    ['received', 80],
    ['completed', 90],
    ['return-label-generated', 95],
    ['re-offered-pending', 100],
    ['requote_accepted', 105],
    ['re-offered-accepted', 110],
    ['re-offered-auto-accepted', 110],
    ['re-offered-declined', 110],
    ['cancelled', 200],
]);

const PROTECTED_STATUSES = new Set([
    'received',
    'completed',
    're-offered-pending',
    're-offered-accepted',
    're-offered-auto-accepted',
    're-offered-declined',
    'return-label-generated',
    'requote_accepted',
    'cancelled',
]);

function isTransitStatus(statusCode, statusDescription) {
    const normalizedCode = typeof statusCode === 'string' ? statusCode.trim().toUpperCase() : '';
    if (normalizedCode && IN_TRANSIT_CODES.has(normalizedCode)) {
        return true;
    }

    const normalizedDescription = typeof statusDescription === 'string' ? statusDescription.toLowerCase() : '';
    if (!normalizedDescription || normalizedDescription.includes('delivered')) {
        return false;
    }

    return IN_TRANSIT_KEYWORDS.some((keyword) => normalizedDescription.includes(keyword));
}

function normalizeStatus(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function shouldApplyStatus(currentStatus, nextStatus) {
    const normalizedNext = normalizeStatus(nextStatus);
    if (!normalizedNext) {
        return false;
    }

    const normalizedCurrent = normalizeStatus(currentStatus);
    if (!normalizedCurrent) {
        return true;
    }

    if (normalizedCurrent === normalizedNext) {
        return false;
    }

    if (PROTECTED_STATUSES.has(normalizedCurrent)) {
        return false;
    }

    const currentPriority = STATUS_PRIORITY.get(normalizedCurrent) || 0;
    const nextPriority = STATUS_PRIORITY.get(normalizedNext) || 0;

    if (currentPriority && nextPriority && currentPriority >= nextPriority) {
        return false;
    }

    return true;
}

function normalizeCarrierCode(code) {
    if (!code || typeof code !== 'string') {
        return null;
    }
    const trimmed = code.trim();
    return trimmed ? trimmed : null;
}

function findCarrierCodeInLabels(labels) {
    if (!labels || typeof labels !== 'object') {
        return null;
    }

    for (const value of Object.values(labels)) {
        if (!value || typeof value !== 'object') {
            continue;
        }

        const direct =
            normalizeCarrierCode(value.carrier_code) || normalizeCarrierCode(value.carrierCode);
        if (direct) {
            return direct;
        }

        const shipmentCarrier =
            normalizeCarrierCode(value.shipment?.carrier_code) ||
            normalizeCarrierCode(value.shipment?.carrierCode);
        if (shipmentCarrier) {
            return shipmentCarrier;
        }
    }

    return null;
}

function resolveCarrierCode(order = {}, direction = 'outbound', defaultCarrierCode = DEFAULT_CARRIER_CODE) {
    const candidates = [];

    if (direction === 'inbound') {
        candidates.push(order?.inboundCarrierCode);
        candidates.push(order?.labelTrackingCarrierCode);
    } else {
        candidates.push(order?.outboundCarrierCode);
    }

    const shipEngineLabels = order?.shipEngineLabels;
    if (shipEngineLabels && typeof shipEngineLabels === 'object') {
        if (direction === 'inbound') {
            candidates.push(shipEngineLabels.inbound?.shipment?.carrier_code);
            candidates.push(shipEngineLabels.inbound?.shipment?.carrierCode);
            candidates.push(shipEngineLabels.customer?.shipment?.carrier_code);
            candidates.push(shipEngineLabels.customer?.shipment?.carrierCode);
            candidates.push(shipEngineLabels.return?.shipment?.carrier_code);
            candidates.push(shipEngineLabels.return?.shipment?.carrierCode);
        } else {
            candidates.push(shipEngineLabels.outbound?.shipment?.carrier_code);
            candidates.push(shipEngineLabels.outbound?.shipment?.carrierCode);
            candidates.push(shipEngineLabels.kit?.shipment?.carrier_code);
            candidates.push(shipEngineLabels.kit?.shipment?.carrierCode);
        }

        candidates.push(shipEngineLabels.primary?.shipment?.carrier_code);
        candidates.push(shipEngineLabels.primary?.shipment?.carrierCode);
    }

    const directCandidate = candidates
        .map((value) => normalizeCarrierCode(value))
        .find(Boolean);

    if (directCandidate) {
        return directCandidate;
    }

    const labelCandidate = findCarrierCodeInLabels(shipEngineLabels);
    return labelCandidate || defaultCarrierCode;
}

function buildTrackingUrl({ trackingNumber, carrierCode, defaultCarrierCode = DEFAULT_CARRIER_CODE }) {
    if (!trackingNumber) {
        throw new Error('Tracking number is required to build a ShipEngine tracking URL.');
    }

    const normalizedCarrier = normalizeCarrierCode(carrierCode) || normalizeCarrierCode(defaultCarrierCode);
    if (!normalizedCarrier) {
        throw new Error('Carrier code is required to build a ShipEngine tracking URL.');
    }

    return `https://api.shipengine.com/v1/tracking?carrier_code=${encodeURIComponent(
        normalizedCarrier
    )}&tracking_number=${encodeURIComponent(trackingNumber)}`;
}
const INBOUND_TRACKING_STATUSES = new Set([
    'kit_delivered',
    'kit_on_the_way_to_us',
    'delivered_to_us',
    'label_generated',
    'emailed',
    'received',
    'completed',
    're-offered-pending',
    're-offered-accepted',
    're-offered-declined',
    're-offered-auto-accepted',
    'return-label-generated',
    'requote_accepted',
]);

function extractTrackingFields(trackingData = {}) {
    const statusCode = trackingData.status_code || trackingData.statusCode || null;
    const statusDescription =
        trackingData.status_description ||
        trackingData.statusDescription ||
        trackingData.carrier_status_description ||
        '';

    const normalizedDescription = statusDescription ? statusDescription.toLowerCase() : '';
    const delivered = statusCode === 'DE' || normalizedDescription.includes('delivered');

    return {
        delivered,
        statusCode,
        statusDescription,
        lastUpdated: trackingData.updated_at || trackingData.last_event?.occurred_at || null,
        estimatedDelivery: trackingData.estimated_delivery_date || null,
    };
}

async function buildKitTrackingUpdate(
    order,
    {
        axiosClient = axios,
        shipengineKey,
        defaultCarrierCode = DEFAULT_CARRIER_CODE,
        serverTimestamp,
    } = {}
) {
    const hasOutbound = Boolean(order?.outboundTrackingNumber);
    const hasInbound = Boolean(order?.inboundTrackingNumber || order?.trackingNumber);

    if (!hasOutbound && !hasInbound) {
        throw new Error('Tracking number not available for this order');
    }

    if (!shipengineKey) {
        throw new Error('ShipEngine API key not configured');
    }

    const normalizedStatus = String(order?.status || '').toLowerCase();
    const prefersInbound =
        hasInbound &&
        (String(order?.kitTrackingStatus?.direction || '').toLowerCase() === 'inbound' ||
            INBOUND_TRACKING_STATUSES.has(normalizedStatus));

    const useInbound = (!hasOutbound && hasInbound) || prefersInbound;
    const trackingNumber = useInbound
        ? order.inboundTrackingNumber || order.trackingNumber
        : order.outboundTrackingNumber;

    if (!trackingNumber) {
        throw new Error('Tracking number not available for this order');
    }

    const carrierCode = resolveCarrierCode(order, useInbound ? 'inbound' : 'outbound', defaultCarrierCode);
    const trackingUrl = buildTrackingUrl({ trackingNumber, carrierCode, defaultCarrierCode });

    const response = await axiosClient.get(trackingUrl, {
        headers: {
            'API-Key': shipengineKey,
        },
        timeout: 20000,
    });

    const trackingData = response.data || {};
    const {
        delivered,
        statusCode,
        statusDescription,
        lastUpdated,
        estimatedDelivery,
    } = extractTrackingFields(trackingData);
    const transit = isTransitStatus(statusCode, statusDescription);

    const direction = useInbound ? 'inbound' : 'outbound';
    const statusPayload = {
        statusCode,
        statusDescription,
        carrierCode,
        lastUpdated,
        estimatedDelivery,
        trackingNumber,
        direction,
    };

    const updatePayload = {
        kitTrackingStatus: statusPayload,
    };

    const shippingPreference = String(order?.shippingPreference || '').toLowerCase();
    const isShippingKit =
        shippingPreference === 'shipping kit requested' ||
        (!shippingPreference && Boolean(order?.outboundTrackingNumber));

    if (!delivered && transit) {
        if (!useInbound && isShippingKit && shouldApplyStatus(order?.status, 'kit_on_the_way_to_customer')) {
            updatePayload.status = 'kit_on_the_way_to_customer';
            if (typeof serverTimestamp === 'function') {
                const ts = serverTimestamp();
                updatePayload.lastStatusUpdateAt = ts;
                if (!order?.kitSentAt) {
                    updatePayload.kitSentAt = ts;
                }
            }
        }

        if (useInbound) {
            if (isShippingKit && shouldApplyStatus(order?.status, 'kit_on_the_way_to_us')) {
                updatePayload.status = 'kit_on_the_way_to_us';
                if (typeof serverTimestamp === 'function') {
                    updatePayload.lastStatusUpdateAt = serverTimestamp();
                }
            } else if (!isShippingKit && shouldApplyStatus(order?.status, 'phone_on_the_way')) {
                updatePayload.status = 'phone_on_the_way';
                if (typeof serverTimestamp === 'function') {
                    updatePayload.lastStatusUpdateAt = serverTimestamp();
                }
            }
        }
    }

    if (!useInbound && delivered) {
        if (shouldApplyStatus(order?.status, 'kit_delivered')) {
            updatePayload.status = 'kit_delivered';
            if (typeof serverTimestamp === 'function') {
                updatePayload.kitDeliveredAt = serverTimestamp();
            }
        }
    }

    if (useInbound && delivered) {
        if (isShippingKit) {
            if (shouldApplyStatus(order?.status, 'delivered_to_us')) {
                updatePayload.status = 'delivered_to_us';
                if (typeof serverTimestamp === 'function') {
                    updatePayload.kitDeliveredToUsAt = serverTimestamp();
                }
            }
        } else if (shouldApplyStatus(order?.status, 'received')) {
            updatePayload.status = 'received';
            if (typeof serverTimestamp === 'function') {
                updatePayload.receivedAt = serverTimestamp();
            }
            updatePayload.autoReceived = true;
        }
    }

    return { updatePayload, delivered, direction };
}

const MANUAL_SCAN_ALIASES = {
    kit_on_way_to_customer: 'kit_on_the_way_to_customer',
    kit_on_way_to_us: 'kit_on_the_way_to_us',
    kit_delivered_to_us: 'delivered_to_us',
    kit_delivered_us: 'delivered_to_us',
    kit_received: 'delivered_to_us',
    kit_returned: 'kit_on_the_way_to_us',
    email_label: 'emailed',
    email_labels: 'emailed',
    email_label_sent: 'emailed',
    label_email: 'emailed',
    label_emailed: 'emailed',
    scan_email_labels: 'emailed',
    scan_kit_sent: 'kit_sent',
    scan_kit_delivered: 'kit_delivered',
    scan_kit_delivered_to_us: 'delivered_to_us',
};

const MANUAL_SCAN_EVENTS = {
    kit_sent: {
        status: 'kit_sent',
        direction: 'outbound',
        timestampField: 'kitSentAt',
        statusDescription: 'Manual scan applied: Kit Sent',
    },
    kit_on_the_way_to_customer: {
        status: 'kit_on_the_way_to_customer',
        direction: 'outbound',
        timestampField: 'lastStatusUpdateAt',
        statusDescription: 'Manual scan applied: Kit on the way to customer',
    },
    kit_delivered: {
        status: 'kit_delivered',
        direction: 'outbound',
        timestampField: 'kitDeliveredAt',
        delivered: true,
        statusDescription: 'Manual scan applied: Kit delivered to customer',
    },
    kit_on_the_way_to_us: {
        status: 'kit_on_the_way_to_us',
        direction: 'inbound',
        timestampField: 'lastStatusUpdateAt',
        statusDescription: 'Manual scan applied: Kit on the way to us',
    },
    delivered_to_us: {
        status: 'delivered_to_us',
        direction: 'inbound',
        timestampField: 'kitDeliveredToUsAt',
        delivered: true,
        statusDescription: 'Manual scan applied: Kit delivered to us',
    },
    emailed: {
        status: 'emailed',
        direction: 'inbound',
        timestampField: 'lastStatusUpdateAt',
        statusDescription: 'Manual scan applied: Email label sent',
    },
    label_generated: {
        status: 'label_generated',
        direction: 'inbound',
        timestampField: 'lastStatusUpdateAt',
        statusDescription: 'Manual scan applied: Label generated',
    },
    phone_on_the_way: {
        status: 'phone_on_the_way',
        direction: 'inbound',
        timestampField: 'lastStatusUpdateAt',
        statusDescription: 'Manual scan applied: Device on the way',
    },
    received: {
        status: 'received',
        direction: 'inbound',
        timestampField: 'receivedAt',
        delivered: true,
        statusDescription: 'Manual scan applied: Device received',
        extraFields(timestampValue) {
            return { autoReceived: true, receivedAt: timestampValue };
        },
    },
};

function normalizeScanCommand(value) {
    if (!value) {
        return null;
    }
    const normalized = String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    if (!normalized) {
        return null;
    }

    const withoutPrefix = normalized.startsWith('scan_') ? normalized.slice(5) : normalized;
    return MANUAL_SCAN_ALIASES[withoutPrefix] || withoutPrefix;
}

function buildManualKitScanUpdate(
    order,
    scanCommand,
    { serverTimestamp, defaultCarrierCode = DEFAULT_CARRIER_CODE } = {}
) {
    const normalizedScan = normalizeScanCommand(scanCommand);
    if (!normalizedScan) {
        return null;
    }

    const config = MANUAL_SCAN_EVENTS[normalizedScan];
    if (!config) {
        return null;
    }

    const timestamp = typeof serverTimestamp === 'function' ? serverTimestamp() : null;
    const direction = config.direction || normalizeStatus(order?.kitTrackingStatus?.direction) || 'outbound';

    const trackingNumber =
        direction === 'inbound'
            ? order?.inboundTrackingNumber || order?.trackingNumber
            : order?.outboundTrackingNumber || order?.trackingNumber;

    const carrierCode =
        order?.kitTrackingStatus?.carrierCode ||
        resolveCarrierCode(order, direction === 'inbound' ? 'inbound' : 'outbound', defaultCarrierCode);

    const existingTracking =
        order?.kitTrackingStatus && typeof order.kitTrackingStatus === 'object'
            ? order.kitTrackingStatus
            : {};

    const statusPayload = {
        ...existingTracking,
        direction,
        statusCode: config.statusCode ?? existingTracking.statusCode ?? null,
        statusDescription: config.statusDescription || existingTracking.statusDescription || null,
        lastUpdated: timestamp || existingTracking.lastUpdated || null,
        estimatedDelivery: existingTracking.estimatedDelivery || null,
        trackingNumber: trackingNumber || existingTracking.trackingNumber || null,
        carrierCode: carrierCode || existingTracking.carrierCode || null,
        manual: true,
        manualScan: normalizedScan,
    };

    const updatePayload = {
        kitTrackingStatus: statusPayload,
    };

    let statusApplied = false;
    if (config.status && shouldApplyStatus(order?.status, config.status)) {
        updatePayload.status = config.status;
        statusApplied = true;

        if (config.timestampField && timestamp) {
            updatePayload[config.timestampField] = timestamp;
        }

        if (typeof config.extraFields === 'function') {
            Object.assign(updatePayload, config.extraFields(timestamp));
        }
    }

    return {
        updatePayload,
        delivered: Boolean(config.delivered),
        direction,
        statusApplied,
        appliedStatus: statusApplied ? config.status : null,
        scan: normalizedScan,
        message: config.statusDescription,
    };
}

module.exports = {
    DEFAULT_CARRIER_CODE,
    extractTrackingFields,
    buildKitTrackingUpdate,
    buildTrackingUrl,
    resolveCarrierCode,
    INBOUND_TRACKING_STATUSES,
    buildManualKitScanUpdate,
};
