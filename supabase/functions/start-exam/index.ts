import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { exam_id } = await request.json()
    if (!exam_id) return json({ error: 'exam_id is required' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Function environment is incomplete' }, 500)

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('id,duration_minutes,paper_path,status,availability_mode,starts_at,available_until')
      .eq('id', exam_id)
      .maybeSingle()

    if (examError) return json({ error: 'Exam lookup failed', code: examError.code, detail: examError.message }, 500)
    if (!exam || exam.status !== 'published') return json({ error: 'Published exam not found' }, 404)

    const now = new Date()
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

    const { data: fileRows, error: fileError } = await supabase
      .from('exam_files')
      .select('storage_path,file_name,mime_type,sort_order')
      .eq('exam_id', exam.id)
      .order('sort_order')

    if (fileError) return json({ error: 'Paper lookup failed', code: fileError.code, detail: fileError.message }, 500)
    const files = fileRows?.length ? fileRows : exam.paper_path ? [{
      storage_path: exam.paper_path,
      file_name: exam.paper_path.split('/').pop() || 'question-paper',
      mime_type: exam.paper_path.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
      sort_order: 0,
    }] : []

    if (!files.length) return json({ error: 'No question-paper files are attached' }, 422)

    const signedSeconds = Math.max(60, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000) + 60)
    const signedFiles = await Promise.all(files.map(async (file) => {
      const { data, error } = await supabase.storage
        .from('question-papers')
        .createSignedUrl(file.storage_path, signedSeconds)
      if (error || !data) throw error || new Error(`Unable to sign ${file.file_name}`)
      return { url: data.signedUrl, file_name: file.file_name, mime_type: file.mime_type }
    }))

    const { data: session, error: sessionError } = await supabase
      .from('exam_sessions')
      .insert({ exam_id: exam.id, started_at: now.toISOString(), expires_at: expiresAt.toISOString() })
      .select('id')
      .single()

    if (sessionError) return json({ error: 'Session creation failed', code: sessionError.code, detail: sessionError.message }, 500)

    return json({
      session_id: session.id,
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      files: signedFiles,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
