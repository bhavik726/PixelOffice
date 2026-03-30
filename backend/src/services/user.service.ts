import { supabase } from '../config/supabase';
import { User } from '../models/user.model';

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
  if (error) return null;
  return data as User;
}

type AuthenticatedSupabaseUser = {
  id: string;
  email?: string | null;
  user_metadata?: {
    username?: string;
  } | null;
};

export async function ensureUserRow(authUser: AuthenticatedSupabaseUser): Promise<void> {
  const fallbackEmail = `${authUser.id}@placeholder.local`;
  const preferredEmail = authUser.email?.trim().toLowerCase();
  let email = preferredEmail || fallbackEmail;

  if (preferredEmail) {
    const { data: existingByEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', preferredEmail)
      .maybeSingle();

    if (existingByEmail && existingByEmail.id !== authUser.id) {
      email = fallbackEmail;
    }
  }

  const fallbackUsername = email.includes('@')
    ? email.split('@')[0]
    : `user_${authUser.id.slice(0, 8)}`;
  const username = authUser.user_metadata?.username || fallbackUsername;

  const { error } = await supabase.from('users').upsert(
    {
      id: authUser.id,
      email,
      username,
      avatar_id: null,
    },
    { onConflict: 'id' },
  );

  if (error) {
    throw new Error(error.message);
  }
}
