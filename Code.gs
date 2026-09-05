/**
 * DAEJIN 자습 벌점 전용 Apps Script
 *
 * 사용하는 열
 * A열: 반 / B열: 번호 / C열: 이름 / D열: 자습 총시수 / E열: 벌점
 * 1행: 제목 / 2행부터: 학생 명단
 * D열 총시수는 30분 단위이므로 사이트에는 2로 나눈 시간으로 표시합니다.
 *
 * 이 코드는 시트의 열·행·제목·서식을 변경하지 않으며, 벌점 저장 시 해당 학생의 E열 값만 수정합니다.
 * 최근 벌점 30건은 사이트 표시용으로 Script Properties에만 보관합니다.
 */
const SETTINGS = Object.freeze({
  SHEET_ID: '1tG8sd7XMOgkechtCgQOz9ROHF3jCcIe1tQcLOgWFbyg',
  SHEET_GID: 1239065071,
  AUTHORIZED_EDITOR: '202620626@dj.hs.kr',
  API_VERSION: 'v44-secure-pwa',
  VIEWER_PASSWORD_PROPERTY: 'VIEWER_PASSWORD',
  ADMIN_PASSWORD_PROPERTY: 'ADMIN_PASSWORD',
  PENALTY_HEADER_ROW: 1,
  DATA_START_ROW: 2,
  CLASS_COLUMN: 1,
  NUMBER_COLUMN: 2,
  NAME_COLUMN: 3,
  HOURS_COLUMN: 4,
  HOURS_DIVISOR: 2,
  PENALTY_COLUMN: 5,
  RECENT_PROPERTY: 'DAEJIN_RECENT_PENALTIES',
  MAX_RECENT: 30,
  RECENT_RETENTION_MS: 3 * 24 * 60 * 60 * 1000
});

function doGet() {
  try {
    requireAuthorizedDeployer_();
    return jsonResponse_({
      apiVersion: SETTINGS.API_VERSION,
      ok: true,
      message: '보호된 API가 정상 작동 중입니다.'
    });
  } catch (error) {
    return jsonResponse_({ apiVersion: SETTINGS.API_VERSION, ok: false, message: error.message });
  }
}

function doPost(event) {
  try {
    requireAuthorizedDeployer_();
    const parameters = event && event.parameter ? event.parameter : {};
    if (parameters.apiVersion !== SETTINGS.API_VERSION) throw new Error('사이트와 Apps Script 버전이 일치하지 않습니다.');
    if (parameters.action === 'read') {
      requireViewerPassword_(parameters.accessPassword);
      const sheet = penaltySheet_();
      return jsonResponse_({
        apiVersion: SETTINGS.API_VERSION,
        ok: true,
        sheetName: sheet.getName(),
        sheetGid: sheet.getSheetId(),
        students: readStudents_(sheet),
        recentPenalties: readRecentPenalties_()
      });
    }
    requireAdminPassword_(parameters.adminPassword);
    if (parameters.action === 'verifyAdmin') {
      return jsonResponse_({ apiVersion: SETTINGS.API_VERSION, ok: true });
    }
    if (parameters.action === 'clearRecentPenalties') {
      const clearLock = LockService.getScriptLock();
      clearLock.waitLock(10000);
      try {
        clearRecentPenalties_();
        return jsonResponse_({ apiVersion: SETTINGS.API_VERSION, ok: true, recentPenalties: [] });
      } finally {
        clearLock.releaseLock();
      }
    }
    if (parameters.action !== 'setPenalty') throw new Error('지원하지 않는 요청입니다.');

    const studentId = String(parameters.studentId || '').replace(/\D/g, '');
    const penalty = roundPenalty_(Number(parameters.penalty));
    const addedPenalty = roundPenalty_(Math.max(0, Number(parameters.addedPenalty) || 0));
    const reason = String(parameters.reason || '벌점 부여').trim().slice(0, 300);
    if (!/^2\d{4}$/.test(studentId)) throw new Error('올바른 5자리 학번이 아닙니다.');
    if (!Number.isFinite(penalty) || penalty < 0) throw new Error('벌점은 0 이상의 숫자여야 합니다.');

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const saved = setPenalty_(studentId, penalty);
      const recentPenalty = addedPenalty > 0
        ? addRecentPenalty_(saved, addedPenalty, reason)
        : null;
      return jsonResponse_({ apiVersion: SETTINGS.API_VERSION, ok: true, studentId: studentId, penalty: saved.penalty, recentPenalty: recentPenalty });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonResponse_({ apiVersion: SETTINGS.API_VERSION, ok: false, message: error.message });
  }
}

