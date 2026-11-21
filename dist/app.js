const COMPLETED_EXAMS_KEY = 'examio-completed-exams';
const LAST_COMPLETED_KEY = 'examio-last-completed-exam';
const DHAKA_TIME_ZONE = 'Asia/Dhaka';
const api = window.examioApi;

const defaultConfig = {
  title: '', subject: '', className: '', durationMinutes: 60, fullMarks: 100,
  availabilityMode: 'window', startsAt: nextDhakaHour(), availableUntil: null,
};

const state = {
  running: false, deadline: null, timerId: null, scheduleTimerId: null,
  totalSeconds: 0, remainingSeconds: 0,
  exams: [], config: null, upcoming: null, results: {}, selectedSubject: null,
  adminSession: null, adminExams: [], editingExam: null,
  editingFiles: [], pendingPaperFiles: [], adminResults: {},
};

const elements = {
  navButtons: [...document.querySelectorAll('.nav-button')], views: [...document.querySelectorAll('.view')],
  startForm: document.querySelector('#start-form'), startPanel: document.querySelector('#start-panel'),
  sessionPanel: document.querySelector('#exam-session'), expiredPanel: document.querySelector('#expired-panel'),
  timer: document.querySelector('#timer'), timerProgress: document.querySelector('#timer-progress'),
  privacyCover: document.querySelector('#privacy-cover'), resumeButton: document.querySelector('#resume-button'),
  watermark: document.querySelector('#watermark'), toast: document.querySelector('#toast'),
  paperPages: document.querySelector('#paper-pages'), paperInput: document.querySelector('#admin-paper'),
  subjectTabs: document.querySelector('#subject-tabs'), resultsEmpty: document.querySelector('#results-empty'),
  resultsContent: document.querySelector('#results-content'), upcomingSection: document.querySelector('#upcoming-section'),
  adminExamList: document.querySelector('#admin-exam-list'), adminFileList: document.querySelector('#admin-file-list'),
};

function completedExamIds() {
  try { return new Set(JSON.parse(localStorage.getItem(COMPLETED_EXAMS_KEY)) || []); }
  catch { return new Set(); }
}

function markCompleted(examId) {
  const ids = completedExamIds();
  ids.add(examId);
  localStorage.setItem(COMPLETED_EXAMS_KEY, JSON.stringify([...ids]));
  localStorage.setItem(LAST_COMPLETED_KEY, examId);
}

function showView(name) {
  elements.views.forEach(view => view.classList.toggle('is-visible', view.id === `${name}-view`));
  elements.navButtons.forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (name === 'results') loadCompletedResults();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mapExam(row) {
  return {
    id: row.id, title: row.title, subject: row.subject, className: row.class_name,
    durationMinutes: Number(row.duration_minutes), fullMarks: Number(row.full_marks),
    paperPath: row.paper_path || null, status: row.status,
    availabilityMode: row.availability_mode || 'window', startsAt: row.starts_at,
    availableUntil: row.available_until || null,
  };
}

function mapResults(rows) {
  return Object.fromEntries(rows.map(row => [row.subject, {
    cq: Number(row.cq_score), cqTotal: Number(row.cq_total),
    mcq: Number(row.mcq_score), mcqTotal: Number(row.mcq_total),
  }]));
}

function examPhase(exam, now = Date.now()) {
  const starts = new Date(exam.startsAt).getTime();
  if (now < starts) return 'upcoming';
  if (exam.availabilityMode === 'fixed') return now < starts + exam.durationMinutes * 60_000 ? 'active' : 'ended';
  return now <= new Date(exam.availableUntil).getTime() ? 'active' : 'ended';
}

function renderCandidatePortal() {
  const now = Date.now();
  const completed = completedExamIds();
  const active = state.exams.filter(exam => examPhase(exam, now) === 'active');
  state.config = active.find(exam => !completed.has(exam.id)) || active[0] || null;
  state.upcoming = state.exams.filter(exam => examPhase(exam, now) === 'upcoming').sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0] || null;
  applyCandidateExam();
  renderUpcoming();
}

