import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Supabase Security Advisor RLS & Database Hardening Suite', () => {
  const rootDir = process.cwd();
  const hardeningSqlPath = path.join(rootDir, 'solo_supabase_hardening.sql');
  const migration0008Path = path.join(rootDir, 'supabase', 'migrations', '0008_1000_driver_concurrency_hardening.sql');
  const migration0012Path = path.join(rootDir, 'supabase', 'migrations', '0012_fix_rls_disabled_in_public.sql');
  const consolidatedSchemaPath = path.join(rootDir, 'supabase', 'consolidated_schema.sql');

  it('guarantees migration 0012_fix_rls_disabled_in_public.sql exists and is populated', () => {
    assert.strictEqual(fs.existsSync(migration0012Path), true);
    const content = fs.readFileSync(migration0012Path, 'utf8');
    assert.ok(content.length > 500);
  });

  it('verifies public.driver_locations has Row Level Security explicitly enabled', () => {
    const filesToCheck = [hardeningSqlPath, migration0008Path, migration0012Path, consolidatedSchemaPath];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf8');
      const hasRls =
        /ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(public\.)?driver_locations\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(
          content
        );
      assert.strictEqual(
        hasRls,
        true,
        `Expected ${path.basename(filePath)} to enable Row Level Security on driver_locations`
      );
    }
  });

  it('verifies public.ride_bids has Row Level Security explicitly enabled', () => {
    const filesToCheck = [hardeningSqlPath, migration0008Path, migration0012Path, consolidatedSchemaPath];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf8');
      const hasRls =
        /ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(public\.)?ride_bids\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(
          content
        );
      assert.strictEqual(
        hasRls,
        true,
        `Expected ${path.basename(filePath)} to enable Row Level Security on ride_bids`
      );
    }
  });

  it('enforces least-privilege CRUD policies on public.driver_locations', () => {
    const m12 = fs.readFileSync(migration0012Path, 'utf8');
    assert.ok(m12.includes('driver_locations_select'), 'Must have SELECT policy for driver_locations');
    assert.ok(m12.includes('driver_locations_insert'), 'Must have INSERT policy for driver_locations');
    assert.ok(m12.includes('driver_locations_update'), 'Must have UPDATE policy for driver_locations');
    assert.ok(m12.includes('driver_locations_delete'), 'Must have DELETE policy for driver_locations');

    // Verify driver_id = auth.uid() scoping
    assert.ok(
      m12.includes('(select auth.uid())') || m12.includes('auth.uid()'),
      'Must scope writes to auth.uid()'
    );
  });

  it('enforces least-privilege CRUD policies on public.ride_bids', () => {
    const m12 = fs.readFileSync(migration0012Path, 'utf8');
    assert.ok(m12.includes('ride_bids_select'), 'Must have SELECT policy for ride_bids');
    assert.ok(m12.includes('ride_bids_insert'), 'Must have INSERT policy for ride_bids');
    assert.ok(m12.includes('ride_bids_update'), 'Must have UPDATE policy for ride_bids');
    assert.ok(m12.includes('ride_bids_delete'), 'Must have DELETE policy for ride_bids');
  });

  it('includes dynamic catch-all guard across pg_tables in migration 0012 and solo_supabase_hardening.sql', () => {
    const m12 = fs.readFileSync(migration0012Path, 'utf8');
    const hardening = fs.readFileSync(hardeningSqlPath, 'utf8');

    const hasDynamicLoop = (sql: string) =>
      sql.includes('pg_tables') &&
      sql.includes("schemaname = 'public'") &&
      sql.includes('ENABLE ROW LEVEL SECURITY');

    assert.strictEqual(hasDynamicLoop(m12), true, 'Migration 0012 must contain dynamic pg_tables RLS guard');
    assert.strictEqual(
      hasDynamicLoop(hardening),
      true,
      'solo_supabase_hardening.sql must contain dynamic pg_tables RLS guard'
    );
  });

  it('protects push_subscriptions against open public modifications', () => {
    const m12 = fs.readFileSync(migration0012Path, 'utf8');
    assert.ok(m12.includes('push_subscriptions_select'), 'Must have scoped push_subscriptions_select');
    assert.ok(m12.includes('push_subscriptions_insert'), 'Must have scoped push_subscriptions_insert');
    assert.ok(m12.includes('push_subscriptions_update'), 'Must have scoped push_subscriptions_update');
    assert.ok(m12.includes('push_subscriptions_delete'), 'Must have scoped push_subscriptions_delete');
  });

  it('hardens SECURITY DEFINER functions with search_path to prevent escalation', () => {
    const m12 = fs.readFileSync(migration0012Path, 'utf8');
    assert.ok(
      m12.includes('SET search_path = public, pg_temp') || m12.includes('SET search_path = public'),
      'Must set explicit search_path on stored procedures'
    );
  });

  it('scans all user tables created in SQL migrations and ensures none lack RLS', () => {
    const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

    const tablesCreated = new Set<string>();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi;
      let match: RegExpExecArray | null;
      while ((match = tableRegex.exec(sql)) !== null) {
        tablesCreated.add(match[1].toLowerCase());
      }
    }

    // Verify all discovered tables have ENABLE ROW LEVEL SECURITY across the migration history
    const allMigrationsSql = migrationFiles
      .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
      .join('\n');

    for (const table of tablesCreated) {
      const rlsRegex = new RegExp(
        `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i'
      );
      const isRlsEnabled = rlsRegex.test(allMigrationsSql);
      assert.strictEqual(
        isRlsEnabled,
        true,
        `Table "${table}" was created in migrations but lacks an ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY command!`
      );
    }
  });
});
