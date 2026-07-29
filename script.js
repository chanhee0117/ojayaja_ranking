const ADMIN_PASSWORD = 'daejin1234';
const PENALTY_PER_HOUR = 2;
const CLASS_PENALTY = 1;

const tiers = [
  ['challenger', 'Challenger', '무벌점 천상계', 0, 0],
  ['diamond', 'Diamond', '주의 구간', 1, 2],
  ['platinum', 'Platinum', '관리 필요', 3, 4],
  ['gold', 'Gold', '강등권', 5, 6],
  ['silver', 'Silver', '면담 추천', 7, 8],
  ['bronze', 'Bronze', '퇴출 위기', 9, 10],
  ['iron', 'Iron', '퇴출', 11, Infinity]
];

let students = [];
let admin = false;
let penalties = {};
let history = null; // { date, ranks:{studentId:rank}, rp:{studentId:rp} }

let battleMode = false;
let battleSelection = [];

const $ = selector => document.querySelector(selector);
const tier = penalty => tiers.find(item => penalty >= item[3] && penalty <= item[4]);
const rankPoint = student => Math.max(0, Math.round(student.hours - student.penalty * PENALTY_PER_HOUR));
const rankStudents = () => [...students].sort((a, b) => rankPoint(b) - rankPoint(a) || a.penalty - b.penalty);
const penaltyStudents = () => [...students].sort((a, b) => b.penalty - a.penalty || a.studentId.localeCompare(b.studentId));

/* ---------------- 랭크 게이지 (승급전 연출) ---------------- */
function tierGauge(student) {
  const t = tier(student.penalty);
  const [, label, , min, max] = t;

  if (label === 'Challenger') {
    return { pct: 100, label, warn: false, note: '무벌점 · 최상위 티어 유지 중' };
  }
  if (max === Infinity) {
    return { pct: 100, label, warn: true, danger: true, note: '퇴출 구간 · 즉시 면담 필요' };
  }

  const range = max - min + 1;
  const used = student.penalty - min;
  const pct = Math.max(4, Math.round((1 - used / range) * 100));
  const left = max - student.penalty;
  const warn = left <= 1;
  const note = warn
    ? `⚠️ 벌점 ${left}점만 더 받으면 강등!`
    : `강등까지 벌점 여유 ${left}점`;

  return { pct, label, warn, danger: false, note };
}

function gaugeHtml(student, size = '') {
  const g = tierGauge(student);
  const cls = ['gauge', size, g.warn ? 'warn' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}"><div class="gauge-track"><div class="gauge-fill" style="width:${g.pct}%"></div></div><small>${g.note}</small></div>`;
}

/* ---------------- 순위 변동 ---------------- */
function rankDelta(student, currentRank) {
  if (!history || !history.ranks || !(student.studentId in history.ranks)) return null;
  const prevRank = Number(history.ranks[student.studentId]);
  if (!Number.isFinite(prevRank)) return null;
  return prevRank - currentRank; // 양수 = 상승
}

function deltaHtml(delta) {
  if (delta === null) return '<span class="delta new">NEW</span>';
  if (delta === 0) return '<span class="delta flat">-</span>';
  if (delta > 0) {
    const hot = delta >= 3 ? ' hot' : '';
    return `<span class="delta up${hot}">▲${delta}${delta >= 3 ? ' 🔥' : ''}</span>`;
  }
  return `<span class="delta down">▼${Math.abs(delta)}</span>`;
}

/* ---------------- 데이터 로드 ---------------- */
async function getServerData() {
  if (!CONFIG.APPS_SCRIPT_URL) {
    return { penalties: JSON.parse(localStorage.getItem('daejin-rift-penalties') || '{}'), history: null };
  }

  try {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL);
    if (!response.ok) throw new Error('데이터를 불러오지 못했습니다.');
    const data = await response.json();
    return { penalties: data.penalties || {}, history: data.history || null };
  } catch (error) {
    console.warn('공용 저장소 연결 실패: 브라우저 저장값을 사용합니다.', error);
    return { penalties: JSON.parse(localStorage.getItem('daejin-rift-penalties') || '{}'), history: null };
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
  history = server.history;

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
      final: hours - penalty * CLASS_PENALTY,
      avg: hours / group.length
    };
  }).sort((a, b) => b.final - a.final);
}

