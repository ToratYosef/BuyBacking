// export-firestore-all.cjs
// Exports ALL Firestore documents (including subcollections)
// Skips admins/*/notifications/* completely (does not scan them)

const fs = require("fs");
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const outPath = process.env.OUT || "firestore_export.ndjson";
const stream = fs.createWriteStream(outPath, { flags: "w" });

let exportedCount = 0;

// ------------------
// Helpers
// ------------------

function splitPath(p) {
  const parts = p.split("/").filter(Boolean);
  const doc_id = parts[parts.length - 1] || null;
  const collection = parts[0] || null;
  const parent_path =
    parts.length > 1 ? parts.slice(0, parts.length - 1).join("/") : null;

  return { collection, doc_id, parent_path };
}

function shouldSkip(docPath) {
  // Skip admin notification docs
  if (/^admins\/[^/]+\/notifications\//.test(docPath)) return true;
  return false;
}

// ------------------
// Recursive Export
// ------------------

async function exportDocRecursive(docRef) {
  const docPath = docRef.path;

  // Skip before any read
  if (shouldSkip(docPath)) return;

  const snap = await docRef.get();
  if (!snap.exists) return;

  const { collection, doc_id, parent_path } = splitPath(docPath);
  const data = snap.data({ serverTimestamps: "estimate" });

  const record = {
    path: docPath,
    collection,
    doc_id,
    parent_path,
    data,
    create_time: snap.createTime
      ? snap.createTime.toDate().toISOString()
      : null,
    update_time: snap.updateTime
      ? snap.updateTime.toDate().toISOString()
      : null,
  };

  if (!stream.write(JSON.stringify(record) + "\n")) {
    await new Promise((res) => stream.once("drain", res));
  }

  exportedCount++;

  if (exportedCount % 1000 === 0) {
    console.log(`Exported ${exportedCount} docs...`);
  }

  // Recurse into subcollections
  const subcols = await docRef.listCollections();

  for (const col of subcols) {
    // If current doc is admins/{uid}, skip notifications subcollection entirely
    if (/^admins\/[^/]+$/.test(docPath) && col.id === "notifications") {
      continue;
    }

    const subSnaps = await col.get();
    for (const subDoc of subSnaps.docs) {
      await exportDocRecursive(subDoc.ref);
    }
  }
}

// ------------------
// Run
// ------------------

async function run() {
  console.log("Starting Firestore export...");

  const rootCols = await db.listCollections();

  for (const col of rootCols) {
    console.log(`Scanning root collection: ${col.id}`);
    const snaps = await col.get();

    for (const d of snaps.docs) {
      await exportDocRecursive(d.ref);
    }
  }

  stream.end();

  console.log(`\n✅ Export complete.`);
  console.log(`Total documents exported: ${exportedCount}`);
  console.log(`Output file: ${outPath}`);
}

run().catch((e) => {
  console.error("Export failed:", e);
  process.exit(1);
});
