/* ---------------- 벌점 기준 ---------------- */
const PENALTY_RULES = [
  {
    key: 'restroom',
    title: '화장실 및 준비물',
    description: '화장실은 자습 시간에 하루 3회 초과부터 감점',
    points: 1
  },
  { key: 'sleep', title: '자습 중 수면', description: '발생 횟수만큼 입력', points: 1 },
  { key: 'late', title: '지각', description: '발생 횟수만큼 입력', points: 1 },
  {
    key: 'noise',
    title: '자습실 내 소란 및 친목 행위',
    description: '눈 맞춤·제스처·톡 치고 지나가기 등',
    points: 1
  },
  {
    key: 'device',
    title: '학습 용도 외 전자기기 사용 / 종 치기 전 책 덮기',
    description: '발생 횟수만큼 입력',
    points: 1.0
  }
];

const ADMIN_PASSWORD = 'daejin1234';
const PENALTY_HOURS_WEIGHT = 2;
const REQUIRED_API_VERSION = 'v41-clear-recent';
const $ = selector => document.querySelector(selector);

let students = [];
let recentPenalties = [];
let admin = false;
let saving = false;
let activeApiVersion = '';
let selections = emptySelections();

function emptySelections() {
  return Object.fromEntries(PENALTY_RULES.map(rule => [rule.key, 0]));
}

function roundPenalty(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function formatPenalty(value) {
  return roundPenalty(value).toFixed(1);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function studentIdFrom(classNumber, number) {
  return `2${String(classNumber).padStart(2, '0')}${String(number).padStart(2, '0')}`;
}

function normalizedStudentId(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 5);
  return digits ? digits.padStart(5, '0') : '';
}

function penaltyStatus(penalty) {
  if (penalty >= 10) return { label: '진경주체불가', tone: 'inferno' };
  if (penalty >= 4) return { label: '진경호출', tone: 'critical' };
  if (penalty >= 2) return { label: '위험', tone: 'warning' };
  if (penalty > 0) return { label: '주의', tone: 'caution' };
  return { label: '청정', tone: 'clean' };
}

function normalizeStudent(record) {
  const classNumber = Number(record.class);
  const number = Number(record.number);
  const name = String(record.name || '').trim();
  if (!Number.isFinite(classNumber) || !Number.isFinite(number) || !name || name === '이름') return null;

  return {
    studentId: record.studentId || studentIdFrom(classNumber, number),
    class: classNumber,
    number,
    name,
    hours: Math.max(0, Number(record.hours) || 0),
    penalty: roundPenalty(Math.max(0, Number(record.penalty) || 0))
  };
}

function sortStudents(list) {
  return [...list].sort((a, b) => a.class - b.class || a.number - b.number || a.name.localeCompare(b.name, 'ko'));
}

/* ---------------- 스프레드시트 연결 ---------------- */
async function loadFromAppsScript() {
  const separator = CONFIG.APPS_SCRIPT_URL.includes('?') ? '&' : '?';
  const freshUrl = `${CONFIG.APPS_SCRIPT_URL}${separator}_=${Date.now()}`;
  const response = await fetch(freshUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Apps Script에서 학생 정보를 불러오지 못했습니다.');
  const data = await response.json();
  if (data.apiVersion !== REQUIRED_API_VERSION) {
    activeApiVersion = '';
    throw new Error('Apps Script가 이전 버전입니다. 새 Code.gs를 새 버전으로 배포해 주세요.');
  }
  activeApiVersion = data.apiVersion;
  if (data.ok === false) throw new Error(data.message || '스프레드시트 연결에 실패했습니다.');
  if (!Array.isArray(data.students)) throw new Error('Apps Script 응답에 학생 목록이 없습니다.');
  return { students: data.students, recentPenalties: Array.isArray(data.recentPenalties) ? data.recentPenalties : [] };
}

function loadSheetJsonp() {
  return new Promise((resolve, reject) => {
    const callback = `daejinPenaltySheet_${Date.now()}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => cleanup(new Error('스프레드시트 응답 시간이 초과되었습니다.')), 15000);

    function cleanup(error) {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
      if (error) reject(error);
    }

    window[callback] = data => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => cleanup(new Error('시트를 읽을 수 없습니다. 편집 계정 권한과 Apps Script URL을 확인해 주세요.'));
    script.src = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?gid=${CONFIG.SHEET_GID}&tqx=out:json;responseHandler:${callback}`;
    document.head.append(script);
  });
}

async function loadFromSheetView() {
  const data = await loadSheetJsonp();
  const labels = (data.table?.cols || []).map(column => String(column?.label || '').replace(/\s/g, ''));
  const classIndex = labels.indexOf('반');
  const numberIndex = labels.indexOf('번호');
  const nameIndex = labels.indexOf('이름');
  const hoursIndex = labels.findIndex(label => label.includes('총시수') || label.includes('자습시수') || label.includes('자습시간'));
  const penaltyIndex = 4;
  return { students: (data.table?.rows || []).map(row => {
    const values = (row.c || []).map(cell => cell?.v);
    return {
      class: values[classIndex],
      number: values[numberIndex],
      name: values[nameIndex],
      hours: values[hoursIndex],
      penalty: values[penaltyIndex]
    };
  }), recentPenalties: [] };
}

async function load() {
  const payload = CONFIG.APPS_SCRIPT_URL
    ? await loadFromAppsScript()
    : await loadFromSheetView();

  students = sortStudents(payload.students.map(normalizeStudent).filter(Boolean));
  recentPenalties = payload.recentPenalties;
  if (!students.length) throw new Error('시트에서 반·번호·이름·총시수 형식의 학생 데이터를 찾지 못했습니다.');

  render();
  populateStudentControls();
  updateSelectedStudent();
  $('#updated').textContent = '마지막 업데이트: ' + new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short', timeStyle: 'short'
  }).format(new Date());

}

