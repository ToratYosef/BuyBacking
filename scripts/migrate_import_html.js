#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const sourceDir = process.argv[2];
  if (!sourceDir) {
    console.error('Usage: node scripts/migrate_import_html.js ./old_site_folder');
    process.exit(1);
  }

  if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    console.error('Missing Firebase credentials. Populate environment variables before running.');
    process.exit(1);
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  const db = getFirestore();
  const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.html'));

  console.log(`Processing ${files.length} HTML files from ${sourceDir}`);
  for (const file of files) {
    const fullPath = path.join(sourceDir, file);
    const html = fs.readFileSync(fullPath, 'utf8');
    const record = await parseDeviceHtml(html, file);
    if (record) {
      console.log(`\nImporting ${record.slug}`);
      await db.collection('devices').doc(record.slug).set(record, { merge: true });
    }
  }

  console.log('Import complete.');
}

async function parseDeviceHtml(html, filename) {
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  const title = $('h1, .product-title').first().text().trim();
  if (!title) {
    console.warn(`Skipping ${filename} – unable to locate title.`);
    return null;
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const specs = {};
  $('.specs li, .specifications li').each((_, el) => {
    const text = $(el).text().trim();
    const [key, value] = text.split(':');
    if (key && value) {
      specs[key.trim()] = value.trim();
    }
  });

  return {
    slug,
    brand: title.split(' ')[0] ?? 'Unknown',
    model: title,
    capacities: extractList($, ['storage', 'capacity']),
    networks: extractList($, ['network', 'carrier']),
    images: $('img').map((_, el) => $(el).attr('src')).get().filter(Boolean),
    specs,
    basePrice: Number($('.price, .offer').first().text().replace(/[^0-9.]/g, '')) || 50,
    conditionMultipliers: {
      Flawless: 1,
      Good: 0.9,
      Fair: 0.75,
      Broken: 0.35,
    },
  };
}

function extractList($, labels) {
  const matches = [];
  labels.forEach((label) => {
    const element = $(`*[data-field*="${label}" i], *:contains('${label}')`).first();
    if (element.length) {
      const text = element.text();
      text
        .split(/[,/\n]/)
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => matches.push(value));
    }
  });
  return [...new Set(matches)];
}

if (import.meta.url === `file://${__filename}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
