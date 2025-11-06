const axios = require('axios');

const DEFAULT_CARRIER_CODE = 'stamps_com';
const INBOUND_TRACKING_STATUSES = new Set([
    'kit_delivered',
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
    const hasInbound = Boolean(order?.inboundTrackingNumber);

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
        ? order.inboundTrackingNumber
        : order.outboundTrackingNumber;

    if (!trackingNumber) {
        throw new Error('Tracking number not available for this order');
    }

    const carrierCode = useInbound
        ? order.inboundCarrierCode || defaultCarrierCode
        : order.outboundCarrierCode || defaultCarrierCode;
    const trackingUrl = `https://api.shipengine.com/v1/tracking?carrier_code=${encodeURIComponent(
        carrierCode
    )}&tracking_number=${encodeURIComponent(trackingNumber)}`;

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

    if (!useInbound && delivered) {
        updatePayload.status = 'kit_delivered';
        if (typeof serverTimestamp === 'function') {
            updatePayload.kitDeliveredAt = serverTimestamp();
        }
    }

    return { updatePayload, delivered, direction };
}

module.exports = {
    DEFAULT_CARRIER_CODE,
    extractTrackingFields,
    buildKitTrackingUpdate,
    INBOUND_TRACKING_STATUSES,
};
