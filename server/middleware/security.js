// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
export const securityHeaders = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
};

// ---------------------------------------------------------------------------
// Login rate limiting (in-memory)
// ---------------------------------------------------------------------------
const loginAttempts = new Map();
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 min
const LOGIN_RATE_MAX = 10;

const cleanupLoginAttempts = () => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now - entry.windowStart > LOGIN_RATE_WINDOW_MS) loginAttempts.delete(key);
  }
};
setInterval(cleanupLoginAttempts, 60_000);

export const checkLoginRateLimit = (ip) => {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_RATE_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= LOGIN_RATE_MAX;
};