function requireViewerPassword_(candidate) {
  const properties = PropertiesService.getScriptProperties();
  const viewerPassword = properties.getProperty(SETTINGS.VIEWER_PASSWORD_PROPERTY);
  const adminPassword = properties.getProperty(SETTINGS.ADMIN_PASSWORD_PROPERTY);
  if (!viewerPassword || !adminPassword) {
    throw new Error('Apps Script 속성에 VIEWER_PASSWORD와 ADMIN_PASSWORD를 먼저 설정해 주세요.');
  }
  if (!safeEquals_(candidate, viewerPassword) && !safeEquals_(candidate, adminPassword)) {
    throw new Error('접속 비밀번호가 올바르지 않습니다.');
  }
}

function requireAdminPassword_(candidate) {
  const expected = PropertiesService.getScriptProperties().getProperty(SETTINGS.ADMIN_PASSWORD_PROPERTY);
  if (!expected) throw new Error('Apps Script 속성에 ADMIN_PASSWORD를 먼저 설정해 주세요.');
  if (!safeEquals_(candidate, expected)) throw new Error('관리자 인증에 실패했습니다.');
}

function safeEquals_(left, right) {
  const leftDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(left || ''), Utilities.Charset.UTF_8);
  const rightDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(right || ''), Utilities.Charset.UTF_8);
  let difference = leftDigest.length ^ rightDigest.length;
  for (let index = 0; index < Math.max(leftDigest.length, rightDigest.length); index += 1) {
    difference |= (leftDigest[index] || 0) ^ (rightDigest[index] || 0);
  }
  return difference === 0;
}

function requireAuthorizedDeployer_() {
  const email = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (email !== SETTINGS.AUTHORIZED_EDITOR.toLowerCase()) {
    throw new Error('이 Apps Script는 지정된 학교 계정으로 배포해야 합니다: ' + SETTINGS.AUTHORIZED_EDITOR);
  }
}

function penaltySheet_() {
  const spreadsheet = SpreadsheetApp.openById(SETTINGS.SHEET_ID);
  const configuredSheet = spreadsheet.getSheetById(SETTINGS.SHEET_GID);
  if (configuredSheet && hasExpectedLayout_(configuredSheet)) return configuredSheet;

  const matchingSheets = spreadsheet.getSheets().filter(function(sheet) {
    return hasExpectedLayout_(sheet);
  });
  if (matchingSheets.length === 1) return matchingSheets[0];
  if (matchingSheets.length > 1) {
    throw new Error('같은 열 구조를 가진 시트가 여러 개입니다: ' + matchingSheets.map(function(sheet) { return sheet.getName(); }).join(', '));
  }
  throw new Error('C1 이름, D1 자습 총시수, E1 벌점 구조의 시트를 찾지 못했습니다.');
}

function hasExpectedLayout_(sheet) {
  const headers = sheet.getRange('C1:E1').getDisplayValues()[0].map(function(value) {
    return String(value || '').replace(/\s/g, '');
  });
  return headers[0] === '이름'
    && headers[1].indexOf('자습') !== -1
    && headers[1].indexOf('시수') !== -1
    && isPenaltyHeader_(headers[2]);
}

function readStudents_(targetSheet) {
  const sheet = targetSheet || penaltySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < SETTINGS.DATA_START_ROW) return [];
  verifySheetLayout_(sheet);

  return sheet
    .getRange(SETTINGS.DATA_START_ROW, 1, lastRow - SETTINGS.DATA_START_ROW + 1, SETTINGS.PENALTY_COLUMN)
    .getValues()
    .map(function(row) {
      const classNumber = Number(row[SETTINGS.CLASS_COLUMN - 1]);
      const number = Number(row[SETTINGS.NUMBER_COLUMN - 1]);
      const name = String(row[SETTINGS.NAME_COLUMN - 1] || '').trim();
      if (!Number.isInteger(classNumber) || classNumber < 1 || !Number.isInteger(number) || number < 1 || !name) return null;
      return {
        studentId: studentId_(classNumber, number),
        class: classNumber,
        number: number,
        name: name,
        hours: roundPenalty_(Math.max(0, Number(row[SETTINGS.HOURS_COLUMN - 1]) || 0) / SETTINGS.HOURS_DIVISOR),
        penalty: parsePenaltyValue_(row[SETTINGS.PENALTY_COLUMN - 1])
      };
    })
    .filter(function(student) { return student !== null; });
}

