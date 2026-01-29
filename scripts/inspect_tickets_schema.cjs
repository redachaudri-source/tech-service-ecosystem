/**
 * One-off script to list actual columns of `tickets` table.
 * Run: node scripts/inspect_tickets_schema.cjs
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (do NOT commit credentials).
 */
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const apiUrl = url.replace(/\/$/, '') + '/rest/v1/tickets?select=*&limit=1';

async function main() {
  const res = await fetch(apiUrl, {
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    console.error('HTTP', res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const row = Array.isArray(data) ? data[0] : data;
  const columns = row ? Object.keys(row) : [];
  console.log('tickets columns:', columns.sort().join(', '));
  const hasTechnicianId = columns.includes('technician_id');
  const hasAssignedTechnicianId = columns.includes('assigned_technician_id');
  const hasScheduledAt = columns.includes('scheduled_at');
  const hasScheduledDate = columns.includes('scheduled_date');
  const hasScheduledTime = columns.includes('scheduled_time');
  console.log('technician_id:', hasTechnicianId, '| assigned_technician_id:', hasAssignedTechnicianId);
  console.log('scheduled_at:', hasScheduledAt, '| scheduled_date:', hasScheduledDate, '| scheduled_time:', hasScheduledTime);
}

main();
