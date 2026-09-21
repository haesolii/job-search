import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '커리어노트 — 내 경험으로 쓰는 다음 기회',
  description: '본인의 이력서와 채용 공고로 자소서 작성, 첨삭, 면접 답변까지. 나만의 Gemini 키로 시작하는 취업 코칭.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