function applyCandidateExam() {
  const exam = state.config;
  const startButton = elements.startForm.querySelector('button[type="submit"]');
  const readiness = document.querySelector('#readiness');
  if (!exam) {
    document.querySelector('#exam-card-status').textContent = 'Exam status';
    document.querySelector('#exam-card-title').textContent = 'No exam available';
    document.querySelector('#exam-card-meta').textContent = state.upcoming ? 'The next scheduled exam is shown below.' : 'An administrator needs to publish or schedule an exam.';
    document.querySelector('#configured-duration').textContent = '—';
    document.querySelector('#configured-subject').textContent = '—';
    document.querySelector('#attempt-title').textContent = 'No exam available';
    document.querySelector('.orbit-clock').textContent = '—';
    startButton.disabled = true;
    readiness.disabled = true;
    return;
  }

  const completed = completedExamIds().has(exam.id);
  document.querySelector('#exam-card-status').textContent = completed ? 'Completed' : exam.availabilityMode === 'fixed' ? 'Live · fixed time' : 'Open now';
  document.querySelector('#exam-card-title').textContent = exam.title;
  document.querySelector('#exam-card-meta').textContent = `${exam.className} · ${exam.subject} · ${exam.fullMarks} marks`;
  document.querySelector('#configured-duration').textContent = `${exam.durationMinutes} minutes`;
  document.querySelector('#configured-subject').textContent = exam.subject;
  document.querySelector('#live-subject').textContent = `${exam.subject} · Live`;
  document.querySelector('#attempt-title').textContent = completed ? 'Exam already completed' : 'Begin a focused attempt';
  document.querySelector('.orbit-clock').innerHTML = `${exam.durationMinutes}<span>min</span>`;
  startButton.disabled = completed;
  readiness.disabled = completed;
}

function renderUpcoming() {
  const exam = state.upcoming;
  elements.upcomingSection.hidden = !exam;
  if (!exam) return;
  document.querySelector('#upcoming-title').textContent = exam.title;
  document.querySelector('#upcoming-meta').textContent = `${exam.subject} · ${exam.className} · ${exam.durationMinutes} minutes`;
  document.querySelector('#upcoming-date').textContent = formatDhaka(exam.startsAt);
  document.querySelector('#upcoming-countdown').textContent = `Starts ${relativeTime(exam.startsAt)}`;
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function formatDhaka(value) {
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: DHAKA_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short', hour12: true,
  }).format(new Date(value));
}

function relativeTime(value) {
  const minutes = Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours} hr ${minutes % 60} min`;
  return `in ${Math.floor(hours / 24)} day${hours >= 48 ? 's' : ''}`;
}

function nextDhakaHour() {
  const date = new Date(Date.now() + 60 * 60_000);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function toDhakaInput(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: DHAKA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function fromDhakaInput(value) {
  if (!value) throw new Error('Choose a start date and time.');
  return new Date(`${value}:00+06:00`).toISOString();
}

async function startExam(event) {
  event.preventDefault();
  if (!state.config?.id) return showToast('No exam is currently available.');
  if (completedExamIds().has(state.config.id)) return showToast('This exam has already been completed.');
  const button = event.submitter;
  button.disabled = true;
  button.textContent = 'Opening paper…';
  try {
    const session = await api.startExam(state.config.id);
    state.deadline = new Date(session.expires_at).getTime();
    state.totalSeconds = Math.max(1, Math.round((state.deadline - new Date(session.started_at).getTime()) / 1000));
    state.remainingSeconds = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    renderPaperFiles(session.files || []);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Start exam';
    return showToast(`Unable to start: ${error.message}`);
  }
  state.running = true;
  elements.startPanel.hidden = true;
  elements.upcomingSection.hidden = true;
  elements.expiredPanel.hidden = true;
  elements.sessionPanel.hidden = false;
  elements.timerProgress.style.width = '100%';
  setWatermark();
  clearInterval(state.timerId);
  state.timerId = window.setInterval(updateTimer, 250);
  updateTimer();
  elements.sessionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  button.textContent = 'Start exam';
}

function renderPaperFiles(files) {
  elements.paperPages.replaceChildren();
  files.forEach((file, index) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'paper-page';
    wrapper.setAttribute('aria-label', `Paper file ${index + 1}: ${file.file_name}`);
    if (file.mime_type === 'application/pdf') {
      const frame = document.createElement('iframe');
      frame.className = 'pdf-page';
      frame.src = `${file.url}#toolbar=0&navpanes=0&scrollbar=1`;
      frame.title = file.file_name;
      wrapper.append(frame);
    } else {
      const image = document.createElement('img');
      image.src = file.url;
      image.alt = `${file.file_name}, page ${index + 1}`;
      image.draggable = false;
      wrapper.append(image);
    }
    elements.paperPages.append(wrapper);
  });
}

