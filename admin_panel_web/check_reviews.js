
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkReviews() {
    console.log('Checking reviews...');

    // 1. Get all reviews
    const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
            id, 
            rating, 
            ticket_id, 
            tickets (ticket_number)
        `);

    if (error) {
        console.error('Error fetching reviews:', error);
        return;
    }

    console.log(`Found ${reviews.length} reviews:`);
    reviews.forEach(r => {
        console.log(`- Review ID: ${r.id}, Rating: ${r.rating}, Ticket #${r.tickets?.ticket_number} (ID: ${r.ticket_id})`);
    });

    // 2. Check specifically for tickets 83 and 84
    const { data: specificTickets, error: specificError } = await supabase
        .from('tickets')
        .select('id, ticket_number, status')
        .in('ticket_number', [83, 84]);

    if (specificTickets) {
        console.log('\nTarget Tickets Status:');
        specificTickets.forEach(t => console.log(`- Ticket #${t.ticket_number} (ID: ${t.id}) Status: ${t.status}`));
    }

}

checkReviews();
