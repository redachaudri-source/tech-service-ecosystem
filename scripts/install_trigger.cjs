/**
 * Installs the ticket_autopilot_on_insert trigger in Supabase.
 * Calls RPC install_autopilot_trigger() via REST (no node_modules needed).
 *
 * Prerequisites:
 * 1. Run the migration 20260129_ticket_autopilot_webhook_trigger.sql first
 * 2. Enable pg_net: Dashboard → Database → Extensions → pg_net → Enable
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/install_trigger.cjs
 */
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const base = url.replace(/\/$/, '');
const rpcUrl = base + '/rest/v1/rpc/install_autopilot_trigger';

async function main() {
  console.log('Installing trigger ticket_autopilot_on_insert...');
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({}),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('HTTP', res.status, data);
    if (res.status === 404 || (data && data.code === '42883') || res.status === 406) {
      console.error('RPC install_autopilot_trigger not found. Run the migration first:');
      console.error('  1. Supabase Dashboard → SQL Editor');
      console.error('  2. Paste and run: supabase/migrations/20260129_ticket_autopilot_webhook_trigger.sql');
      console.error('  3. Enable pg_net: Database → Extensions → pg_net');
      console.error('  4. Run this script again.');
    }
    process.exit(1);
  }

  if (data && data.ok) {
    console.log('OK:', data.message || 'Trigger installed.');
  } else {
    console.error('RPC returned:', data);
    if (data && data.error) console.error('DB error:', data.error);
    process.exit(1);
  }
}

main();
