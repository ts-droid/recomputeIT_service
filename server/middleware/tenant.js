import { query } from '../db.js';

// Cache tenants in memory for 5 minutes to avoid repeated DB hits
const tenantCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const getCachedTenant = (tenantId) => {
  const cached = tenantCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.tenant;
  }
  return null;
};

const setCachedTenant = (tenantId, tenant) => {
  tenantCache.set(tenantId, { tenant, fetchedAt: Date.now() });
};

export const clearTenantCache = (tenantId) => {
  if (tenantId) {
    tenantCache.delete(tenantId);
  } else {
    tenantCache.clear();
  }
};

/**
 * Load a tenant by ID.
 */
export const getTenantById = async (tenantId) => {
  if (!tenantId) return null;

  const cached = getCachedTenant(tenantId);
  if (cached) return cached;

  const { rows } = await query(
    'SELECT * FROM tenants WHERE id = $1 AND is_active = true',
    [tenantId]
  );
  const tenant = rows[0] || null;
  if (tenant) setCachedTenant(tenantId, tenant);
  return tenant;
};

/**
 * Load a tenant by slug.
 */
export const getTenantBySlug = async (slug) => {
  if (!slug) return null;
  const { rows } = await query(
    'SELECT * FROM tenants WHERE slug = $1 AND is_active = true',
    [slug]
  );
  return rows[0] || null;
};

/**
 * Get the default tenant (first active tenant, typically re:Compute-IT).
 */
export const getDefaultTenant = async () => {
  const { rows } = await query(
    'SELECT * FROM tenants WHERE is_active = true ORDER BY created_at ASC LIMIT 1'
  );
  return rows[0] || null;
};

/**
 * Middleware: sets req.tenant based on req.user.tenant_id.
 * Must run AFTER requireAuth.
 */
export const requireTenant = async (req, res, next) => {
  const tenantId = req.user?.tenant_id;
  if (!tenantId) {
    // Master-key users (API_KEY auth) — assign default tenant
    if (req.user?.id === 'master-key') {
      const defaultTenant = await getDefaultTenant();
      if (!defaultTenant) {
        return res.status(500).json({ error: 'No tenant configured.' });
      }
      req.tenant = defaultTenant;
      req.tenantId = defaultTenant.id;
      return next();
    }
    return res.status(403).json({ error: 'Tenant context missing.' });
  }

  try {
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return res.status(403).json({ error: 'Tenant not found or inactive.' });
    }
    req.tenant = tenant;
    req.tenantId = tenant.id;
    return next();
  } catch (error) {
    console.error('Tenant lookup error:', error);
    return res.status(500).json({ error: 'Tenant lookup failed.' });
  }
};

/**
 * Returns a merged brand config for a tenant, with defaults.
 */
export const getTenantBrand = (tenant) => {
  const defaults = {
    name: 're:Compute-IT',
    logoUrl: '',
    faviconUrl: '',
    themePreset: 'forest',
    theme: {
      primary: '#166534',
      primaryHover: '#14532d',
      primarySoft: '#dcfce7',
      accent: '#0f766e',
      panel: '#1f2937',
    },
  };

  const brand = tenant?.brand_config || {};
  return {
    name: tenant?.name || brand.name || defaults.name,
    logoUrl: brand.logoUrl || defaults.logoUrl,
    faviconUrl: brand.faviconUrl || brand.logoUrl || defaults.faviconUrl,
    themePreset: brand.themePreset || defaults.themePreset,
    theme: { ...defaults.theme, ...(brand.theme || {}) },
    supportEmail: tenant?.support_email || '',
    supportPhone: tenant?.support_phone || '',
  };
};