function updateTimer() {
  if (!state.running) return;
  state.remainingSeconds = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
  elements.timer.textContent = formatTime(state.remainingSeconds);
  elements.timerProgress.style.width = `${(state.remainingSeconds / state.totalSeconds) * 100}%`;
  document.title = `${formatTime(state.remainingSeconds)} · Examio`;
  if (state.remainingSeconds <= 0) endExam();
}

function endExam() {
  state.running = false;
  clearInterval(state.timerId);
  markCompleted(state.config.id);
  elements.paperPages.replaceChildren();
  elements.sessionPanel.hidden = true;
  elements.expiredPanel.hidden = false;
  elements.privacyCover.hidden = true;
  renderCandidatePortal();
  loadCompletedResults();
  document.title = 'Session complete · Examio';
}

function resetExam() {
  state.running = false;
  clearInterval(state.timerId);
  elements.startForm.reset();
  elements.sessionPanel.hidden = true;
  elements.expiredPanel.hidden = true;
  elements.startPanel.hidden = false;
  renderCandidatePortal();
  showView('exam');
}

function setWatermark() {
  const stamp = `EXAMIO • ${state.config.subject.toUpperCase()} • ${new Date().toLocaleTimeString('en-BD', { timeZone: DHAKA_TIME_ZONE, hour: '2-digit', minute: '2-digit' })}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="170"><text x="18" y="85" fill="#273338" font-family="Arial" font-weight="700" font-size="15">${stamp}</text></svg>`;
  elements.watermark.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function showPrivacyCover() { if (state.running) elements.privacyCover.hidden = false; }

async function loadCompletedResults() {
  const examId = localStorage.getItem(LAST_COMPLETED_KEY);
  if (!examId) {
    state.results = {};
    return renderResultsState();
  }
  try { state.results = mapResults(await api.fetchResults(examId)); }
  catch { state.results = {}; }
  state.selectedSubject = Object.keys(state.results).length > 1 ? 'All' : Object.keys(state.results)[0] || null;
  renderResultsState();
}

function renderResultsState() {
  const examId = localStorage.getItem(LAST_COMPLETED_KEY);
  const hasResults = Object.keys(state.results).length > 0;
  elements.resultsEmpty.hidden = Boolean(examId && hasResults);
  elements.resultsContent.hidden = !examId || !hasResults;
  if (!examId) {
    document.querySelector('#results-empty-title').textContent = 'No exam taken';
    document.querySelector('#results-empty-copy').textContent = 'Complete an exam to see results.';
  } else if (!hasResults) {
    document.querySelector('#results-empty-title').textContent = 'Results not published';
    document.querySelector('#results-empty-copy').textContent = 'Results will appear after the administrator publishes them.';
  } else {
    renderSubjectTabs();
    renderResult(state.selectedSubject);
  }
}

function aggregateResults() {
  return Object.values(state.results).reduce((total, item) => ({
    cq: total.cq + item.cq, cqTotal: total.cqTotal + item.cqTotal,
    mcq: total.mcq + item.mcq, mcqTotal: total.mcqTotal + item.mcqTotal,
  }), { cq: 0, cqTotal: 0, mcq: 0, mcqTotal: 0 });
}

function renderSubjectTabs() {
  const available = Object.keys(state.results);
  const subjects = available.length > 1 ? ['All', ...available] : available;
  if (!subjects.includes(state.selectedSubject)) state.selectedSubject = subjects[0] || null;
  elements.subjectTabs.innerHTML = subjects.map(subject => `<button class="result-tab${subject === state.selectedSubject ? ' is-active' : ''}" role="tab" aria-selected="${subject === state.selectedSubject}" data-subject="${subject}">${subject}</button>`).join('');
  elements.subjectTabs.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    state.selectedSubject = button.dataset.subject;
    renderSubjectTabs();
    renderResult(state.selectedSubject);
  }));
}

