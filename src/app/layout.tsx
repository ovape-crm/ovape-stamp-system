import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';
import { ModalProvider } from './_contexts/ModalContext';
import QueryProvider from './_contexts/QueryProvider';
import { Toaster } from 'react-hot-toast';

const notoSansKR = Noto_Sans_KR({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: '이승현 병신',
  description: 'Ovape Stamp System - 고객 스탬프 관리 시스템',
  icons: {
    icon: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={notoSansKR.className}>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#fff',
              color: '#333',
              border: '1px solid #fdd0dc',
            },
            success: {
              iconTheme: {
                primary: '#f64b7f',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
        <QueryProvider>
          <ModalProvider>{children}</ModalProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
