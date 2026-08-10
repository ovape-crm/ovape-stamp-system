import type { Metadata } from "next";

const title = "베이프 성인 인증";
const description = "안전한 성인 인증을 위해 링크를 눌러 인증을 진행해 주세요.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ??
      "https://ovape-stamp-system-lczx.vercel.app",
  ),
  title,
  description,
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "ko_KR",
    siteName: "오베이프",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function AdultVerificationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