/* ---------------- 렌더링 ---------------- */
function render() {
  const ranked = rankStudents();
  const penaltyRanked = penaltyStudents();
  const classGroups = groups();

  $('#top3').innerHTML = ranked.slice(0, 3).map((student, index) => {
    const delta = rankDelta(student, index + 1);
    return `
    <article class="top">
      <i>${['♛', '♜', '♞'][index]}</i>
      <h3>${student.name}</h3>
      <span>${student.studentId} · ${tier(student.penalty)[1]}</span>
      <strong>${rankPoint(student)} RP</strong>
      <small>벌점 ${student.penalty}점 ${deltaHtml(delta)}</small>
      ${gaugeHtml(student, 'sm')}
    </article>`;
  }).join('');

  $('#rankingBody').innerHTML = ranked.map((student, index) => {
    const delta = rankDelta(student, index + 1);
    return `
    <tr class="${student.penalty >= 11 ? 'expelled' : ''}">
      <td>#${index + 1}</td>
      <td>${deltaHtml(delta)}</td>
      <td>${student.studentId}</td><td><b>${student.name}</b></td>
      <td>2학년 ${student.class}반</td><td>${student.hours}h</td>
      <td class="danger">${student.penalty}점</td><td>${rankPoint(student)} RP</td>
      <td class="tier">${tier(student.penalty)[1]}${student.penalty >= 11 ? ' · 퇴출' : ''}${gaugeHtml(student, 'xs')}</td>
    </tr>`;
  }).join('');

  $('#penaltyRankingBody').innerHTML = penaltyRanked.map((student, index) => `
    <tr class="${student.penalty >= 11 ? 'expelled' : ''}">
      <td>#${index + 1}</td><td>${student.studentId}</td><td><b>${student.name}</b></td>
      <td>2학년 ${student.class}반</td><td class="danger">${student.penalty}점</td>
      <td>${student.penalty >= 11 ? '퇴출' : tier(student.penalty)[2]}</td>
    </tr>
  `).join('');

  const maxFinal = Math.max(...classGroups.map(group => group.final), 1);

  $('#classCards').innerHTML = classGroups.map((group, index) => {
    const power = Math.max(6, Math.round((group.final / maxFinal) * 100));
    const selected = battleSelection.includes(group.class) ? ' selected' : '';
    return `
    <button class="class${selected}" data-class="${group.class}">
      <p>🏰 ${index + 1}위 · 2학년 ${group.class}반</p>
      <strong>${group.final.toFixed(1)} RP</strong>
      <p>총 ${group.hours}h · 평균 ${group.avg.toFixed(1)}h</p>
      <small>반 벌점 ${group.penalty}점 · -${(group.penalty * CLASS_PENALTY).toFixed(1)}h</small>
      <div class="nexus-mini"><div class="nexus-mini-fill" style="width:${power}%"></div></div>
    </button>`;
  }).join('');

  document.querySelectorAll('.class').forEach(card => {
    card.onclick = () => handleClassClick(Number(card.dataset.class));
  });
}

function handleClassClick(classNumber) {
  if (!battleMode) {
    showClass(classNumber);
    return;
  }

  const idx = battleSelection.indexOf(classNumber);
  if (idx > -1) {
    battleSelection.splice(idx, 1);
  } else if (battleSelection.length < 2) {
    battleSelection.push(classNumber);
  } else {
    battleSelection = [classNumber];
  }

  render();

  if (battleSelection.length === 2) {
    showBattle(battleSelection[0], battleSelection[1]);
  } else {
    $('#classBattle').hidden = true;
  }
}