/* ---------------- 화면 렌더링 ---------------- */
function reflectedHours(student) {
  return student.hours - student.penalty * PENALTY_HOURS_WEIGHT;
}

function rankedStudents() {
  return [...students].sort((a, b) => b.hours - a.hours || a.studentId.localeCompare(b.studentId));
}

function penaltyRankedStudents() {
  return [...students].filter(student => student.penalty > 0).sort((a, b) => b.penalty - a.penalty || a.studentId.localeCompare(b.studentId));
}

function classGroups() {
  return Object.values(students.reduce((map, student) => {
    (map[student.class] ??= []).push(student);
    return map;
  }, {})).map(group => {
    const hours = group.reduce((sum, student) => sum + student.hours, 0);
    const penalty = roundPenalty(group.reduce((sum, student) => sum + student.penalty, 0));
    return {
      class: group[0].class,
      students: group,
      hours,
      penalty,
      average: hours / group.length,
      reflected: hours - penalty * PENALTY_HOURS_WEIGHT
    };
  }).sort((a, b) => b.reflected - a.reflected || a.class - b.class);
}

function renderTop3() {
  $('#top3').innerHTML = rankedStudents().slice(0, 3).map((student, index) => `
    <article class="top-card place-${index + 1}">
      <i>${['♛', '♜', '♞'][index]}</i>
      <span class="top-place">TOP ${index + 1}</span>
      <h3>${escapeHtml(student.name)}</h3>
      <p>${student.studentId} · 2학년 ${student.class}반</p>
      <strong>${student.hours.toFixed(1)}h</strong>
      <small>벌점 ${formatPenalty(student.penalty)}점</small>
    </article>`).join('');
}

function renderRanking() {
  $('#rankingBody').innerHTML = rankedStudents().map((student, index) => `
    <tr>
      <td>#${index + 1}</td>
      <td>${student.studentId}</td>
      <td><b>${escapeHtml(student.name)}</b></td>
      <td>${student.hours.toFixed(1)}h</td>
      <td class="${student.penalty > 0 ? 'danger' : 'clean-text'}">${formatPenalty(student.penalty)}점</td>
    </tr>`).join('');
}

function renderPenaltyFeed() {
  $('#penaltyFeed').innerHTML = recentPenalties.length ? recentPenalties.slice(0, 30).map(item => `
    <div class="feed-item">
      <span class="feed-student"><b>${escapeHtml(item.name || '학생')}</b><small>${escapeHtml(item.studentId || '')}</small></span>
      <span class="feed-reason">${escapeHtml(item.reason || '벌점 부여')}</span>
      <strong>+${formatPenalty(item.points || 0)}점</strong>
      <time>${escapeHtml(item.date || '')}</time>
    </div>`).join('') : '<p class="feed-empty">최근 벌점 기록이 없습니다.</p>';
}

