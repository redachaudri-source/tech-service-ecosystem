
import { createClient } from '@supabase/supabase-js';

// Read from your .env manually if running via node, 
// OR just hardcode for this quick check if avoiding dotenv dependency
const SUPABASE_URL = 'https://zapjbtgnmxkhpfykxmnh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcGpidGdubXhraHBmeWt4bW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MDY3NjcsImV4cCI6MjA4MjM4Mjc2N30.boe3ZdBH0Wo_Vmf9Nmhhjh5SnGXq8IG8rRuRlzby1Zg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkInsert() {
    console.log('Testing Ticket Insert...');

    // 1. Login as a client (simulate or use a real one if you have credentials)
    // Actually, I can just try to insert anon if policy allows, but policy likely needs auth.
    // I will try to Sign Up a temp user to get a valid token, then Insert.

    const email = `test_client_${Date.now()}@test.com`;
    const password = 'password123';

    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email, password
        });

        if (authError) throw authError;

        console.log('User created:', authData.user.id);

        const { error: insertError } = await supabase
            .from('tickets')
            .insert([{
                client_id: authData.user.id,
                status: 'nuevo',
                description_failure: 'Test failure',
                appliance_info: { brand: 'TestBrand' },
                created_by: authData.user.id // Trying to see if this field is required/checked
            }]);

        if (insertError) {
            console.error('INSERT FAILED:', insertError);
        } else {
            console.log('INSERT SUCCESS!');
        }

    } catch (e) {
        console.error('Script Error:', e);
    }
}

checkInsert();