function showClass(classNumber) {
  const classStudents = rankStudents().filter(student => student.class === classNumber);
  const classRank = groups().findIndex(group => group.class === classNumber) + 1;

  $('#classDetail').hidden = false;
  $('#classBattle').hidden = true;
  $('#classDetail').innerHTML = `<h3>🏰 2학년 ${classNumber}반 · ${classRank}위</h3><ol>${classStudents.map((student, index) => `
    <li>#${index + 1} <b>${student.studentId} ${student.name}</b><span>${rankPoint(student)} RP · ${tier(student.penalty)[1]} · 벌점 ${student.penalty}</span></li>
  `).join('')}</ol>`;
}

/* ---------------- 넥서스 대결 ---------------- */
function showBattle(classA, classB) {
  const classGroups = groups();
  const a = classGroups.find(group => group.class === classA);
  const b = classGroups.find(group => group.class === classB);
  if (!a || !b) return;

  const offset = Math.min(a.final, b.final) < 0 ? Math.abs(Math.min(a.final, b.final)) + 1 : 0;
  const scoreA = a.final + offset;
  const scoreB = b.final + offset;
  const total = scoreA + scoreB || 1;
  const pctA = Math.max(6, Math.round((scoreA / total) * 100));
  const pctB = 100 - pctA;
  const winner = a.final === b.final ? null : (a.final > b.final ? a : b);

  $('#classDetail').hidden = true;
  const panel = $('#classBattle');
  panel.hidden = false;
  panel.innerHTML = `
    <h3>⚔️ 넥서스 대결 · 2학년 ${a.class}반 VS 2학년 ${b.class}반</h3>
    <div class="battle-row">
      <div class="battle-side ${winner === a ? 'win' : winner ? 'lose' : ''}">
        <p>2학년 ${a.class}반</p><strong>${a.final.toFixed(1)} RP</strong>
      </div>
      <div class="battle-vs">VS</div>
      <div class="battle-side ${winner === b ? 'win' : winner ? 'lose' : ''}">
        <p>2학년 ${b.class}반</p><strong>${b.final.toFixed(1)} RP</strong>
      </div>
    </div>
    <div class="nexus-bar">
      <div class="nexus-fill left" style="width:${pctA}%"></div>
      <div class="nexus-fill right" style="width:${pctB}%"></div>
    </div>
    <p class="battle-result">${winner ? `🏆 2학년 ${winner.class}반의 넥서스가 파괴되지 않았습니다! 승리!` : '무승부 · 두 반의 넥서스가 팽팽합니다.'}</p>
    <button id="resetBattle" class="ghost">다시 선택</button>
  `;

  // 애니메이션 트리거 (다음 프레임에 0% → 목표%로 채워지도록)
  const fills = panel.querySelectorAll('.nexus-fill');
  fills.forEach(fill => { fill.style.width = '0%'; });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fills[0].style.width = pctA + '%';
    fills[1].style.width = pctB + '%';
  }));

  $('#resetBattle').onclick = () => {
    battleSelection = [];
    panel.hidden = true;
    render();
  };
}

