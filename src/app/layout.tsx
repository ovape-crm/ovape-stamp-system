import type { Metadata } from 'next';
import './globals.css';
import { ModalProvider } from './contexts/ModalContext';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'OSS - Ovape Stamp System',
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
      <body>
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
        <ModalProvider>{children}</ModalProvider>
      </body>
    </html>
  );
}
