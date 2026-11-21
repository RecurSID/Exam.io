const DEFAULT_PAPER = 'assets/question-paper.svg';
const COMPLETED_EXAM_KEY = 'examio-completed-exam';
const api = window.examioApi;

const defaultConfig = {
  title: '', subject: '', className: '', durationMinutes: 60, fullMarks: 100, paperUrl: DEFAULT_PAPER,
};

const state = {
  running: false, ended: false, deadline: null, timerId: null,
  totalSeconds: 0, remainingSeconds: 0, config: null, results: {},
  selectedSubject: null, pendingPaperFile: null, adminSession: null,
};

const elements = {
  navButtons: [...document.querySelectorAll('.nav-button')],
  views: [...document.querySelectorAll('.view')],
  startForm: document.querySelector('#start-form'), startPanel: document.querySelector('#start-panel'),
  sessionPanel: document.querySelector('#exam-session'), expiredPanel: document.querySelector('#expired-panel'),
  timer: document.querySelector('#timer'), timerProgress: document.querySelector('#timer-progress'),
  privacyCover: document.querySelector('#privacy-cover'), resumeButton: document.querySelector('#resume-button'),
  watermark: document.querySelector('#watermark'), toast: document.querySelector('#toast'),
  questionPaper: document.querySelector('#question-paper'), paperPreview: document.querySelector('#admin-paper-preview'),
  paperInput: document.querySelector('#admin-paper'), subjectTabs: document.querySelector('#subject-tabs'),
  resultsEmpty: document.querySelector('#results-empty'), resultsContent: document.querySelector('#results-content'),
};

