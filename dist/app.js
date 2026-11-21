const DEFAULT_PAPER = 'assets/question-paper.svg';

const defaultConfig = {
  title: 'General Science Assessment', subject: 'Science', className: 'Class 10',
  durationMinutes: 15, fullMarks: 50, paperUrl: DEFAULT_PAPER,
};

const defaultResults = {
  Bangla: { cq: 36, cqTotal: 50, mcq: 41, mcqTotal: 50, feedback: 'Good written expression and careful reading. Keep answers concise.' },
  English: { cq: 39, cqTotal: 50, mcq: 43, mcqTotal: 50, feedback: 'Strong comprehension and vocabulary. Review punctuation in long answers.' },
  Mathematics: { cq: 42, cqTotal: 50, mcq: 46, mcqTotal: 50, feedback: 'Excellent method and accuracy. Show the final unit consistently.' },
  Science: { cq: 38, cqTotal: 50, mcq: 44, mcqTotal: 50, feedback: 'Strong understanding of the core concepts. Add one more supporting step in longer written explanations.' },
  ICT: { cq: 40, cqTotal: 50, mcq: 45, mcqTotal: 50, feedback: 'Confident technical knowledge with accurate objective answers.' },
};

function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}

const state = {
  running: false, ended: false, totalSeconds: 900, remainingSeconds: 900,
  deadline: null, timerId: null,
  config: { ...defaultConfig, ...readStored('examio-config', {}) },
  results: { ...defaultResults, ...readStored('examio-results', {}) },
  selectedSubject: 'All', pendingPaperUrl: null,
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
};

function showView(name) {
  elements.views.forEach(view => view.classList.toggle('is-visible', view.id === `${name}-view`));
  elements.navButtons.forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function applyExamConfig() {
  const config = state.config;
  document.querySelector('#exam-card-title').textContent = config.title;
  document.querySelector('#exam-card-meta').textContent = `${config.className} · CQ + MCQ · ${config.fullMarks} marks`;
  document.querySelector('#configured-duration').textContent = `${config.durationMinutes} minutes`;
  document.querySelector('#configured-subject').textContent = config.subject;
  document.querySelector('#live-subject').textContent = `${config.subject} · Live`;
  elements.questionPaper.src = config.paperUrl || DEFAULT_PAPER;
  elements.questionPaper.alt = `${config.subject} question paper`;
  elements.paperPreview.src = config.paperUrl || DEFAULT_PAPER;
  document.querySelector('#admin-exam-title').value = config.title;
  document.querySelector('#admin-subject').value = config.subject;
  document.querySelector('#admin-class').value = config.className;
  document.querySelector('#admin-duration').value = config.durationMinutes;
  document.querySelector('#admin-marks').value = config.fullMarks;
  document.querySelector('.orbit-clock').innerHTML = `${config.durationMinutes}<span>min</span>`;
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

function startExam(event) {
  event.preventDefault();
  state.totalSeconds = Number(state.config.durationMinutes) * 60;
  state.remainingSeconds = state.totalSeconds;
  state.deadline = Date.now() + state.totalSeconds * 1000;
  state.running = true; state.ended = false;
  elements.startPanel.hidden = true; elements.expiredPanel.hidden = true; elements.sessionPanel.hidden = false;
  elements.timer.textContent = formatTime(state.remainingSeconds);
  elements.timerProgress.style.width = '100%';
  setWatermark(); clearInterval(state.timerId);
  state.timerId = window.setInterval(updateTimer, 250);
  updateTimer(); elements.sessionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('Exam started. Focus protection is active.');
}

function endExam() {
  state.running = false; state.ended = true;
  clearInterval(state.timerId); state.timerId = null;
  elements.sessionPanel.hidden = true; elements.expiredPanel.hidden = false; elements.privacyCover.hidden = true;
  document.title = 'Session complete · Examio';
  elements.expiredPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetExam() {
  state.running = false; state.ended = false; clearInterval(state.timerId);
  elements.startForm.reset(); elements.sessionPanel.hidden = true; elements.expiredPanel.hidden = true; elements.startPanel.hidden = false;
  document.title = 'Examio — Timed exam portal'; showView('exam');
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
    feedback: 'A complete view across all published subjects.',
  }), { cq: 0, cqTotal: 0, mcq: 0, mcqTotal: 0 });
}

function renderSubjectTabs() {
  const subjects = ['All', ...Object.keys(state.results)];
  elements.subjectTabs.innerHTML = subjects.map(subject => `<button class="result-tab${subject === state.selectedSubject ? ' is-active' : ''}" role="tab" aria-selected="${subject === state.selectedSubject}" data-subject="${subject}">${subject}</button>`).join('');
  elements.subjectTabs.querySelectorAll('.result-tab').forEach(tab => tab.addEventListener('click', () => {
    state.selectedSubject = tab.dataset.subject; renderSubjectTabs(); renderResult(state.selectedSubject);
  }));
}

function resultRows(subject, data) {
  if (subject === 'All') return Object.entries(state.results).map(([name, item]) => [name, Math.round((Number(item.cq) + Number(item.mcq)) / (Number(item.cqTotal) + Number(item.mcqTotal)) * 100)]);
  return [
    ['Creative questions', Math.round(Number(data.cq) / Number(data.cqTotal) * 100)],
    ['Multiple choice', Math.round(Number(data.mcq) / Number(data.mcqTotal) * 100)],
    ['Overall', Math.round((Number(data.cq) + Number(data.mcq)) / (Number(data.cqTotal) + Number(data.mcqTotal)) * 100)],
  ];
}

