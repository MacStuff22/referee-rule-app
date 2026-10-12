import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VIDEO_BUCKET, VIDEO_SIGNED_URL_SECONDS, isValidVideoPath } from '@/lib/video'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Hands a logged-in user a short-lived signed URL for a question's clip.
 *
 * The bucket is private and has no read policy for regular users, so this is
 * the only way a clip can be fetched: the caller must be signed in, and the
 * question must be approved (admins may also preview unapproved ones). The
 * question lookup runs as the caller, so RLS already hides unapproved rows
 * from non-admins; the explicit checks below are belt and braces.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params
  if (!UUID.test(questionId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: question } = await supabase
    .from('questions')
    .select('video_path, is_approved')
    .eq('id', questionId)
    .maybeSingle()

  if (!question || !isValidVideoPath(question.video_path)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!question.is_approved) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data, error } = await createAdminClient()
    .storage.from(VIDEO_BUCKET)
    .createSignedUrl(question.video_path, VIDEO_SIGNED_URL_SECONDS)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Could not load video' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl }, { headers: { 'Cache-Control': 'no-store' } })
}
