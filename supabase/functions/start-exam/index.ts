import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type PaperFile = { storage_path: string; file_name: string; mime_type: string; sort_order: number }
type ExamSession = { id: string; started_at: string; expires_at: string; status: string }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { exam_id, device_token, action = 'start' } = await request.json()
    if (!exam_id) return json({ error: 'exam_id is required' }, 400)
    if (typeof device_token !== 'string' || device_token.length < 32 || device_token.length > 200) {
      return json({ error: 'A valid device token is required' }, 400)
    }
    if (!['start', 'resume'].includes(action)) return json({ error: 'Invalid attempt action' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Function environment is incomplete' }, 500)

    const clientIp = request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (!clientIp) return json({ error: 'Unable to verify the originating network' }, 503)

    const deviceHash = await sha256(`${serviceRoleKey}|device|${device_token}`)
    const ipHash = await sha256(`${serviceRoleKey}|network|${clientIp}`)
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('id,duration_minutes,paper_path,status,availability_mode,starts_at,available_until')
      .eq('id', exam_id)
      .maybeSingle()

    if (examError) return json({ error: 'Exam lookup failed', code: examError.code, detail: examError.message }, 500)
    if (!exam || exam.status !== 'published') return json({ error: 'Published exam not found' }, 404)

    const now = new Date()
    const existing = await findSession(supabase, exam.id, 'device_hash', deviceHash)
    if (existing) {
      if (now.getTime() >= new Date(existing.expires_at).getTime()) {
        await supabase.from('exam_sessions').update({ status: 'expired' }).eq('id', existing.id)
        return json({ error: 'This attempt has ended and cannot be started again', attempt_status: 'expired', exam_id: exam.id }, 410)
      }
      await supabase.from('exam_sessions').update({ last_resumed_at: now.toISOString() }).eq('id', existing.id)
      return issueSession(supabase, exam, existing, now, true)
    }

    if (action === 'resume') return json({ error: 'No resumable attempt exists on this device' }, 404)

    const networkSession = await findSession(supabase, exam.id, 'ip_hash', ipHash)
    if (networkSession) return json({ error: 'Another device has already used this exam on the current network' }, 423)

    const startsAt = new Date(exam.starts_at)
    if (now < startsAt) return json({ error: 'Exam has not started yet', starts_at: startsAt.toISOString() }, 409)

    let expiresAt: Date
    if (exam.availability_mode === 'fixed') {
      expiresAt = new Date(startsAt.getTime() + exam.duration_minutes * 60_000)
      if (now >= expiresAt) return json({ error: 'Exam has ended' }, 410)
    } else {
      const availableUntil = new Date(exam.available_until)
      if (now > availableUntil) return json({ error: 'Exam start window has closed' }, 410)
      expiresAt = new Date(now.getTime() + exam.duration_minutes * 60_000)
    }

    const { data: session, error: sessionError } = await supabase
      .from('exam_sessions')
      .insert({
        exam_id: exam.id,
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        device_hash: deviceHash,
        ip_hash: ipHash,
      })
      .select('id,started_at,expires_at,status')
      .single()

    if (sessionError?.code === '23505') {
      const racedDevice = await findSession(supabase, exam.id, 'device_hash', deviceHash)
      if (racedDevice && now.getTime() < new Date(racedDevice.expires_at).getTime()) return issueSession(supabase, exam, racedDevice, now, true)
      return json({ error: 'Another device has already claimed this exam or network' }, 423)
    }
    if (sessionError || !session) {
      return json({ error: 'Session creation failed', code: sessionError?.code, detail: sessionError?.message }, 500)
    }

    return issueSession(supabase, exam, session, now, false)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error' }, 500)
  }
})

async function findSession(supabase: any, examId: string, column: 'device_hash' | 'ip_hash', hash: string): Promise<ExamSession | null> {
  const { data, error } = await supabase
    .from('exam_sessions')
    .select('id,started_at,expires_at,status')
    .eq('exam_id', examId)
    .eq(column, hash)
    .maybeSingle()
  if (error) throw new Error(`Attempt lookup failed: ${error.message}`)
  return data
}

async function issueSession(supabase: any, exam: any, session: ExamSession, now: Date, resumed: boolean) {
  const { data: fileRows, error: fileError } = await supabase
    .from('exam_files')
    .select('storage_path,file_name,mime_type,sort_order')
    .eq('exam_id', exam.id)
    .order('sort_order')

  if (fileError) return json({ error: 'Paper lookup failed', code: fileError.code, detail: fileError.message }, 500)
  const files: PaperFile[] = fileRows?.length ? fileRows : exam.paper_path ? [{
    storage_path: exam.paper_path,
    file_name: exam.paper_path.split('/').pop() || 'question-paper',
    mime_type: exam.paper_path.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    sort_order: 0,
  }] : []
  if (!files.length) return json({ error: 'No question-paper files are attached' }, 422)

  const expiresAt = new Date(session.expires_at)
  const signedSeconds = Math.max(60, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000) + 60)
  const signedFiles = await Promise.all(files.map(async (file) => {
    const { data, error } = await supabase.storage
      .from('question-papers')
      .createSignedUrl(file.storage_path, signedSeconds)
    if (error || !data) throw error || new Error(`Unable to sign ${file.file_name}`)
    return { url: data.signedUrl, file_name: file.file_name, mime_type: file.mime_type }
  }))

  return json({
    session_id: session.id,
    started_at: session.started_at,
    expires_at: session.expires_at,
    resumed,
    files: signedFiles,
  })
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
