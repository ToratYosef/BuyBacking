const express = require('express');
const { upsert } = require('../services/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/create-admin', requireAdmin, async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required.' });
    }

    const uid = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    await upsert('admins', uid, {
      email,
      password,
      displayName: displayName || null,
      createdAt: new Date().toISOString(),
      createdBy: req.user.uid,
      admin: true,
    });

    return res.json({ ok: true, uid, email });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
