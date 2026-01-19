SELECT permissions FROM profiles WHERE email = 'amorbuba@fixarr.es';
SELECT id, email, role FROM profiles WHERE role::text NOT IN ('admin', 'tech', 'technician');
