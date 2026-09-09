import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './init.js';
import { securityHeaders } from './middleware/security.js';

// Route modules
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import ticketRoutes from './routes/tickets.js';
import notificationRoutes from './routes/notifications.js';
import webhookRoutes from './routes/webhooks.js';
import tenantRoutes from './routes/tenants.js';
import superadminRoutes from './routes/superadmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Railway/cloud proxies terminate TLS and forward the client IP in X-Forwarded-For.
// Without this, req.ip is the proxy address and login rate limiting applies to everyone at once.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use(securityHeaders);

app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: false }));
app.use(express.text({ type: 'text/plain', limit: '1mb' }));
app.use((req, _res, next) => {
  if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      // Keep original body and let route-level validation handle it.
    }
  }
  if (!req.rawBody && typeof req.body === 'string') {
    req.rawBody = req.body;
  }
  next();
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api', notificationRoutes);
app.use('/api/webhooks', webhookRoutes);

// Unknown API routes should answer with JSON, not the SPA shell.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ---------------------------------------------------------------------------
// Serve frontend (SPA fallback)
// ---------------------------------------------------------------------------
app.use(express.static(DIST_DIR));
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// ---------------------------------------------------------------------------
// Error handler (malformed JSON bodies, oversized payloads, unexpected throws)
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Ogiltig JSON i anropet.' });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Anropet är för stort.' });
  }
  console.error('Unhandled request error:', error);
  return res.status(500).json({ error: 'Internt serverfel.' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
