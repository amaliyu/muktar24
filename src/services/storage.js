import { supabase } from '../lib/supabase';

// Shared signed-URL helper for private document buckets.
// Extract the storage path from a stored value: new rows store the bare
// storage path; legacy rows stored the full public URL — for those, take the
// part after `/<bucket>/` before signing.
export function docStoragePath(bucket, storedValue) {
  if (!storedValue) return null;
  return storedValue.startsWith('http')
    ? (storedValue.split(`/${bucket}/`)[1] || null)
    : storedValue;
}

// Returns a 1-hour signed URL for a stored document value in `bucket`,
// or null if there is nothing to sign.
export async function getSignedDocUrl(bucket, storedValue) {
  const path = docStoragePath(bucket, storedValue);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl || null;
}
