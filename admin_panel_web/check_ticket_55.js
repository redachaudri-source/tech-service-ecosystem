
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zapjbtgnmxkhpfykxmnh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcGpidGdubXhraHBmeWt4bW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUyMjgxODgsImV4cCI6MjA4MjM4Mjc2N30.boe3ZdBH0Wo_Vmf9Nmhjh5SnGXq8IG8rRuRlzby1Zgc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTicket() {
    console.log('Fetching ticket 55...');
    const { data, error } = await supabase
        .from('tickets')
        .select('id, ticket_number, status, appointment_status, proposed_slots')
        .eq('ticket_number', 55)
        .single();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Ticket 55 Data:', JSON.stringify(data, null, 2));
    }
}

checkTicket();
