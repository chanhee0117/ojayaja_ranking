const tiers = [
  { key: "challenger", name: "Challenger", label: "무벌점 천상계", min: 0, max: 0, colors: ["#fff1b8", "#d7a634", "#5f4314"] },
  { key: "diamond", name: "Diamond", label: "주의 구간", min: 1, max: 2, colors: ["#8ff3ff", "#3aa7c5", "#143e5b"] },
  { key: "platinum", name: "Platinum", label: "관리 필요", min: 3, max: 4, colors: ["#9af7d5", "#2d9f91", "#164b4e"] },
  { key: "gold", name: "Gold", label: "강등권", min: 5, max: 6, colors: ["#f3cf6a", "#bf8430", "#5b3916"] },
  { key: "silver", name: "Silver", label: "면담 추천", min: 7, max: 8, colors: ["#d8e1e8", "#8796a4", "#3d4653"] },
  { key: "bronze", name: "Bronze", label: "퇴출 위기", min: 9, max: 10, colors: ["#d39463", "#935730", "#3e2618"] },
  { key: "iron", name: "Iron", label: "퇴출", min: 11, max: Infinity, colors: ["#8b939c", "#4e5968", "#202732"] },
];

const ROSTER_VERSION = "grade2-2026-07-23";
const ADMIN_PASSWORD = "daejin1234";

const champions = [
  { name: "Garen", ko: "가렌", className: "champ-garen" },
  { name: "Lux", ko: "럭스", className: "champ-lux" },
  { name: "Ahri", ko: "아리", className: "champ-ahri" },
  { name: "Yasuo", ko: "야스오", className: "champ-yasuo" },
  { name: "Ezreal", ko: "이즈리얼", className: "champ-ezreal" },
  { name: "Jinx", ko: "징크스", className: "champ-jinx" },
  { name: "Akali", ko: "아칼리", className: "champ-akali" },
  { name: "Leona", ko: "레오나", className: "champ-leona" },
  { name: "Thresh", ko: "쓰레쉬", className: "champ-thresh" },
  { name: "Ashe", ko: "애쉬", className: "champ-ashe" },
  { name: "Darius", ko: "다리우스", className: "champ-darius" },
  { name: "Seraphine", ko: "세라핀", className: "champ-seraphine" },
];

