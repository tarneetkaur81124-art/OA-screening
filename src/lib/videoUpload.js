import { supabase } from './supabaseClient.js'

// TODO (backend team): create a 'gait-videos' bucket in Supabase Storage and
// confirm its access policy (likely private, with signed URLs for the pose
// pipeline to read from). This function uploads the raw video and returns
// its storage path.
export async function uploadGaitVideo(blob, patientId) {
  const fileName = `${patientId ?? 'anonymous'}-${Date.now()}.webm`
  const { data, error } = await supabase.storage
    .from('gait-videos')
    .upload(fileName, blob, { contentType: blob.type || 'video/webm' })

  if (error) throw error
  return data.path
}
