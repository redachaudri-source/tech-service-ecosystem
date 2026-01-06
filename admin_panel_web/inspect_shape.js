
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspectData() {
    console.log('Fetching tickets with reviews...');

    // Fetch a ticket that likely has a review (based on previous output or just any)
    const { data, error } = await supabase
        .from('tickets')
        .select(`
            id,
            ticket_number,
            reviews (
                rating
            )
        `)
        .not('reviews', 'is', null) // Filter where reviews is not null (if possible in postgrest, or just fetch all and filter JS)
        .limit(5);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Data shape:', JSON.stringify(data, null, 2));
}

inspectData();
