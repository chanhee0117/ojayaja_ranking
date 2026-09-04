const CONFIG = {
  // 실제 벌점 스프레드시트
  SHEET_ID: '1tG8sd7XMOgkechtCgQOz9ROHF3jCcIe1tQcLOgWFbyg',
  SHEET_GID: 1239065071,

  // 실제 구조: 1행 제목, 2행부터 학생 / A열=총 자습시수, B열=반, C열=번호, D열=이름, E열=벌점
  HOURS_COLUMN: 1,
  PENALTY_COLUMN: 5,

  // 이 계정이 시트 편집자로 추가된 뒤 Apps Script를 배포합니다.
  EDITOR_ACCOUNT: '202620626@dj.hs.kr',

  // Code.gs를 웹 앱으로 배포한 뒤 생성된 /exec 주소를 붙여 넣으세요.
  // 비어 있으면 공개/로그인 가능한 시트에서 읽기만 시도하며 벌점 저장은 차단됩니다.
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx5zXhP48VjTmHXpcGVwxXP93A9IMzYueD786V5h2LU3LJxXR4aG_RjhbwgQUMmnHk1/exec'
};
