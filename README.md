# 대진고 자습 관리 · 보안 PWA

기존 자습 순위·반 대항전·벌점 관리 기능을 유지하면서 학교 내부용 접속 보호와 휴대폰 설치 기능을 추가한 배포본입니다.

## 이번 버전의 변경점

- 공개 JavaScript에 있던 관리자 비밀번호 제거
- 모든 학생 정보 조회에 `VIEWER_PASSWORD` 서버 검증 적용
- 모든 벌점 추가·정정·기록 삭제에 `ADMIN_PASSWORD` 서버 검증 적용
- 비밀번호를 Apps Script의 스크립트 속성에만 보관
- PWA manifest, 서비스 워커, 192/512px 앱 아이콘 추가
- iPhone 홈 화면 아이콘과 앱 표시 설정 추가
- 학생 API 응답과 비밀번호를 오프라인 캐시에서 제외
- 개인정보처리 안내 페이지 추가

## 파일 구성

- `index.html`, `styles.css`, `script.js`, `config.js`: GitHub Pages 프런트엔드
- `manifest.webmanifest`, `sw.js`, 앱 아이콘: 설치형 PWA 구성
- `Code.gs`: Google Spreadsheet를 읽고 벌점을 수정하는 보호된 API
- `APPS_SCRIPT_SETUP.md`: 실제 배포 순서
- `privacy.html`: 개인정보처리 안내 초안

## 중요한 운영 원칙

이 앱은 학교 내부용입니다. 학생 이름·학번·자습시간·벌점은 개인정보이므로 접속 비밀번호와 URL을 외부에 공개하지 마세요. 관리자 비밀번호는 접속 비밀번호와 반드시 다르게 설정하고, 과거 공개 코드에 포함됐던 비밀번호는 사용하지 마세요.

설치 전에 반드시 [APPS_SCRIPT_SETUP.md](./APPS_SCRIPT_SETUP.md)를 따라 Apps Script 새 버전과 두 개의 스크립트 속성을 설정해야 합니다.