function renderPenaltyRanking() {
  const penalized = penaltyRankedStudents();
  $('#penaltyRankingBody').innerHTML = penalized.length ? penalized.map((student, index) => {
    const status = penaltyStatus(student.penalty);
    return `
      <tr class="${student.penalty >= 4 ? 'expelled' : ''}">
        <td>#${index + 1}</td>
        <td>${student.studentId}</td>
        <td><b>${escapeHtml(student.name)}</b></td>
        <td class="danger">${formatPenalty(student.penalty)}점</td>
        <td><span class="status-chip ${status.tone}">${status.label}</span></td>
      </tr>`;
  }).join('') : '<tr><td colspan="5" class="empty-table">현재 벌점이 있는 학생이 없습니다.</td></tr>';
}

function renderCleanZone() {
  const cleanStudents = students.filter(student => student.penalty === 0);
  const grouped = cleanStudents.reduce((map, student) => {
    (map[student.class] ??= []).push(student);
    return map;
  }, {});
  const entries = Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b));

  $('#cleanCount').textContent = `${cleanStudents.length}명`;
  $('#cleanStats').innerHTML = `
    <div><span>청정 학생</span><b>${cleanStudents.length}명</b></div>
    <div><span>전체 비율</span><b>${students.length ? Math.round(cleanStudents.length / students.length * 100) : 0}%</b></div>
    <div><span>벌점 기준</span><b>누적 0.0점</b></div>`;

  $('#cleanZoneList').innerHTML = entries.length ? entries.map(([classNumber, members]) => `
    <article class="clean-class">
      <div class="clean-class-title"><h3>2학년 ${classNumber}반</h3><span>${members.length}명</span></div>
      <ul>${members.map(student => `<li><span>${student.studentId}</span><b>${escapeHtml(student.name)}</b><em>0.0점</em></li>`).join('')}</ul>
    </article>`).join('') : '<p class="clean-empty">현재 청정구역에 등록된 학생이 없습니다.</p>';
}

function renderPenaltyGuide() {
  $('#penaltyGuide').innerHTML = PENALTY_RULES.map((rule, index) => `
    <article class="guide-card">
      <span class="guide-number">0${index + 1}</span>
      <div><h3>${escapeHtml(rule.title)}</h3><p>${escapeHtml(rule.description)}</p></div>
      <strong>${formatPenalty(rule.points)}점</strong>
    </article>`).join('');
}

function renderClasses() {
  const groups = classGroups();
  if (!groups.length) {
    $('#classCards').innerHTML = '<p class="hint">반 데이터가 없습니다.</p>';
    return;
  }
  const max = groups[0].reflected;
  const min = Math.min(...groups.map(group => group.reflected));
  const span = max - min || 1;

  $('#classCards').innerHTML = groups.map((group, index) => {
    const width = 14 + 86 * ((group.reflected - min) / span);
    return `
      <button class="race-row ${index === 0 ? 'lead' : ''}" data-class="${group.class}" style="--i:${index}" type="button">
        <span class="race-rank">${index + 1}</span>
        <span class="race-label">2학년 ${group.class}반<small>총 ${group.hours.toFixed(1)}h · 평균 ${group.average.toFixed(1)}h · 벌점 ${formatPenalty(group.penalty)}점</small></span>
        <span class="race-track"><span class="race-bar" style="width:${width}%"></span></span>
        <span class="race-score">${group.reflected.toFixed(1)}h</span>
        <span class="race-gap">${index === 0 ? '👑 선두' : `−${(max - group.reflected).toFixed(1)}h`}</span>
      </button>`;
  }).join('');

  document.querySelectorAll('.race-row').forEach(row => {
    row.onclick = () => showClass(Number(row.dataset.class));
  });
}

function showClass(classNumber) {
  const group = classGroups().find(item => item.class === classNumber);
  if (!group) return;
  const position = classGroups().findIndex(item => item.class === classNumber) + 1;
  const members = rankedStudents().filter(student => student.class === classNumber);
  $('#classDetail').hidden = false;
  $('#classDetail').innerHTML = `
    <h3>2학년 ${classNumber}반 · ${position}위</h3>
    <ol>${members.map((student, index) => `
      <li><span>#${index + 1} <b>${student.studentId} ${escapeHtml(student.name)}</b></span><small>자습 ${student.hours.toFixed(1)}h · 벌점 ${formatPenalty(student.penalty)}점 · 반영 ${reflectedHours(student).toFixed(1)}h</small></li>`).join('')}</ol>`;
}

function render() {
  renderTop3();
  renderRanking();
  renderPenaltyFeed();
  renderPenaltyRanking();
  renderCleanZone();
  renderClasses();
}

