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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
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
app.use('/api', notificationRoutes);
app.use('/api/webhooks', webhookRoutes);

// ---------------------------------------------------------------------------
// Serve frontend (SPA fallback)
// ---------------------------------------------------------------------------
app.use(express.static(DIST_DIR));
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
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
