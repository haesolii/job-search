# Career Note · 커리어노트

저장된 career-application-strategy-dynamic v8.1.0 (2026-09-16)의 공용 방법론을 웹으로 옮긴 한국어 취업 코칭 도구입니다. 각 방문자가 Gemini 키와 본인의 이력서를 사용합니다. 원본 개인 이력, 지원 현황, 자소서 사례 DB는 포함하지 않습니다.

## 실행

`npm ci`, `npm run dev` → http://localhost:3002

`npm test`, `npm run check`, `npm run build`로 검증합니다. Vercel Root Directory는 `career-web`이며 Next.js 자동 감지를 사용합니다.

## 구조와 배포 계획

- `app/page.tsx`, `app/globals.css`: 처음 사용하는 사람을 위한 자료 → 지원 정보 → 결과 흐름 및 Gemini 발급 안내.
- `lib/coach.ts`: 사실 보호, 자료 분리, 핵심 질문 하나, 한국어 문체 교정의 공용 정책과 입출력 계약.
- `app/api/coach/route.ts`: 방문자 키로 Gemini에 전달하는 무상태 서버 프록시.
- `lib/coach.test.ts`: 입력 경계, 파일 크기/형식, 결과 분량 및 출처 분리 회귀 검사.

기존 개인용 앱과 DB는 수정하지 않습니다. 공개 배포는 이 디렉터리만 포함합니다. C3 UI 구현 및 C4 개인정보/배포 범위를 분리해 계획 → 독립 감사 → 구현 → 테스트/브라우저 확인 → Git/Vercel 배포 순서로 진행합니다.

## 데이터 경계

API 키는 현재 페이지 메모리에만 있으며 새로고침하면 사라집니다. Google 로그인 후 저장 버튼을 눌렀을 때 자료·입력·결과를 Supabase DB에 계정별 작업 하나로 보관합니다. API 키와 전송 동의는 저장본에 포함하지 않으며 자동저장은 없습니다. 결과를 직접 파일로 내려받을 수도 있습니다. 생성 버튼을 누르면 자료와 키가 서버를 거쳐 Google Gemini로 전달됩니다. Google의 처리 정책과 본인 계정의 API 요금이 적용됩니다.

위협 모델: 익명 또는 다른 계정 사용자의 악성 문서·과대 요청·교차 출처 요청·잘못된 AI 응답으로부터 자료와 키를 보호합니다. Supabase RLS와 서버 getUser 검증으로 소유자를 확인하고 UUID revision 조건으로 동시 수정/삭제 충돌을 거부합니다. 고정 Google endpoint, strict 계약, 실제 바이트 제한, PDF 헤더 확인, 타임아웃, 안전한 오류 메시지와 HTML 이스케이프를 적용합니다. 첨부는 공개 URL 없이 snapshot에 함께 저장하며 실행하지 않습니다. 세션은 HttpOnly/Secure/SameSite=Lax 쿠키이고 API 응답은 no-store입니다. DB 서비스 역할 키를 사용하지 않습니다.

## 로그인·DB 설정

1. Supabase SQL Editor에서 `supabase/migrations/202609220001_workspace.sql`을 한 번 실행합니다.
2. `.env.local`과 Vercel 환경 변수에 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`를 설정합니다. Service Role/Secret key를 넣지 않습니다.
3. Google Auth Platform의 OAuth 웹 클라이언트에 사이트 원본과 Supabase `/auth/v1/callback`을 등록합니다. Google Client ID/Secret은 Supabase Google 공급자 설정에만 입력합니다.
4. Supabase Site URL은 서비스 URL, Redirect URLs는 정확한 `https://서비스도메인/auth/callback`입니다. 개발 확인에만 `http://localhost:3002/auth/callback`을 추가합니다. 와일드카드는 사용하지 않습니다.
5. Google 사용자 유형은 외부로 설정하고 공개 운영 시 앱 게시 상태를 확인합니다. 기본 프로필/이메일 범위만 사용합니다.

실제 로그인 → 저장 → 새로고침 → 불러오기 → 로그아웃을 확인합니다. 로그아웃은 현재 화면의 자료를 지우고 저장본은 유지합니다. 저장본 삭제는 서버 자료만 지웁니다. 인증/DB 장애 시 저장 성공으로 표시하지 않습니다. API 키·이력서·세션·인증코드를 로그에 남기지 마세요.

배포 복구는 이전 정상 Vercel deployment를 다시 승격합니다. DB 테이블은 보존하여 저장본을 유지합니다. Supabase 설정이 없어도 비회원 코칭은 사용할 수 있습니다.

파일은 PDF/TXT/MD, 총 2MB/최대 5개. HWP/DOCX는 PDF로 변환하여 올립니다. 키는 브라우저 저장소·URL에 넣지 않습니다. 모델 응답은 검증하며 본문 글자 수는 앱이 다시 계산합니다. 제한 초과는 완성으로 표시하지 않고 수정 요청을 제공합니다. 외부 URL을 자동 열거나 기업 사실을 실시간 조사하지 않습니다.

배포 전 필수 검사: 잘못된 입력/키/파일/출처 거부, 이전 결과 보존, 취소, 키 미저장, 새 방문자 빈 상태, 320~1440px 화면, 빌드, 의존성 감사, 게시 파일 개인정보 검사. 실제 유효한 방문자 키를 사용한 생성은 별도 실연이 필요합니다.

## 근거

- [Gemini 키 발급](https://ai.google.dev/gemini-api/docs/api-key)
- [Gemini generateContent API](https://ai.google.dev/api/generate-content)
- [Vercel CLI 배포](https://vercel.com/docs/cli/deploy)

공용 코칭 정책은 원본 스킬의 방법론을 독립적으로 요약했습니다. 개인 사실 절과 제3자 자소서 원문은 재배포하지 않습니다.
