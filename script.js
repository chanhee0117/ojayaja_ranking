/* ---------------- 승급전 LP 티어 시스템 ----------------
 * 골드에서 시작해서 자습시간으로 LP를 쌓아 승급하고, 벌점으로 LP를 잃어 강등됩니다.
 * ⚠️ TIERS 순서, START_TIER_INDEX, LP_PER_HOUR, LP_PER_PENALTY는
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
const LP_PER_HOUR = 4;
const LP_PER_PENALTY = 50;

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

const $ = selector => document.querySelector(selector);

function computeTier(student) {
  const totalLP = student.hours * LP_PER_HOUR - student.penalty * LP_PER_PENALTY;
  const offset = Math.floor(totalLP / 100);
  let idx = START_TIER_INDEX + offset;
  let lp;
  let prestige = false;

  if (idx >= TIERS.length - 1) {
    idx = TIERS.length - 1;
    lp = totalLP - (idx - START_TIER_INDEX) * 100;
    prestige = true;
  } else if (idx <= 0) {
    idx = 0;
    lp = 0;
  } else {
    lp = ((totalLP % 100) + 100) % 100;
  }

  return { idx, totalLP, lp, prestige, ...TIERS[idx] };
}

const rankStudents = () => [...students].sort((a, b) => computeTier(b).totalLP - computeTier(a).totalLP || a.penalty - b.penalty);
const penaltyStudents = () => [...students].sort((a, b) => b.penalty - a.penalty || a.studentId.localeCompare(b.studentId));

function tierNote(t) {
  if (t.prestige) return '🔥 최고 티어 유지 중';
  if (t.idx === 0) return '⚠️ 최저 티어 · 추가 벌점 시 즉시 면담 필요';

  const toDemote = Math.ceil((t.lp + 1) / LP_PER_PENALTY);
  if (toDemote <= 1) return `⚠️ 벌점 1점만 더 받으면 ${TIERS[t.idx - 1].ko}로 강등!`;

  const hoursToPromote = Math.ceil((100 - t.lp) / LP_PER_HOUR);
  return `다음 승급까지 자습 ${hoursToPromote}시간 남음`;
}

function badgeHtml(t, size = '') {
  return `<span class="rank-badge ${size}" style="--tier-color:${t.color}">
    <span class="badge-shield"></span>
    <span class="badge-text"><b>${t.ko}</b><small>${Math.round(t.lp)} LP</small></span>
  </span>`;
}

function gaugeHtml(t, size = '') {
  const pct = t.prestige ? 100 : t.lp;
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
    el.innerHTML = '<p class="hint">아직 승급 기록이 없습니다. 자습을 많이 할수록 승급 소식이 쌓여요!</p>';
    return;
  }

  el.innerHTML = recentPromotions.map(item => `
    <div class="promo-item">
      <span class="promo-name"><b>${item.name}</b>님</span>
      <span class="promo-tier">${item.from} → ${item.to}</span>
      <span class="promo-time">${item.date}</span>
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
  if (!CONFIG.APPS_SCRIPT_URL) {
    return { penalties: JSON.parse(localStorage.getItem('daejin-rift-penalties') || '{}'), recentPromotions: [] };
  }

  try {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL);
    if (!response.ok) throw new Error('데이터를 불러오지 못했습니다.');
    const data = await response.json();
    return { penalties: data.penalties || {}, recentPromotions: data.recentPromotions || [] };
  } catch (error) {
    console.warn('공용 저장소 연결 실패: 브라우저 저장값을 사용합니다.', error);
    return { penalties: JSON.parse(localStorage.getItem('daejin-rift-penalties') || '{}'), recentPromotions: [] };
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

  students = data.table.rows
    .filter(row => row.c?.[2] && Number.isFinite(Number(row.c?.[0]?.v)) && Number.isFinite(Number(row.c?.[1]?.v)))
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
        penalty: Number(penalties[studentId]) || 0
      };
    });

  $('#updated').textContent = '📅 마지막 업데이트 : ' + new Intl.DateTimeFormat('ko-KR', {
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
      final: hours - penalty,
      avg: hours / group.length
    };
  }).sort((a, b) => b.final - a.final);
}

/* ---------------- 렌더링 ---------------- */
function render() {
  const ranked = rankStudents();
  const penaltyRanked = penaltyStudents();
  const classGroups = groups();

  renderPromotions();

  $('#top3').innerHTML = ranked.slice(0, 3).map((student, index) => {
    const t = computeTier(student);
    return `
    <article class="top">
      <i>${['♛', '♜', '♞'][index]}</i>
      <h3>${student.name}</h3>
      <span>${student.studentId} · 2학년 ${student.class}반</span>
      ${badgeHtml(t, 'sm')}
      <strong>${Math.round(t.lp)} LP</strong>
      ${gaugeHtml(t, 'sm')}
    </article>`;
  }).join('');

  $('#rankingBody').innerHTML = ranked.map((student, index) => {
    const t = computeTier(student);
    return `
    <tr class="${student.penalty >= 11 ? 'expelled' : ''}">
      <td>#${index + 1}</td><td>${student.studentId}</td><td><b>${student.name}</b></td>
      <td>2학년 ${student.class}반</td><td>${student.hours}h</td>
      <td class="danger">${student.penalty}점</td>
      <td>${Math.round(t.lp)} LP</td>
      <td>${tierCellHtml(student)}</td>
    </tr>`;
  }).join('');

  $('#penaltyRankingBody').innerHTML = penaltyRanked.map((student, index) => `
    <tr class="${student.penalty >= 11 ? 'expelled' : ''}">
      <td>#${index + 1}</td><td>${student.studentId}</td><td><b>${student.name}</b></td>
      <td>2학년 ${student.class}반</td><td class="danger">${student.penalty}점</td>
      <td>${penaltyStatus(student.penalty)}</td>
    </tr>
  `).join('');

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
      <span class="race-label">2학년 ${group.class}반<small>총 ${group.hours}h · 평균 ${group.avg.toFixed(1)}h · 반 벌점 ${group.penalty}점</small></span>
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
    return `<li>#${index + 1} <b>${student.studentId} ${student.name}</b><span>${t.ko} · ${Math.round(t.lp)}LP · 벌점 ${student.penalty}</span></li>`;
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
      ['벌점', `${student.penalty}점`],
      ['학교 순위', `${rankPos}위`],
      ['반 순위', `${classRank}위`],
      ['징계 상태', penaltyStatus(student.penalty)]
    ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')}</div>
  `;
};

/* ---------------- 관리자 ---------------- */
const ADMIN_PASSWORD = 'daejin1234';

async function setPenalty() {
  const studentId = $('#penaltyStudent').value.replace(/\D/g, '').padStart(5, '0');
  const student = students.find(item => item.studentId === studentId);
  const value = Math.max(0, Number($('#penaltyValue').value) || 0);

  if (!student) throw new Error('학번을 찾을 수 없습니다. 예: 20626');

  if (CONFIG.APPS_SCRIPT_URL) {
    const form = new URLSearchParams();
    form.append('action', 'setPenalty');
    form.append('studentId', student.studentId);
    form.append('penalty', String(value));
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body: form });
    if (!response.ok) throw new Error('벌점 저장에 실패했습니다.');
  } else {
    penalties[student.studentId] = value;
    localStorage.setItem('daejin-rift-penalties', JSON.stringify(penalties));
  }

  student.penalty = value;
  $('#penaltyStudent').value = student.studentId;
  render();
}

function setup() {
  $('#refresh').onclick = refresh;
  $('#adminRefresh').onclick = refresh;
  $('#adminToggle').onclick = () => { $('#admin').hidden = false; };
  $('#closeAdmin').onclick = () => { $('#admin').hidden = true; };
  $('#loginForm').onsubmit = event => {
    event.preventDefault();
    if ($('#password').value !== ADMIN_PASSWORD) return alert('비밀번호가 올바르지 않습니다.');
    admin = true;
    $('#loginForm').hidden = true;
    $('#adminTools').hidden = false;
  };
  $('#penaltyStudent').onchange = event => {
    const studentId = event.target.value.replace(/\D/g, '').padStart(5, '0');
    $('#penaltyValue').value = students.find(student => student.studentId === studentId)?.penalty || 0;
  };
  $('#savePenalty').onclick = () => admin && setPenalty().catch(error => alert(error.message));
  $('#sheetLink').href = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit`;
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