/* ---------------- 소환사 카드 공유 ---------------- */
function drawSummonerCard(student) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 405;
  const ctx = canvas.getContext('2d');
  const studentTier = tier(student.penalty);

  const bg = ctx.createLinearGradient(0, 0, 720, 405);
  bg.addColorStop(0, '#0a1120');
  bg.addColorStop(1, '#161f36');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 720, 405);

  ctx.strokeStyle = '#e8c574';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, 692, 377);

  ctx.fillStyle = '#e8c574';
  ctx.font = '700 16px sans-serif';
  ctx.fillText('DAEJIN RIFT · SEASON 2026', 40, 56);

  ctx.fillStyle = '#f4f6ff';
  ctx.font = '900 46px sans-serif';
  ctx.fillText(student.name, 40, 130);

  ctx.fillStyle = '#93a1c2';
  ctx.font = '600 16px sans-serif';
  ctx.fillText(`${student.studentId} · 2학년 ${student.class}반`, 40, 162);

  ctx.fillStyle = '#e8c574';
  ctx.font = '900 30px sans-serif';
  ctx.fillText(studentTier[1].toUpperCase(), 40, 220);

  ctx.fillStyle = '#f4f6ff';
  ctx.font = '700 18px sans-serif';
  ctx.fillText(`${rankPoint(student)} RP`, 40, 255);

  const ranked = rankStudents();
  const rankPos = ranked.indexOf(student) + 1;
  const stats = [
    [`자습 시간`, `${student.hours}h`],
    [`벌점`, `${student.penalty}점`],
    [`학교 순위`, `${rankPos}위 / ${ranked.length}명`]
  ];
  stats.forEach(([label, value], i) => {
    const y = 300 + i * 32;
    ctx.fillStyle = '#93a1c2';
    ctx.font = '600 14px sans-serif';
    ctx.fillText(label, 40, y);
    ctx.fillStyle = '#f4f6ff';
    ctx.font = '700 14px sans-serif';
    ctx.fillText(value, 200, y);
  });

  return canvas;
}

async function shareSummonerCard(student) {
  const canvas = drawSummonerCard(student);

  canvas.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], `소환사카드_${student.studentId}.png`, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '나의 소환사 카드', text: `${student.name}의 대진고의 협곡 카드` });
        return;
      } catch (error) {
        // 공유 취소/실패 시 다운로드로 대체
      }
    }

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `소환사카드_${student.studentId}.png`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, 'image/png');
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

  const studentTier = tier(student.penalty);
  const classRank = classGroups.findIndex(group => group.class === student.class) + 1;
  const rankPos = ranked.indexOf(student) + 1;
  const delta = rankDelta(student, rankPos);

  $('#searchResult').innerHTML = `
    ${gaugeHtml(student, 'lg')}
    <div class="result">${[
      ['소환사', student.name],
      ['학번', student.studentId],
      ['소속', `2학년 ${student.class}반`],
      ['자습시간', `${student.hours}h`],
      ['벌점', `${student.penalty}점`],
      ['랭크 점수', `${rankPoint(student)} RP`],
      ['개인 티어', studentTier[1]],
      ['학교 순위', `${rankPos}위 ${deltaHtml(delta)}`],
      ['반 순위', `${classRank}위`],
      ['상태', studentTier[2]]
    ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')}</div>
    <button id="shareCardBtn" class="ghost">🎴 소환사 카드 저장/공유</button>
  `;

  $('#shareCardBtn').onclick = () => shareSummonerCard(student);
};

/* ---------------- 관리자 ---------------- */
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

async function saveSnapshotNow() {
  if (!CONFIG.APPS_SCRIPT_URL) throw new Error('Apps Script 연결이 설정되어 있지 않습니다.');
  const form = new URLSearchParams();
  form.append('action', 'snapshot');
  const response = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body: form });
  if (!response.ok) throw new Error('스냅샷 저장에 실패했습니다.');
  alert('오늘자 순위 스냅샷이 저장되었습니다. 내일부터 순위 변동이 표시됩니다.');
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
  $('#saveSnapshot').onclick = () => admin && saveSnapshotNow().catch(error => alert(error.message));
  $('#sheetLink').href = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit`;

  $('#battleModeToggle').onclick = () => {
    battleMode = !battleMode;
    battleSelection = [];
    $('#classBattle').hidden = true;
    $('#battleModeToggle').classList.toggle('active', battleMode);
    $('#battleModeToggle').textContent = battleMode ? '⚔️ 대결 모드 ON (카드 2개 선택)' : '⚔️ 넥서스 대결 모드';
    render();
  };
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