function populateStudentControls() {
  $('#studentOptions').innerHTML = students.map(student => `
    <option value="${student.studentId}" label="${escapeHtml(student.name)} · 2학년 ${student.class}반 ${student.number}번"></option>`).join('');
}

/* ---------------- 학생 검색 ---------------- */
function findStudentByInput(value) {
  const studentId = normalizedStudentId(value);
  return students.find(student => student.studentId === studentId);
}

function renderSearchResult(student) {
  if (!student) {
    $('#searchResult').innerHTML = '<p class="hint">해당 학번의 학생을 찾을 수 없습니다. 예: 20101</p>';
    return;
  }

  const status = penaltyStatus(student.penalty);
  const schoolPosition = rankedStudents().findIndex(item => item.studentId === student.studentId) + 1;
  const classPosition = rankedStudents().filter(item => item.class === student.class).findIndex(item => item.studentId === student.studentId) + 1;
  $('#searchResult').innerHTML = `
    <div class="student-result">
      <div><span>학생</span><b>${student.studentId} ${escapeHtml(student.name)}</b></div>
      <div><span>소속</span><b>2학년 ${student.class}반 ${student.number}번</b></div>
      <div><span>자습시간</span><b>${student.hours.toFixed(1)}h</b></div>
      <div><span>누적 벌점</span><b class="${student.penalty > 0 ? 'danger' : 'clean-text'}">${formatPenalty(student.penalty)}점</b></div>
      <div><span>반영 점수</span><b>${reflectedHours(student).toFixed(1)}h</b></div>
      <div><span>전체 순위</span><b>${schoolPosition}위</b></div>
      <div><span>반 순위</span><b>${classPosition}위</b></div>
      <div><span>상태</span><b><span class="status-chip ${status.tone}">${status.label}</span></b></div>
    </div>`;
}

/* ---------------- 감독학생 입력 ---------------- */
function selectedStudent() {
  return findStudentByInput($('#penaltyStudent').value);
}

function selectedPenaltyAmount() {
  return roundPenalty(PENALTY_RULES.reduce((sum, rule) => sum + rule.points * (selections[rule.key] || 0), 0));
}

function renderPenaltyChecklist() {
  $('#penaltyChecklist').innerHTML = PENALTY_RULES.map(rule => `
    <div class="penalty-rule" data-rule="${rule.key}">
      <label class="rule-select">
        <input class="rule-check" type="checkbox" aria-label="${escapeHtml(rule.title)} 1회 선택">
        <span><b>${escapeHtml(rule.title)}</b><small>${escapeHtml(rule.description)}</small></span>
      </label>
      <strong>+${formatPenalty(rule.points)}점</strong>
      <div class="stepper" aria-label="${escapeHtml(rule.title)} 발생 횟수">
        <button type="button" class="secondary" data-step="-1" aria-label="횟수 줄이기">−</button>
        <output>0회</output>
        <button type="button" data-step="1" aria-label="횟수 늘리기">+</button>
      </div>
    </div>`).join('');
}

function updatePenaltyTool({ syncManual = false } = {}) {
  const student = selectedStudent();
  const added = selectedPenaltyAmount();
  const current = student?.penalty || 0;
  const writable = Boolean(CONFIG.APPS_SCRIPT_URL);

  PENALTY_RULES.forEach(rule => {
    const row = document.querySelector(`[data-rule="${rule.key}"]`);
    if (!row) return;
    const count = selections[rule.key] || 0;
    row.classList.toggle('selected', count > 0);
    row.querySelector('.rule-check').checked = count > 0;
    row.querySelector('output').textContent = `${count}회`;
  });

  $('#selectedStudent').innerHTML = student
    ? `<b>${escapeHtml(student.name)}</b><span>${student.studentId} · 2학년 ${student.class}반 ${student.number}번</span>`
    : '학번을 입력해 주세요.';
  $('#selectedStudent').classList.toggle('valid', Boolean(student));
  $('#currentPenalty').textContent = student ? `${formatPenalty(current)}점` : '-';
  $('#addedPenalty').textContent = `+${formatPenalty(added)}점`;
  $('#nextPenalty').textContent = student ? `${formatPenalty(current + added)}점` : '-';
  $('#savePenalty').disabled = !student || added <= 0 || saving || !writable;
  $('#overwritePenalty').disabled = !student || saving || !writable;

  if (student && (syncManual || document.activeElement !== $('#penaltyValue'))) {
    $('#penaltyValue').value = formatPenalty(current);
  }
}

