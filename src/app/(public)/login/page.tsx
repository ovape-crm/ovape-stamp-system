'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import supabase, {
  clearLocalSupabaseSession,
  isInvalidRefreshTokenError,
} from '@/libs/supabaseClient';
import { useRouter } from 'next/navigation';
import Loading from '@/app/_components/Loading';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error && isInvalidRefreshTokenError(error)) {
          await clearLocalSupabaseSession();
        }
        if (data.session && !error) {
          router.push('/customers');
          return;
        }
      } catch (error) {
        if (isInvalidRefreshTokenError(error)) {
          await clearLocalSupabaseSession();
        } else {
          console.error('Session check failed:', error);
        }
      } finally {
        setIsChecking(false);
      }
    };

    checkSession();
  }, [router]);

  const handleLogin = async () => {
    if (!email || !password) return;
    setError('');
    setIsLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      router.push('/customers');
    }
  };

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loading size="lg" text="세션 확인 중..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* 좌측 브랜딩 영역 */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 items-center justify-center p-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-brand-300 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-28 h-28 bg-white/15 backdrop-blur-sm rounded-3xl mb-8 ring-1 ring-white/20">
            <Image
              src="/logo.PNG"
              alt="OSS Logo"
              width={80}
              height={80}
              className="object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            OVAPE STAMP SYSTEM
          </h1>
          <p className="text-brand-200 text-sm leading-relaxed max-w-xs mx-auto">
            고객 관리, 스탬프 적립, AS 현황을
            <br />한 곳에서 효율적으로 관리하세요
          </p>
        </div>
      </div>

      {/* 우측 로그인 폼 영역 */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-gray-50">
        <div className="w-full max-w-sm">
          {/* 모바일 로고 */}
          <div className="flex justify-center mb-8 lg:hidden">
            <div className="w-24 h-24 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/25">
              <Image
                src="/logo.PNG"
                alt="OSS Logo"
                width={68}
                height={68}
                className="object-contain"
              />
            </div>
          </div>

          {/* 타이틀 */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">로그인</h2>
            <p className="text-sm text-gray-500 mt-1">
              계정 정보를 입력해주세요
            </p>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
              <svg
                className="w-4 h-4 shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {error}
            </div>
          )}

          {/* 폼 */}
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                이메일
              </label>
              <input
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 px-4 bg-white border border-gray-200 rounded-xl text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                비밀번호
              </label>
              <input
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full h-12 px-4 bg-white border border-gray-200 rounded-xl text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={isLoading || !email || !password}
              className="w-full h-12 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  로그인 중...
                </span>
              ) : (
                '로그인'
              )}
            </button>
          </div>

          {/* 하단 */}
          <p className="text-center text-xs text-gray-400 mt-8">
            OVAPE STAMP SYSTEM
          </p>
        </div>
      </div>
    </div>
  );
}
