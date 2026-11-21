(() => {
  const config = window.EXAMIO_CONFIG || {};
  const baseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
  const apiKey = config.supabasePublishableKey || '';
  const sessionKey = 'examio-supabase-session';

  function isConfigured() { return Boolean(baseUrl && apiKey); }

  async function request(path, options = {}) {
    if (!isConfigured()) throw new Error('Supabase is not configured.');
    const headers = new Headers(options.headers || {});
    headers.set('apikey', apiKey);
    if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
    if (options.body && !(options.body instanceof Blob) && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(payload?.msg || payload?.message || payload?.error_description || payload?.error || `Request failed (${response.status})`);
    return payload;
  }

  function saveSession(session) {
    if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
    else localStorage.removeItem(sessionKey);
    return session;
  }

  function storedSession() {
    try { return JSON.parse(localStorage.getItem(sessionKey)); }
    catch { return null; }
  }

  async function refreshSession(session) {
    if (!session?.refresh_token) return null;
    const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    return saveSession(refreshed);
  }

  async function getSession() {
    const session = storedSession();
    if (!session) return null;
    if (Number(session.expires_at) * 1000 > Date.now() + 60_000) return session;
    try { return await refreshSession(session); }
    catch { saveSession(null); return null; }
  }

  async function signIn(email, password) {
    const session = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    return saveSession(session);
  }

  async function signOut() {
    const session = await getSession();
    if (session?.access_token) {
      try { await request('/auth/v1/logout', { method: 'POST', token: session.access_token }); } catch {}
    }
    saveSession(null);
  }

  async function fetchPublishedExam() {
    const fields = 'id,title,subject,class_name,duration_minutes,full_marks,updated_at,status';
    const rows = await request(`/rest/v1/exams?select=${fields}&status=eq.published&order=updated_at.desc&limit=1`);
    return rows[0] || null;
  }

  async function fetchAdminExam() {
    const session = await getSession();
    if (!session) throw new Error('Administrator sign-in required.');
    const rows = await request('/rest/v1/exams?select=*&order=updated_at.desc&limit=1', { token: session.access_token });
    return rows[0] || null;
  }

  async function getAdminProfile() {
    const session = await getSession();
    if (!session) throw new Error('Administrator sign-in required.');
    const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,role`, { token: session.access_token });
    if (rows[0]?.role !== 'admin') throw new Error('This account does not have the administrator role.');
    return rows[0];
  }

  async function fetchResults() {
    return request('/rest/v1/results?select=subject,cq_score,cq_total,mcq_score,mcq_total,teacher_note,published_at&published_at=not.is.null&order=subject.asc');
  }

  async function saveExam(exam) {
    const session = await getSession();
    if (!session) throw new Error('Administrator sign-in required.');
    const payload = {
      title: exam.title, subject: exam.subject, class_name: exam.className,
      duration_minutes: exam.durationMinutes, full_marks: exam.fullMarks,
      paper_path: exam.paperPath, status: 'published', updated_at: new Date().toISOString(),
    };
    const common = { method: exam.id ? 'PATCH' : 'POST', token: session.access_token, body: JSON.stringify(payload), headers: { Prefer: 'return=representation' } };
    const rows = await request(exam.id ? `/rest/v1/exams?id=eq.${encodeURIComponent(exam.id)}` : '/rest/v1/exams', common);
    return rows[0];
  }

  async function saveResult(subject, result) {
    const session = await getSession();
    if (!session) throw new Error('Administrator sign-in required.');
    const payload = {
      subject, cq_score: result.cq, cq_total: result.cqTotal, mcq_score: result.mcq,
      mcq_total: result.mcqTotal, teacher_note: result.feedback,
      published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const rows = await request('/rest/v1/results?on_conflict=subject', {
      method: 'POST', token: session.access_token, body: JSON.stringify(payload),
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    });
    return rows[0];
  }

  async function uploadPaper(file) {
    const session = await getSession();
    if (!session) throw new Error('Administrator sign-in required.');
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const path = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
    await request(`/storage/v1/object/question-papers/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', token: session.access_token, body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
    });
    return path;
  }

  async function createPaperPreview(path) {
    const session = await getSession();
    if (!session) throw new Error('Administrator sign-in required.');
    const signed = await request(`/storage/v1/object/sign/question-papers/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', token: session.access_token, body: JSON.stringify({ expiresIn: 3600 }),
    });
    const signedPath = signed.signedURL || signed.signedUrl;
    if (!signedPath) throw new Error('Supabase did not return a signed paper URL.');
    if (signedPath.startsWith('http')) return signedPath;
    return signedPath.startsWith('/storage/v1') ? `${baseUrl}${signedPath}` : `${baseUrl}/storage/v1${signedPath}`;
  }

  async function startExam(examId) {
    return request('/functions/v1/start-exam', { method: 'POST', body: JSON.stringify({ exam_id: examId }) });
  }

  window.examioApi = Object.freeze({
    isConfigured, getSession, signIn, signOut, getAdminProfile, fetchPublishedExam, fetchAdminExam,
    fetchResults, saveExam, saveResult, uploadPaper, createPaperPreview, startExam,
  });
})();
