import fs from 'node:fs';
import path from 'node:path';
import { create } from 'xmlbuilder2';
import admin from 'firebase-admin';

const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json';
const OUTPUT_FILE = './device-prices.xml';
const SUPPORTED_BRANDS = ['iphone', 'samsung', 'google_pixel', 'ipad', 'macbook', 'other'];
const CONDITIONS_TO_KEEP = ['flawless', 'good', 'fair', 'broken'];

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`Service account not found at ${SERVICE_ACCOUNT_PATH}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
  ),
});

const db = admin.firestore();

async function fetchAllModels() {
  const devices = [];

  for (const brand of SUPPORTED_BRANDS) {
    const snapshot = await db.collection(`devices/${brand}/models`).get();
    snapshot.forEach((doc) => {
      const data = doc.data();
      devices.push({
        parentDevice: brand,
        modelID: doc.id,
        ...data,
      });
    });
  }

  return devices;
}

function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function computeDeeplink(device) {
  const brandSegment = normalizeSlug(device.brand || device.parentDevice);
  const slugSource = device.slug || device.modelID || device.name;
  const slugSegment = normalizeSlug(slugSource);

  if (!brandSegment && !slugSegment) {
    return null;
  }

  let deviceSegment = slugSegment;
  if (brandSegment && deviceSegment && !deviceSegment.startsWith(`${brandSegment}-`)) {
    deviceSegment = `${brandSegment}-${deviceSegment}`;
  } else if (!deviceSegment) {
    deviceSegment = brandSegment;
  }

  deviceSegment = deviceSegment.replace(/-+/g, '-');

  if (!deviceSegment) {
    return null;
  }

  return `https://secondhandcell.com/sell/?device=${deviceSegment}&storage={storage}&carrier={carrier}&power={power}&functionality={functionality}&quality={quality}`;
}

function buildXml(devices) {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('models');

  devices.forEach((device) => {
    const {
      parentDevice,
      modelID,
      prices = {},
      slug,
      imageUrl,
      name,
      brand,
      deeplink,
    } = device;

    const modelNode = root.ele('model');
    modelNode.ele('parentDevice').txt(parentDevice || brand || '');
    modelNode.ele('modelID').txt(slug || modelID);

    Object.keys(prices)
      .sort()
      .forEach((storageSize) => {
        const priceNode = modelNode.ele('prices');
        priceNode.ele('storageSize').txt(storageSize);

        const priceValueNode = priceNode.ele('priceValue');
        const connectivityBands = prices[storageSize] || {};

        Object.keys(connectivityBands)
          .sort()
          .forEach((carrierState) => {
            const carrierNode = priceValueNode.ele(carrierState);

            CONDITIONS_TO_KEEP.forEach((condition) => {
              const value = connectivityBands[carrierState]?.[condition];
              if (value !== undefined && value !== null) {
                carrierNode.ele(condition).txt(String(value));
              }
            });
          });
      });

    if (slug) modelNode.ele('slug').txt(slug);
    if (imageUrl) modelNode.ele('imageUrl').txt(imageUrl);
    if (name) modelNode.ele('name').txt(name);
    modelNode.ele('brand').txt(brand || parentDevice || '');

    const deeplinkValue = deeplink || computeDeeplink(device);
    if (deeplinkValue) {
      modelNode.ele('deeplink').txt(deeplinkValue);
    }
  });

  return root.end({
    prettyPrint: true,
    indent: '  ',
    newline: '\n',
  });
}

(async () => {
  try {
    const devices = await fetchAllModels();
    const xml = buildXml(devices);
    fs.writeFileSync(path.resolve(OUTPUT_FILE), xml, 'utf8');
    console.log(`Wrote ${devices.length} models to ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('Export failed:', err);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
})();
