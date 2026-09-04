/* ---------------- 승급전 티어 시스템 (자습시수 기준) ----------------
 * 골드에서 시작해서 자습시간이 쌓이면 승급하고, 벌점을 받으면 강등됩니다.
 * LP 같은 별도 포인트 개념 없이, 전부 "시간" 단위로만 계산합니다.
 * ⚠️ TIERS 순서, START_TIER_INDEX, HOURS_PER_PENALTY는
 *    Code.gs와 반드시 같은 값을 유지해야 승급 로그가 정확합니다.
 */
const TIERS = [
  { name: 'Iron', ko: '아이언', color: '#5a5f6b' },
  { name: 'Bronze', ko: '브론즈', color: '#b0703a' },
  { name: 'Silver', ko: '실버', color: '#9fb0c3' },
  { name: 'Gold', ko: '골드', color: '#e8c574' },
  { name: 'Platinum', ko: '플래티넘', color: '#3fd9c7' },
  { name: 'Emerald', ko: '에메랄드', color: '#34c77b' },
  { name: 'Diamond', ko: '다이아몬드', color: '#b06bff' },
  { name: 'Master', ko: '마스터', color: '#ff5f6d' },
  { name: 'Challenger', ko: '챌린저', color: '#ffe37a' }
];
const START_TIER_INDEX = 3; // Gold
const TIER_BAND = 40;          // 티어 1단계당 필요한 자습시간 (시간)
const HOURS_PER_PENALTY = 20;  // 벌점 1점당 차감되는 자습시간 환산치 (시간)
// 200시간이면 Gold(idx3)에서 5단계 위인 Challenger(idx8)에 정확히 도달합니다.

/* ---------------- 공식 벌점 기준 ----------------
 * 사진 속 기준표와 동일한 점수입니다. 관리자 패널과 공개 기준표가
 * 같은 데이터를 사용하므로 한 곳만 수정해도 두 화면에 함께 반영됩니다.
 */
const PENALTY_RULES = [
  {
    key: 'restroom',
    title: '화장실 및 준비물',
    description: '화장실은 자습 시간에 하루 3회 초과부터 감점',
    points: 0.2
  },
  { key: 'sleep', title: '자습 중 수면', description: '발생 횟수만큼 입력', points: 0.5 },
  { key: 'late', title: '지각', description: '발생 횟수만큼 입력', points: 0.3 },
  {
    key: 'noise',
    title: '자습실 내 소란 및 친목 행위',
    description: '눈 맞춤·제스처·톡 치고 지나가기 등',
    points: 0.5
  },
  {
    key: 'device',
    title: '학습 용도 외 전자기기 사용 / 종 치기 전 책 덮기',
    description: '발생 횟수만큼 입력',
    points: 1.0
  }
];

const CLASS_PENALTY_WEIGHT = 2; // 개인 벌점 1점당 반 총시수 2시간 차감

