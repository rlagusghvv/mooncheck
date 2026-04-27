import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://mooncheck.splui.com"),
  title: "협곡 문철 | 롤 장면 과실비율 커뮤니티",
  description: "로그인 없이 YouTube 롤 장면 링크를 제보하고 포지션별 과실비율을 투표하는 커뮤니티",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "협곡 문철",
    description: "로그인 없이 YouTube 롤 장면 링크를 올리고 포지션별 과실비율을 투표합니다.",
    url: "https://mooncheck.splui.com",
    siteName: "협곡 문철",
    locale: "ko_KR",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "협곡 문철",
    description: "로그인 없이 YouTube 롤 장면 링크를 올리고 포지션별 과실비율을 투표합니다."
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
