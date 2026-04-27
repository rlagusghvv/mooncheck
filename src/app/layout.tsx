import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "협곡 문철 | 롤 장면 과실비율 커뮤니티",
  description: "롤 장면을 제보하고 포지션별 과실비율을 커뮤니티가 판정하는 서비스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