const rosterSource = `
1 1 강민준
1 2 강보민
1 3 강상훈
1 4 고나연
1 5 권도연
1 6 권민서
1 7 김규민
1 8 김나경
1 9 김다현
1 10 김대규
1 11 김도영
1 12 김도훈
1 13 김태민
1 14 류소현
1 15 박도현
1 16 배세현
1 17 손현지
1 19 양진영
1 20 여승후
1 21 이가원
1 22 이한빛
1 23 정다빈
1 24 정혜원
1 25 조세은
1 26 최연서
1 27 최예원
1 28 한나경
1 29 홍지안
1 30 황시현
1 31 노채원
2 1 강지민
2 2 김기령
2 3 김나현
2 4 김민식
2 5 김상찬
2 6 김수민
2 7 김지원
2 8 문채원
2 9 박가윤
2 10 박태헌
2 11 배연빈
2 12 백민소
2 13 신유주
2 14 심민준
2 15 안정완
2 16 이가연
2 17 이다은
2 18 이도건
2 19 이지훈
2 20 이채은
2 21 장윤서
2 22 정세현
2 23 조민재
2 24 조영빈
2 25 지은수
2 26 최나은
2 27 최민준
2 28 최정후
2 29 홍성민
2 30 홍지욱
3 1 권민서
3 2 김다희
3 3 김민준
3 4 김세현
3 5 김희조
3 6 남예빈
3 7 노하윤
3 8 문광희
3 9 문다은
3 10 박관우
3 11 박서현
3 12 박소현
3 13 박지태
3 14 서소연
3 15 손기범
3 16 손민재
3 17 송근혁
3 18 안겸서
3 19 이다은
3 20 이승우
3 21 이재백
3 22 이재용
3 23 이재환
3 24 장우영
3 25 장혜성
3 26 조도영
3 27 조현승
3 28 최라록
3 29 최연이
3 30 황태영
4 1 김고운
4 2 김나현
4 3 김도영
4 4 김동건
4 5 김민송
4 6 김시헌
4 7 김아람
4 8 도경민
4 9 박서현
4 10 박예진
4 11 서주희
4 12 송서연
4 13 윤수빈
4 14 윤예빈
4 15 이나은
4 16 이도건
4 17 이솔지
4 18 이수민
4 19 이예지
4 20 이유정
4 21 이재민
4 22 이정민
4 23 이지안
4 24 정상희
4 25 정윤서
4 26 조예진
4 27 진재경
4 28 최진석
4 29 하이안
4 30 현지혜
4 31 노영채
5 1 고나경
5 2 곽은서
5 3 권민서
5 4 권준혁
5 5 김나현
5 6 김도현
5 7 김동윤
5 8 김시우
5 9 김지유
5 10 남서윤
5 11 노태완
5 12 박서현
5 13 박소현
5 14 박예빈
5 15 박주연
5 16 박지훈
5 17 배수빈
5 18 심효은
5 19 이민재
5 20 이세진
5 21 이승준
5 22 이시열
5 23 이장호
5 24 이지원
5 25 임승혁
5 26 정지훈
5 27 정해린
5 28 지윤정
5 29 차유나
5 30 최은우
5 31 허유은
6 1 강명승
6 2 기나형
6 3 김민송
6 4 김수민
6 5 김수연
6 6 김종윤
6 7 김채은
6 8 노우진
6 9 박도훈
6 10 박수빈
6 11 박초연
6 12 박효빈
6 13 소은찬
6 14 손윤진
6 15 오지현
6 16 윤진성
6 17 이민서
6 18 이승민
6 19 이채영
6 20 이현우
6 21 전윤성
6 22 전찬우
6 23 정호윤
6 24 조승빈
6 25 최지호
6 26 최찬희
6 27 하지윤
6 28 허수인
6 29 허준현
7 1 강주홍
7 2 구자현
7 3 권연진
7 4 김나현
7 5 김도연
7 6 김민준
7 7 김윤주
7 8 김채현
7 9 나윤아
7 10 박시현
7 11 서용규
7 12 송지민
7 13 신기욱
7 14 염승혜
7 15 우연우
7 16 윤현우
7 17 이서경
7 18 이유주
7 19 이준희
7 20 이지민
7 21 임재민
7 22 장수민
7 23 전민교
7 24 전영찬
7 25 정성엽
7 26 정아린
7 27 조서준
7 28 조향희
7 29 진이주
7 30 한지형
7 31 홍지원
`;
const state = loadState();
let selectedPoints = 1;
let adminMode = sessionStorage.getItem("night-study-admin") === "true";
let focusedStudentId = "";

const rankingList = document.querySelector("#ranking-list");
const leaderCard = document.querySelector("#leader-card");
const myRankCard = document.querySelector("#my-rank-card");
const activeCount = document.querySelector("#active-count");
const penaltyStudent = document.querySelector("#penalty-student");
const tierGuide = document.querySelector("#tier-guide");
const historyList = document.querySelector("#history-list");
const championSelect = document.querySelector("#champion-select");
const crestTemplate = document.querySelector("#crest-template");
const adminLogin = document.querySelector("#admin-login");
const adminTools = document.querySelector("#admin-tools");
const adminActions = document.querySelector("#admin-actions");
const loginMessage = document.querySelector("#login-message");

