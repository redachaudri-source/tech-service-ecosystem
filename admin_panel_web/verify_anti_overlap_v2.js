
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyOverlap() {
    console.log("🛡️ VERIFYING ANTI-OVERLAP SHIELD 🛡️");

    // 0. Login to bypass Anon RLS
    // Try a known tech email or just generic if I recall one.
    // I'll try to sign in with a hardcoded test user if exists, OR create a temp user?
    // Safer: Assuming dev environment has 'admin@admin.com' / '123456' from seeds? 
    // Or I can select a user from `auth.users`? No access to auth schema via client.
    // I'll try to just log error details better.

    // I will try to use a known user from previous context or just proceed and see the Real Error.
    // The previous output was truncated/missing. Let's fix logging first.


    // 1. Get a Tech
    const { data: techs } = await supabase.from('profiles').select('id, full_name').eq('role', 'tech').limit(1);
    if (!techs || techs.length === 0) {
        console.error("No techs found!");
        return;
    }
    const tech = techs[0];
    console.log(`Testing with tech: ${tech.full_name} (${tech.id})`);

    // 2. Get a Service Type (for duration)
    const { data: sTypes } = await supabase.from('service_types').select('id, estimated_duration_min').limit(1);
    const serviceTypeId = sTypes && sTypes.length > 0 ? sTypes[0].id : null;
    const duration = sTypes && sTypes.length > 0 ? sTypes[0].estimated_duration_min : 60;

    // 3. Create Ticket A (Base) at 10:00
    // Use a date far in future to avoid polluting valid data: 2026-06-01
    const baseDate = '2026-06-01T10:00:00Z';

    console.log(`Creating Ticket A at ${baseDate} (Duration: ${duration}m)...`);
    const { data: ticketA, error: errA } = await supabase.from('tickets').insert({
        client_id: tech.id, // Hack: Make tech his own client just for test, or fetch a client
        technician_id: tech.id,
        status: 'asignado',
        scheduled_at: baseDate,
        estimated_duration: duration,
        service_type_id: serviceTypeId,
        description_failure: 'TEST TICKET A'
    }).select().single();

    if (errA) {
        console.error("Failed to create Ticket A:", errA.message);
        return;
    }
    console.log("✅ Ticket A Created:", ticketA.ticket_number);

    // 4. Attempt Ticket B (Overlap) at 10:15
    const overlapDate = '2026-06-01T10:15:00Z';
    console.log(`Creating Ticket B at ${overlapDate} (Should FAIL)...`);

    const { data: ticketB, error: errB } = await supabase.from('tickets').insert({
        client_id: tech.id,
        technician_id: tech.id,
        status: 'asignado',
        scheduled_at: overlapDate,
        estimated_duration: duration,
        service_type_id: serviceTypeId,
        description_failure: 'TEST TICKET B (OVERLAP)'
    }).select();

    if (errB) {
        console.log("✅ SUCCESS! Overlap Blocked as expected.");
        console.log("Error Message:", errB.message);
    } else {
        console.error("❌ FAILURE! Ticket B was created despite overlap.");
        console.log("Ticket B:", ticketB);

        // Clean up
        await supabase.from('tickets').delete().eq('id', ticketB[0].id);
    }

    // Clean up Ticket A
    await supabase.from('tickets').delete().eq('id', ticketA.id);
    console.log("Cleanup done.");
}

verifyOverlap();
