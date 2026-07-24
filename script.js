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

const $ = selector => document.querySelector(selector);
const tier = penalty => tiers.find(item => penalty >= item[3] && penalty <= item[4]);
const rankPoint = student => Math.max(0, Math.round(student.hours - student.penalty * PENALTY_PER_HOUR));
const rankStudents = () => [...students].sort((a, b) => rankPoint(b) - rankPoint(a) || a.penalty - b.penalty);
const penaltyStudents = () => [...students].sort((a, b) => b.penalty - a.penalty || a.studentId.localeCompare(b.studentId));

async function getPenalties() {
  if (!CONFIG.APPS_SCRIPT_URL) {
    return JSON.parse(localStorage.getItem('daejin-rift-penalties') || '{}');
  }

  try {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL);
    if (!response.ok) throw new Error('벌점 데이터를 불러오지 못했습니다.');
    return (await response.json()).penalties || {};
  } catch (error) {
    console.warn('공용 벌점 저장소 연결 실패: 브라우저 저장값을 사용합니다.', error);
    return JSON.parse(localStorage.getItem('daejin-rift-penalties') || '{}');
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
  penalties = await getPenalties();

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

function render() {
  const ranked = rankStudents();
  const penaltyRanked = penaltyStudents();
  const classGroups = groups();

  $('#top3').innerHTML = ranked.slice(0, 3).map((student, index) => `
    <article class="top">
      <i>${['♛', '♜', '♞'][index]}</i>
      <h3>${student.name}</h3>
      <span>${student.studentId} · ${tier(student.penalty)[1]}</span>
      <strong>${rankPoint(student)} RP</strong>
      <small>벌점 ${student.penalty}점</small>
    </article>
  `).join('');

  $('#rankingBody').innerHTML = ranked.map((student, index) => `
    <tr class="${student.penalty >= 11 ? 'expelled' : ''}">
      <td>#${index + 1}</td><td>${student.studentId}</td><td><b>${student.name}</b></td>
      <td>2학년 ${student.class}반</td><td>${student.hours}h</td>
      <td class="danger">${student.penalty}점</td><td>${rankPoint(student)} RP</td>
      <td class="tier">${tier(student.penalty)[1]}${student.penalty >= 11 ? ' · 퇴출' : ''}</td>
    </tr>
  `).join('');

  $('#penaltyRankingBody').innerHTML = penaltyRanked.map((student, index) => `
    <tr class="${student.penalty >= 11 ? 'expelled' : ''}">
      <td>#${index + 1}</td><td>${student.studentId}</td><td><b>${student.name}</b></td>
      <td>2학년 ${student.class}반</td><td class="danger">${student.penalty}점</td>
      <td>${student.penalty >= 11 ? '퇴출' : tier(student.penalty)[2]}</td>
    </tr>
  `).join('');

  $('#classCards').innerHTML = classGroups.map((group, index) => `
    <button class="class" data-class="${group.class}">
      <p>🏰 ${index + 1}위 · 2학년 ${group.class}반</p>
      <strong>${group.final.toFixed(1)} RP</strong>
      <p>총 ${group.hours}h · 평균 ${group.avg.toFixed(1)}h</p>
      <small>반 벌점 ${group.penalty}점 · -${(group.penalty * CLASS_PENALTY).toFixed(1)}h</small>
    </button>
  `).join('');

  document.querySelectorAll('.class').forEach(card => {
    card.onclick = () => showClass(Number(card.dataset.class));
  });
}

function showClass(classNumber) {
  const classStudents = rankStudents().filter(student => student.class === classNumber);
  const classRank = groups().findIndex(group => group.class === classNumber) + 1;

  $('#classDetail').hidden = false;
  $('#classDetail').innerHTML = `<h3>🏰 2학년 ${classNumber}반 · ${classRank}위</h3><ol>${classStudents.map((student, index) => `
    <li>#${index + 1} <b>${student.studentId} ${student.name}</b><span>${rankPoint(student)} RP · ${tier(student.penalty)[1]} · 벌점 ${student.penalty}</span></li>
  `).join('')}</ol>`;
}

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
  $('#searchResult').innerHTML = `<div class="result">${[
    ['소환사', student.name],
    ['학번', student.studentId],
    ['소속', `2학년 ${student.class}반`],
    ['자습시간', `${student.hours}h`],
    ['벌점', `${student.penalty}점`],
    ['랭크 점수', `${rankPoint(student)} RP`],
    ['개인 티어', studentTier[1]],
    ['학교 순위', `${ranked.indexOf(student) + 1}위`],
    ['반 순위', `${classRank}위`],
    ['상태', studentTier[2]]
  ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')}</div>`;
};

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
