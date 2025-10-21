const axios = require('axios');

const DEFAULT_CARRIER_CODE = 'stamps_com';

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
    if (!order?.outboundTrackingNumber) {
        throw new Error('Outbound tracking number not available for this order');
    }

    if (!shipengineKey) {
        throw new Error('ShipEngine API key not configured');
    }

    const carrierCode = order.outboundCarrierCode || defaultCarrierCode;
    const trackingUrl = `https://api.shipengine.com/v1/tracking?carrier_code=${encodeURIComponent(
        carrierCode
    )}&tracking_number=${encodeURIComponent(order.outboundTrackingNumber)}`;

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

    const updatePayload = {
        kitTrackingStatus: {
            statusCode,
            statusDescription,
            carrierCode,
            lastUpdated,
            estimatedDelivery,
        },
    };

    if (delivered) {
        updatePayload.status = 'kit_delivered';
        if (typeof serverTimestamp === 'function') {
            updatePayload.kitDeliveredAt = serverTimestamp();
        }
    }

    return { updatePayload, delivered };
}

module.exports = {
    DEFAULT_CARRIER_CODE,
    extractTrackingFields,
    buildKitTrackingUpdate,
};