document.querySelector("#student-form").addEventListener("submit", addStudent);
document.querySelector("#penalty-form").addEventListener("submit", addPenalty);
document.querySelector("#admin-form").addEventListener("submit", unlockAdmin);
document.querySelector("#admin-logout").addEventListener("click", lockAdmin);
document.querySelector("#finder-form").addEventListener("submit", findStudent);
document.querySelector("#reset-roster").addEventListener("click", resetRoster);
document.querySelector("#clear-history").addEventListener("click", clearHistory);

document.querySelectorAll(".quick-points button").forEach((button) => {
  button.addEventListener("click", () => {
    selectedPoints = Number(button.dataset.points);
    document.querySelectorAll(".quick-points button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

document.querySelector('.quick-points button[data-points="1"]').classList.add("active");
render();

function loadState() {
  const saved = localStorage.getItem("night-study-ladder");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.version === ROSTER_VERSION) {
        parsed.history = (parsed.history ?? []).filter((item) => item.reason !== "소명 인정");
        parsed.students = (parsed.students ?? []).map(hydrateSavedStudent);
        return parsed;
      }
    } catch {
      localStorage.removeItem("night-study-ladder");
    }
  }

  return {
    version: ROSTER_VERSION,
    students: createRoster(),
    history: [],
  };
}

function saveState() {
  state.version = ROSTER_VERSION;
  localStorage.setItem("night-study-ladder", JSON.stringify(state));
}

function createRoster() {
  return rosterSource
    .trim()
    .split("\n")
    .map((line, index) => {
      const [room, number, name] = line.trim().split(/\s+/);
      return {
        id: `grade2-${room}-${number}-${index}`,
        name,
        group: `2-${room} · ${number}번`,
        room,
        number,
        championIndex: index % champions.length,
        points: 0,
      };
    });
}

function hydrateSavedStudent(student, index) {
  return {
    ...student,
    championIndex: Number.isInteger(student.championIndex) ? student.championIndex : index % champions.length,
    points: Number(student.points) || 0,
  };
}

function getTier(points) {
  return tiers.find((tier) => points >= tier.min && points <= tier.max) ?? tiers[tiers.length - 1];
}

function getProgress(points) {
  return `${Math.min(100, Math.round((points / 11) * 100))}%`;
}

function crestFor(tier) {
  const crest = crestTemplate.content.firstElementChild.cloneNode(true);
  const wrap = document.createElement("span");
  wrap.className = `crest crest-${tier.key}`;
  wrap.style.setProperty("--tier-light", tier.colors[0]);
  wrap.style.setProperty("--tier-mid", tier.colors[1]);
  wrap.style.setProperty("--tier-dark", tier.colors[2]);
  wrap.append(crest);
  return wrap;
}

function getChampion(student) {
  return champions[(student.championIndex ?? 0) % champions.length];
}

function championPortrait(student, size = "regular") {
  const champion = getChampion(student);
  const portrait = document.createElement("span");
  portrait.className = `champion-token ${champion.className} ${size}`;
  portrait.setAttribute("title", `${champion.ko} 컨셉`);
  portrait.innerHTML = `<span></span><em>${champion.name.slice(0, 2).toUpperCase()}</em>`;
  return portrait;
}

function rankStudents() {
  return [...state.students].sort(
    (a, b) =>
      b.points - a.points ||
      Number(a.room ?? 99) - Number(b.room ?? 99) ||
      Number(a.number ?? 99) - Number(b.number ?? 99) ||
      a.name.localeCompare(b.name, "ko")
  );
}

function render() {
  const ranked = rankStudents();
  renderChampionSelect();
  renderLeader(ranked[0]);
  renderRanking(ranked);
  renderMyRank(ranked);
  renderSelect(ranked);
  renderTiers();
  renderHistory();
  renderAdminMode();
  activeCount.textContent = `${state.students.filter((student) => student.points < 11).length}명 생존`;
  saveState();
}

function renderLeader(student) {
  leaderCard.innerHTML = "";

  if (!student) {
    leaderCard.className = "leader-card empty-state";
    leaderCard.textContent = "아직 등록된 학생이 없습니다.";
    return;
  }

  leaderCard.className = "leader-card";
  const tier = getTier(student.points);
  const meta = document.createElement("div");
  meta.innerHTML = `
    <p class="eyebrow">Current Most Wanted</p>
    <div class="leader-name">${escapeHtml(student.name)}</div>
    <div class="leader-meta">
      <span class="pill">${escapeHtml(student.group || "미지정")}</span>
      <span class="pill">${tier.name}</span>
      <span class="pill">${getChampion(student).ko} 컨셉</span>
      <span class="${student.points >= 11 ? "expelled" : ""}">${tier.label}</span>
    </div>
  `;

  const score = document.createElement("div");
  score.className = "leader-score";
  score.innerHTML = `<strong>${student.points}</strong><span>Penalty LP</span>`;

  const leaderVisual = document.createElement("div");
  leaderVisual.className = "leader-visual";
  leaderVisual.append(crestFor(tier), championPortrait(student, "hero"));

  leaderCard.append(leaderVisual, meta, score);
}

function renderRanking(ranked) {
  rankingList.innerHTML = "";

  if (ranked.length === 0) {
    rankingList.innerHTML = '<li class="empty-state">등록 후 벌점을 기록하면 순위가 나타납니다.</li>';
    return;
  }

  ranked.forEach((student, index) => {
    const tier = getTier(student.points);
    const row = document.createElement("li");
    row.className = `rank-row${student.id === focusedStudentId ? " is-focused" : ""}`;
    row.innerHTML = `
      <span class="rank-number">#${index + 1}</span>
      <div class="student-info">
        <div class="student-name">
          <span>${escapeHtml(student.name)}</span>
          <span class="pill">${tier.name}</span>
        </div>
        <div class="student-sub">${escapeHtml(student.group || "미지정")} · ${tier.label}</div>
      </div>
      <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="--progress:${getProgress(student.points)}"></div></div>
      <div class="score-box">${student.points}<span>LP</span></div>
    `;
    row.insertBefore(championPortrait(student), row.children[1]);
    row.insertBefore(crestFor(tier), row.children[2]);
    rankingList.append(row);
  });
}

function renderMyRank(ranked) {
  myRankCard.innerHTML = "";

  if (!focusedStudentId) {
    myRankCard.className = "my-rank-card";
    myRankCard.innerHTML = `
      <strong>내 랭킹을 검색하면 현재 순위와 강등 상태가 표시됩니다.</strong>
      <span>친구들 현황은 아래 순위표에서 바로 확인할 수 있습니다.</span>
    `;
    return;
  }

  const index = ranked.findIndex((student) => student.id === focusedStudentId);
  const student = ranked[index];
  if (!student) return;

  const tier = getTier(student.points);
  myRankCard.className = "my-rank-card found";
  myRankCard.append(crestFor(tier));
  myRankCard.append(championPortrait(student));
  const detail = document.createElement("div");
  detail.innerHTML = `
    <p class="eyebrow">Your Rank</p>
    <strong>#${index + 1} ${escapeHtml(student.name)}</strong>
    <span>${escapeHtml(student.group || "미지정")} · ${tier.name} · ${getChampion(student).ko} 컨셉 · ${student.points} LP</span>
  `;
  myRankCard.append(detail);
}

function renderChampionSelect() {
  championSelect.innerHTML = "";
  champions.forEach((champion) => {
    const card = document.createElement("span");
    card.className = `champion-card ${champion.className}`;
    card.innerHTML = `<span></span><strong>${champion.ko}</strong>`;
    championSelect.append(card);
  });
}

function renderSelect(ranked) {
  penaltyStudent.innerHTML = "";
  ranked.forEach((student) => {
    const option = document.createElement("option");
    option.value = student.id;
    option.textContent = `${student.name} · ${student.group} (${student.points}점)`;
    penaltyStudent.append(option);
  });

  if (ranked.length === 0) {
    const option = document.createElement("option");
    option.textContent = "등록된 학생 없음";
    penaltyStudent.append(option);
  }
}

function renderTiers() {
  tierGuide.innerHTML = "";
  tiers.forEach((tier) => {
    const range = tier.max === Infinity ? `${tier.min}+` : tier.min === tier.max ? `${tier.min}` : `${tier.min}-${tier.max}`;
    const item = document.createElement("div");
    item.className = "tier-item";
    item.style.setProperty("--tier-light", tier.colors[0]);
    item.style.setProperty("--tier-mid", tier.colors[1]);
    item.innerHTML = `
      <strong>${tier.name}</strong>
      <span>${range}점</span>
    `;
    item.prepend(crestFor(tier));
    tierGuide.append(item);
  });
}

function renderHistory() {
  historyList.innerHTML = "";

  if (state.history.length === 0) {
    historyList.innerHTML = '<li class="empty-state">아직 기록이 없습니다.</li>';
    return;
  }

  state.history.slice(0, 8).forEach((item) => {
    const row = document.createElement("li");
    row.className = "history-item";
    const sign = item.points > 0 ? "+" : "";
    row.innerHTML = `
      <strong>${escapeHtml(item.name)} ${sign}${item.points} LP</strong>
      <p>${escapeHtml(item.reason)} · ${escapeHtml(item.time)}</p>
    `;
    historyList.append(row);
  });
}

function addStudent(event) {
  event.preventDefault();
  const nameInput = document.querySelector("#student-name");
  const classInput = document.querySelector("#student-class");
  const name = nameInput.value.trim();

  if (!name) return;

  state.students.push({
    id: createId(),
    name,
    group: classInput.value.trim(),
    championIndex: state.students.length % champions.length,
    points: 0,
  });

  focusedStudentId = state.students[state.students.length - 1].id;
  nameInput.value = "";
  classInput.value = "";
  render();
}

function addPenalty(event) {
  event.preventDefault();
  const student = state.students.find((item) => item.id === penaltyStudent.value);
  if (!student) return;

  const nextPoints = Math.max(0, student.points + selectedPoints);
  const reason = document.querySelector("#penalty-reason").value;
  student.points = nextPoints;

  state.history.unshift({
    name: student.name,
    points: selectedPoints,
    reason,
    time: new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).format(new Date()),
  });

  render();
}

function resetRoster() {
  localStorage.removeItem("night-study-ladder");
  state.version = ROSTER_VERSION;
  state.students = createRoster();
  state.history = [];
  focusedStudentId = "";
  render();
}

function clearHistory() {
  state.history = [];
  render();
}

function findStudent(event) {
  event.preventDefault();
  const keyword = document.querySelector("#finder-name").value.trim();
  const ranked = rankStudents();
  const found = ranked.find(
    (student) =>
      student.name === keyword ||
      `${student.group} ${student.name}`.includes(keyword) ||
      (keyword.length >= 2 && student.name.includes(keyword))
  );

  focusedStudentId = keyword && found ? found.id : "";
  render();
}

function unlockAdmin(event) {
  event.preventDefault();
  const password = document.querySelector("#admin-password").value;

  if (password !== ADMIN_PASSWORD) {
    loginMessage.textContent = "비밀번호가 맞지 않습니다.";
    return;
  }

  adminMode = true;
  sessionStorage.setItem("night-study-admin", "true");
  document.querySelector("#admin-password").value = "";
  loginMessage.textContent = "";
  render();
}

function lockAdmin() {
  adminMode = false;
  sessionStorage.removeItem("night-study-admin");
  render();
}

function renderAdminMode() {
  adminLogin.hidden = adminMode;
  adminTools.hidden = !adminMode;
  adminActions.hidden = !adminMode;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `student-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
