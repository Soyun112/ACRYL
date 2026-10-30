import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AX CONNECT",
  description: "전시회 CRM 접점을 라벨링해 맞춤 제안 대상을 검토합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
