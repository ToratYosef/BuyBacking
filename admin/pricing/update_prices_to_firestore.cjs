// update_prices_to_firestore.js
// Usage:
//   node update_prices_to_firestore.js /path/to/pricing.xlsx
// Options:
//   --dry-run    Print planned updates without writing
//
// Requires: npm i firebase-admin xlsx
// Auth: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON
//
// Spreadsheet columns expected (case-sensitive):
// Device, Storage, Lock Status, Flawless, Good, Fair, Damaged, Broken, No Power, Slug, Brand
// (Image URL may be present, but this script won't modify it.)

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const admin = require('firebase-admin');

// --- Init Firebase Admin ---
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS env var to your service account JSON.');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

// --- Args ---
const args = process.argv.slice(2);
if (!args[0]) {
  console.error('Usage: node update_prices_to_firestore.js /path/to/pricing.xlsx [--dry-run]');
  process.exit(1);
}
const file = args[0];
const DRY_RUN = args.includes('--dry-run');

// --- Helpers ---
function keySafe(str) {
  return String(str || '').trim();
}
function toNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? parseFloat(x.toFixed(2)) : null;
}
function normalizeBrand(b) {
  const v = String(b || '').toLowerCase().trim();
  if (v === 'iphones' || v === 'iphone') return 'iphone';
  if (v === 'ipads' || v === 'ipad') return 'ipad';
  if (v === 'google pixel' || v === 'pixel' || v === 'googlepixel') return 'google_pixel';
  if (v === 'samsung' || v === 'galaxy') return 'samsung';
  return v;
}
function normalizeStatus(val, brand) {
  const v = String(val || '').toLowerCase().trim();
  if (brand === 'ipad') {
    if (['lte', 'cellular'].includes(v)) return 'lte';
    if (['wifi', 'wi-fi', 'wi fi'].includes(v)) return 'wifi';
  }
  if (v === 'locked') return 'locked';
  return 'unlocked';
}
function normalizeStorage(s) {
  // keep as-is except lowercase; "128GB" -> "128gb"
  return keySafe(s).toLowerCase();
}

// --- Load sheet ---
if (!fs.existsSync(file)) {
  console.error('File not found:', file);
  process.exit(1);
}
const wb = xlsx.readFile(file);
const sheetName = wb.SheetNames[0];
const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });

const required = ['Device','Storage','Lock Status','Flawless','Good','Fair','Damaged','Broken','No Power','Slug','Brand'];
if (!rows.length) {
  console.error('Spreadsheet appears empty.');
  process.exit(1);
}
const missing = required.filter(h => !(h in rows[0]));
if (missing.length) {
  console.error('Missing required column(s):', missing.join(', '));
  process.exit(1);
}

// --- Build per-document price updates ---
// We create a map of doc => { updatePaths ... } and then batch update only those field paths.
const updatesByDoc = new Map(); // key: `devices/{brand}/models/{slug}` => { [fieldPath]: value }

for (const r of rows) {
  const device = keySafe(r['Device']);
  const brand = normalizeBrand(r['Brand']);
  const slug = keySafe(r['Slug']).toLowerCase();
  const storage = normalizeStorage(r['Storage']);
  const status = normalizeStatus(r['Lock Status'], brand);

  if (!['iphone','ipad','samsung','google_pixel'].includes(brand)) {
    console.warn(`Skipping unsupported brand "${brand}" for row device="${device}".`);
    continue;
  }
  if (!slug) {
    console.warn(`Skipping row missing Slug for device="${device}".`);
    continue;
  }
  if (!storage) {
    console.warn(`Skipping row missing Storage for device="${device}" slug="${slug}".`);
    continue;
  }

  // Prices
  const fields = {
    flawless: toNumber(r['Flawless']),
    good:     toNumber(r['Good']),
    fair:     toNumber(r['Fair']),
    damaged:  toNumber(r['Damaged']),
    broken:   toNumber(r['Broken']),
    noPower:  toNumber(r['No Power'])
  };

  const docPath = `devices/${brand}/models/${slug}`;
  if (!updatesByDoc.has(docPath)) updatesByDoc.set(docPath, {});
  const docUpdates = updatesByDoc.get(docPath);

  // Build field paths: prices.<storage>.<status>.<condition>
  for (const [condKey, val] of Object.entries(fields)) {
    const fieldPath = `prices.${storage}.${status}.${condKey}`;
    docUpdates[fieldPath] = val; // may be null (we keep nulls to clear or skip? Keeping explicit null keeps shape consistent)
  }
}

// --- Apply updates in batches ---
async function run() {
  const entries = Array.from(updatesByDoc.entries());
  if (!entries.length) {
    console.log('No valid updates found from the spreadsheet.');
    return;
  }

  console.log(`Prepared updates for ${entries.length} document(s). DRY_RUN=${DRY_RUN}`);

  if (DRY_RUN) {
    // Print a preview of first few documents
    entries.slice(0, Math.min(entries.length, 5)).forEach(([docPath, updates]) => {
      console.log('DOC:', docPath);
      console.log(JSON.stringify(updates, null, 2));
    });
    if (entries.length > 5) console.log('...');
    return;
  }

  const BATCH_LIMIT = 450; // Field updates across docs per batch safeguard
  let batch = db.batch();
  let opCount = 0;
  let batchCount = 1;
  let written = 0;

  for (const [docPath, updates] of entries) {
    const ref = db.doc(docPath);
    batch.set(ref, updates, { merge: true });
    opCount++;
    written++;

    if (opCount >= BATCH_LIMIT) {
      console.log(`Committing batch #${batchCount} (${opCount} docs)...`);
      await batch.commit();
      batch = db.batch();
      opCount = 0;
      batchCount++;
    }
  }
  if (opCount > 0) {
    console.log(`Committing batch #${batchCount} (${opCount} docs)...`);
    await batch.commit();
  }
  console.log(`Done. Updated prices on ${written} document(s).`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
