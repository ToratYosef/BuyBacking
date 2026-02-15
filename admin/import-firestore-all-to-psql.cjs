// import-firestore-all-to-psql.cjs
// Imports NDJSON produced by export-firestore-all.cjs into Postgres.
//
// Usage:
//   DATABASE_URL="postgres://..." node import-firestore-all-to-psql.cjs
//   OUT=firestore_export.ndjson BATCH=1000 DATABASE_URL="postgres://..." node import-firestore-all-to-psql.cjs

const fs = require("fs");
const readline = require("readline");
const { Client } = require("pg");

const inPath = process.env.OUT || "firestore_export.ndjson";
const BATCH_SIZE = Number(process.env.BATCH || 500);

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ Missing DATABASE_URL");
    process.exit(1);
  }

  if (!fs.existsSync(inPath)) {
    console.error(`❌ Input file not found: ${inPath}`);
    console.error(`   Tip: set OUT=yourfile.ndjson or place ${inPath} in this folder.`);
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const rl = readline.createInterface({
    input: fs.createReadStream(inPath),
    crlfDelay: Infinity,
  });

  let total = 0;
  let batch = [];

  async function flushBatch(rows) {
    if (!rows.length) return;

    // 7 columns per row => keep BATCH reasonable to avoid param limits.
    // If you hit "bind message has N parameters" errors, reduce BATCH.
    const values = [];
    const params = [];
    let i = 1;

    for (const r of rows) {
      values.push(
        `($${i++},$${i++},$${i++},$${i++},$${i++}::jsonb,$${i++}::timestamptz,$${i++}::timestamptz)`
      );

      params.push(
        r.path,
        r.collection,
        r.doc_id,
        r.parent_path || null,
        JSON.stringify(r.data ?? {}),
        r.create_time || null,
        r.update_time || null
      );
    }

    const sql = `
      insert into firebase_docs (path, collection, doc_id, parent_path, data, create_time, update_time)
      values ${values.join(",")}
      on conflict (path) do update set
        collection = excluded.collection,
        doc_id = excluded.doc_id,
        parent_path = excluded.parent_path,
        data = excluded.data,
        create_time = excluded.create_time,
        update_time = excluded.update_time,
        exported_at = now()
    `;

    await client.query(sql, params);
  }

  try {
    await client.query("begin");

    for await (const line of rl) {
      if (!line.trim()) continue;

      let r;
      try {
        r = JSON.parse(line);
      } catch (e) {
        console.error("❌ Bad JSON line. First 200 chars:", line.slice(0, 200));
        throw e;
      }

      batch.push(r);
      total++;

      if (batch.length >= BATCH_SIZE) {
        await flushBatch(batch);
        batch = [];

        if (total % (BATCH_SIZE * 10) === 0) {
          console.log(`✅ Imported ${total} docs...`);
        }
      }
    }

    if (batch.length) await flushBatch(batch);

    await client.query("commit");
    console.log(`🎉 Done. Imported ${total} docs into firebase_docs.`);
  } catch (e) {
    await client.query("rollback");
    console.error("❌ Import failed:", e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
