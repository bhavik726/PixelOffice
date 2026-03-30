import { supabase } from '../config/supabase';

export async function signup(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  // Insert username and avatar_id into users table
  const user = data.user;
  if (user) {
    const { error: insertError } = await supabase.from('users').insert({
      id: user.id,
      email: user.email,
      username,
      avatar_id: null,
    });

    if (insertError) {
      throw new Error(insertError.message);
    }
  }
  return data;
}

export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  const user = data.user;
  if (!user) throw new Error('User not found');
  // Return Supabase session and access_token
  return {
    access_token: data.session?.access_token,
    user,
    session: data.session,
  };
}
