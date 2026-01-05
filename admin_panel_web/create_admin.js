
import { createClient } from '@supabase/supabase-js';

// Hardcoded for this script usage only, based on previous artifacts
const supabaseUrl = 'https://zapjbtgnmxkhpfykxmnh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcGpidGdubXhraHBmeWt4bW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MDY3NjcsImV4cCI6MjA4MjM4Mjc2N30.boe3ZdBH0Wo_Vmf9Nmhhjh5SnGXq8IG8rRuRlzby1Zg';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createAdmin() {
    console.log("Creating super admin user...");
    const email = 'admin@techservice.com';
    const password = 'admin123';

    // 1. Sign Up
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: 'Super Admin',
                role: 'client' // Default, will change via SQL
            }
        }
    });

    if (error) {
        console.error("Error creating user:", error.message);
    } else {
        console.log("User created successfully!");
        console.log("ID:", data.user?.id);
        console.log("Email:", data.user?.email);
        console.log("\n⚠️  IMPORTANT STEP REQUIRED ⚠️");
        console.log("To give this user ADMIN permissions, you MUST run the following SQL in your Supabase Dashboard:");
        console.log(`\nUPDATE public.profiles SET role = 'admin' WHERE id = '${data.user?.id}';\n`);
    }
}

createAdmin();
