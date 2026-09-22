'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import TaggedContent from '@/app/_components/TaggedContent';
import { useUser } from '@/app/_contexts/UserContext';
import {
  acknowledgeRequiredSystemNotice,
  getPendingRequiredSystemNotices,
  type RequiredSystemNotice,
} from '@/app/_domains/_systemNotice/_services/systemNoticeService';
import supabase from '@/libs/supabaseClient';

export default function RequiredSystemNoticeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [pendingNotices, setPendingNotices] = useState<RequiredSystemNotice[]>([]);
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  const loadPendingNotices = useCallback(async () => {
    if (!user) return;
    try {
      setPendingNotices(await getPendingRequiredSystemNotices());
    } catch (error) {
      console.error('Required system notice check failed:', error);
    }
  }, [user]);

  useEffect(() => {
    void loadPendingNotices();
  }, [loadPendingNotices]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`required-system-notices-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'required_system_notice_recipients', filter: `user_id=eq.${user.id}`,
      }, () => void loadPendingNotices())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadPendingNotices, user]);

  const acknowledge = async () => {
    const notice = pendingNotices[0];
    if (!notice) return;
    setIsAcknowledging(true);
    try {
      await acknowledgeRequiredSystemNotice(notice.id);
      // 확인 성공 직후에는 즉시 잠금을 해제하고, 백그라운드 조회로 서버 상태를 다시 맞춘다.
      setPendingNotices((current) => current.filter((item) => item.id !== notice.id));
      void loadPendingNotices();
    } catch (error) {
      console.error('Required system notice acknowledgement failed:', error);
      toast.error(
        `공지 확인 처리에 실패했습니다: ${error instanceof Error ? error.message : '다시 시도해 주세요.'}`,
      );
    } finally {
      setIsAcknowledging(false);
    }
  };

  const notice = pendingNotices[0];
  return (
    <>
      {children}
      {notice && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="required-system-notice-title">
          <section className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <header className="border-b border-gray-100 px-5 py-4 sm:px-6">
              <span className="text-xs font-bold text-brand-600">필수 확인 공지</span>
              <h2 id="required-system-notice-title" className="mt-1 text-lg font-bold text-gray-900">{notice.title}</h2>
            </header>
            <div className="px-5 py-5 sm:px-6">
              <TaggedContent content={notice.content || '확인 후 시스템을 이용해 주세요.'} className="text-sm leading-6 text-gray-700" />
              {pendingNotices.length > 1 && <p className="mt-4 text-xs text-gray-500">확인할 공지가 {pendingNotices.length}건 남아 있습니다.</p>}
              <Button className="mt-6 w-full" onClick={acknowledge} disabled={isAcknowledging}>{isAcknowledging ? '확인 중...' : '확인했습니다'}</Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