function roundPenalty(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function formatPenalty(value) {
  return roundPenalty(value).toFixed(1);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

// 벌점 자체에 대한 경고 문구 (승급전 티어와 별개로, 실제 징계 상태를 나타냄)
function penaltyStatus(penalty) {
  if (penalty >= 11) return '퇴출';
  if (penalty >= 9) return '퇴출 위기';
  if (penalty >= 7) return '면담 추천';
  if (penalty >= 5) return '강등권';
  if (penalty >= 3) return '관리 필요';
  if (penalty >= 1) return '주의 구간';
  return '무벌점 천상계';
}

let students = [];
let admin = false;
let penalties = {};
let recentPromotions = [];
let recentPenalties = [];
let penaltySelections = Object.fromEntries(PENALTY_RULES.map(rule => [rule.key, 0]));
let penaltySaving = false;

const $ = selector => document.querySelector(selector);

function computeTier(student) {
  const totalHours = student.hours - student.penalty * HOURS_PER_PENALTY;
  const offset = Math.floor(totalHours / TIER_BAND);
  let idx = START_TIER_INDEX + offset;
  let hoursIn;
  let prestige = false;

  if (idx >= TIERS.length - 1) {
    idx = TIERS.length - 1;
    hoursIn = totalHours - (idx - START_TIER_INDEX) * TIER_BAND;
    prestige = true;
  } else if (idx <= 0) {
    idx = 0;
    hoursIn = 0;
  } else {
    hoursIn = ((totalHours % TIER_BAND) + TIER_BAND) % TIER_BAND;
  }

  return { idx, totalHours, hoursIn, prestige, ...TIERS[idx] };
}

const RANK_PENALTY_WEIGHT = 2; // 전체 순위(개인 랭킹) 정렬 전용 — 티어 시스템과 분리, 훨씬 완만하게 반영
const rankStudents = () => [...students].sort((a, b) => (b.hours - b.penalty * RANK_PENALTY_WEIGHT) - (a.hours - a.penalty * RANK_PENALTY_WEIGHT) || a.penalty - b.penalty);
const penaltyStudents = () => [...students].sort((a, b) => b.penalty - a.penalty || a.studentId.localeCompare(b.studentId));

function tierNote(t) {
  if (t.prestige) return `🔥 최고 티어 유지 중 · 자습 ${Math.round(t.hoursIn)}시간 초과 달성`;
  if (t.idx === 0) return '⚠️ 최저 티어 · 추가 벌점 시 즉시 면담 필요';

  const toDemote = Math.ceil((t.hoursIn + 1) / HOURS_PER_PENALTY);
  if (toDemote <= 1) return `⚠️ 벌점 1점만 더 받으면 ${TIERS[t.idx - 1].ko}로 강등!`;

  const hoursToPromote = Math.ceil(TIER_BAND - t.hoursIn);
  return `다음 승급까지 자습 ${hoursToPromote}시간 남음`;
}

function badgeHtml(t, size = '') {
  const progress = t.prestige ? `+${Math.round(t.hoursIn)}h` : `${Math.round(t.hoursIn)}/${TIER_BAND}h`;
  return `<span class="rank-badge ${size}" style="--tier-color:${t.color}">
    <span class="badge-shield"></span>
    <span class="badge-text"><b>${t.ko}</b><small>${progress}</small></span>
  </span>`;
}

function gaugeHtml(t, size = '') {
  const pct = t.prestige ? 100 : Math.round((t.hoursIn / TIER_BAND) * 100);
  return `<div class="gauge ${size}" style="--tier-color:${t.color}">
    <div class="gauge-track"><div class="gauge-fill" style="width:${pct}%"></div></div>
    <small>${tierNote(t)}</small>
  </div>`;
}

function tierCellHtml(student) {
  const t = computeTier(student);
  return `<div class="tier-cell">${badgeHtml(t, 'xs')}${gaugeHtml(t, 'xs')}</div>`;
}

/* ---------------- 최근 승급자 피드 ---------------- */
function renderPromotions() {
  const el = $('#promotionFeed');
  if (!el) return;

  if (!recentPromotions.length) {
    el.innerHTML = '<p class="hint"> 승급 기록이 없습니다.</p>';
    return;
  }

  el.innerHTML = recentPromotions.map(item => `
    <div class="promo-item">
      <span class="promo-name"><b>${escapeHtml(item.name)}</b>님</span>
      <span class="promo-tier">${escapeHtml(item.from)} → ${escapeHtml(item.to)}</span>
      <span class="promo-time">${escapeHtml(item.date)}</span>
    </div>
  `).join('');
}

/* ---------------- 개인 승급 토스트 ---------------- */
function showLevelUpToast(name, fromKo, toKo) {
  let toast = document.querySelector('.level-up-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'level-up-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `🎉 <b>${name}</b>님, <b>${fromKo}</b> → <b>${toKo}</b> 승급을 축하합니다!`;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 4200);
}

function checkPersonalLevelUp(student, t) {
  const key = 'daejin-tier-seen';
  const seen = JSON.parse(localStorage.getItem(key) || '{}');
  const prevIdx = seen[student.studentId];

  if (prevIdx !== undefined && t.idx > prevIdx) {
    showLevelUpToast(student.name, TIERS[prevIdx].ko, t.ko);
  }

  seen[student.studentId] = t.idx;
  localStorage.setItem(key, JSON.stringify(seen));
}

/* ---------------- 데이터 로드 ---------------- */
async function getServerData() {
  const localPenaltyValues = JSON.parse(localStorage.getItem('daejin-rift-penalties') || '{}');
  const localPenaltyFeed = JSON.parse(localStorage.getItem('daejin-rift-recent-penalties') || '[]');

  if (!CONFIG.APPS_SCRIPT_URL) {
    return { penalties: localPenaltyValues, recentPromotions: [], recentPenalties: localPenaltyFeed };
  }

  try {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL);
    if (!response.ok) throw new Error('데이터를 불러오지 못했습니다.');
    const data = await response.json();
    return {
      penalties: data.penalties || {},
      recentPromotions: data.recentPromotions || [],
      recentPenalties: Array.isArray(data.recentPenalties) && data.recentPenalties.length
        ? data.recentPenalties
        : localPenaltyFeed
    };
  } catch (error) {
    console.warn('공용 저장소 연결 실패: 브라우저 저장값을 사용합니다.', error);
    return { penalties: localPenaltyValues, recentPromotions: [], recentPenalties: localPenaltyFeed };
  }
}

function loadSheetJsonp() {
  return new Promise((resolve, reject) => {
    const callback = `daejinSheet_${Date.now()}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => cleanup(new Error('시트 응답 시간이 초과되었습니다.')), 15000);

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
    script.onerror = () => cleanup(new Error('시트 연결에 실패했습니다. 공유 권한을 확인하세요.'));
    script.src = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}&tqx=out:json;responseHandler:${callback}`;
    document.head.append(script);
  });
}

async function load() {
  const data = await loadSheetJsonp();
  const server = await getServerData();
  penalties = server.penalties;
  recentPromotions = server.recentPromotions;
  recentPenalties = server.recentPenalties;

  students = data.table.rows
    .filter(row =>
      row.c?.[2] &&
      Number.isFinite(Number(row.c?.[0]?.v)) &&
      Number.isFinite(Number(row.c?.[1]?.v)) &&
      Number.isFinite(Number(row.c?.[3]?.v)) &&
      String(row.c?.[2]?.v).trim() !== '이름'
    )
    .map(row => {
      const values = row.c.map(cell => cell?.v);
      const classNumber = Number(values[0]);
      const number = Number(values[1]);
      const studentId = `2${String(classNumber).padStart(2, '0')}${String(number).padStart(2, '0')}`;

      return {
        studentId,
        class: classNumber,
        number,
        name: String(values[2]).trim(),
        hours: Number(values[3]) || 0,
        penalty: roundPenalty(Number(penalties[studentId]) || 0)
      };
    });

  populateStudentOptions();
  updateSelectedStudent();

  $('#updated').textContent = ' 마지막 업데이트 : ' + new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date());

  render();
}