function showView(name) {
  elements.views.forEach(view => view.classList.toggle('is-visible', view.id === `${name}-view`));
  elements.navButtons.forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (name === 'results') renderResultsState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function populateAdminForm(config = defaultConfig) {
  document.querySelector('#admin-exam-title').value = config.title;
  document.querySelector('#admin-subject').value = config.subject;
  document.querySelector('#admin-class').value = config.className;
  document.querySelector('#admin-duration').value = config.durationMinutes;
  document.querySelector('#admin-marks').value = config.fullMarks;
}

function applyExamConfig() {
  const config = state.config;
  const startButton = elements.startForm.querySelector('button[type="submit"]');
  const readiness = document.querySelector('#readiness');
  populateAdminForm(config || defaultConfig);

  if (!config) {
    document.querySelector('#exam-card-status').textContent = 'Exam status';
    document.querySelector('#exam-card-title').textContent = 'No exam published';
    document.querySelector('#exam-card-meta').textContent = 'An administrator needs to create an exam first.';
    document.querySelector('#configured-duration').textContent = '—';
    document.querySelector('#configured-subject').textContent = '—';
    document.querySelector('#attempt-title').textContent = 'No exam available';
    document.querySelector('.orbit-clock').textContent = '—';
    startButton.disabled = true;
    readiness.disabled = true;
    return;
  }

  const completed = localStorage.getItem(COMPLETED_EXAM_KEY) === config.id;
  document.querySelector('#exam-card-status').textContent = completed ? 'Completed' : 'Ready paper';
  document.querySelector('#exam-card-title').textContent = config.title;
  document.querySelector('#exam-card-meta').textContent = `${config.className} · CQ + MCQ · ${config.fullMarks} marks`;
  document.querySelector('#configured-duration').textContent = `${config.durationMinutes} minutes`;
  document.querySelector('#configured-subject').textContent = config.subject;
  document.querySelector('#live-subject').textContent = `${config.subject} · Live`;
  document.querySelector('#attempt-title').textContent = completed ? 'Exam already completed' : 'Begin a focused attempt';
  document.querySelector('.orbit-clock').innerHTML = `${config.durationMinutes}<span>min</span>`;
  elements.questionPaper.src = DEFAULT_PAPER;
  elements.questionPaper.alt = `${config.subject} question paper`;
  startButton.disabled = completed;
  readiness.disabled = completed;
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function updateTimer() {
  if (!state.running) return;
  state.remainingSeconds = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
  elements.timer.textContent = formatTime(state.remainingSeconds);
  elements.timerProgress.style.width = `${(state.remainingSeconds / state.totalSeconds) * 100}%`;
  document.title = `${formatTime(state.remainingSeconds)} · Examio`;
  if (state.remainingSeconds <= 0) endExam();
}

async function startExam(event) {
  event.preventDefault();
  if (!state.config?.id) { showToast('No exam is currently published.'); return; }
  if (localStorage.getItem(COMPLETED_EXAM_KEY) === state.config.id) { showToast('This exam has already been completed.'); return; }

  const startButton = event.submitter;
  startButton.disabled = true;
  startButton.textContent = 'Opening paper…';
  try {
    const session = await api.startExam(state.config.id);
    state.deadline = new Date(session.expires_at).getTime();
    state.totalSeconds = Math.max(1, Math.round((state.deadline - new Date(session.started_at).getTime()) / 1000));
    state.remainingSeconds = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    elements.questionPaper.src = session.paper_url;
  } catch (error) {
    showToast(`Unable to start: ${error.message}`);
    startButton.disabled = false;
    startButton.textContent = 'Start exam';
    return;
  }

  state.running = true;
  state.ended = false;
  elements.startPanel.hidden = true;
  elements.expiredPanel.hidden = true;
  elements.sessionPanel.hidden = false;
  elements.timer.textContent = formatTime(state.remainingSeconds);
  elements.timerProgress.style.width = '100%';
  setWatermark();
  clearInterval(state.timerId);
  state.timerId = window.setInterval(updateTimer, 250);
  updateTimer();
  elements.sessionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  startButton.textContent = 'Start exam';
  showToast('Exam started. Focus protection is active.');
}

function endExam() {
  state.running = false;
  state.ended = true;
  clearInterval(state.timerId);
  state.timerId = null;
  elements.sessionPanel.hidden = true;
  elements.expiredPanel.hidden = false;
  elements.privacyCover.hidden = true;
  if (state.config?.id) localStorage.setItem(COMPLETED_EXAM_KEY, state.config.id);
  applyExamConfig();
  renderResultsState();
  document.title = 'Session complete · Examio';
  elements.expiredPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetExam() {
  state.running = false;
  state.ended = false;
  clearInterval(state.timerId);
  elements.startForm.reset();
  elements.sessionPanel.hidden = true;
  elements.expiredPanel.hidden = true;
  elements.startPanel.hidden = false;
  applyExamConfig();
  document.title = 'Examio — Timed exam portal';
  showView('exam');
}

function setWatermark() {
  const stamp = `EXAMIO • ${state.config.subject.toUpperCase()} • ${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="170"><text x="18" y="85" fill="#273338" font-family="Arial" font-weight="700" font-size="15">${stamp}</text></svg>`;
  elements.watermark.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function showPrivacyCover() { if (state.running) elements.privacyCover.hidden = false; }

function aggregateResults() {
  return Object.values(state.results).reduce((total, item) => ({
    cq: total.cq + Number(item.cq), cqTotal: total.cqTotal + Number(item.cqTotal),
    mcq: total.mcq + Number(item.mcq), mcqTotal: total.mcqTotal + Number(item.mcqTotal),
  }), { cq: 0, cqTotal: 0, mcq: 0, mcqTotal: 0 });
}

function renderSubjectTabs() {
  const available = Object.keys(state.results);
  const subjects = available.length > 1 ? ['All', ...available] : available;
  if (!subjects.includes(state.selectedSubject)) state.selectedSubject = subjects[0] || null;
  elements.subjectTabs.innerHTML = subjects.map(subject => `<button class="result-tab${subject === state.selectedSubject ? ' is-active' : ''}" role="tab" aria-selected="${subject === state.selectedSubject}" data-subject="${subject}">${subject}</button>`).join('');
  elements.subjectTabs.querySelectorAll('.result-tab').forEach(tab => tab.addEventListener('click', () => {
    state.selectedSubject = tab.dataset.subject;
    renderSubjectTabs();
    renderResult(state.selectedSubject);
  }));
}

function resultRows(subject, data) {
  if (subject === 'All') return Object.entries(state.results).map(([name, item]) => [name, Math.round((Number(item.cq) + Number(item.mcq)) / (Number(item.cqTotal) + Number(item.mcqTotal)) * 100)]);
  return [
    ['CQ', Math.round(Number(data.cq) / Number(data.cqTotal) * 100)],
    ['MCQ', Math.round(Number(data.mcq) / Number(data.mcqTotal) * 100)],
    ['Overall', Math.round((Number(data.cq) + Number(data.mcq)) / (Number(data.cqTotal) + Number(data.mcqTotal)) * 100)],
  ];
}

function renderResult(subject) {
  if (!subject || !Object.keys(state.results).length) return;
  const data = subject === 'All' ? aggregateResults() : state.results[subject];
  const score = Number(data.cq) + Number(data.mcq);
  const total = Number(data.cqTotal) + Number(data.mcqTotal);
  const percent = Math.round(score / total * 100);
  document.querySelector('#score-value').textContent = score;
  document.querySelector('#score-unit').textContent = `/${total}`;
  document.querySelector('#score-label').textContent = subject === 'All' ? 'Overall' : subject;
  document.querySelector('#score-ring').style.setProperty('--score', percent);
  document.querySelector('#cq-score').innerHTML = `${data.cq}<span>/${data.cqTotal}</span>`;
  document.querySelector('#mcq-score').innerHTML = `${data.mcq}<span>/${data.mcqTotal}</span>`;
  document.querySelector('#cq-bar').style.width = `${Number(data.cq) / Number(data.cqTotal) * 100}%`;
  document.querySelector('#mcq-bar').style.width = `${Number(data.mcq) / Number(data.mcqTotal) * 100}%`;
  document.querySelector('#breakdown-list').innerHTML = resultRows(subject, data).map(([label, value]) => `<div class="breakdown-row"><span>${label}</span><div class="row-track"><i style="width:${value}%"></i></div><strong>${value}%</strong></div>`).join('');
}

function renderResultsState() {
  const completed = Boolean(state.config?.id && localStorage.getItem(COMPLETED_EXAM_KEY) === state.config.id);
  const hasResults = Object.keys(state.results).length > 0;
  elements.resultsEmpty.hidden = completed && hasResults;
  elements.resultsContent.hidden = !(completed && hasResults);
  if (!completed) {
    document.querySelector('#results-empty-title').textContent = 'No exam taken';
    document.querySelector('#results-empty-copy').textContent = state.config ? 'Complete the published exam to see results.' : 'No exam is currently published.';
  } else if (!hasResults) {
    document.querySelector('#results-empty-title').textContent = 'Results not published';
    document.querySelector('#results-empty-copy').textContent = 'Your exam is complete. Results will appear after the administrator publishes them.';
  } else {
    renderSubjectTabs();
    renderResult(state.selectedSubject);
  }
}

async function saveExamSettings(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = 'Publishing…';
  try {
    let paperPath = state.config?.paperPath || null;
    if (state.pendingPaperFile) paperPath = await api.uploadPaper(state.pendingPaperFile);
    if (!paperPath) throw new Error('Upload a question-paper image before publishing.');
    const draft = {
      id: state.config?.id, paperPath,
      title: document.querySelector('#admin-exam-title').value.trim(),
      subject: document.querySelector('#admin-subject').value.trim(),
      className: document.querySelector('#admin-class').value.trim(),
      durationMinutes: Number(document.querySelector('#admin-duration').value),
      fullMarks: Number(document.querySelector('#admin-marks').value),
    };
    const saved = await api.saveExam(draft);
    state.config = mapExam(saved);
    state.pendingPaperFile = null;
    applyExamConfig();
    document.querySelector('#result-subject').value = state.config.subject;
    elements.paperPreview.src = await api.createPaperPreview(paperPath);
    renderResultsState();
    showToast('Exam published to Supabase.');
  } catch (error) {
    showToast(`Publish failed: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Save exam settings';
  }
}

function loadResultEditor(subject) {
  const data = state.results[subject] || { cq: 0, cqTotal: 50, mcq: 0, mcqTotal: 50 };
  document.querySelector('#admin-cq-score').value = data.cq;
  document.querySelector('#admin-cq-total').value = data.cqTotal;
  document.querySelector('#admin-mcq-score').value = data.mcq;
  document.querySelector('#admin-mcq-total').value = data.mcqTotal;
}

async function saveSubjectResult(event) {
  event.preventDefault();
  const subject = document.querySelector('#result-subject').value.trim();
  const result = {
    cq: Number(document.querySelector('#admin-cq-score').value), cqTotal: Number(document.querySelector('#admin-cq-total').value),
    mcq: Number(document.querySelector('#admin-mcq-score').value), mcqTotal: Number(document.querySelector('#admin-mcq-total').value), feedback: '',
  };
  if (!subject) { showToast('Enter a subject.'); return; }
  if (result.cq > result.cqTotal || result.mcq > result.mcqTotal) { showToast('A score cannot be higher than its full marks.'); return; }
  const button = event.submitter;
  button.disabled = true;
  button.textContent = 'Publishing…';
  try {
    await api.saveResult(subject, result);
    state.results[subject] = result;
    state.selectedSubject = subject;
    renderResultsState();
    showToast(`${subject} result published.`);
  } catch (error) {
    showToast(`Publish failed: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Publish subject result';
  }
}

function mapExam(row) {
  return {
    id: row.id, title: row.title, subject: row.subject, className: row.class_name,
    durationMinutes: row.duration_minutes, fullMarks: row.full_marks,
    paperPath: row.paper_path || state.config?.paperPath || null, paperUrl: DEFAULT_PAPER,
  };
}

function mapResults(rows) {
  return Object.fromEntries(rows.map(row => [row.subject, {
    cq: row.cq_score, cqTotal: row.cq_total, mcq: row.mcq_score,
    mcqTotal: row.mcq_total, feedback: row.teacher_note || '',
  }]));
}

async function showAdminDashboard(session) {
  await api.getAdminProfile();
  state.adminSession = session;
  document.querySelector('#admin-login-form').hidden = true;
  document.querySelector('#admin-dashboard').hidden = false;
  document.querySelector('#admin-user-email').textContent = session.user.email;
  const exam = await api.fetchAdminExam();
  if (exam) {
    state.config = mapExam(exam);
    applyExamConfig();
    document.querySelector('#result-subject').value = exam.subject;
    loadResultEditor(exam.subject);
    if (exam.paper_path) elements.paperPreview.src = await api.createPaperPreview(exam.paper_path);
  } else {
    populateAdminForm();
  }
}

async function hydrateRemoteData() {
  if (!api?.isConfigured()) return;
  try {
    const [exam, rows] = await Promise.all([api.fetchPublishedExam(), api.fetchResults()]);
    state.config = exam ? mapExam(exam) : null;
    state.results = mapResults(rows);
    state.selectedSubject = Object.keys(state.results).length > 1 ? 'All' : Object.keys(state.results)[0] || null;
    applyExamConfig();
    renderResultsState();
  } catch (error) {
    document.querySelector('#admin-login-status').textContent = `Backend unavailable: ${error.message}`;
  }
  const session = await api.getSession();
  if (session) {
    try { await showAdminDashboard(session); }
    catch (error) { document.querySelector('#admin-login-status').textContent = error.message; }
  }
}

let toastTimeout;
function showToast(message) {
  clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimeout = setTimeout(() => elements.toast.classList.remove('is-visible'), 2800);
}

elements.navButtons.forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => showView(button.dataset.viewLink)));
elements.startForm.addEventListener('submit', startExam);
elements.resumeButton.addEventListener('click', () => { elements.privacyCover.hidden = true; updateTimer(); });
document.querySelector('#view-results').addEventListener('click', () => showView('results'));
document.querySelector('#new-session').addEventListener('click', resetExam);
document.querySelector('#exam-settings-form').addEventListener('submit', saveExamSettings);
document.querySelector('#result-settings-form').addEventListener('submit', saveSubjectResult);
document.querySelector('#result-subject').addEventListener('change', event => loadResultEditor(event.target.value.trim()));

document.querySelector('#admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  const status = document.querySelector('#admin-login-status');
  button.disabled = true;
  button.textContent = 'Signing in…';
  status.textContent = 'Checking administrator access…';
  try {
    const session = await api.signIn(document.querySelector('#admin-email').value.trim(), document.querySelector('#admin-password').value);
    await showAdminDashboard(session);
    event.target.reset();
    showToast('Administrator signed in.');
  } catch (error) {
    await api.signOut();
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});

document.querySelector('#admin-sign-out').addEventListener('click', async () => {
  await api.signOut();
  state.adminSession = null;
  document.querySelector('#admin-dashboard').hidden = true;
  document.querySelector('#admin-login-form').hidden = false;
  document.querySelector('#admin-login-status').textContent = 'Supabase authentication protects exam and result changes.';
  showToast('Signed out.');
});

elements.paperInput.addEventListener('change', event => {
  const [file] = event.target.files;
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Choose an image file for the question paper.'); return; }
  if (file.size > 1.5 * 1024 * 1024) showToast('Large image selected; backend storage is recommended.');
  state.pendingPaperFile = file;
  const reader = new FileReader();
  reader.addEventListener('load', () => { elements.paperPreview.src = reader.result; });
  reader.readAsDataURL(file);
});

document.addEventListener('visibilitychange', () => { if (document.hidden) showPrivacyCover(); });
window.addEventListener('blur', showPrivacyCover);
document.addEventListener('contextmenu', event => { if (state.running) { event.preventDefault(); showToast('Context menu is disabled during the exam.'); } });
document.addEventListener('dragstart', event => { if (state.running) event.preventDefault(); });
document.addEventListener('keydown', event => {
  if (!state.running) return;
  const key = event.key.toLowerCase();
  if (event.key === 'PrintScreen' || ((event.ctrlKey || event.metaKey) && (key === 'p' || key === 's'))) {
    event.preventDefault();
    showPrivacyCover();
    showToast('Capture and printing controls are disabled in this session.');
  }
});
window.addEventListener('beforeprint', showPrivacyCover);

applyExamConfig();
renderResultsState();
hydrateRemoteData();
