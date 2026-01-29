/**
 * Install ticket_autopilot trigger + pg_net.
 * Run: DATABASE_URL='postgresql://postgres.[ref]:[PASSWORD]@...pooler.supabase.com:6543/postgres' node scripts/install_trigger.js
 * Get DATABASE_URL from Supabase Dashboard → Project Settings → Database → Connection string (URI).
 */

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function main() {
  if (!DATABASE_URL) {
    console.error('Missing DATABASE_URL or SUPABASE_DB_URL.');
    console.error('Get it from: Supabase Dashboard → Project Settings → Database → Connection string (URI).');
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_net');
  } catch (e) {
    if (/permission denied|must be superuser|already exists/i.test(e.message)) {
      console.warn('pg_net: enable manually in Dashboard → Database → Extensions if needed. Proceeding.');
    } else {
      console.error('pg_net:', e.message);
      await client.end();
      process.exit(1);
    }
  }

  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION public.trigger_ticket_autopilot()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      DECLARE payload jsonb; edge_url text;
      BEGIN
        IF NEW.status IS DISTINCT FROM 'solicitado' THEN RETURN NEW; END IF;
        edge_url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot';
        payload := jsonb_build_object('type','INSERT','table','tickets','schema','public','record',to_jsonb(NEW),'old_record',NULL);
        PERFORM net.http_post(url := edge_url, body := payload, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 10000);
        RETURN NEW;
      END; $$;
    `);
    await client.query('DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets');
    await client.query(`
      CREATE TRIGGER trigger_ticket_autopilot_on_insert
      AFTER INSERT ON public.tickets FOR EACH ROW
      EXECUTE FUNCTION public.trigger_ticket_autopilot();
    `);
    console.log('OK: trigger_ticket_autopilot_on_insert installed.');
  } catch (e) {
    console.error('Trigger install failed:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