function groups() {
  return Object.values(students.reduce((map, student) => {
    (map[student.class] ??= []).push(student);
    return map;
  }, {})).map(group => {
    const hours = group.reduce((sum, student) => sum + student.hours, 0);
    const penalty = group.reduce((sum, student) => sum + student.penalty, 0);

    return {
      class: group[0].class,
      students: group,
      hours,
      penalty,
      final: hours - penalty * CLASS_PENALTY_WEIGHT,
      avg: hours / group.length
    };
  }).sort((a, b) => b.final - a.final);
}

function renderPenaltyGuide() {
  const guide = $('#penaltyGuide');
  if (!guide) return;

  guide.innerHTML = PENALTY_RULES.map((rule, index) => `
    <article class="guide-card">
      <span class="guide-number">0${index + 1}</span>
      <div><h3>${escapeHtml(rule.title)}</h3><p>${escapeHtml(rule.description)}</p></div>
      <strong>${formatPenalty(rule.points)}점</strong>
    </article>
  `).join('');
}

function renderPenaltyFeed() {
  const feed = $('#penaltyFeed');
  if (!feed) return;

  if (!recentPenalties.length) {
    feed.innerHTML = '<p class="hint">저장된 최근 벌점 기록이 없습니다.</p>';
    return;
  }

  feed.innerHTML = recentPenalties.slice(0, 30).map(item => `
    <div class="penalty-feed-item">
      <span class="penalty-feed-student"><b>${escapeHtml(item.name || '학생')}</b><small>${escapeHtml(item.studentId || '')}</small></span>
      <span class="penalty-feed-reason">${escapeHtml(item.reason || '벌점 부여')}</span>
      <strong>+${formatPenalty(item.points || 0)}점</strong>
      <time>${escapeHtml(item.date || '')}</time>
    </div>
  `).join('');
}

