import Link from 'next/link';

export const metadata = { title: '개인정보 처리 안내 — 커리어노트' };
export default function Privacy() {
  return <main className="wrap privacy-page">
    <Link className="text-link" href="/">← 커리어노트로 돌아가기</Link>
    <h1>개인정보 처리 안내</h1><p>적용일: 2026년 9월 22일 · 운영자: 김해솔</p>
    <h2>로그인과 저장</h2>
    <p>Google 로그인 시 계정 식별자와 기본 프로필·이메일을 Supabase 인증 서비스에서 처리합니다. 계정 구분과 로그인 유지에 사용하며 비밀번호는 커리어노트가 받지 않습니다. 로그인 유지용 쿠키는 브라우저에서 사용됩니다.</p>
    <p>‘현재 작업 저장’을 누르면 올린 이력서·문서, 직접 입력한 경험과 지원 정보, 작성 결과를 Supabase 데이터베이스(호주 시드니)에 계정별로 보관합니다. 다음 방문에서 본인 작업을 불러오기 위한 목적이며 자동저장하지 않습니다. 다른 사용자는 이 자료에 접근할 수 없습니다.</p>
    <h2>보관과 삭제</h2>
    <p>저장본은 직접 삭제할 때까지 보관합니다. 로그인 후 ‘저장본 삭제’로 서버의 작업을 삭제할 수 있습니다. ‘모두 지우기’와 로그아웃은 현재 화면의 입력을 지우며 서버 저장본은 유지합니다. 계정 자체의 삭제나 개인정보 관련 문의는 아래 연락처로 요청해주세요. 운영 서비스의 보안·장애 대응 기록과 백업에는 제공업체의 별도 보관 정책이 적용될 수 있습니다.</p>
    <h2>AI 생성과 API 키</h2>
    <p>생성을 요청하면 입력 자료와 API 키가 Vercel에서 운영되는 서버를 거쳐 Google Gemini API로 전송됩니다. 이 전송은 화면의 안내에 동의하고 생성을 누른 경우에 수행합니다. Google의 처리 정책과 본인 API 계정의 요금·한도가 적용됩니다.</p>
    <p>API 키는 현재 페이지 메모리에서만 보관하며 작업 저장본, 브라우저 저장소, 애플리케이션 로그에 기록하지 않습니다. 저장하지 않은 입력은 새로고침하거나 페이지를 닫으면 사라집니다. 주민등록번호, 주소 등 코칭에 필요하지 않은 민감한 정보는 업로드 전에 제거해주세요.</p>
    <h2>사용하는 외부 서비스</h2>
    <p><a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">Supabase 개인정보처리방침</a> · <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer">Vercel 개인정보처리방침</a> · <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Google Gemini API 약관</a></p>
    <h2>문의</h2><p><a href="mailto:roy919491@gmail.com">roy919491@gmail.com</a></p>
  </main>;
}
