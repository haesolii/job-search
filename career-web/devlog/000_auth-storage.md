# 로그인과 개인 작업 저장

방문자는 Google 계정으로 로그인하고 자신의 이력서·경험·지원 정보·작성 결과를 저장하고 다시 불러온다. 기존 비회원 생성은 유지한다. Ponytail 원칙에 따라 관리형 Supabase Auth와 Postgres를 사용하고 사용자당 작업 하나를 명시적으로 저장한다.

## 범위와 완료 조건

C4, satisfy-spec. Trigger: 로그인/DB 추가 요청. Goal: 실제 계정 간 격리된 저장·복구·삭제. Non-goals: 관리자 UI, 공유, 팀, 결제, 비밀번호 관리, API 키 저장, 자동저장. Memory: 이 문서 및 README. Stop: 테스트/타입/빌드/브라우저 및 실제 DB 격리 검증 후 기존 Vercel 사이트 갱신. 외부 계정·프로젝트·SMTP 설정이 없으면 해당 연결만 미완료로 남기고 코드 검증은 진행한다. 비용 발생, 새 인증정보 입력, 약관 동의는 사용자에게 넘긴다.

## 근거와 설계

- app/page.tsx:17 상태가 단일 작업의 소유자다. lib/coach.ts:13 생성 스키마는 필수 문항을 요구하므로 미완성 저장에는 별도 스키마가 필요하다. 기존 auth/DB 의존성 없음.
- D1: 서버 전용 Supabase SSR 클라이언트, HttpOnly/Secure/SameSite=lax 쿠키. 브라우저 토큰·localStorage 없음. 요청마다 getUser 검증, 쿠키 갱신을 오류 응답에도 전달, 응답 no-store.
- D2: 이메일 OTP만 지원. 발송/검증/로그아웃은 동일 출처 POST. 가입·로그인 통합. 공개 발송 SMTP와 OTP 템플릿을 실제 설정한 뒤 활성화한다.
- D3: 사용자당 snapshot 하나, user_id는 검증된 세션에서만 결정. RLS auth.uid()=user_id. 서비스 역할 키를 앱에 사용하지 않는다. bounded JSON에 첨부까지 함께 저장하여 별도 공개 파일/고아 파일 없음.
- D4: revision은 UUID. 새 저장 expectedRevision=null은 insert-only; 수정/삭제는 owner+revision 조건, 충돌409. 삭제 후 재생성도 옛 버전과 충돌하도록 UUID를 재사용하지 않는다.
- D5: 명시적 저장/불러오기/삭제. 로그인은 현재 입력을 덮어쓰지 않는다. 로그아웃은 실행 중 생성 중지 후 메모리 삭제. 파일 읽기 중 세션 작업 금지. 세션 변경/만료시 다른 계정으로 이전 자료를 저장하지 않게 identity 확인 및 클라이언트 초기화.
- D6: 저장값은 form(동의 제외), result, compact resultContext(company/position/mode/limit), followup, step. 생성: page.tsx → JSON: workspace.ts → 서버 재검증 및 DB → 같은 schema로 복원 → page.tsx. API키/동의/상태 메시지는 계약상 금지.

## 파일 변경과 순서

1. NEW lib/workspace.ts: 미완성 snapshot과 revision 계약. NEW lib/account-server.ts: SDK/cookie/인증 및 bounded-body 공통 경계. NEW supabase/migrations/202609220001_workspace.sql: 테이블/RLS/제한. MODIFY package.json/lock: 공식 SDK 두 개만.
2. NEW app/api/account/route.ts: 상태, OTP 발송·확인·로그아웃. NEW app/api/workspace/route.ts: 본인 snapshot GET/PUT/DELETE. 기존 coach API 유지.
3. NEW app/account-panel.tsx: 로그인/저장 패널. MODIFY app/page.tsx: 상태 snapshot 연결과 logout clear, 개인정보 안내. MODIFY globals.css: 기존 스타일의 반응형 폼.
4. NEW lib/workspace.test.ts 및 integration 검사: 부정 입력·소유권·충돌·쿠키·발송 오류. MODIFY README: 실제 설정/복구 절차. 배포 rollback은 직전 Vercel deployment로 복귀, 새 테이블은 보존하여 사용자 자료 손실 방지.

## 위협 모델과 필수 검사

자산: 이력서·지원 내용·이메일·세션. 경계: 브라우저→앱→Supabase. 공격자: 익명, 다른 계정, 악성 문서, 위조 쿠키. 최종 권한 경계는 DB RLS; 앱의 본인 조회와 CSRF는 추가 방어다. DB 관리자/서비스 키는 RLS를 우회할 수 있으므로 앱에 주입하지 않는다. 사용자 문서는 데이터로만 저장하고 실행·공개 제공하지 않는다. 원문/키/메일/코드는 로그에 출력하지 않는다.

