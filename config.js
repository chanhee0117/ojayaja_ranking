const CONFIG = {
  // 실제 벌점 스프레드시트
  SHEET_ID: '1tG8sd7XMOgkechtCgQOz9ROHF3jCcIe1tQcLOgWFbyg',
  SHEET_GID: 1239065071,

  // A열=반, B열=번호, C열=이름, D열=자습 총시수, E열=벌점
  HOURS_COLUMN: 4,
  PENALTY_COLUMN: 5,

  // 이 계정이 시트 편집자로 추가된 뒤 Apps Script를 배포합니다.
  EDITOR_ACCOUNT: '202620626@dj.hs.kr',

  // Code.gs를 웹 앱으로 배포한 뒤 생성된 /exec 주소를 붙여 넣으세요.
  // 비어 있으면 공개/로그인 가능한 시트에서 읽기만 시도하며 벌점 저장은 차단됩니다.
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzB2pQPM5T9y0ih57Jl4i2Xlaeg5Gu_Mg_65_u55yAj9_7W-pgAjICxjO9AqvBmD8O4/exec'
};
