const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');

const router = express.Router();

const ROOT_TABLES = new Set(['orders', 'users', 'admins', 'signed_up_emails', 'counters']);

function parsePath(input) {
  const parts = String(input || '').split('/').filter(Boolean);
  if (!parts.length) throw new Error('Path is required.');

  if (parts[0] === 'devices') {
    const brand = parts[1];
    if (!brand || (brand !== 'iphone' && brand !== 'samsung')) throw new Error('Unsupported device brand path.');
    const table = `devices_${brand}_models`;
    if (parts[2] !== 'models') throw new Error('Unsupported devices path.');
    if (parts.length === 3) return { type: 'collection', table };
    if (parts.length >= 4) return { type: 'doc', table, id: parts[3], tail: parts.slice(4) };
  }

  const root = parts[0];
  if (!ROOT_TABLES.has(root)) throw new Error('Unsupported table path.');
  if (parts.length === 1) return { type: 'collection', table: root };
  return { type: 'doc', table: root, id: parts[1], tail: parts.slice(2) };
}

function fieldExpr(field) {
  const keys = String(field || '').split('.').filter(Boolean);
  if (!keys.length) return "data";
  const safe = keys.map((k) => k.replace(/[^a-zA-Z0-9_]/g, ''));
  return `data #>> '{${safe.join(',')}}'`;
}

router.get('/neon/doc', async (req, res, next) => {
  try {
    const parsed = parsePath(req.query.path);
    if (parsed.type !== 'doc') return res.status(400).json({ ok: false, error: 'Document path required.' });

    const q = await pool.query(`SELECT id, data FROM ${parsed.table} WHERE id = $1`, [parsed.id]);
    if (!q.rows[0]) return res.status(404).json({ ok: false, data: null });

    const row = q.rows[0];
    if (parsed.tail && parsed.tail[0] === 'priceHistory') {
      const history = Array.isArray(row.data?.priceHistory) ? row.data.priceHistory : [];
      return res.json({ ok: true, data: { id: 'priceHistory', ...{ entries: history } } });
    }

    return res.json({ ok: true, data: { id: row.id, ...row.data } });
  } catch (error) { return next(error); }
});

router.post('/neon/query', async (req, res, next) => {
  try {
    const { path, where = [], orderBy = null, limit = null } = req.body || {};
    const parsed = parsePath(path);
    if (parsed.type !== 'collection') return res.status(400).json({ ok: false, error: 'Collection path required.' });

    const conditions = [];
    const values = [];

    for (const w of where) {
      if (!w || w.op !== '==') continue;
      values.push(String(w.value ?? ''));
      conditions.push(`${fieldExpr(w.field)} = $${values.length}`);
    }

    let sql = `SELECT id, data FROM ${parsed.table}`;
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    if (orderBy && orderBy.field) {
      const dir = String(orderBy.direction || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      sql += ` ORDER BY ${fieldExpr(orderBy.field)} ${dir}`;
    }
    if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
      values.push(Number(limit));
      sql += ` LIMIT $${values.length}`;
    }

    const q = await pool.query(sql, values);
    return res.json({ ok: true, docs: q.rows.map((r) => ({ id: r.id, ...r.data })) });
  } catch (error) { return next(error); }
});

router.post('/neon/add', async (req, res, next) => {
  try {
    const { path, data } = req.body || {};
    const parsed = parsePath(path);
    if (parsed.type !== 'collection') return res.status(400).json({ ok: false, error: 'Collection path required.' });
    const id = crypto.randomUUID();
    await pool.query(`INSERT INTO ${parsed.table}(id, data, migrated_at) VALUES ($1, $2::jsonb, NOW())`, [id, data || {}]);
    return res.json({ ok: true, id });
  } catch (error) { return next(error); }
});

router.post('/neon/set', async (req, res, next) => {
  try {
    const { path, data, merge = false } = req.body || {};
    const parsed = parsePath(path);
    if (parsed.type !== 'doc') return res.status(400).json({ ok: false, error: 'Document path required.' });

    if (merge) {
      await pool.query(
        `INSERT INTO ${parsed.table}(id, data, migrated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = ${parsed.table}.data || EXCLUDED.data, migrated_at = NOW()`,
        [parsed.id, data || {}]
      );
    } else {
      await pool.query(
        `INSERT INTO ${parsed.table}(id, data, migrated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, migrated_at = NOW()`,
        [parsed.id, data || {}]
      );
    }

    return res.json({ ok: true, id: parsed.id });
  } catch (error) { return next(error); }
});

router.post('/neon/update', async (req, res, next) => {
  try {
    const { path, data } = req.body || {};
    const parsed = parsePath(path);
    if (parsed.type !== 'doc') return res.status(400).json({ ok: false, error: 'Document path required.' });
    await pool.query(
      `INSERT INTO ${parsed.table}(id, data, migrated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = ${parsed.table}.data || EXCLUDED.data, migrated_at = NOW()`,
      [parsed.id, data || {}]
    );
    return res.json({ ok: true, id: parsed.id });
  } catch (error) { return next(error); }
});

module.exports = router;