function updateSelectedStudent() {
  const student = selectedStudent();
  if (student) $('#penaltyStudent').value = student.studentId;
  updatePenaltyTool({ syncManual: Boolean(student) });
}

function resetSelections() {
  selections = emptySelections();
  updatePenaltyTool();
}

function showSaveMessage(message, tone = 'success') {
  const element = $('#penaltySaveMessage');
  element.textContent = message;
  element.className = `save-message ${tone}`;
}

function selectedPenaltyReason() {
  return PENALTY_RULES
    .filter(rule => (selections[rule.key] || 0) > 0)
    .map(rule => `${rule.title} ${selections[rule.key]}회`)
    .join(' · ');
}

async function persistPenalty(student, value, metadata = {}) {
  if (!CONFIG.APPS_SCRIPT_URL) throw new Error('먼저 config.js에 새 Apps Script /exec 주소를 입력해 주세요.');
  if (activeApiVersion !== REQUIRED_API_VERSION) throw new Error('안전을 위해 저장을 차단했습니다. Apps Script v41을 먼저 배포해 주세요.');
  const safeValue = roundPenalty(Math.max(0, Number(value) || 0));
  const form = new URLSearchParams({
    action: 'setPenalty',
    apiVersion: REQUIRED_API_VERSION,
    studentId: student.studentId,
    penalty: String(safeValue)
  });
  if (metadata.reason) form.append('reason', metadata.reason);
  if (metadata.points > 0) form.append('addedPenalty', String(roundPenalty(metadata.points)));
  const response = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body: form });
  if (!response.ok) throw new Error('누적 벌점 저장에 실패했습니다.');
  const result = await response.json();
  if (result.apiVersion !== REQUIRED_API_VERSION) throw new Error('Apps Script 응답 버전이 일치하지 않습니다.');
  if (result.ok === false) throw new Error(result.message || '누적 벌점 저장에 실패했습니다.');
  student.penalty = safeValue;
  return {
    penalty: safeValue,
    recentPenalty: result.recentPenalty || (metadata.points > 0 ? {
      studentId: student.studentId,
      name: student.name,
      reason: metadata.reason,
      points: roundPenalty(metadata.points),
      date: new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())
    } : null)
  };
}

async function addSelectedPenalty() {
  const student = selectedStudent();
  const added = selectedPenaltyAmount();
  if (!student) throw new Error('학번을 확인해 주세요. 예: 20626');
  if (added <= 0) throw new Error('벌점 항목을 하나 이상 선택해 주세요.');

  const previous = student.penalty;
  const reason = selectedPenaltyReason();
  const result = await persistPenalty(student, previous + added, { reason, points: added });
  if (result.recentPenalty) recentPenalties = [result.recentPenalty, ...recentPenalties].slice(0, 30);
  resetSelections();
  render();
  updatePenaltyTool({ syncManual: true });
  showSaveMessage(`${student.studentId} ${student.name}: 누적 벌점이 ${formatPenalty(previous)}점에서 ${formatPenalty(result.penalty)}점으로 저장되었습니다.`);
}

async function overwritePenalty() {
  const student = selectedStudent();
  const value = Number($('#penaltyValue').value);
  if (!student) throw new Error('학번을 확인해 주세요. 예: 20626');
  if (!Number.isFinite(value) || value < 0) throw new Error('0 이상의 누적 벌점을 입력해 주세요.');

  const previous = student.penalty;
  const result = await persistPenalty(student, value);
  render();
  updatePenaltyTool({ syncManual: true });
  showSaveMessage(`${student.studentId} ${student.name}: 누적 벌점을 ${formatPenalty(previous)}점에서 ${formatPenalty(result.penalty)}점으로 정정했습니다.`);
}

