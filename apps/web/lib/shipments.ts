import ShipEngine from 'shipengine';
import { adminDb } from './firebaseAdmin';

export interface ShipmentRequest {
  orderId: string;
  to: {
    name: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
  };
  from: {
    name: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
  };
  serviceCode: string;
}

export async function createShippingLabel(request: ShipmentRequest) {
  if (!process.env.SHIPENGINE_API_KEY) {
    throw new Error('SHIPENGINE_API_KEY is not configured');
  }

  const shipengine = new ShipEngine({ apiKey: process.env.SHIPENGINE_API_KEY });

  const label = await shipengine.createLabelFromShipmentDetails({
    shipment: {
      service_code: request.serviceCode,
      ship_to: {
        name: request.to.name,
        address_line1: request.to.addressLine1,
        city_locality: request.to.city,
        state_province: request.to.state,
        postal_code: request.to.postalCode,
        country_code: 'US',
      },
      ship_from: {
        name: request.from.name,
        address_line1: request.from.addressLine1,
        city_locality: request.from.city,
        state_province: request.from.state,
        postal_code: request.from.postalCode,
        country_code: 'US',
      },
    },
  });

  await adminDb().collection('orders').doc(request.orderId).set(
    {
      shipping: {
        method: 'label',
        status: 'label_created',
        carrier: label.shipment?.carrier_code ?? null,
        labelId: label.label_id,
        trackingNumber: label.tracking_number,
        labelDownloadUrl: label.label_download?.pdf ?? null,
      },
    },
    { merge: true }
  );

  return label;
}