function setPenalty_(studentId, penalty) {
  const sheet = penaltySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < SETTINGS.DATA_START_ROW) throw new Error('학생 데이터가 없습니다.');
  verifySheetLayout_(sheet);

  const rows = sheet
    .getRange(SETTINGS.DATA_START_ROW, 1, lastRow - SETTINGS.DATA_START_ROW + 1, SETTINGS.NAME_COLUMN)
    .getValues();

  for (let index = 0; index < rows.length; index += 1) {
    const classNumber = Number(rows[index][SETTINGS.CLASS_COLUMN - 1]);
    const number = Number(rows[index][SETTINGS.NUMBER_COLUMN - 1]);
    if (studentId_(classNumber, number) !== studentId) continue;

    const sheetRow = SETTINGS.DATA_START_ROW + index;
    const cell = sheet.getRange('E' + sheetRow);
    cell.setValue(penalty);
    SpreadsheetApp.flush();
    return {
      studentId: studentId,
      name: String(rows[index][SETTINGS.NAME_COLUMN - 1] || '').trim(),
      penalty: penalty
    };
  }

  throw new Error('해당 학번을 시트에서 찾을 수 없습니다: ' + studentId);
}

function studentId_(classNumber, number) {
  return '2' + String(classNumber).padStart(2, '0') + String(number).padStart(2, '0');
}

function roundPenalty_(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function parsePenaltyValue_(value) {
  const numeric = typeof value === 'number'
    ? value
    : Number(String(value || '').replace(/[^0-9.+-]/g, ''));
  return roundPenalty_(Math.max(0, Number.isFinite(numeric) ? numeric : 0));
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function readRecentPenalties_() {
  const value = PropertiesService.getScriptProperties().getProperty(SETTINGS.RECENT_PROPERTY);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - SETTINGS.RECENT_RETENTION_MS;
    const recent = parsed
      .filter(function(record) { return recentPenaltyTimestamp_(record) >= cutoff; })
      .slice(0, SETTINGS.MAX_RECENT);
    if (recent.length !== parsed.length) {
      PropertiesService.getScriptProperties().setProperty(SETTINGS.RECENT_PROPERTY, JSON.stringify(recent));
    }
    return recent;
  } catch (error) {
    return [];
  }
}

function recentPenaltyTimestamp_(record) {
  const createdAt = Date.parse(String(record && record.createdAt || ''));
  if (Number.isFinite(createdAt)) return createdAt;

  const match = String(record && record.date || '').match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])).getTime();
}

function addRecentPenalty_(student, points, reason) {
  const now = new Date();
  const record = {
    studentId: student.studentId,
    name: student.name,
    points: points,
    reason: reason || '벌점 부여',
    createdAt: now.toISOString(),
    date: Utilities.formatDate(now, 'Asia/Seoul', 'yyyy. M. d. HH:mm')
  };
  const recent = [record].concat(readRecentPenalties_()).slice(0, SETTINGS.MAX_RECENT);
  PropertiesService.getScriptProperties().setProperty(SETTINGS.RECENT_PROPERTY, JSON.stringify(recent));
  return record;
}

function clearRecentPenalties_() {
  PropertiesService.getScriptProperties().deleteProperty(SETTINGS.RECENT_PROPERTY);
}

/** 시트는 수정하지 않고 현재 E1 제목이 벌점인지 확인만 합니다. */
function setupPenaltyColumn() {
  requireAuthorizedDeployer_();
  const sheet = penaltySheet_();
  requirePenaltyColumn_(sheet);
  return '확인 완료: 시트를 변경하지 않았습니다.';
}

function isPenaltyHeader_(value) {
  const normalized = String(value || '').replace(/\s/g, '');
  return normalized === '벌점' || normalized === '누적벌점';
}

function requirePenaltyColumn_(sheet) {
  if (!isPenaltyHeader_(sheet.getRange(SETTINGS.PENALTY_HEADER_ROW, SETTINGS.PENALTY_COLUMN).getDisplayValue())) {
    throw new Error('E1 셀의 제목이 벌점인지 확인해 주세요. 시트는 자동으로 수정하지 않습니다.');
  }
}

function verifySheetLayout_(sheet) {
  requirePenaltyColumn_(sheet);
  const nameHeader = String(sheet.getRange('C1').getDisplayValue() || '').replace(/\s/g, '');
  const hoursHeader = String(sheet.getRange('D1').getDisplayValue() || '').replace(/\s/g, '');
  if (nameHeader !== '이름') throw new Error('C1 셀의 제목이 이름인지 확인해 주세요.');
  if (hoursHeader.indexOf('자습') === -1 || hoursHeader.indexOf('시수') === -1) {
    throw new Error('D1 셀의 제목이 자습 총시수인지 확인해 주세요.');
  }
}

/** 최초 연결 확인용: 편집 권한과 대상 시트를 확인합니다. */
function verifyConnection() {
  requireAuthorizedDeployer_();
  const sheet = penaltySheet_();
  verifySheetLayout_(sheet);
  return '연결 완료: ' + sheet.getName() + ' (gid ' + sheet.getSheetId() + ') / API ' + SETTINGS.API_VERSION + ' / D열 자습 총시수 읽기 / E열 벌점 쓰기';
}