async function clearRecentPenaltyHistory() {
  if (!admin) return;
  if (activeApiVersion !== REQUIRED_API_VERSION) throw new Error('Apps Script v41을 먼저 배포해 주세요.');
  if (!window.confirm('최근 벌점 기록을 모두 초기화할까요? 학생들의 누적 벌점은 변경되지 않습니다.')) return;

  const button = $('#clearRecentPenalties');
  button.disabled = true;
  showSaveMessage('최근 벌점 기록을 초기화하는 중입니다…', 'pending');
  try {
    const form = new URLSearchParams({
      action: 'clearRecentPenalties',
      apiVersion: REQUIRED_API_VERSION,
      adminPassword: ADMIN_PASSWORD
    });
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body: form });
    if (!response.ok) throw new Error('최근 벌점 기록 초기화에 실패했습니다.');
    const result = await response.json();
    if (result.apiVersion !== REQUIRED_API_VERSION) throw new Error('Apps Script 응답 버전이 일치하지 않습니다.');
    if (result.ok === false) throw new Error(result.message || '최근 벌점 기록 초기화에 실패했습니다.');
    recentPenalties = [];
    renderPenaltyFeed();
    showSaveMessage('최근 벌점 기록을 모두 초기화했습니다. 누적 벌점은 그대로 유지됩니다.');
  } finally {
    button.disabled = false;
  }
}

async function runSave(action) {
  if (!admin || saving) return;
  saving = true;
  showSaveMessage('누적 벌점을 저장하는 중입니다…', 'pending');
  updatePenaltyTool();
  try {
    await action();
  } catch (error) {
    showSaveMessage(error.message, 'error');
  } finally {
    saving = false;
    updatePenaltyTool();
  }
}

/* ---------------- 이벤트 ---------------- */
function setup() {
  renderPenaltyGuide();
  renderPenaltyChecklist();
  $('#editorAccount').textContent = CONFIG.EDITOR_ACCOUNT;
  $('#sheetLink').href = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit?gid=${CONFIG.SHEET_GID}#gid=${CONFIG.SHEET_GID}`;

  $('#refresh').onclick = refresh;
  $('#adminRefresh').onclick = refresh;

  $('#searchForm').onsubmit = event => {
    event.preventDefault();
    renderSearchResult(findStudentByInput($('#studentId').value));
  };

  $('#adminToggle').onclick = () => {
    $('#admin').hidden = false;
    if (!CONFIG.APPS_SCRIPT_URL) showSaveMessage('현재 읽기 전용입니다. 새 Apps Script /exec 주소를 config.js에 입력하면 저장 버튼이 활성화됩니다.', 'pending');
    setTimeout(() => (admin ? $('#penaltyStudent') : $('#password')).focus(), 0);
  };
  $('#closeAdmin').onclick = () => { $('#admin').hidden = true; };
  $('#loginForm').onsubmit = event => {
    event.preventDefault();
    if ($('#password').value !== ADMIN_PASSWORD) return alert('비밀번호가 올바르지 않습니다.');
    admin = true;
    $('#loginForm').hidden = true;
    $('#adminTools').hidden = false;
    $('#penaltyStudent').focus();
  };

  $('#penaltyStudent').oninput = () => {
    showSaveMessage('');
    updateSelectedStudent();
  };
  $('#penaltyChecklist').onclick = event => {
    const button = event.target.closest('[data-step]');
    if (!button) return;
    const key = button.closest('[data-rule]').dataset.rule;
    selections[key] = Math.min(99, Math.max(0, (selections[key] || 0) + Number(button.dataset.step)));
    showSaveMessage('');
    updatePenaltyTool();
  };
  $('#penaltyChecklist').onchange = event => {
    if (!event.target.matches('.rule-check')) return;
    const key = event.target.closest('[data-rule]').dataset.rule;
    selections[key] = event.target.checked ? Math.max(1, selections[key] || 0) : 0;
    showSaveMessage('');
    updatePenaltyTool();
  };

  $('#savePenalty').onclick = () => runSave(addSelectedPenalty);
  $('#overwritePenalty').onclick = () => runSave(overwritePenalty);
  $('#clearRecentPenalties').onclick = () => clearRecentPenaltyHistory().catch(error => showSaveMessage(error.message, 'error'));
  $('#resetPenaltySelection').onclick = () => {
    resetSelections();
    showSaveMessage('선택한 항목을 초기화했습니다.', 'pending');
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#admin').hidden) $('#admin').hidden = true;
  });

  updatePenaltyTool();
}

async function refresh() {
  $('#refresh').disabled = true;
  try {
    await load();
  } catch (error) {
    $('#top3').innerHTML = `<p class="feed-empty">${escapeHtml(error.message)}</p>`;
    $('#rankingBody').innerHTML = `<tr><td colspan="5" class="empty-table">${escapeHtml(error.message)}</td></tr>`;
    $('#penaltyRankingBody').innerHTML = '<tr><td colspan="5" class="empty-table">시트 연결 후 표시됩니다.</td></tr>';
  } finally {
    $('#refresh').disabled = false;
  }
}

setup();
refresh();
