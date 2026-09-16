/**
 * DAEJIN 자습 벌점 전용 Apps Script
 *
 * 사용하는 열
 * A열: 반 / B열: 번호 / C열: 이름 / D열: 자습 총시수 / E열: 벌점
 * 1행: 제목 / 2행부터: 학생 명단
 * D열 총시수는 스프레드시트의 값을 그대로 사이트에 표시합니다.
 *
 * 이 코드는 시트의 열·행·제목·서식을 변경하지 않으며, 벌점 저장 시 해당 학생의 E열 값만 수정합니다.
 * 최근 벌점 30건은 사이트 표시용으로 Script Properties에만 보관합니다.
 */
const SETTINGS = Object.freeze({
  SHEET_ID: '1tG8sd7XMOgkechtCgQOz9ROHF3jCcIe1tQcLOgWFbyg',
  SHEET_NAME: '2학기 자습 총시수',
  SHEET_GID: 890818435,
  AUTHORIZED_EDITOR: '202620626@dj.hs.kr',
  API_VERSION: 'v44-secure-pwa',
  ADMIN_PASSWORD_PROPERTY: 'ADMIN_PASSWORD',
  ADMIN_AUTH_GUARD_PREFIX: 'DAEJIN_ADMIN_GUARD_',
  ADMIN_LOCK_MS: 60 * 60 * 1000,
  ADMIN_NEAR_FAILURE_LIMIT: 3,
  // 시범 운영: 2학년 6반만 공개. 정식 운영 때 []로 바꾸면 전 학급이 표시됩니다.
  VISIBLE_CLASSES: [6],
  PENALTY_HEADER_ROW: 1,
  DATA_START_ROW: 2,
  CLASS_COLUMN: 1,
  NUMBER_COLUMN: 2,
  NAME_COLUMN: 3,
  HOURS_COLUMN: 4,
  HOURS_DIVISOR: 1,
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
      const sheet = penaltySheet_();
      return jsonResponse_({
        apiVersion: SETTINGS.API_VERSION,
        ok: true,
        sheetName: sheet.getName(),
        sheetGid: sheet.getSheetId(),
        students: readStudents_(sheet),
        recentPenalties: readRecentPenalties_().filter(function(record) {
          return isVisibleStudentId_(record && record.studentId);
        })
      });
    }
    if (parameters.action === 'verifyAdmin') {
      const authentication = verifyAdminAttempt_(parameters.adminPassword, parameters.clientToken);
      authentication.apiVersion = SETTINGS.API_VERSION;
      return jsonResponse_(authentication);
    }
    requireAdminPassword_(parameters.adminPassword);
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
    if (!isVisibleStudentId_(studentId)) throw new Error('현재 시범 운영 대상 학급의 학생이 아닙니다.');
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

function requireAdminPassword_(candidate) {
  const expected = PropertiesService.getScriptProperties().getProperty(SETTINGS.ADMIN_PASSWORD_PROPERTY);
  if (!expected) throw new Error('Apps Script 속성에 ADMIN_PASSWORD를 먼저 설정해 주세요.');
  if (!safeEquals_(candidate, expected)) throw new Error('관리자 인증에 실패했습니다.');
}

function verifyAdminAttempt_(candidate, clientToken) {
  const expected = PropertiesService.getScriptProperties().getProperty(SETTINGS.ADMIN_PASSWORD_PROPERTY);
  if (!expected) throw new Error('Apps Script 속성에 ADMIN_PASSWORD를 먼저 설정해 주세요.');

  const token = String(clientToken || '').trim();
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    return { ok: false, message: '보안 식별 정보를 확인하지 못했습니다. 페이지를 새로고침해 주세요.' };
  }

  const now = Date.now();
  const cache = CacheService.getScriptCache();
  const guardKey = adminGuardKey_(token);
  const scriptLock = LockService.getScriptLock();
  scriptLock.waitLock(10000);
  try {
    let guard = {};
    try {
      guard = JSON.parse(cache.get(guardKey) || '{}');
    } catch (ignored) {
      guard = {};
    }

    if (Number(guard.lockUntil) > now) {
      return {
        ok: false,
        securityLocked: true,
        lockUntil: Number(guard.lockUntil),
        message: '보안상 관리자 접근이 잠겼습니다.'
      };
    }

    if (safeEquals_(candidate, expected)) {
      cache.remove(guardKey);
      return { ok: true };
    }

    const recentWindow = now - Number(guard.lastFailedAt || 0) < 10 * 60 * 1000;
    const previousFailures = recentWindow ? Number(guard.failures || 0) : 0;
    const nearTypo = isNearPasswordTypo_(String(candidate || ''), expected);
    const failures = previousFailures + (nearTypo ? 1 : SETTINGS.ADMIN_NEAR_FAILURE_LIMIT);
    const securityLocked = !nearTypo || failures >= SETTINGS.ADMIN_NEAR_FAILURE_LIMIT;
    const lockUntil = securityLocked ? now + SETTINGS.ADMIN_LOCK_MS : 0;
    cache.put(guardKey, JSON.stringify({
      failures: failures,
      lastFailedAt: now,
      lockUntil: lockUntil
    }), Math.ceil(SETTINGS.ADMIN_LOCK_MS / 1000));

    return {
      ok: false,
      securityLocked: securityLocked,
      lockUntil: lockUntil || undefined,
      message: securityLocked
        ? '허가되지 않은 관리자 접근 시도가 감지되어 로그인이 잠겼습니다.'
        : '관리자 인증에 실패했습니다. 비밀번호를 다시 확인해 주세요.'
    };
  } finally {
    scriptLock.releaseLock();
  }
}

function adminGuardKey_(clientToken) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    clientToken,
    Utilities.Charset.UTF_8
  );
  const hex = digest.map(function(value) {
    return ('0' + ((value + 256) % 256).toString(16)).slice(-2);
  }).join('');
  return SETTINGS.ADMIN_AUTH_GUARD_PREFIX + hex.slice(0, 32);
}

function isNearPasswordTypo_(candidate, expected) {
  if (!candidate || Math.abs(candidate.length - expected.length) > 2) return false;
  return editDistance_(candidate, expected) <= 2;
}

function editDistance_(left, right) {
  const previous = [];
  const current = [];
  for (let column = 0; column <= right.length; column += 1) previous[column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1] + (left.charAt(row - 1) === right.charAt(column - 1) ? 0 : 1);
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, substitution);
    }
    for (let column = 0; column <= right.length; column += 1) previous[column] = current[column];
  }
  return previous[right.length];
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
  const sheet = spreadsheet.getSheetByName(SETTINGS.SHEET_NAME);
  if (!sheet) throw new Error('지정된 시트를 찾지 못했습니다: ' + SETTINGS.SHEET_NAME);
  if (sheet.getSheetId() !== SETTINGS.SHEET_GID) throw new Error('지정된 시트의 GID가 일치하지 않습니다.');
  if (!hasExpectedLayout_(sheet)) throw new Error('지정된 시트의 C1 이름, D1 자습 총시수, E1 벌점 구조를 확인해 주세요.');
  return sheet;
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
    .filter(function(student) {
      return student !== null && isVisibleClass_(student.class);
    });
}

function isVisibleClass_(classNumber) {
  return !SETTINGS.VISIBLE_CLASSES.length || SETTINGS.VISIBLE_CLASSES.indexOf(Number(classNumber)) !== -1;
}

function isVisibleStudentId_(studentId) {
  const match = String(studentId || '').match(/^2(\d{2})\d{2}$/);
  return Boolean(match) && isVisibleClass_(Number(match[1]));
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
