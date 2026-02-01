const { admin } = require('../services/firestore');

function parseBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token.trim();
}

async function verifyFirebaseToken(token) {
  return admin.auth().verifyIdToken(token);
}

async function requireAuth(req, res, next) {
  try {
    const token = parseBearerToken(req);
    if (!token) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required. Please sign in and try again.',
        code: 'auth/unauthenticated',
      });
    }

    const decoded = await verifyFirebaseToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      claims: decoded,
    };
    return next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: 'Invalid or expired authentication token.',
      code: 'auth/invalid-token',
      detail: error?.message || 'Token verification failed.',
    });
  }
}

async function optionalAuth(req, res, next) {
  const token = parseBearerToken(req);
  if (!token) {
    return next();
  }
  try {
    const decoded = await verifyFirebaseToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      claims: decoded,
    };
  } catch (error) {
    req.user = null;
  }
  return next();
}

function createAuthGate({ publicPaths = [] } = {}) {
  return async function authGate(req, res, next) {
    const path = req.path || '/';
    const isPublic = publicPaths.some((matcher) =>
      typeof matcher === 'string' ? matcher === path : matcher.test(path)
    );
    if (isPublic) {
      return optionalAuth(req, res, next);
    }
    return requireAuth(req, res, next);
  };
}

module.exports = {
  requireAuth,
  optionalAuth,
  createAuthGate,
};
