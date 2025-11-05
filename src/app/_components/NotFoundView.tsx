'use client';

import Image from 'next/image';
import Link from 'next/link';
import Button from '@/app/_components/Button';

export default function NotFoundView({ full = true }: { full?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center ${
        full
          ? 'min-h-screen bg-gradient-to-br from-brand-50 to-brand-100 px-6'
          : 'py-12 mt-20'
      }`}
    >
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 w-32 h-32 sm:w-40 sm:h-40 relative">
          <Image
            src="/logo.PNG"
            alt="OVAPE Logo"
            fill
            sizes="(max-width: 640px) 128px, 160px"
            className="object-contain drop-shadow-sm"
            priority
          />
        </div>

        <h1 className="text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">
          404 NOT FOUND
        </h1>
        <p className="text-base text-gray-700 mb-1">
          페이지를 찾을 수 없어요 😭
        </p>
        <p className="text-sm text-gray-600 mb-8">
          요청하신 페이지가 존재하지 않습니다.
        </p>

        <div className="flex items-center justify-center">
          <Link href="/" className="inline-block">
            <Button size="md">홈으로</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
