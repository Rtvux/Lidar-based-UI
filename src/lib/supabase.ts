import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

const BUCKET = 'models'

/**
 * Upload a file to Supabase Storage.
 * Returns the public URL on success.
 */
export async function uploadModel(file: File): Promise<{ publicUrl: string; storagePath: string }> {
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${timestamp}_${safeName}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path)

  return { publicUrl: data.publicUrl, storagePath: path }
}

/**
 * List all models in the storage bucket.
 * Returns file metadata sorted by newest first.
 */
export async function listModels(): Promise<{ name: string; url: string; created: string }[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list('', {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    })

  if (error) throw new Error(`List failed: ${error.message}`)

  return (data ?? [])
    .filter(f => !f.name.startsWith('.'))
    .map(f => {
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(f.name)

      return {
        name: f.name,
        url: urlData.publicUrl,
        created: f.created_at ?? '',
      }
    })
}

/**
 * Delete a model from Supabase Storage by its storage path (filename).
 */
export async function deleteModel(storagePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath])

  if (error) throw new Error(`Delete failed: ${error.message}`)
}
