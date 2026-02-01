const express = require('express');
const { admin, db } = require('../services/firestore');

const router = express.Router();

router.post('/create-admin', async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required.' });
    }

    const requesterDoc = await db.collection('admins').doc(req.user.uid).get();
    if (!requesterDoc.exists) {
      return res.status(403).json({ ok: false, error: 'Only admins can create new admins.' });
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || undefined,
    });

    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });

    await db.collection('admins').doc(userRecord.uid).set({
      email: userRecord.email,
      displayName: userRecord.displayName || displayName || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid,
    });

    return res.json({ ok: true, uid: userRecord.uid, email: userRecord.email });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
