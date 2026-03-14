import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TENANT = {
  slug: 'recompute-it',
  name: 're:Compute-IT',
  support_email: 'kontakt@recompute.it',
  support_phone: '016-5416700',
  brand_config: {
    logoUrl: 'https://horizons-cdn.hostinger.com/66ce8f1a-1805-4a09-9f17-041a9f68d79f/f39487d84caba3a65608a9652e97d727.jpg',
    themePreset: 'forest',
    theme: {
      primary: '#166534',
      primaryHover: '#14532d',
      primarySoft: '#dcfce7',
      accent: '#0f766e',
      panel: '#1f2937',
    },
  },
};

export async function initDb() {
  // 1. Ensure tenants table exists FIRST
  await query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      brand_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      smtp_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      sms_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      support_email TEXT,
      support_phone TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 2. Seed default tenant
  const { rows: existingTenants } = await query(
    'SELECT id FROM tenants WHERE slug = $1',
    [DEFAULT_TENANT.slug]
  );

  let defaultTenantId;
  if (existingTenants.length === 0) {
    const { rows } = await query(
      `INSERT INTO tenants (slug, name, support_email, support_phone, brand_config)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id`,
      [
        DEFAULT_TENANT.slug,
        DEFAULT_TENANT.name,
        DEFAULT_TENANT.support_email,
        DEFAULT_TENANT.support_phone,
        JSON.stringify(DEFAULT_TENANT.brand_config),
      ]
    );
    defaultTenantId = rows[0].id;
    console.log(`Default tenant "${DEFAULT_TENANT.name}" created (${defaultTenantId}).`);
  } else {
    defaultTenantId = existingTenants[0].id;
  }

  // 3. Add tenant_id columns to EXISTING tables BEFORE schema.sql runs
  //    (schema.sql creates indexes on tenant_id — columns must exist first)
  //    On fresh installs the tables don't exist yet, so we guard with DO blocks.
  for (const tbl of ['users', 'service_tickets', 'message_logs', 'app_settings']) {
    await query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tbl}')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tbl}' AND column_name = 'tenant_id')
        THEN
          ALTER TABLE ${tbl} ADD COLUMN tenant_id UUID REFERENCES tenants(id);
        END IF;
      END $$;
    `);
  }

  // 4. Run schema.sql (creates tables IF NOT EXISTS + indexes)
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const sanitizedSchemaSql = schemaSql
    .split('\n')
    .filter((line) => !line.includes('service_tickets_phone_norm_idx'))
    .join('\n');
  await query(sanitizedSchemaSql);

  // 5. Ensure tenant_id columns exist (idempotent, covers both fresh + legacy DBs)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)`);
  await query(`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)`);

  // Assign orphan rows to default tenant
  await query(`UPDATE users SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenantId]);
  await query(`UPDATE service_tickets SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenantId]);
  await query(`UPDATE message_logs SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenantId]);
  await query(`UPDATE app_settings SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenantId]);

  // 6. Set NOT NULL after backfill
  await query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'tenant_id' AND is_nullable = 'YES'
      ) THEN
        ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
      END IF;
    END $$;
  `);
  await query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_tickets' AND column_name = 'tenant_id' AND is_nullable = 'YES'
      ) THEN
        ALTER TABLE service_tickets ALTER COLUMN tenant_id SET NOT NULL;
      END IF;
    END $$;
  `);

  // Unique constraint on (tenant_id, email) for users
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_tenant_email_unique'
      ) THEN
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
        ALTER TABLE users ADD CONSTRAINT users_tenant_email_unique UNIQUE (tenant_id, email);
      END IF;
    END $$;
  `);

  // Migrate app_settings PK from (key) to (tenant_id, key)
  await query(`
    DO $$ BEGIN
      -- Check if old single-column PK exists (no tenant_id in PK)
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'app_settings'
          AND tc.constraint_type = 'PRIMARY KEY'
          AND kcu.column_name = 'key'
          AND NOT EXISTS (
            SELECT 1 FROM information_schema.key_column_usage kcu2
            WHERE kcu2.constraint_name = tc.constraint_name
              AND kcu2.column_name = 'tenant_id'
          )
      ) THEN
        -- Drop old PK and create composite PK
        ALTER TABLE app_settings DROP CONSTRAINT app_settings_pkey;
        ALTER TABLE app_settings ALTER COLUMN tenant_id SET NOT NULL;
        ALTER TABLE app_settings ADD PRIMARY KEY (tenant_id, key);
      END IF;
    END $$;
  `);

  // Tenant indexes
  await query(`CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON users (tenant_id)`);
  await query(`CREATE INDEX IF NOT EXISTS service_tickets_tenant_id_idx ON service_tickets (tenant_id)`);
  await query(`CREATE INDEX IF NOT EXISTS message_logs_tenant_id_idx ON message_logs (tenant_id)`);

  // 7. Other column migrations
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS cost_proposal TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS customer_notified_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS customer_phone_normalized TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_customer_response_text TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_customer_response_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_customer_response_channel TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_customer_decision TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_staff_contact_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_staff_contact_by TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_staff_contact_channel TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS has_new_customer_message BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS diagnosis_fee TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS planned_actions TEXT`);
  await query(`ALTER TABLE service_tickets ALTER COLUMN customer_phone DROP NOT NULL`);

  await query(
    `UPDATE service_tickets
     SET preferred_contact_channel = CASE
       WHEN customer_phone IS NOT NULL AND customer_phone <> '' AND (customer_email IS NULL OR customer_email = '') THEN 'sms'
       WHEN customer_email IS NOT NULL AND customer_email <> '' AND (customer_phone IS NULL OR customer_phone = '') THEN 'email'
       WHEN customer_email IS NOT NULL AND customer_email <> '' THEN COALESCE(preferred_contact_channel, 'email')
       WHEN customer_phone IS NOT NULL AND customer_phone <> '' THEN COALESCE(preferred_contact_channel, 'sms')
       ELSE preferred_contact_channel
     END
     WHERE preferred_contact_channel IS NULL OR preferred_contact_channel = ''`
  );

  await query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_tickets' AND column_name = 'customer_phone_normalized'
      ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS service_tickets_phone_norm_idx ON service_tickets (customer_phone_normalized)';
      END IF;
    END $$;
  `);

  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS sender_user TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS raw_body TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS parse_method TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS parse_confidence TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS message_id TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS in_reply_to TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS references_header TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS reply_token TEXT`);

  await query(`CREATE INDEX IF NOT EXISTS message_logs_ticket_id_idx ON message_logs (ticket_id)`);
  await query(`CREATE INDEX IF NOT EXISTS message_logs_channel_direction_idx ON message_logs (channel, direction)`);
  await query(`CREATE INDEX IF NOT EXISTS message_logs_provider_id_idx ON message_logs (provider, provider_id) WHERE provider_id IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS message_logs_created_at_idx ON message_logs (created_at)`);

  // 8. Bootstrap admin user
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const { rows } = await query(
      'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
      [adminEmail, defaultTenantId]
    );
    if (rows.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await query(
        'INSERT INTO users (tenant_id, email, password_hash, role, name) VALUES ($1, $2, $3, $4, $5)',
        [defaultTenantId, adminEmail, hash, 'admin', 'Admin']
      );
      console.log('Bootstrap admin user created.');
    }
  }

  // 9. Bootstrap superadmin user
  const superadminEmail = process.env.BOOTSTRAP_SUPERADMIN_EMAIL;
  const superadminPassword = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;
  if (superadminEmail && superadminPassword) {
    const { rows } = await query(
      'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
      [superadminEmail, defaultTenantId]
    );
    if (rows.length === 0) {
      const hash = await bcrypt.hash(superadminPassword, 10);
      await query(
        'INSERT INTO users (tenant_id, email, password_hash, role, name) VALUES ($1, $2, $3, $4, $5)',
        [defaultTenantId, superadminEmail, hash, 'superadmin', 'Super Admin']
      );
      console.log('Bootstrap superadmin user created.');
    }
  }
}
