
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function testSignup() {
    const email = 'naykevm@adminsatialia.com';
    const password = 'testpassword123';

    console.log(`Attempting to sign up with: ${email}`);

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: 'Test Admin Debug',
                role: 'admin'
            }
        }
    });

    if (error) {
        console.error('SIGNUP ERROR:', error);
        console.error('Error Message:', error.message);
        console.error('Error Status:', error.status);
    } else {
        console.log('SIGNUP SUCCESS:', data);
    }
}

testSignup();
