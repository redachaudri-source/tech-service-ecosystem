
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zapjbtgnmxkhpfykxmnh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcGpidGdubXhraHBmeWt4bW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MDY3NjcsImV4cCI6MjA4MjM4Mjc2N30.boe3ZdBH0Wo_Vmf9Nmhhjh5SnGXq8IG8rRuRlzby1Zg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log("🔍 Checking Tickets/Clients for TODAY (2026-01-24)...");

    // Check specific technician if needed (Reda - find id?)
    // But first, global check for any tickets today
    const todayStart = '2026-01-24T00:00:00.000Z';
    const todayEnd = '2026-01-24T23:59:59.999Z';

    // 1. Fetch Tickets
    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('id, client_id, scheduled_at, status, technician_id')
        .gte('scheduled_at', todayStart)
        .lte('scheduled_at', todayEnd);

    if (error) {
        console.error("❌ Tickets Error:", error);
        return;
    }

    console.log(`✅ Found ${tickets.length} tickets for today.`);

    if (tickets.length === 0) {
        // Check ALL tickets (limit 5)
        const yest = await supabase.from('tickets').select('id, scheduled_at').limit(5);
        console.log("Sample tickets from DB (any date):", yest.data);
        return;
    }

    // 2. Check Client IDs
    const clientIds = [...new Set(tickets.map(t => t.client_id).filter(id => id && id.length > 5))];
    console.log(`Checking ${clientIds.length} unique Client IDs...`, clientIds);

    // 3. Fetch Profiles for these Clients
    const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, full_name, latitude, longitude, address')
        .in('id', clientIds);

    if (pError) console.error("❌ Profiles Error:", pError);

    console.log(`✅ Found ${profiles?.length || 0} client profiles.`);

    profiles?.forEach(p => {
        const hasCoords = p.latitude && p.longitude;
        console.log(`- Client ${p.full_name}: Coords=${hasCoords ? '✅' : '❌'} (${p.latitude}, ${p.longitude}) ID: ${p.id}`);
    });

    // 4. Manual Join Check
    tickets.forEach(t => {
        const client = profiles?.find(p => p.id === t.client_id);
        const hasCoords = client?.latitude && client?.longitude;
        console.log(`Ticket ${t.id} (${t.scheduled_at}): Client=${client ? '✅' : 'MISSING'} Coords=${hasCoords ? '✅' : '❌'}`);
    });
}

checkData();