function renderResult(subject) {
  if (!subject) return;
  const data = subject === 'All' ? aggregateResults() : state.results[subject];
  const score = data.cq + data.mcq;
  const total = data.cqTotal + data.mcqTotal;
  const percent = Math.round(score / total * 100);
  document.querySelector('#score-value').textContent = score;
  document.querySelector('#score-unit').textContent = `/${total}`;
  document.querySelector('#score-label').textContent = subject === 'All' ? 'Overall' : subject;
  document.querySelector('#score-ring').style.setProperty('--score', percent);
  document.querySelector('#cq-score').innerHTML = `${data.cq}<span>/${data.cqTotal}</span>`;
  document.querySelector('#mcq-score').innerHTML = `${data.mcq}<span>/${data.mcqTotal}</span>`;
  document.querySelector('#cq-bar').style.width = `${data.cq / data.cqTotal * 100}%`;
  document.querySelector('#mcq-bar').style.width = `${data.mcq / data.mcqTotal * 100}%`;
  const rows = subject === 'All'
    ? Object.entries(state.results).map(([name, item]) => [name, Math.round((item.cq + item.mcq) / (item.cqTotal + item.mcqTotal) * 100)])
    : [['CQ', Math.round(data.cq / data.cqTotal * 100)], ['MCQ', Math.round(data.mcq / data.mcqTotal * 100)], ['Overall', percent]];
  document.querySelector('#breakdown-list').innerHTML = rows.map(([label, value]) => `<div class="breakdown-row"><span>${label}</span><div class="row-track"><i style="width:${value}%"></i></div><strong>${value}%</strong></div>`).join('');
}

function populateAdminForm(exam = defaultConfig) {
  document.querySelector('#admin-exam-title').value = exam.title || '';
  document.querySelector('#admin-subject').value = exam.subject || '';
  document.querySelector('#admin-class').value = exam.className || '';
  document.querySelector('#admin-duration').value = exam.durationMinutes || 60;
  document.querySelector('#admin-marks').value = exam.fullMarks || 100;
  document.querySelector('#admin-availability-mode').value = exam.availabilityMode || 'window';
  document.querySelector('#admin-starts-at').value = toDhakaInput(exam.startsAt || nextDhakaHour());
  const hours = exam.availableUntil ? Math.max(1, Math.round((new Date(exam.availableUntil) - new Date(exam.startsAt)) / 3_600_000)) : 24;
  document.querySelector('#admin-window-hours').value = hours;
  document.querySelector('#admin-form-title').textContent = exam.id ? 'Edit exam' : 'Create exam';
  document.querySelector('#admin-form-status').textContent = exam.id ? 'Published' : 'New';
  toggleWindowField();
}

function renderAdminExamList() {
  elements.adminExamList.replaceChildren();
  if (!state.adminExams.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-list-empty';
    empty.textContent = 'No exams yet. Create the first scheduled exam.';
    elements.adminExamList.append(empty);
    return;
  }
  state.adminExams.forEach(exam => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `admin-exam-row${state.editingExam?.id === exam.id ? ' is-selected' : ''}`;
    const main = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = exam.title;
    const meta = document.createElement('small');
    meta.textContent = `${exam.subject} · ${exam.availabilityMode === 'fixed' ? 'Fixed' : 'Window'} · ${formatDhaka(exam.startsAt)}`;
    main.append(title, meta);
    const badge = document.createElement('em');
    badge.textContent = examPhase(exam);
    button.append(main, badge);
    button.addEventListener('click', () => selectAdminExam(exam.id));
    elements.adminExamList.append(button);
  });
}

