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
    if (options.body && !(options.body instanceof Blob) && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = payload?.msg || payload?.message || payload?.error_description || payload?.error || `Request failed (${response.status})`;
      const error = new Error(payload?.detail ? `${message}: ${payload.detail}` : message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
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

  async function getSession() {
    const session = storedSession();
    if (!session) return null;
    if (Number(session.expires_at) * 1000 > Date.now() + 60_000) return session;
    try {
      const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      return saveSession(refreshed);
    } catch {
      return saveSession(null);
    }
  }

  async function signIn(email, password) {
    const session = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    return saveSession(session);
  }

  async function signOut() {
    const session = await getSession();
    if (session?.access_token) {
      try { await request('/auth/v1/logout', { method: 'POST', token: session.access_token }); } catch {}
    }
    saveSession(null);
  }

  async function requireSession() {
    const session = await getSession();
    if (!session) throw new Error('Administrator sign-in required.');
    return session;
  }

  async function getAdminProfile() {
    const session = await requireSession();
    const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,role`, { token: session.access_token });
    if (rows[0]?.role !== 'admin') throw new Error('This account does not have the administrator role.');
    return rows[0];
  }

  async function fetchPortalExams() {
    const fields = 'id,title,subject,class_name,duration_minutes,full_marks,status,availability_mode,starts_at,available_until,student_note,announcement,updated_at';
    return request(`/rest/v1/exams?select=${fields}&status=eq.published&order=starts_at.asc`);
  }

  async function fetchAdminExams() {
    const session = await requireSession();
    return request('/rest/v1/exams?select=*&order=starts_at.desc', { token: session.access_token });
  }

  async function fetchExamFiles(examId) {
    const session = await requireSession();
    return request(`/rest/v1/exam_files?select=id,exam_id,storage_path,file_name,mime_type,sort_order&exam_id=eq.${encodeURIComponent(examId)}&order=sort_order.asc`, { token: session.access_token });
  }

  async function fetchResults(examId) {
    if (!examId) return [];
    return request(`/rest/v1/results?select=exam_id,subject,cq_score,cq_total,mcq_score,mcq_total,published_at&exam_id=eq.${encodeURIComponent(examId)}&published_at=not.is.null&order=subject.asc`);
  }

  async function saveExam(exam) {
    const session = await requireSession();
    const payload = {
      title: exam.title, subject: exam.subject, class_name: exam.className,
      duration_minutes: exam.durationMinutes, full_marks: exam.fullMarks,
      paper_path: exam.paperPath || null, status: 'published',
      availability_mode: exam.availabilityMode, starts_at: exam.startsAt,
      available_until: exam.availabilityMode === 'window' ? exam.availableUntil : null,
      student_note: exam.studentNote || '', announcement: exam.announcement || '',
      updated_at: new Date().toISOString(),
    };
    const options = { method: exam.id ? 'PATCH' : 'POST', token: session.access_token, body: JSON.stringify(payload), headers: { Prefer: 'return=representation' } };
    const rows = await request(exam.id ? `/rest/v1/exams?id=eq.${encodeURIComponent(exam.id)}` : '/rest/v1/exams', options);
    return rows[0];
  }

  async function saveExamFiles(examId, files) {
    const session = await requireSession();
    await request(`/rest/v1/exam_files?exam_id=eq.${encodeURIComponent(examId)}`, { method: 'DELETE', token: session.access_token });
    if (!files.length) return [];
    const payload = files.map((file, index) => ({
      exam_id: examId, storage_path: file.storagePath, file_name: file.fileName,
      mime_type: file.mimeType, sort_order: index,
    }));
    return request('/rest/v1/exam_files', {
      method: 'POST', token: session.access_token, body: JSON.stringify(payload), headers: { Prefer: 'return=representation' },
    });
  }

  async function saveResult(examId, subject, result) {
    const session = await requireSession();
    const payload = {
      exam_id: examId, subject, cq_score: result.cq, cq_total: result.cqTotal,
      mcq_score: result.mcq, mcq_total: result.mcqTotal, teacher_note: '',
      published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const rows = await request('/rest/v1/results?on_conflict=exam_id,subject', {
      method: 'POST', token: session.access_token, body: JSON.stringify(payload),
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    });
    return rows[0];
  }

  async function deleteResult(examId, subject) {
    const session = await requireSession();
    return request(`/rest/v1/results?exam_id=eq.${encodeURIComponent(examId)}&subject=eq.${encodeURIComponent(subject)}`, {
      method: 'DELETE', token: session.access_token,
    });
  }

  async function deleteExam(examId, storagePaths = []) {
    const session = await requireSession();
    await request(`/rest/v1/exams?id=eq.${encodeURIComponent(examId)}`, { method: 'DELETE', token: session.access_token });
    await Promise.allSettled(storagePaths.map(path => request(
      `/storage/v1/object/question-papers/${path.split('/').map(encodeURIComponent).join('/')}`,
      { method: 'DELETE', token: session.access_token },
    )));
  }

  async function uploadPapers(files) {
    const session = await requireSession();
    const uploaded = [];
    for (const file of files) {
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
      const path = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
      await request(`/storage/v1/object/question-papers/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', token: session.access_token, body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
      });
      uploaded.push({ storagePath: path, fileName: file.name, mimeType: file.type || 'application/octet-stream' });
    }
    return uploaded;
  }

  async function createPaperPreview(path) {
    const session = await requireSession();
    const signed = await request(`/storage/v1/object/sign/question-papers/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', token: session.access_token, body: JSON.stringify({ expiresIn: 3600 }),
    });
    const signedPath = signed.signedURL || signed.signedUrl;
    if (!signedPath) throw new Error('Supabase did not return a signed paper URL.');
    if (signedPath.startsWith('http')) return signedPath;
    return signedPath.startsWith('/storage/v1') ? `${baseUrl}${signedPath}` : `${baseUrl}/storage/v1${signedPath}`;
  }

  async function startExam(examId, deviceToken, action = 'start') {
    return request('/functions/v1/start-exam', {
      method: 'POST', body: JSON.stringify({ exam_id: examId, device_token: deviceToken, action }),
    });
  }

  window.examioApi = Object.freeze({
    isConfigured, getSession, signIn, signOut, getAdminProfile,
    fetchPortalExams, fetchAdminExams, fetchExamFiles, fetchResults,
    saveExam, saveExamFiles, saveResult, deleteResult, deleteExam,
    uploadPapers, createPaperPreview, startExam,
  });
})();
