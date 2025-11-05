'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Loading from '@/app/_components/Loading';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.push('/customers');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-brand-50 to-brand-100">
      <Loading size="lg" text="페이지 이동 중..." />
    </div>
  );
}