function renderCleanZone() {
  const cleanStudents = students
    .filter(student => roundPenalty(student.penalty) === 0)
    .sort((a, b) => a.class - b.class || a.number - b.number);
  const cleanCount = $('#cleanCount');
  const stats = $('#cleanStats');
  const list = $('#cleanZoneList');

  cleanCount.textContent = `${cleanStudents.length}명`;

  if (!cleanStudents.length) {
    stats.innerHTML = '';
    list.innerHTML = '<p class="clean-empty">현재 청정구역에 등록된 학생이 없습니다.</p>';
    return;
  }

  const grouped = cleanStudents.reduce((map, student) => {
    (map[student.class] ??= []).push(student);
    return map;
  }, {});
  const classEntries = Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b));
  const topClass = [...classEntries].sort((a, b) => b[1].length - a[1].length || Number(a[0]) - Number(b[0]))[0];
  const cleanRatio = students.length ? Math.round((cleanStudents.length / students.length) * 100) : 0;

  stats.innerHTML = `
    <div><span>청정 학생</span><b>${cleanStudents.length}명</b></div>
    <div><span>전체 비율</span><b>${cleanRatio}%</b></div>
    <div><span>최다 청정 반</span><b>2학년 ${topClass[0]}반 · ${topClass[1].length}명</b></div>
  `;

  list.innerHTML = classEntries.map(([classNumber, classStudents]) => `
    <article class="clean-class">
      <div class="clean-class-title"><h3>2학년 ${classNumber}반</h3><span>${classStudents.length}명</span></div>
      <ul>${classStudents.map(student => `
        <li><span>${student.studentId}</span><b>${escapeHtml(student.name)}</b><em>0.0점</em></li>
      `).join('')}</ul>
    </article>
  `).join('');
}

