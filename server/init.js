import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const sanitizedSchemaSql = schemaSql
    .split('\n')
    .filter((line) => !line.includes('service_tickets_phone_norm_idx'))
    .join('\n');
  await query(sanitizedSchemaSql);

  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS customer_notified_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS customer_phone_normalized TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS customer_phone_normalized TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_customer_response_text TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_customer_response_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_customer_response_channel TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_customer_decision TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_staff_contact_at TIMESTAMPTZ`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_staff_contact_by TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS last_staff_contact_channel TEXT`);
  await query(`ALTER TABLE service_tickets ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT`);
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
  await query(
    `DO $$
     BEGIN
       IF EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_name = 'service_tickets'
           AND column_name = 'customer_phone_normalized'
       ) THEN
         EXECUTE 'CREATE INDEX IF NOT EXISTS service_tickets_phone_norm_idx ON service_tickets (customer_phone_normalized)';
       END IF;
     END
     $$;`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS message_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id UUID REFERENCES service_tickets(id) ON DELETE SET NULL,
      channel TEXT NOT NULL,
      direction TEXT NOT NULL,
      sender_user TEXT,
      to_number TEXT,
      from_number TEXT,
      subject TEXT,
      body TEXT,
      provider TEXT,
      provider_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS sender_user TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS raw_body TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS parse_method TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS parse_confidence TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS message_id TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS in_reply_to TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS references_header TEXT`);
  await query(`ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS reply_token TEXT`);
  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS translation_cache (
      source_text TEXT NOT NULL,
      target_language TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (source_text, target_language)
    )`
  );

  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (rows.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await query(
        'INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4)',
        [adminEmail, hash, 'admin', 'Admin']
      );
      console.log('Bootstrap admin user created.');
    }
  }
}
