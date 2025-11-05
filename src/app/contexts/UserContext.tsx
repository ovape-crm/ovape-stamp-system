'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import supabase from '@/libs/supabaseClient';
import Loading from '@/app/_components/Loading';
import { UserType } from '@/app/_types/user.types';

interface UserContextType {
  user: UserType | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({
  children,
  requireAuth = false,
}: {
  children: React.ReactNode;
  requireAuth?: boolean;
}) => {
  const [user, setUser] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const fetchUser = async () => {
    try {
      // 1. 세션에서 user id 가져오기
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        setUser(null);
        // requireAuth가 true면 로그인 페이지로 리다이렉트
        if (requireAuth) {
          router.push('/login');
        }
        return;
      }

      const userId = sessionData.session.user.id;

      // 2. public.users 테이블에서 유저 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('User fetch error:', userError);
        setUser(null);
        if (requireAuth) {
          router.push('/login');
        }
        return;
      }

      setUser(userData);
    } catch (error) {
      console.error('Error fetching user:', error);
      setUser(null);
      if (requireAuth) {
        router.push('/login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();

    // 세션 변경 감지 (로그인/로그아웃 시)
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        fetchUser();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        if (requireAuth) {
          router.push('/login');
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [requireAuth, router]);

  const refreshUser = async () => {
    setIsLoading(true);
    await fetchUser();
  };

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
        toast.error('로그아웃에 실패했습니다.');
        return;
      }
      setUser(null);
      toast.success('로그아웃 완료!');
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('로그아웃에 실패했습니다.');
    }
  };

  // requireAuth가 true일 때 로딩 화면 표시
  if (requireAuth && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loading size="lg" text="인증 확인 중..." />
      </div>
    );
  }

  // requireAuth가 true인데 user가 없으면 null 반환 (리다이렉트 중)
  if (requireAuth && !isLoading && !user) {
    return null;
  }

  return (
    <UserContext.Provider value={{ user, isLoading, refreshUser, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
