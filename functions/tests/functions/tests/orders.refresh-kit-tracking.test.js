const test = require('node:test');
const assert = require('node:assert/strict');

const { buildKitTrackingUpdate } = require('../../../helpers/shipengine');

function createAxiosStub(responseData, tracker = []) {
    return {
        calls: tracker,
        async get(url, options) {
            this.calls.push({ url, options });
            return { data: responseData };
        }
    };
}

test('marks kit as delivered when ShipEngine reports delivery', async () => {
    const axiosStub = createAxiosStub({
        status_code: 'DE',
        status_description: 'Package delivered',
        updated_at: '2024-10-01T18:22:00Z',
        estimated_delivery_date: '2024-10-01'
    });

    const { updatePayload, delivered, direction } = await buildKitTrackingUpdate(
        {
            outboundTrackingNumber: '9400TEST123',
            outboundCarrierCode: 'usps'
        },
        {
            axiosClient: axiosStub,
            shipengineKey: 'demo-key',
            serverTimestamp: () => 'server-ts'
        }
    );

    assert.equal(axiosStub.calls.length, 1, 'ShipEngine should be queried exactly once');
    assert.ok(
        axiosStub.calls[0].url.includes('tracking_number=9400TEST123'),
        'Tracking number should be included in ShipEngine request'
    );
    assert.ok(
        axiosStub.calls[0].url.includes('carrier_code=usps'),
        'Carrier code should be included in ShipEngine request'
    );
    assert.equal(axiosStub.calls[0].options.headers['API-Key'], 'demo-key');

    assert.equal(delivered, true);
    assert.equal(direction, 'outbound');
    assert.equal(updatePayload.status, 'kit_delivered');
    assert.equal(updatePayload.kitDeliveredAt, 'server-ts');
    assert.deepEqual(updatePayload.kitTrackingStatus, {
        statusCode: 'DE',
        statusDescription: 'Package delivered',
        carrierCode: 'usps',
        lastUpdated: '2024-10-01T18:22:00Z',
        estimatedDelivery: '2024-10-01',
        trackingNumber: '9400TEST123',
        direction: 'outbound'
    });
});

test('returns in-transit tracking data without forcing delivery status', async () => {
    const axiosStub = createAxiosStub({
        status_description: 'In transit to destination facility'
    });

    const { updatePayload, delivered, direction } = await buildKitTrackingUpdate(
        {
            outboundTrackingNumber: '9400TEST999'
        },
        {
            axiosClient: axiosStub,
            shipengineKey: 'demo-key'
        }
    );

    assert.equal(delivered, false);
    assert.equal(direction, 'outbound');
    assert.equal(updatePayload.status, 'kit_on_the_way_to_customer');
    assert.ok(!('kitDeliveredAt' in updatePayload));
    assert.ok(
        axiosStub.calls[0].url.includes('carrier_code=stamps_com'),
        'Default carrier code should be used when none is provided'
    );

    assert.deepEqual(updatePayload.kitTrackingStatus, {
        statusCode: null,
        statusDescription: 'In transit to destination facility',
        carrierCode: 'stamps_com',
        lastUpdated: null,
        estimatedDelivery: null,
        trackingNumber: '9400TEST999',
        direction: 'outbound'
    });
});

test('prefers inbound tracking once the kit is delivered', async () => {
    const axiosStub = createAxiosStub({
        status_code: 'IT',
        status_description: 'Inbound in transit'
    });

    const { updatePayload, delivered, direction } = await buildKitTrackingUpdate(
        {
            status: 'kit_delivered',
            outboundTrackingNumber: '9400OUTBOUND1',
            inboundTrackingNumber: '9400INBOUND1'
        },
        {
            axiosClient: axiosStub,
            shipengineKey: 'demo-key'
        }
    );

    assert.equal(delivered, false);
    assert.equal(direction, 'inbound');
    assert.equal(updatePayload.status, 'phone_on_the_way_to_us');
    assert.ok(
        axiosStub.calls[0].url.includes('carrier_code=stamps_com'),
        'Inbound tracking should default to the standard carrier code when unspecified'
    );

    assert.deepEqual(updatePayload.kitTrackingStatus, {
        statusCode: 'IT',
        statusDescription: 'Inbound in transit',
        carrierCode: 'stamps_com',
        lastUpdated: null,
        estimatedDelivery: null,
        trackingNumber: '9400INBOUND1',
        direction: 'inbound'
    });
});

test('marks inbound kits as delivered to us when ShipEngine reports delivery', async () => {
    const axiosStub = createAxiosStub({
        status_code: 'DE',
        status_description: 'Delivered back to warehouse'
    });

    const { updatePayload, delivered, direction } = await buildKitTrackingUpdate(
        {
            status: 'kit_on_the_way_to_us',
            shippingPreference: 'Shipping Kit Requested',
            outboundTrackingNumber: '9400OUT',
            inboundTrackingNumber: '9400IN'
        },
        {
            axiosClient: axiosStub,
            shipengineKey: 'demo-key',
            serverTimestamp: () => 'server-ts'
        }
    );

    assert.equal(delivered, true);
    assert.equal(direction, 'inbound');
    assert.equal(updatePayload.status, 'delivered_to_us');
    assert.equal(updatePayload.kitDeliveredToUsAt, 'server-ts');
    assert.ok(!('autoReceived' in updatePayload));
    assert.deepEqual(updatePayload.kitTrackingStatus, {
        statusCode: 'DE',
        statusDescription: 'Delivered back to warehouse',
        carrierCode: 'stamps_com',
        lastUpdated: null,
        estimatedDelivery: null,
        trackingNumber: '9400IN',
        direction: 'inbound'
    });
});

test('marks emailed label orders as received when inbound delivery is detected', async () => {
    const axiosStub = createAxiosStub({
        status_code: 'DE',
        status_description: 'Delivered to processing center'
    });

    const { updatePayload, delivered, direction } = await buildKitTrackingUpdate(
        {
            status: 'phone_on_the_way',
            shippingPreference: 'Email Label Requested',
            trackingNumber: '1ZEMAIL12345'
        },
        {
            axiosClient: axiosStub,
            shipengineKey: 'demo-key',
            serverTimestamp: () => 'timestamp'
        }
    );

    assert.equal(delivered, true);
    assert.equal(direction, 'inbound');
    assert.equal(updatePayload.status, 'delivered_to_us');
    assert.equal(updatePayload.receivedAt, 'timestamp');
    assert.equal(updatePayload.autoReceived, true);
    assert.deepEqual(updatePayload.kitTrackingStatus, {
        statusCode: 'DE',
        statusDescription: 'Delivered to processing center',
        carrierCode: 'stamps_com',
        lastUpdated: null,
        estimatedDelivery: null,
        trackingNumber: '1ZEMAIL12345',
        direction: 'inbound'
    });
});

test('throws a descriptive error when ShipEngine API key is missing', async () => {
    const axiosStub = createAxiosStub({});

    await assert.rejects(
        () =>
            buildKitTrackingUpdate(
                {
                    outboundTrackingNumber: '9400MISSINGKEY'
                },
                {
                    axiosClient: axiosStub,
                    shipengineKey: ''
                }
            ),
        /ShipEngine or ShipStation API credentials not configured/
    );
});