# 대진고 자습 관리 · 6반 시범 PWA

기존 자습 순위·반 대항전·벌점 관리 기능을 유지하면서 2학년 6반 시범 운영과 휴대폰 설치 기능을 적용한 배포본입니다.

## 이번 버전의 변경점

- 공개 JavaScript에 있던 관리자 비밀번호 제거
- 일반 조회는 접속 비밀번호 없이 공개
- 서버와 화면에서 2학년 6반 데이터만 허용
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

## 정식 운영 때 전 학급으로 복구

1. `Code.gs`와 `config.js`의 `VISIBLE_CLASSES: [6]`을 모두 `VISIBLE_CLASSES: []`로 바꿉니다.
2. Apps Script를 기존 배포의 **새 버전**으로 재배포합니다.
3. 변경한 `config.js`를 GitHub에 올리고 `sw.js`의 캐시 버전도 한 단계 올립니다.

빈 배열 `[]`은 학급 제한이 없다는 뜻입니다.

## 중요한 운영 원칙

학생 이름·학번·자습시간·벌점은 개인정보입니다. 현재 일반 조회가 공개 상태이므로 학교의 승인과 안내 범위 안에서만 URL을 배포하세요. 관리자 비밀번호는 계속 서버에만 보관하며 공개 코드에 넣지 마세요.

설치 전에 반드시 [APPS_SCRIPT_SETUP.md](./APPS_SCRIPT_SETUP.md)를 따라 Apps Script 새 버전과 관리자 스크립트 속성을 설정해야 합니다.