function renderResult(subject) {
  const data = subject === 'All' ? aggregateResults() : state.results[subject];
  const score = Number(data.cq) + Number(data.mcq);
  const total = Number(data.cqTotal) + Number(data.mcqTotal);
  const percent = Math.round(score / total * 100);
  document.querySelector('#score-value').textContent = score;
  document.querySelector('#score-unit').textContent = `/${total}`;
  document.querySelector('#score-label').textContent = subject === 'All' ? 'All subjects' : subject;
  document.querySelector('#score-grade').textContent = percent >= 80 ? 'Excellent work' : percent >= 65 ? 'Good progress' : 'Keep improving';
  document.querySelector('#score-summary').textContent = subject === 'All' ? 'A complete view across every published subject.' : `CQ and MCQ performance for ${subject}.`;
  document.querySelector('#result-note').textContent = subject === 'All' ? 'All subjects' : subject;
  document.querySelector('#teacher-note').textContent = `“${data.feedback || 'Result published.'}”`;
  document.querySelector('#score-ring').style.setProperty('--score', percent);
  document.querySelector('#cq-score').innerHTML = `${data.cq}<span>/${data.cqTotal}</span>`;
  document.querySelector('#mcq-score').innerHTML = `${data.mcq}<span>/${data.mcqTotal}</span>`;
  document.querySelector('#cq-bar').style.width = `${Number(data.cq) / Number(data.cqTotal) * 100}%`;
  document.querySelector('#mcq-bar').style.width = `${Number(data.mcq) / Number(data.mcqTotal) * 100}%`;
  document.querySelector('#breakdown-list').innerHTML = resultRows(subject, data).map(([label, value]) => `<div class="breakdown-row"><span>${label}</span><div class="row-track"><i style="width:${value}%"></i></div><strong>${value}%</strong></div>`).join('');
}

function saveExamSettings(event) {
  event.preventDefault();
  state.config = {
    title: document.querySelector('#admin-exam-title').value.trim(), subject: document.querySelector('#admin-subject').value,
    className: document.querySelector('#admin-class').value.trim(), durationMinutes: Number(document.querySelector('#admin-duration').value),
    fullMarks: Number(document.querySelector('#admin-marks').value), paperUrl: state.pendingPaperUrl || state.config.paperUrl || DEFAULT_PAPER,
  };
  try { localStorage.setItem('examio-config', JSON.stringify(state.config)); }
  catch { showToast('Image is too large for browser storage; it will last for this session.'); }
  applyExamConfig(); showToast('Exam settings saved and ready for candidates.');
}

function loadResultEditor(subject) {
  const data = state.results[subject] || defaultResults.Science;
  document.querySelector('#admin-cq-score').value = data.cq; document.querySelector('#admin-cq-total').value = data.cqTotal;
  document.querySelector('#admin-mcq-score').value = data.mcq; document.querySelector('#admin-mcq-total').value = data.mcqTotal;
  document.querySelector('#admin-feedback').value = data.feedback || '';
}

function saveSubjectResult(event) {
  event.preventDefault();
  const subject = document.querySelector('#result-subject').value;
  const result = {
    cq: Number(document.querySelector('#admin-cq-score').value), cqTotal: Number(document.querySelector('#admin-cq-total').value),
    mcq: Number(document.querySelector('#admin-mcq-score').value), mcqTotal: Number(document.querySelector('#admin-mcq-total').value),
    feedback: document.querySelector('#admin-feedback').value.trim(),
  };
  if (result.cq > result.cqTotal || result.mcq > result.mcqTotal) { showToast('A score cannot be higher than its full marks.'); return; }
  state.results[subject] = result; localStorage.setItem('examio-results', JSON.stringify(state.results));
  state.selectedSubject = subject; renderSubjectTabs(); renderResult(subject); showToast(`${subject} result published.`);
}

let toastTimeout;
function showToast(message) {
  clearTimeout(toastTimeout); elements.toast.textContent = message; elements.toast.classList.add('is-visible');
  toastTimeout = setTimeout(() => elements.toast.classList.remove('is-visible'), 2800);
}

elements.navButtons.forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
elements.startForm.addEventListener('submit', startExam);
elements.resumeButton.addEventListener('click', () => { elements.privacyCover.hidden = true; updateTimer(); });
document.querySelector('#view-results').addEventListener('click', () => showView('results'));
document.querySelector('#new-session').addEventListener('click', resetExam);
document.querySelector('#exam-settings-form').addEventListener('submit', saveExamSettings);
document.querySelector('#result-settings-form').addEventListener('submit', saveSubjectResult);
document.querySelector('#result-subject').addEventListener('change', event => loadResultEditor(event.target.value));

elements.paperInput.addEventListener('change', event => {
  const [file] = event.target.files; if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Choose an image file for the question paper.'); return; }
  if (file.size > 1.5 * 1024 * 1024) showToast('Large image selected; backend storage is recommended.');
  const reader = new FileReader();
  reader.addEventListener('load', () => { state.pendingPaperUrl = reader.result; elements.paperPreview.src = reader.result; });
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
    event.preventDefault(); showPrivacyCover(); showToast('Capture and printing controls are disabled in this session.');
  }
});
window.addEventListener('beforeprint', showPrivacyCover);

applyExamConfig(); renderSubjectTabs(); renderResult('All'); loadResultEditor('Science');
