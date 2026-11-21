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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('id,duration_minutes,paper_path,status')
      .eq('id', exam_id)
      .eq('status', 'published')
      .single()

    if (examError || !exam) return json({ error: 'Published exam not found' }, 404)

    const startedAt = new Date()
    const expiresAt = new Date(startedAt.getTime() + exam.duration_minutes * 60_000)
    const signedSeconds = exam.duration_minutes * 60 + 60
    const { data: paper, error: paperError } = await supabase.storage
      .from('question-papers')
      .createSignedUrl(exam.paper_path, signedSeconds)

    if (paperError || !paper) throw paperError || new Error('Unable to sign paper URL')

    const { data: session, error: sessionError } = await supabase
      .from('exam_sessions')
      .insert({ exam_id: exam.id, started_at: startedAt.toISOString(), expires_at: expiresAt.toISOString() })
      .select('id')
      .single()

    if (sessionError) throw sessionError

    return json({
      session_id: session.id,
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      paper_url: paper.signedUrl,
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

