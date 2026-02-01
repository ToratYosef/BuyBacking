const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createAuthGate, requireAuth } = require('./middleware/auth');
const profileRouter = require('./routes/profile');
const remindersRouter = require('./routes/reminders');
const refreshTrackingRouter = require('./routes/refreshTracking');
const manualFulfillRouter = require('./routes/manualFulfill');
const adminUsersRouter = require('./routes/adminUsers');
const supportRouter = require('./routes/support');
const { notFoundHandler, errorHandler } = require('./utils/errors');

const { expressApp } = require('../../functions/index.js');

const app = express();

const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

const apiBasePath = process.env.API_BASE_PATH || '/api';

const apiRouter = express.Router();

const publicPaths = [
  /^\/verify-address$/,
  /^\/submit-order$/,
  /^\/email-support$/,
  /^\/submit-chat-feedback$/,
  /^\/promo-codes\/[^/]+$/,
  /^\/wholesale(\/|$)/,
];

apiRouter.use(
  createAuthGate({
    publicPaths,
  })
);

apiRouter.use(profileRouter);
apiRouter.use(remindersRouter);
apiRouter.use(refreshTrackingRouter);
apiRouter.use(manualFulfillRouter);
apiRouter.use(adminUsersRouter);
apiRouter.use(supportRouter);

apiRouter.use(expressApp);

app.use(apiBasePath, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
