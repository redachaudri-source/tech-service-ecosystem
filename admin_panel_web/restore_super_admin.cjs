
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

console.log("Loading env...");
console.log("URL:", process.env.VITE_SUPABASE_URL ? "Exists" : "MISSING");
console.log("KEY:", process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ? "Exists" : "MISSING");
console.log("DB_URL:", process.env.DATABASE_URL ? "Exists" : "MISSING");

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
    console.error("FATAL: Missing Supabase Env Vars in .env");
    process.exit(1);
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function restoreSuperAdmin() {
    console.log("Starting Super Admin Restore...");

    // 1. Delete 'reda@example.com' (User request)
    console.log("Deleting reda@example.com...");
    const { data: redaUser, error: findRedaError } = await supabase
        .from('profiles')
        .select('id, user_id')
        .eq('email', 'reda@example.com')
        .single();

    if (redaUser) {
        // Delete from auth.users (Cascades to profiles usually, but we do explicitly)
        const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(redaUser.user_id);
        if (deleteAuthError) console.error("Error deleting Reda auth:", deleteAuthError.message);
        else console.log("Deleted reda@example.com from Auth & Profiles.");
    } else {
        console.log("reda@example.com not found.");
    }

    // 2. Create 'admin@techservice.com'
    const email = 'admin@techservice.com';
    const password = 'password123'; // Default known password

    console.log(`Creating ${email}...`);

    // Check if exists in Auth first
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    let adminUser = users.find(u => u.email === email);

    if (!adminUser) {
        const { data, error: createError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: {
                full_name: 'Super Admin',
                role: 'admin',
                is_super_admin: true
            }
        });
        if (createError) {
            console.error("FATAL: Could not create admin user:", createError);
            return;
        }
        adminUser = data.user;
        console.log("Created new Auth User:", adminUser.id);
    } else {
        console.log("Auth User already exists:", adminUser.id);
        // Reset password just in case user forgot it
        await supabase.auth.admin.updateUserById(adminUser.id, { password: password });
        console.log("Password reset to 'password123'");
    }

    // 3. Ensure Profile
    const { error: upsertError } = await supabase.from('profiles').upsert({
        id: adminUser.id,
        user_id: adminUser.id,
        email: email,
        full_name: 'Super Admin',
        role: 'admin',
        is_super_admin: true,
        is_active: true,
        status: 'active',
        permissions: { "can_manage_team": true, "can_delete_tickets": true, "can_manage_inventory": true, "can_view_all_clients": true, "can_view_all_tickets": true },
        created_via: 'restore_script'
    });

    if (upsertError) console.error("Error creating profile:", upsertError);
    else console.log("SUCCESS: Super Admin Profile Restored.");

}

restoreSuperAdmin();