검증 시나리오: 익명 GET/PUT/DELETE401; 교차 출처403; 위조쿠키401; 키/owner/동의 필드 추가400; 실제 스트림 초과413; 빈 draft 저장/복구; 두 사용자 교차 읽기·쓰기·삭제 거부; 같은 revision 수정 경쟁409; 삭제/재생성 뒤 이전 revision409; 잘못된/만료 OTP 거부; 메일 실패 안전 오류; 세션 쿠키 HttpOnly/Secure/no-store; 로그아웃 후 메모리 지움; 실패시 원문 유지; 모바일320/390 및 데스크톱 화면.

기존 npm test baseline 9/9 통과(2026-09-22). npm test는 현재 lib/coach.test.ts만 관찰하므로 새 workspace test를 스크립트에 추가한다. npm run check는 tsconfig의 **/*.ts, **/*.tsx를 확인한다. npm run build는 Next route 및 client 컴파일을 확인한다. 실제 DB 검증은 별도로 수행하며 모의 응답을 실제 인증으로 보고하지 않는다.

## 상담/감사 기록

Architect: /root/auth_discovery. D1~D6 제안을 수용. UUID revision/초기 insert-only/응답 쿠키 전달 지적 반영. Google OAuth는 별도 공급자 설정과 불필요한 초기 복잡도를 줄이기 위해 이번에는 제외. Reflection 및 독립 감사 후 구현.

공식 근거: https://supabase.com/docs/guides/auth/server-side/creating-a-client, https://supabase.com/docs/guides/auth/auth-email-passwordless, https://supabase.com/docs/guides/database/postgres/row-level-security, https://supabase.com/docs/guides/auth/auth-smtp.

감사 반영: /api/account 발송·검증은 서버에서 이메일 SHA256별 분당 5회 제한(원문 로그 없음), Vercel Firewall은 실제 방문자 IP별 분당 10회 제한. 메모리 제한은 인스턴스 범위의 추가 보호이며 Supabase 자체 OTP 만료·시도 제한과 WAF가 분산 경계다. 한도 초과 429 + Retry-After를 테스트하고 배포 전 WAF 확인. Architect reflection ALIGNED 수신.

## 구현 변경 및 검증 (2026-09-22)

사용자가 Google 로그인을 선택하여 D2를 Google OAuth PKCE로 변경했다. SMTP/이메일 OTP 엔드포인트와 이메일별 rate limit은 구현하지 않는다. 인증은 기본 프로필/이메일 범위만 요청한다. 콜백은 고정 경로로만 돌아오며 요청 시의 HttpOnly PKCE 쿠키로 코드를 교환한다. Google Client Secret은 Supabase 공급자 설정에만 보관한다.

14개 자동 테스트와 TypeScript 및 Next 프로덕션 빌드 통과. Supabase 실제 테이블 생성 완료. SQL transaction에서 임시 두 계정의 owner read 및 cross-user select/update/delete/insert 차단 확인 후 rollback 완료(결과: RLS checks passed; test data rolled back). 생성/보안 설정은 Supabase 무료 프로젝트에서 확인했다.

독립 구현 리뷰 /root/auth_review: 서버 권한 경계 차단 결함 없음. focus 중 busy로 누락되는 계정 재확인은 busy 종료/계정 요청 완료 시 다시 확인하도록 보완했다. 파일 읽기 결과는 generation으로 계정 변경 후 재삽입을 방지한다. 실제 OAuth 및 갱신 쿠키 검증은 아직 남음. Google 공급자 설정/실제 로그인/배포 전이므로 완료로 표시하지 않는다.

실연 완료: Google OAuth 로그인, 인증 유지된 새 탭에서 저장본 복원, 가짜 API 키 미복원, 승인된 임시 자료 삭제, 로그아웃 시 화면 메모리 삭제. 390px/320px 계정 패널 가로 overflow 없음. 15/15 자동 테스트와 최종 프로덕션 빌드 통과. OAuth 성공/실패, PKCE 및 HttpOnly/Secure 쿠키도 자동 테스트로 확인. Google 앱 프로덕션 게시 완료, Supabase Google Enabled 확인. 운영 환경 두 연결 변수 추가 완료.

## 배포 완료

소스 commit 012b6a9, GitHub codex/career-note-web 업로드 완료. Vercel production dpl_7mzsCKt4KTj2xMYXDWpT6CDLZ1pg READY, https://career-note-haesolii.vercel.app alias 적용. 운영 주소에서 Google OAuth 왕복 로그인과 본인 DB 조회 성공, 삭제된 임시 저장본이 없는 상태 확인. 비로그인 workspace 401, account 설정 200/no-store/private, 개인정보 안내 200 확인. API 키는 복원되지 않았으며 실제 개인 이력서는 시험/배포에 사용하지 않았다.

남은 사용자 설정 없음. 생성 기능은 기존 BYOK 동작을 유지하며 이번 범위에서 실제 유효 Gemini 키로 유료 생성하지 않았다. 계정별 저장은 명시적 버튼 방식이고 한 계정당 현재 작업 하나이다. Git 연결 자동배포는 별도 설정하지 않았으며 이번 배포는 Vercel CLI로 수행했다.