/* ---------------- 렌더링 ---------------- */
function render() {
  const ranked = rankStudents();
  const penaltyRanked = penaltyStudents().filter(student => student.penalty > 0);
  const classGroups = groups();

  renderPromotions();
  renderPenaltyFeed();
  renderCleanZone();

  $('#top3').innerHTML = ranked.slice(0, 3).map((student, index) => {
    const t = computeTier(student);
    return `
    <article class="top">
      <i>${['♛', '♜', '♞'][index]}</i>
      <h3>${escapeHtml(student.name)}</h3>
      <span>${student.studentId} · 2학년 ${student.class}반</span>
      ${badgeHtml(t, 'sm')}
      <strong>${student.hours}h</strong>
      ${gaugeHtml(t, 'sm')}
    </article>`;
  }).join('');

  $('#rankingBody').innerHTML = ranked.map((student, index) => {
    const t = computeTier(student);
    return `
    <tr class="${student.penalty >= 11 ? 'expelled' : ''}">
      <td>#${index + 1}</td><td>${student.studentId}</td><td><b>${escapeHtml(student.name)}</b></td>
      <td>${student.hours}h</td>
      <td class="danger">${formatPenalty(student.penalty)}점</td>
      <td>${tierCellHtml(student)}</td>
    </tr>`;
  }).join('');

  $('#penaltyRankingBody').innerHTML = penaltyRanked.length ? penaltyRanked.map((student, index) => `
    <tr class="${student.penalty >= 11 ? 'expelled' : ''}">
      <td>#${index + 1}</td><td>${student.studentId}</td><td><b>${escapeHtml(student.name)}</b></td>
      <td>2학년 ${student.class}반</td><td class="danger">${formatPenalty(student.penalty)}점</td>
      <td>${penaltyStatus(student.penalty)}</td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-table">현재 벌점이 있는 학생이 없습니다.</td></tr>';

  const finals = classGroups.map(group => group.final);
  const maxFinal = Math.max(...finals);
  const minFinal = Math.min(...finals);
  const span = (maxFinal - minFinal) || 1;

  $('#classCards').innerHTML = classGroups.map((group, index) => {
    const pct = 14 + 86 * ((group.final - minFinal) / span);
    const gap = maxFinal - group.final;
    return `
    <button class="race-row ${index === 0 ? 'lead' : ''}" data-class="${group.class}" style="--i:${index}">
      <span class="race-rank">${index + 1}</span>
      <span class="race-label">2학년 ${group.class}반<small>총 ${group.hours}h · 평균 ${group.avg.toFixed(1)}h · 반 벌점 ${formatPenalty(group.penalty)}점</small></span>
      <span class="race-track"><span class="race-bar" data-pct="${pct}"></span></span>
      <span class="race-score">${group.final.toFixed(1)}h</span>
      <span class="race-gap">${index === 0 ? '👑 선두' : `−${gap.toFixed(1)}h`}</span>
    </button>`;
  }).join('');

  document.querySelectorAll('.race-row').forEach(row => {
    row.onclick = () => showClass(Number(row.dataset.class));
  });

  requestAnimationFrame(() => {
    document.querySelectorAll('.race-bar').forEach(bar => {
      bar.style.width = bar.dataset.pct + '%';
    });
  });
}

function showClass(classNumber) {
  const classStudents = rankStudents().filter(student => student.class === classNumber);
  const classRank = groups().findIndex(group => group.class === classNumber) + 1;

  $('#classDetail').hidden = false;
  $('#classDetail').innerHTML = `<h3>🏰 2학년 ${classNumber}반 · ${classRank}위</h3><ol>${classStudents.map((student, index) => {
    const t = computeTier(student);
    return `<li>#${index + 1} <b>${student.studentId} ${escapeHtml(student.name)}</b><span>${t.ko} · ${student.hours}h · 벌점 ${formatPenalty(student.penalty)}</span></li>`;
  }).join('')}</ol>`;
}

/* ---------------- 검색 ---------------- */
$('#searchForm').onsubmit = event => {
  event.preventDefault();
  const input = $('#studentId').value.replace(/\D/g, '');
  const studentId = input.padStart(5, '0');
  const student = students.find(item => String(item.studentId) === studentId);
  const ranked = rankStudents();
  const classGroups = groups();

  if (!student) {
    $('#searchResult').innerHTML = '<p class="hint">해당 학번의 소환사를 찾을 수 없습니다. 예: 20101</p>';
    return;
  }

  const t = computeTier(student);
  const classRank = classGroups.findIndex(group => group.class === student.class) + 1;
  const rankPos = ranked.indexOf(student) + 1;

  checkPersonalLevelUp(student, t);

  $('#searchResult').innerHTML = `
    <div class="search-tier" style="--tier-color:${t.color}">
      ${badgeHtml(t, 'lg')}
      ${gaugeHtml(t)}
    </div>
    <div class="result">${[
      ['소환사', student.name],
      ['학번', student.studentId],
      ['소속', `2학년 ${student.class}반`],
      ['자습시간', `${student.hours}h`],
      ['벌점', `${formatPenalty(student.penalty)}점`],
      ['학교 순위', `${rankPos}위`],
      ['반 순위', `${classRank}위`],
      ['징계 상태', penaltyStatus(student.penalty)]
    ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>
  `;
};

/* ---------------- 관리자 ---------------- */
const ADMIN_PASSWORD = 'daejin1234';

function normalizedStudentId(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 5);
  return digits ? digits.padStart(5, '0') : '';
}

function selectedPenaltyStudent() {
  const studentId = normalizedStudentId($('#penaltyStudent').value);
  return students.find(student => student.studentId === studentId);
}

function populateStudentOptions() {
  const options = $('#studentOptions');
  if (!options) return;

  options.innerHTML = [...students]
    .sort((a, b) => a.class - b.class || a.number - b.number)
    .map(student => `<option value="${student.studentId}" label="${escapeHtml(student.name)} · 2학년 ${student.class}반"></option>`)
    .join('');
}

function selectedPenaltyAmount() {
  return roundPenalty(PENALTY_RULES.reduce((sum, rule) => {
    return sum + rule.points * (penaltySelections[rule.key] || 0);
  }, 0));
}

function renderPenaltyChecklist() {
  const checklist = $('#penaltyChecklist');
  if (!checklist) return;

  checklist.innerHTML = PENALTY_RULES.map(rule => `
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
    </div>
  `).join('');
}

function updatePenaltyTool({ syncManualValue = false } = {}) {
  const student = selectedPenaltyStudent();
  const added = selectedPenaltyAmount();
  const current = student ? roundPenalty(student.penalty) : 0;

  PENALTY_RULES.forEach(rule => {
    const row = document.querySelector(`[data-rule="${rule.key}"]`);
    if (!row) return;
    const count = penaltySelections[rule.key] || 0;
    row.classList.toggle('selected', count > 0);
    row.querySelector('.rule-check').checked = count > 0;
    row.querySelector('output').textContent = `${count}회`;
  });

  $('#selectedStudent').innerHTML = student
    ? `<b>${escapeHtml(student.name)}</b><span>${student.studentId} · 2학년 ${student.class}반</span>`
    : '학번을 입력해 주세요.';
  $('#selectedStudent').classList.toggle('valid', Boolean(student));
  $('#currentPenalty').textContent = student ? `${formatPenalty(current)}점` : '-';
  $('#addedPenalty').textContent = `+${formatPenalty(added)}점`;
  $('#nextPenalty').textContent = student ? `${formatPenalty(current + added)}점` : '-';
  $('#savePenalty').disabled = !student || added <= 0 || penaltySaving;
  $('#overwritePenalty').disabled = !student || penaltySaving;

  if (student && (syncManualValue || document.activeElement !== $('#penaltyValue'))) {
    $('#penaltyValue').value = formatPenalty(current);
  }
}

function updateSelectedStudent() {
  const input = $('#penaltyStudent');
  if (!input) return;
  const student = selectedPenaltyStudent();

  if (student) input.value = student.studentId;
  updatePenaltyTool({ syncManualValue: Boolean(student) });
}

function resetPenaltySelection() {
  penaltySelections = Object.fromEntries(PENALTY_RULES.map(rule => [rule.key, 0]));
  updatePenaltyTool();
}

function showPenaltyMessage(message, type = 'success') {
  const element = $('#penaltySaveMessage');
  element.textContent = message;
  element.className = `save-message ${type}`;
}

function selectedPenaltyReason() {
  return PENALTY_RULES
    .filter(rule => (penaltySelections[rule.key] || 0) > 0)
    .map(rule => `${rule.title} ${penaltySelections[rule.key]}회`)
    .join(' · ');
}

function appendRecentPenalty(student, points, reason) {
  const item = {
    studentId: student.studentId,
    name: student.name,
    points: roundPenalty(points),
    reason,
    date: new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())
  };
  recentPenalties = [item, ...recentPenalties].slice(0, 50);
  localStorage.setItem('daejin-rift-recent-penalties', JSON.stringify(recentPenalties));
}

async function persistPenalty(student, value, metadata = {}) {
  const safeValue = roundPenalty(Math.max(0, Number(value) || 0));

  if (CONFIG.APPS_SCRIPT_URL) {
    const form = new URLSearchParams();
    form.append('action', 'setPenalty');
    form.append('studentId', student.studentId);
    form.append('penalty', String(safeValue));
    if (metadata.reason) form.append('reason', metadata.reason);
    if (metadata.points) form.append('addedPenalty', String(roundPenalty(metadata.points)));
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body: form });
    if (!response.ok) throw new Error('벌점 저장에 실패했습니다.');
  } else {
    localStorage.setItem('daejin-rift-penalties', JSON.stringify({
      ...penalties,
      [student.studentId]: safeValue
    }));
  }

  penalties[student.studentId] = safeValue;
  student.penalty = safeValue;
  return safeValue;
}

async function addSelectedPenalty() {
  const student = selectedPenaltyStudent();
  const added = selectedPenaltyAmount();

  if (!student) throw new Error('학번을 확인해 주세요. 예: 20626');
  if (added <= 0) throw new Error('발생한 벌점 항목을 하나 이상 선택해 주세요.');

  const previous = student.penalty;
  const reason = selectedPenaltyReason();
  const saved = await persistPenalty(student, previous + added, { reason, points: added });
  appendRecentPenalty(student, added, reason);
  resetPenaltySelection();
  render();
  updatePenaltyTool({ syncManualValue: true });
  showPenaltyMessage(`${student.studentId} ${student.name}: ${formatPenalty(previous)}점 → ${formatPenalty(saved)}점으로 저장했습니다.`);
}

async function overwritePenalty() {
  const student = selectedPenaltyStudent();
  const value = Number($('#penaltyValue').value);

  if (!student) throw new Error('학번을 확인해 주세요. 예: 20626');
  if (!Number.isFinite(value) || value < 0) throw new Error('누적 벌점을 0 이상의 숫자로 입력해 주세요.');

  const previous = student.penalty;
  const saved = await persistPenalty(student, value);
  render();
  updatePenaltyTool({ syncManualValue: true });
  showPenaltyMessage(`${student.studentId} ${student.name}: 누적 벌점을 ${formatPenalty(previous)}점에서 ${formatPenalty(saved)}점으로 수정했습니다.`);
}

async function runPenaltySave(action) {
  if (!admin || penaltySaving) return;
  penaltySaving = true;
  showPenaltyMessage('저장 중입니다…', 'pending');
  updatePenaltyTool();

  try {
    await action();
  } catch (error) {
    showPenaltyMessage(error.message, 'error');
  } finally {
    penaltySaving = false;
    updatePenaltyTool();
  }
}

function setup() {
  renderPenaltyGuide();
  renderPenaltyChecklist();
  updatePenaltyTool();
  $('#refresh').onclick = refresh;
  $('#adminRefresh').onclick = refresh;
  $('#adminToggle').onclick = () => {
    $('#admin').hidden = false;
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
    showPenaltyMessage('');
    updateSelectedStudent();
  };
  $('#penaltyChecklist').onclick = event => {
    const button = event.target.closest('[data-step]');
    if (!button) return;
    const row = button.closest('[data-rule]');
    const key = row.dataset.rule;
    penaltySelections[key] = Math.min(99, Math.max(0, (penaltySelections[key] || 0) + Number(button.dataset.step)));
    showPenaltyMessage('');
    updatePenaltyTool();
  };
  $('#penaltyChecklist').onchange = event => {
    if (!event.target.matches('.rule-check')) return;
    const key = event.target.closest('[data-rule]').dataset.rule;
    penaltySelections[key] = event.target.checked ? Math.max(1, penaltySelections[key] || 0) : 0;
    showPenaltyMessage('');
    updatePenaltyTool();
  };
  $('#savePenalty').onclick = () => runPenaltySave(addSelectedPenalty);
  $('#overwritePenalty').onclick = () => runPenaltySave(overwritePenalty);
  $('#resetPenaltySelection').onclick = () => {
    resetPenaltySelection();
    showPenaltyMessage('선택한 항목을 초기화했습니다.', 'pending');
  };
  $('#sheetLink').href = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit`;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#admin').hidden) $('#admin').hidden = true;
  });
}

async function refresh() {
  try {
    await load();
  } catch (error) {
    $('#top3').innerHTML = `<p class="hint">데이터 로드 실패: ${error.message}</p>`;
  }
}

setup();
refresh();
