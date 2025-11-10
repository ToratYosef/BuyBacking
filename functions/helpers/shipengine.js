const axios = require('axios');

const DEFAULT_CARRIER_CODE = 'stamps_com';

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
    const isShippingKit = shippingPreference === 'shipping kit requested';

    if (!useInbound && delivered) {
        updatePayload.status = 'kit_delivered';
        if (typeof serverTimestamp === 'function') {
            updatePayload.kitDeliveredAt = serverTimestamp();
        }
    }

    if (useInbound && delivered) {
        const deliveredStamp = typeof serverTimestamp === 'function' ? serverTimestamp() : null;
        if (deliveredStamp) {
            updatePayload.labelDeliveredAt = deliveredStamp;
        }
        updatePayload.inboundTrackingLocked = true;

        if (isShippingKit) {
            updatePayload.status = 'delivered_to_us';
            if (deliveredStamp) {
                updatePayload.kitDeliveredToUsAt = deliveredStamp;
            }
        } else {
            updatePayload.status = 'received';
            if (deliveredStamp) {
                updatePayload.receivedAt = deliveredStamp;
            }
            updatePayload.autoReceived = true;
        }
    }

    return { updatePayload, delivered, direction };
}

module.exports = {
    DEFAULT_CARRIER_CODE,
    extractTrackingFields,
    buildKitTrackingUpdate,
    buildTrackingUrl,
    resolveCarrierCode,
    INBOUND_TRACKING_STATUSES,
};
