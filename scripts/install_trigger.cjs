/**
 * Installs the ticket_autopilot_on_insert trigger via RPC.
 * Requires: 1) pg_net enabled in Supabase Dashboard → Extensions
 *           2) Migration 20260129_rpc_install_autopilot_trigger.sql applied (creates the RPC)
 * Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/install_trigger.cjs
 */
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const base = url.replace(/\/$/, '');
const rpcUrl = base + '/rest/v1/rpc/install_autopilot_trigger';

async function main() {
  console.log('Calling install_autopilot_trigger RPC...');
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
  const text = await res.text();
  if (!res.ok) {
    console.error('HTTP', res.status, text);
    if (res.status === 404 || text.includes('42883')) {
      console.error('RPC not found. Run the migration 20260129_rpc_install_autopilot_trigger.sql in SQL Editor first.');
    }
    process.exit(1);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (_) {
    raw = text;
  }
  const data = Array.isArray(raw) ? raw[0] : raw;
  console.log('Result:', data);
  if (data && data.ok) {
    console.log('Trigger ticket_autopilot_on_insert installed.');
  } else {
    console.error('Install failed:', data?.error || data);
    process.exit(1);
  }
}

main();
