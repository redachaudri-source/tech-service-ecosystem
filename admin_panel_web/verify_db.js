
import { createClient } from '@supabase/supabase-js';

// Load env vars

// Note: We are running this with node, so we need to load .env manually or hardcode for test
// Using hardcoded values from .env file view for simplicity/speed in this debug script, 
// as loading from .env in ES module key requires setup.

const supabaseUrl = 'https://zapjbtgnmxkhpfykxmnh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcGpidGdubXhraHBmeWt4bW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MDY3NjcsImV4cCI6MjA4MjM4Mjc2N30.boe3ZdBH0Wo_Vmf9Nmhhjh5SnGXq8IG8rRuRlzby1Zg';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
    console.log('Checking Supabase connection...');
    console.log('URL:', supabaseUrl);

    // Try to select from profiles
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);

    if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
    } else {
        console.log('Profiles table accessible. Count result:', profiles);
    }

    // Test Insert and Delete
    console.log('Testing Write Permissions...');
    const testEmail = 'test_delete_' + Date.now() + '@example.com';

    // 1. Insert
    const { data: inserted, error: insertError } = await supabase
        .from('profiles')
        .insert([{
            full_name: 'Test Delete User',
            email: testEmail,
            role: 'client'
        }])
        .select()
        .single();

    if (insertError) {
        console.error('INSERT Failed:', insertError);
        return;
    }
    console.log('INSERT Success:', inserted.id);

    // 2. Delete
    const { error: deleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', inserted.id);

    if (deleteError) {
        console.error('DELETE Failed:', deleteError);
    } else {
        console.log('DELETE Success');
    }
}

check();
