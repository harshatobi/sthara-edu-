import { createClient } from '@supabase/supabase-js';

const url = 'https://nqwvsuyiwswnsqbyhghb.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xd3ZzdXlpd3N3bnNxYnloZ2hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDEzNzAzNSwiZXhwIjoyMDk5NzEzMDM1fQ.rFuYkmbA-T92TzWIqgbpCn2Ua_qdGymJB9u-9B4X2hk';

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  const email = 'admin@sthara.in';
  const password = 'Kittu@761681';
  const name = 'Super Admin';

  console.log(`Creating SuperAdmin user: ${email}...`);

  // 1. Create or update user in Supabase Auth
  let uid = '';
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'superadmin', name }
  });

  if (authErr) {
    if (authErr.message.includes('already registered')) {
      console.log('User already exists in Auth, updating password...');
      const { data: usersData } = await supabase.auth.admin.listUsers();
      const existing = usersData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (existing) {
        uid = existing.id;
        await supabase.auth.admin.updateUserById(uid, { password });
      } else {
        throw authErr;
      }
    } else {
      throw authErr;
    }
  } else {
    uid = authData.user.id;
  }

  console.log(`Auth UID: ${uid}`);

  // 2. Insert into `superadmins` table
  const { error: saErr } = await supabase
    .from('superadmins')
    .upsert({ id: uid, email, name });

  if (saErr) console.error('superadmins error:', saErr);
  else console.log('✓ Inserted into superadmins table');

  // 3. Insert into `users` table
  const { error: uErr } = await supabase
    .from('users')
    .upsert({
      id: uid,
      email,
      name,
      role: 'superadmin',
      school_id: 'global'
    });

  if (uErr) console.error('users error:', uErr);
  else console.log('✓ Inserted into users table');

  console.log('🎉 SuperAdmin creation completed successfully!');
}

main().catch(console.error);
