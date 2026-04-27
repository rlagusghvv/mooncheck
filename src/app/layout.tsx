import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://mooncheck.splui.com"),
  title: "협곡 문철 | 롤 장면 과실비율 커뮤니티",
  description: "롤 장면을 제보하고 포지션별 과실비율을 커뮤니티가 판정하는 서비스",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "협곡 문철",
    description: "롤 장면을 올리고 포지션별 과실비율을 커뮤니티가 판정합니다.",
    url: "https://mooncheck.splui.com",
    siteName: "협곡 문철",
    locale: "ko_KR",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "협곡 문철",
    description: "롤 장면을 올리고 포지션별 과실비율을 커뮤니티가 판정합니다."
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
