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

    const { updatePayload, delivered } = await buildKitTrackingUpdate(
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
    assert.equal(axiosStub.calls[0].options.headers['API-Key'], 'demo-key');

    assert.equal(delivered, true);
    assert.equal(updatePayload.status, 'kit_delivered');
    assert.equal(updatePayload.kitDeliveredAt, 'server-ts');
    assert.deepEqual(updatePayload.kitTrackingStatus, {
        statusCode: 'DE',
        statusDescription: 'Package delivered',
        carrierCode: 'usps',
        lastUpdated: '2024-10-01T18:22:00Z',
        estimatedDelivery: '2024-10-01'
    });
});

test('returns in-transit tracking data without forcing delivery status', async () => {
    const axiosStub = createAxiosStub({
        status_description: 'In transit to destination facility'
    });

    const { updatePayload, delivered } = await buildKitTrackingUpdate(
        {
            outboundTrackingNumber: '9400TEST999'
        },
        {
            axiosClient: axiosStub,
            shipengineKey: 'demo-key'
        }
    );

    assert.equal(delivered, false);
    assert.ok(!('status' in updatePayload), 'Order status should remain unchanged when not delivered');
    assert.ok(!('kitDeliveredAt' in updatePayload));
    assert.deepEqual(updatePayload.kitTrackingStatus, {
        statusCode: null,
        statusDescription: 'In transit to destination facility',
        carrierCode: 'stamps_com',
        lastUpdated: null,
        estimatedDelivery: null
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
        /ShipEngine API key not configured/
    );
});