'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import supabase from '@/libs/supabaseClient';
import { useRouter } from 'next/navigation';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(true);
  const router = useRouter();

  // 이미 로그인되어 있는지 체크
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // 이미 로그인되어 있으면 customers로 이동
        router.push('/customers');
      } else {
        setIsChecking(false);
      }
    };

    checkSession();
  }, [router]);

  const handleLogin = async () => {
    setError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      // 로그인 성공 시 메인 페이지로 이동
      router.push('/customers');
    }
  };

  // 세션 체크 중일 때 로딩 표시
  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-brand-50 to-brand-100">
        <Loading size="lg" text="세션 확인 중..." />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-brand-50 to-brand-100">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-xl border border-brand-100">
        {/* 로고 */}
        <div className="flex justify-center mb-8">
          <div className="w-48 h-48">
            <Image
              src="/logo.PNG"
              alt="OSS Logo"
              width={192}
              height={192}
              className="object-contain"
            />
          </div>
        </div>

        {/* 제목 */}
        <div className="text-center mb-8">
          <h1 className="text-sm font-semibold text-brand-600 tracking-wider mb-2">
            OVAPE STAMP SYSTEM
          </h1>
          <div className="h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent mb-6" />
          <h2 className="text-2xl font-bold text-gray-800">로그인</h2>
        </div>

        {/* 폼 */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              이메일
            </label>
            <input
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              비밀번호
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full px-4 py-3 border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent transition-all"
            />
          </div>

          <Button onClick={handleLogin} className="w-full mt-6">
            로그인
          </Button>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm text-center">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
