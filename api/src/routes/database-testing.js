const {
  collection,
  fsDocIdToMongoId,
} = require('../db/mongo');

const ADMIN_TOKEN = process.env.DATABASE_TESTING_ADMIN_TOKEN || 'database-testing-admin';

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getAdminTokenFromRequest(req, parsedUrl) {
  const queryToken = parsedUrl.searchParams.get('token');
  const headerToken = req.headers['x-database-testing-token'];
  const authHeader = req.headers.authorization;

  if (queryToken) return queryToken;
  if (headerToken) return headerToken;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function isAdminAuthorized(req, parsedUrl) {
  const token = getAdminTokenFromRequest(req, parsedUrl);
  return Boolean(token) && token === ADMIN_TOKEN;
}

function generateOrderId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DT-${timestamp}-${randomPart}`;
}

async function listUsers() {
  const users = await collection('users');
  return users.find({}, { projection: { __migrated_at: 0 } }).limit(500).toArray();
}

async function getUserByUid(uid) {
  const users = await collection('users');
  return users.findOne({ _id: fsDocIdToMongoId(`users/${uid}`) });
}

async function listOrders() {
  const orders = await collection('orders');
  return orders.find({}).sort({ createdAt: -1, createdAtMillis: -1 }).limit(500).toArray();
}

async function getOrderById(orderId) {
  const orders = await collection('orders');
  return orders.findOne({ _id: fsDocIdToMongoId(`orders/${orderId}`) });
}

async function createOrder(body = {}) {
  const orders = await collection('orders');
  const orderId = body.orderId || generateOrderId();
  const now = new Date();

  const document = {
    _id: fsDocIdToMongoId(`orders/${orderId}`),
    id: orderId,
    orderId,
    device: body.device || {},
    customer: body.customer || {},
    shippingInfo: body.shippingInfo || {},
    status: body.status || 'pending',
    payout: body.payout || body.offerPrice || null,
    offerPrice: body.offerPrice || null,
    source: 'database-testing',
    createdAt: body.createdAt || now.toISOString(),
    createdAtMillis: body.createdAtMillis || now.getTime(),
    updatedAt: now.toISOString(),
    __fs_path: `orders/${orderId}`,
    __collection_path: 'orders',
    __parent_doc_path: null,
    __ancestors: [],
    __migrated_at: now.toISOString(),
  };

  await orders.insertOne(document);
  console.log('[database-testing] Mongo order created:', document._id);
  return document;
}

async function handleDatabaseTestingApi(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  try {
    if (req.method === 'GET' && pathname === '/database-testing/api/users') {
      return json(res, 200, { data: await listUsers() });
    }

    const userMatch = pathname.match(/^\/database-testing\/api\/users\/([^/]+)$/);
    if (req.method === 'GET' && userMatch) {
      const doc = await getUserByUid(decodeURIComponent(userMatch[1]));
      if (!doc) return json(res, 404, { error: 'User not found' });
      return json(res, 200, { data: doc });
    }

    if (req.method === 'GET' && pathname === '/database-testing/api/orders') {
      return json(res, 200, { data: await listOrders() });
    }

    const orderMatch = pathname.match(/^\/database-testing\/api\/orders\/([^/]+)$/);
    if (req.method === 'GET' && orderMatch) {
      const doc = await getOrderById(decodeURIComponent(orderMatch[1]));
      if (!doc) return json(res, 404, { error: 'Order not found' });
      return json(res, 200, { data: doc });
    }

    if (req.method === 'POST' && pathname === '/database-testing/api/orders') {
      const body = await readBody(req);
      const created = await createOrder(body);
      return json(res, 201, { data: created });
    }

    if (req.method === 'GET' && pathname === '/database-testing/api/admin/orders') {
      if (!isAdminAuthorized(req, parsedUrl)) {
        return json(res, 401, { error: 'Unauthorized: provide x-database-testing-token' });
      }
      return json(res, 200, { data: await listOrders() });
    }

    return false;
  } catch (error) {
    console.error('[database-testing] API error', error);
    return json(res, 500, { error: error.message || 'Internal server error' });
  }
}

module.exports = { handleDatabaseTestingApi };
