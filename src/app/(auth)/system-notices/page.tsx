'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import TaggedContent from '@/app/_components/TaggedContent';
import { showConfirmDialog } from '@/app/_components/AppDialog';
import { useUser } from '@/app/_contexts/UserContext';
import supabase from '@/libs/supabaseClient';

type Recipient = { user_id: string; acknowledged_at: string | null };
type Notice = { id: string; title: string; content: string; created_at: string; archived_at: string | null; required_system_notice_recipients: Recipient[] };
type UserOption = { id: string; name: string; email: string; oss_role: string };
type Schedule = { id: string; title: string; content: string; recipient_ids: string[]; weekdays: number[]; send_time: string; is_active: boolean; last_sent_on: string | null; last_sent_at: string | null; last_failed_at: string | null; last_error: string | null };
const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

const formatDateTime = (value: string) => new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
}).format(new Date(value));

export default function SystemNoticesPage() {
  const { user, isLoading: isUserLoading } = useUser();
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tab, setTab] = useState<'manage' | 'history' | 'repeat'>('manage');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [repeatTitle, setRepeatTitle] = useState('');
  const [repeatContent, setRepeatContent] = useState('');
  const [repeatUserIds, setRepeatUserIds] = useState<string[]>([]);
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([]);
  const [repeatTime, setRepeatTime] = useState('09:00');
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [usersResult, noticesResult, schedulesResult] = await Promise.all([
      supabase.rpc('get_required_system_notice_users'),
      supabase.from('required_system_notices').select('id, title, content, created_at, archived_at, required_system_notice_recipients(user_id, acknowledged_at)').order('created_at', { ascending: false }),
      supabase.from('required_system_notice_schedules').select('id, title, content, recipient_ids, weekdays, send_time, is_active, last_sent_on, last_sent_at, last_failed_at, last_error').order('created_at', { ascending: false }),
    ]);
    if (usersResult.error || noticesResult.error || schedulesResult.error) {
      const error = usersResult.error ?? noticesResult.error ?? schedulesResult.error;
      console.error('System notice management load failed:', error);
      toast.error('공지 관리 데이터를 불러오지 못했습니다.');
      return;
    }
    setUsers((usersResult.data ?? []) as UserOption[]);
    setNotices((noticesResult.data ?? []) as unknown as Notice[]);
    setSchedules((schedulesResult.data ?? []) as Schedule[]);
  }, []);

  useEffect(() => {
    if (isUserLoading) return;
    if (user?.oss_role !== 'master') {
      router.replace('/customers');
      return;
    }
    void load().finally(() => setIsLoading(false));
  }, [isUserLoading, load, router, user?.oss_role]);

  useEffect(() => {
    if (user?.oss_role !== 'master') return;
    const channel = supabase
      .channel('system-notice-management-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'required_system_notices' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'required_system_notice_recipients' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, user?.oss_role]);

  const selectedCount = selectedUserIds.length;
  const allSelected = users.length > 0 && selectedCount === users.length;
  const toggleUser = (userId: string) => setSelectedUserIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  const toggleAll = () => setSelectedUserIds(allSelected ? [] : users.map((option) => option.id));

  const sendNotice = async () => {
    if (!title.trim()) { toast.error('공지 제목을 입력해 주세요.'); return; }
    if (!selectedUserIds.length) { toast.error('공지 대상자를 선택해 주세요.'); return; }
    setIsSending(true);
    const { error } = await supabase.rpc('create_required_system_notice', {
      p_title: title, p_content: content, p_recipient_ids: selectedUserIds,
    });
    setIsSending(false);
    if (error) { toast.error(error.message); return; }
    setTitle('');
    setContent('');
    setSelectedUserIds([]);
    toast.success(`${selectedCount}명에게 필수 확인 공지를 발송했습니다.`);
    await load();
  };

  const archiveNotice = async (noticeId: string) => {
    const { error } = await supabase.rpc('archive_required_system_notice', { p_notice_id: noticeId });
    if (error) { toast.error(error.message); return; }
    toast.success('공지를 종료했습니다. 이력은 계속 보관됩니다.');
    await load();
  };

  const deleteNotice = async (notice: Notice) => {
    if (!(await showConfirmDialog({ title: '공지 삭제', description: `‘${notice.title}’ 공지를 삭제할까요?`, confirmLabel: '삭제', tone: 'danger' }))) return;
    const { error } = await supabase.rpc('delete_required_system_notice', { p_notice_id: notice.id });
    if (error) { toast.error(error.message); return; }
    toast.success('공지를 삭제했습니다.');
    await load();
  };

  const createSchedule = async () => {
    if (!repeatTitle.trim() || !repeatUserIds.length || !repeatWeekdays.length) { toast.error('제목, 대상, 발송 요일을 모두 선택해 주세요.'); return; }
    const { error } = await supabase.rpc(editingScheduleId ? 'update_required_system_notice_schedule' : 'create_required_system_notice_schedule', editingScheduleId ? { p_schedule_id: editingScheduleId, p_title: repeatTitle, p_content: repeatContent, p_recipient_ids: repeatUserIds, p_weekdays: repeatWeekdays, p_send_time: repeatTime } : { p_title: repeatTitle, p_content: repeatContent, p_recipient_ids: repeatUserIds, p_weekdays: repeatWeekdays, p_send_time: repeatTime });
    if (error) { toast.error(error.message); return; }
    setRepeatTitle(''); setRepeatContent(''); setRepeatUserIds([]); setRepeatWeekdays([]); setEditingScheduleId(null); toast.success(editingScheduleId ? '반복 발송 공지를 수정했습니다.' : '반복 발송 공지를 등록했습니다.'); await load();
  };

  const setScheduleActive = async (schedule: Schedule) => {
    const { error } = await supabase.rpc('set_required_system_notice_schedule_active', { p_schedule_id: schedule.id, p_is_active: !schedule.is_active });
    if (error) { toast.error(error.message); return; }
    await load();
  };

  const editSchedule = (schedule: Schedule) => {
    setRepeatTitle(schedule.title); setRepeatContent(schedule.content); setRepeatUserIds(schedule.recipient_ids); setRepeatWeekdays(schedule.weekdays); setRepeatTime(schedule.send_time.slice(0, 5)); setEditingScheduleId(schedule.id);
  };

  const deleteSchedule = async (schedule: Schedule) => {
    if (!(await showConfirmDialog({ title: '반복 발송 삭제', description: `‘${schedule.title}’ 반복 발송을 삭제할까요?`, confirmLabel: '삭제', tone: 'danger' }))) return;
    const { error } = await supabase.rpc('delete_required_system_notice_schedule', { p_schedule_id: schedule.id });
    if (error) { toast.error(error.message); return; }
    if (editingScheduleId === schedule.id) { setEditingScheduleId(null); setRepeatTitle(''); setRepeatContent(''); setRepeatUserIds([]); setRepeatWeekdays([]); }
    toast.success('반복 발송을 삭제했습니다.'); await load();
  };

  const activeNotices = useMemo(
    () => notices.filter((notice) => !notice.archived_at && notice.required_system_notice_recipients.some((recipient) => !recipient.acknowledged_at)),
    [notices],
  );
  const userNames = useMemo(() => new Map(users.map((option) => [option.id, option.name])), [users]);
  if (isUserLoading || isLoading) return <Loading size="lg" text="공지 관리 정보를 불러오는 중..." />;
  if (user?.oss_role !== 'master') return null;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex w-full gap-1 rounded-xl border border-gray-200 bg-gray-50/70 p-1 sm:w-fit">
        {([['manage', '공지 관리'], ['history', '공지 내역'], ['repeat', '공지 반복 발송']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === value ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-600 hover:bg-white/70'}`}>{label}</button>)}
      </div>

      {tab === 'repeat' && schedules.some((schedule) => schedule.last_error) && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">반복 발송 실패 건이 있습니다. 등록된 반복 발송 목록에서 사유를 확인하세요.</p>}

      {tab === 'manage' && <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-gray-900">공지 발송</h2>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-sm font-semibold text-gray-700">제목
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="공지 제목을 입력하세요" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-gray-700">내용
            <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="확인이 필요한 공지 내용을 입력하세요" rows={5} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </label>
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">발송 대상</p><p className="mt-0.5 text-xs text-gray-600">마스터를 포함해 원하는 사용자를 직접 선택하세요.</p></div><button type="button" onClick={toggleAll} className="cursor-pointer text-sm font-semibold text-brand-600 hover:text-brand-700">{allSelected ? '전체 해제' : '전체 선택'}</button></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {users.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm hover:border-brand-300"><input type="checkbox" checked={selectedUserIds.includes(option.id)} onChange={() => toggleUser(option.id)} className="h-4 w-4 accent-brand-600" /><span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{option.name}</span><span className="block truncate text-xs text-gray-500">{option.oss_role === 'master' ? '마스터' : option.oss_role === 'admin' ? '관리자' : '직원'}</span></span></label>)}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4"><span className="text-sm text-gray-600">선택된 대상 <strong className="text-brand-600">{selectedCount}</strong>명</span><Button onClick={sendNotice} disabled={isSending || !title.trim() || selectedCount === 0}>{isSending ? '발송 중...' : '공지 발송'}</Button></div>
        </div>
      </section>}

      {tab === 'history' && <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4"><h2 className="text-lg font-bold text-gray-900">발송 이력</h2><p className="mt-1 text-sm text-gray-600">종료한 공지도 삭제하지 않고 확인 기록과 함께 보관합니다.</p></div>
        <div className="space-y-3">
          {notices.map((notice) => {
            const recipients = notice.required_system_notice_recipients ?? [];
            const acknowledgedCount = recipients.filter((recipient) => recipient.acknowledged_at).length;
            const isComplete = recipients.length > 0 && acknowledgedCount === recipients.length;
            const canDelete = Boolean(notice.archived_at) || isComplete;
            const status = notice.archived_at ? '종료' : isComplete ? '확인 완료' : '발송 중';
            return <article key={notice.id} className="rounded-xl border border-gray-200 bg-gray-50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-gray-900">{notice.title}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${notice.archived_at ? 'bg-gray-200 text-gray-600' : isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-100 text-brand-700'}`}>{status}</span></div><p className="mt-1 text-xs text-gray-500">발송 {formatDateTime(notice.created_at)} · 확인 {acknowledgedCount}/{recipients.length}</p></div><div className="flex gap-2">{!notice.archived_at && !isComplete && <Button variant="secondary" size="xs" onClick={() => void archiveNotice(notice.id)}>공지 종료</Button>}{canDelete && <Button variant="danger" size="xs" onClick={() => void deleteNotice(notice)}>삭제</Button>}</div></div><TaggedContent content={notice.content || '내용 없음'} className="mt-3 text-sm text-gray-700" /><div className="mt-3 flex flex-wrap gap-2">{recipients.map((recipient) => <span key={recipient.user_id} className={`rounded-md px-2 py-1 text-xs font-semibold ${recipient.acknowledged_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{userNames.get(recipient.user_id) ?? '사용자'} · {recipient.acknowledged_at ? `확인 ${formatDateTime(recipient.acknowledged_at)}` : '미확인'}</span>)}</div></article>;
          })}
          {!notices.length && <p className="py-10 text-center text-sm text-gray-500">발송한 공지가 없습니다.</p>}
        </div>
      </section>}
      {tab === 'history' && activeNotices.length > 0 && <p className="text-right text-xs text-gray-500">현재 발송 중인 공지 {activeNotices.length}건</p>}
      {tab === 'repeat' && <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"><div><h2 className="text-lg font-bold text-gray-900">공지 반복 발송</h2><p className="mt-1 text-sm text-gray-600">선택한 요일과 시간(한국 시간)에 대상자에게 필수 확인 공지를 자동 발송합니다.</p></div><div className="grid gap-4"><input value={repeatTitle} onChange={(event) => setRepeatTitle(event.target.value)} placeholder="공지 제목" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /><textarea value={repeatContent} onChange={(event) => setRepeatContent(event.target.value)} placeholder="공지 내용" rows={4} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /><div className="flex flex-wrap gap-2">{weekdayLabels.map((label, value) => <button key={label} type="button" onClick={() => setRepeatWeekdays((current) => current.includes(value) ? current.filter((day) => day !== value) : [...current, value])} className={`h-9 w-9 cursor-pointer rounded-lg text-sm font-bold ${repeatWeekdays.includes(value) ? 'bg-brand-500 text-white' : 'border border-gray-300 bg-white text-gray-600 hover:border-brand-300'}`}>{label}</button>)}<label className="ml-2 flex items-center gap-2 text-sm font-semibold text-gray-700">발송 시각 <input type="time" value={repeatTime} onChange={(event) => setRepeatTime(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></label></div><div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3"><p className="mb-2 text-sm font-semibold text-gray-900">발송 대상</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{users.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={repeatUserIds.includes(option.id)} onChange={() => setRepeatUserIds((current) => current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id])} className="h-4 w-4 accent-brand-600" />{option.name}</label>)}</div></div><div className="flex justify-end gap-2">{editingScheduleId && <Button variant="gray" onClick={() => { setEditingScheduleId(null); setRepeatTitle(''); setRepeatContent(''); setRepeatUserIds([]); setRepeatWeekdays([]); }}>수정 취소</Button>}<Button onClick={createSchedule}>{editingScheduleId ? '수정 저장' : '반복 발송 등록'}</Button></div></div><div className="border-t border-gray-100 pt-5"><h3 className="font-bold text-gray-900">등록된 반복 발송</h3><div className="mt-3 space-y-2">{schedules.map((schedule) => <div key={schedule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3"><div><p className="font-semibold text-gray-900">{schedule.title}</p><p className="mt-1 text-xs text-gray-600">{schedule.weekdays.map((day) => weekdayLabels[day]).join(' · ')}요일 · {schedule.send_time.slice(0, 5)} · 대상 : {schedule.recipient_ids.map((id) => userNames.get(id) ?? '사용자').join(' · ')}</p></div><div className="flex gap-2"><Button size="xs" variant="secondary" onClick={() => void setScheduleActive(schedule)}>{schedule.is_active ? '중지' : '재개'}</Button><Button size="xs" variant="gray" onClick={() => editSchedule(schedule)}>수정</Button><Button size="xs" variant="danger" onClick={() => void deleteSchedule(schedule)}>삭제</Button></div></div>)}{!schedules.length && <p className="py-5 text-center text-sm text-gray-500">등록된 반복 발송이 없습니다.</p>}</div></div></section>}
      {tab === 'repeat' && schedules.filter((schedule) => schedule.last_error).map((schedule) => <p key={`${schedule.id}-error`} className="text-sm text-rose-700">{schedule.title}: {schedule.last_error}</p>)}
    </main>
  );
}