async function selectAdminExam(examId) {
  state.editingExam = state.adminExams.find(exam => exam.id === examId) || null;
  state.pendingPaperFiles = [];
  state.editingFiles = state.editingExam ? await api.fetchExamFiles(examId) : [];
  state.adminResults = state.editingExam ? mapResults(await api.fetchResults(examId)) : {};
  populateAdminForm(state.editingExam || defaultConfig);
  renderAdminFiles();
  renderAdminExamList();
  document.querySelector('#result-exam-label').textContent = state.editingExam?.title || 'Choose an exam';
  document.querySelector('#result-subject').value = state.editingExam?.subject || '';
  loadResultEditor(document.querySelector('#result-subject').value.trim());
}

function newAdminExam() {
  state.editingExam = null;
  state.editingFiles = [];
  state.pendingPaperFiles = [];
  state.adminResults = {};
  populateAdminForm(defaultConfig);
  renderAdminFiles();
  renderAdminExamList();
  document.querySelector('#result-exam-label').textContent = 'Choose an exam';
  document.querySelector('#result-subject').value = '';
}

function renderAdminFiles() {
  elements.adminFileList.replaceChildren();
  const files = [
    ...state.editingFiles.map(file => ({ kind: 'existing', name: file.file_name, type: file.mime_type, id: file.id })),
    ...state.pendingPaperFiles.map((file, index) => ({ kind: 'pending', name: file.name, type: file.type, index })),
  ];
  if (!files.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No question-paper files attached.';
    elements.adminFileList.append(empty);
    return;
  }
  files.forEach(file => {
    const row = document.createElement('div');
    row.className = 'admin-file-row';
    const label = document.createElement('span');
    label.textContent = `${file.type === 'application/pdf' ? 'PDF' : 'Image'} · ${file.name}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      if (file.kind === 'existing') state.editingFiles = state.editingFiles.filter(item => item.id !== file.id);
      else state.pendingPaperFiles.splice(file.index, 1);
      renderAdminFiles();
    });
    row.append(label, remove);
    elements.adminFileList.append(row);
  });
}

function toggleWindowField() {
  const isWindow = document.querySelector('#admin-availability-mode').value === 'window';
  document.querySelector('#window-hours-field').hidden = !isWindow;
  document.querySelector('#admin-window-hours').required = isWindow;
}

async function saveExamSettings(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = 'Publishing…';
  try {
    const uploaded = state.pendingPaperFiles.length ? await api.uploadPapers(state.pendingPaperFiles) : [];
    const existing = state.editingFiles.map(file => ({ storagePath: file.storage_path, fileName: file.file_name, mimeType: file.mime_type }));
    const files = [...existing, ...uploaded];
    if (!files.length) throw new Error('Attach at least one image or PDF question-paper file.');
    const mode = document.querySelector('#admin-availability-mode').value;
    const startsAt = fromDhakaInput(document.querySelector('#admin-starts-at').value);
    const windowHours = Number(document.querySelector('#admin-window-hours').value || 24);
    const savedRow = await api.saveExam({
      id: state.editingExam?.id,
      title: document.querySelector('#admin-exam-title').value.trim(),
      subject: document.querySelector('#admin-subject').value.trim(),
      className: document.querySelector('#admin-class').value.trim(),
      durationMinutes: Number(document.querySelector('#admin-duration').value),
      fullMarks: Number(document.querySelector('#admin-marks').value),
      availabilityMode: mode,
      startsAt,
      availableUntil: mode === 'window' ? new Date(new Date(startsAt).getTime() + windowHours * 3_600_000).toISOString() : null,
      paperPath: files[0].storagePath,
    });
    await api.saveExamFiles(savedRow.id, files);
    await refreshAdminExams(savedRow.id);
    await hydratePortal();
    showToast('Exam published and scheduled.');
  } catch (error) {
    showToast(`Publish failed: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Publish exam';
  }
}

async function refreshAdminExams(selectId) {
  state.adminExams = (await api.fetchAdminExams()).map(mapExam);
  renderAdminExamList();
  if (selectId) await selectAdminExam(selectId);
}

function loadResultEditor(subject) {
  const data = state.adminResults[subject] || { cq: 0, cqTotal: 50, mcq: 0, mcqTotal: 50 };
  document.querySelector('#admin-cq-score').value = data.cq;
  document.querySelector('#admin-cq-total').value = data.cqTotal;
  document.querySelector('#admin-mcq-score').value = data.mcq;
  document.querySelector('#admin-mcq-total').value = data.mcqTotal;
}

async function saveSubjectResult(event) {
  event.preventDefault();
  if (!state.editingExam) return showToast('Choose an exam first.');
  const subject = document.querySelector('#result-subject').value.trim();
  const result = {
    cq: Number(document.querySelector('#admin-cq-score').value), cqTotal: Number(document.querySelector('#admin-cq-total').value),
    mcq: Number(document.querySelector('#admin-mcq-score').value), mcqTotal: Number(document.querySelector('#admin-mcq-total').value),
  };
  if (!subject) return showToast('Enter a subject.');
  if (result.cq > result.cqTotal || result.mcq > result.mcqTotal) return showToast('A score cannot be higher than its full marks.');
  const button = event.submitter;
  button.disabled = true;
  try {
    await api.saveResult(state.editingExam.id, subject, result);
    state.adminResults[subject] = result;
    showToast(`${subject} result published for ${state.editingExam.title}.`);
    await loadCompletedResults();
  } catch (error) {
    showToast(`Publish failed: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function showAdminDashboard(session) {
  await api.getAdminProfile();
  state.adminSession = session;
  document.querySelector('#admin-login-form').hidden = true;
  document.querySelector('#admin-dashboard').hidden = false;
  document.querySelector('#admin-user-email').textContent = session.user.email;
  state.adminExams = (await api.fetchAdminExams()).map(mapExam);
  if (state.adminExams.length) await selectAdminExam(state.adminExams[0].id);
  else newAdminExam();
}

async function hydratePortal() {
  try {
    state.exams = (await api.fetchPortalExams()).map(mapExam);
    renderCandidatePortal();
    await loadCompletedResults();
  } catch (error) {
    showToast(`Portal unavailable: ${error.message}`);
  }
}

async function hydrate() {
  await hydratePortal();
  const session = await api.getSession();
  if (session) {
    try { await showAdminDashboard(session); }
    catch (error) { document.querySelector('#admin-login-status').textContent = error.message; }
  }
  clearInterval(state.scheduleTimerId);
  state.scheduleTimerId = window.setInterval(renderCandidatePortal, 15_000);
}

let toastTimeout;
function showToast(message) {
  clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimeout = setTimeout(() => elements.toast.classList.remove('is-visible'), 4000);
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
document.querySelector('#admin-new-exam').addEventListener('click', newAdminExam);
document.querySelector('#admin-availability-mode').addEventListener('change', toggleWindowField);

document.querySelector('#admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  const status = document.querySelector('#admin-login-status');
  button.disabled = true;
  try {
    const session = await api.signIn(document.querySelector('#admin-email').value.trim(), document.querySelector('#admin-password').value);
    await showAdminDashboard(session);
    event.target.reset();
  } catch (error) {
    await api.signOut();
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#admin-sign-out').addEventListener('click', async () => {
  await api.signOut();
  state.adminSession = null;
  document.querySelector('#admin-dashboard').hidden = true;
  document.querySelector('#admin-login-form').hidden = false;
});

elements.paperInput.addEventListener('change', event => {
  const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']);
  const files = [...event.target.files];
  const invalid = files.find(file => !allowed.has(file.type) || file.size > 25 * 1024 * 1024);
  if (invalid) return showToast(`${invalid.name} is unsupported or larger than 25 MB.`);
  state.pendingPaperFiles.push(...files);
  event.target.value = '';
  renderAdminFiles();
});

document.addEventListener('visibilitychange', () => { if (document.hidden) showPrivacyCover(); });
window.addEventListener('blur', showPrivacyCover);
document.addEventListener('contextmenu', event => { if (state.running) event.preventDefault(); });
document.addEventListener('dragstart', event => { if (state.running) event.preventDefault(); });
document.addEventListener('keydown', event => {
  if (!state.running) return;
  const key = event.key.toLowerCase();
  if (event.key === 'PrintScreen' || ((event.ctrlKey || event.metaKey) && (key === 'p' || key === 's'))) {
    event.preventDefault();
    showPrivacyCover();
  }
});
window.addEventListener('beforeprint', showPrivacyCover);

populateAdminForm();
renderCandidatePortal();
renderResultsState();
hydrate();
