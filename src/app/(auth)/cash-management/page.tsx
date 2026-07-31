'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import {
  getCashClosing,
  getCashClosingHistory,
  getDailyCashSales,
  getDailyPaymentSales,
  getPreviousClosing,
  saveCashClosing,
} from '@/app/_domains/_cashManagement/_services/cashManagementService';
import { cashManagementKeys } from '@/app/_domains/_cashManagement/_queryKeys/cashManagementKeys';
import {
  CASH_DENOMINATIONS,
  CashCounts,
} from '@/app/_domains/_cashManagement/_types/cashManagement.types';
import KoreanDatePicker, { formatKoreanDate } from '@/app/_components/KoreanDatePicker';
import { KoreanDateRangePicker } from '@/app/_components/KoreanDatePicker';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import { getWorkJournalsByDate } from '@/app/_domains/_workJournal/_services/workJournalService';
import { getDailyClosingReportsByRange } from '@/app/_domains/_dailyClosing/_services/dailyClosingService';
import { useModal } from '@/app/_contexts/ModalContext';
import ConfirmModal from '@/app/(auth)/_components/ConfirmModal';
import { useUser } from '@/app/_contexts/UserContext';
import { useStaffOpening } from '@/app/_contexts/StaffOpeningContext';
import DailyClosingReport from './_components/DailyClosingReport';
import ChecklistManagement from './_components/ChecklistManagement';
import ReportSnapshotView from './_components/ReportSnapshotView';
import StaffOpeningProgressBanner from '@/app/(auth)/_components/StaffOpeningProgressBanner';

type CashManagementTab =
  | 'save'
  | 'history'
  | 'report'
  | 'reportLookup'
  | 'checklist';

const getTodayInKorea = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const formatWon = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;

const emptyCashCounts = (): CashCounts =>
  Object.fromEntries(CASH_DENOMINATIONS.map((value) => [String(value), 0]));

const toNonNegativeNumber = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

const getMonthDateRange = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
};

export default function CashManagementPage() {
  const pathname = usePathname();
  const isReportsPage = pathname?.startsWith('/reports');
  const { isAdmin } = useUser();
  const {
    step: staffOpeningStep,
    previousCash: requiredOpeningCash,
    refresh: refreshStaffOpening,
  } = useStaffOpening();
  const queryClient = useQueryClient();
  const { open, close } = useModal();
  const [activeTab, setActiveTab] = useState<CashManagementTab>(
    isReportsPage ? 'report' : 'save',
  );
  const [tabOrder, setTabOrder] = useState<CashManagementTab[]>([
    'save',
    'history',
    'report',
    'reportLookup',
    'checklist',
  ]);
  const [editingTabOrder, setEditingTabOrder] = useState(false);
  const [businessDate, setBusinessDate] = useState(getTodayInKorea);
  const [openingCash, setOpeningCash] = useState(0);
  const [cashIn, setCashIn] = useState(0);
  const [cashOut, setCashOut] = useState(0);
  const [cashCounts, setCashCounts] = useState<CashCounts>(emptyCashCounts);
  const [note, setNote] = useState('');
  const today = getTodayInKorea();
  const [historyViewMode, setHistoryViewMode] = useState<'month' | 'range'>('month');
  const [historyMonth, setHistoryMonth] = useState(today.slice(0, 7));
  const [historyStartDate, setHistoryStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [historyEndDate, setHistoryEndDate] = useState(today);
  const [reportViewMode, setReportViewMode] = useState<'month' | 'range'>(
    'range',
  );
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [selectedReportId, setSelectedReportId] = useState('');
  const [reportEditRequestKey, setReportEditRequestKey] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem('cash-management-tab-order');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as CashManagementTab[];
      const knownTabs: CashManagementTab[] = [
        'save',
        'history',
        'report',
        'reportLookup',
        'checklist',
      ];
      const normalized = parsed.filter((tab) => knownTabs.includes(tab));
      knownTabs.forEach((tab) => {
        if (!normalized.includes(tab)) normalized.push(tab);
      });
      setTabOrder(normalized);
    } catch {
      window.localStorage.removeItem('cash-management-tab-order');
    }
  }, []);

  const moveTab = (index: number, direction: -1 | 1) => {
    setTabOrder((current) => {
      const visibleTabs = current.filter((tab) =>
        isReportsPage
          ? tab !== 'save' &&
            tab !== 'history' &&
            (isAdmin || (tab !== 'reportLookup' && tab !== 'checklist'))
          : tab === 'save' || tab === 'history',
      );
      const currentTab = current[index];
      const visibleIndex = visibleTabs.indexOf(currentTab);
      const targetTab = visibleTabs[visibleIndex + direction];
      if (!targetTab) return current;
      const target = current.indexOf(targetTab);
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      window.localStorage.setItem(
        'cash-management-tab-order',
        JSON.stringify(next),
      );
      return next;
    });
  };

  const historyDateRange =
    historyViewMode === 'month'
      ? getMonthDateRange(historyMonth)
      : { start: historyStartDate, end: historyEndDate };
  const isHistoryRangeValid =
    Boolean(historyDateRange.start && historyDateRange.end) &&
    historyDateRange.start <= historyDateRange.end;
  const reportDateRange =
    reportViewMode === 'month'
      ? getMonthDateRange(today.slice(0, 7))
      : { start: reportStartDate, end: reportEndDate };
  const isReportRangeValid =
    Boolean(reportDateRange.start && reportDateRange.end) &&
    reportDateRange.start <= reportDateRange.end;

  const dayQuery = useQuery({
    queryKey: cashManagementKeys.day(businessDate),
    queryFn: async () => {
      const [closing, previousClosing, sales, paymentSales, workJournals] = await Promise.all([
        getCashClosing(businessDate),
        getPreviousClosing(businessDate),
        getDailyCashSales(businessDate),
        getDailyPaymentSales(businessDate),
        getWorkJournalsByDate(businessDate),
      ]);
      return { closing, previousClosing, sales, paymentSales, workJournals };
    },
  });

  const historyQuery = useQuery({
    queryKey: cashManagementKeys.history(historyDateRange.start, historyDateRange.end),
    queryFn: () => getCashClosingHistory(historyDateRange.start, historyDateRange.end),
    enabled: isHistoryRangeValid,
  });
  const reportHistoryQuery = useQuery({
    queryKey: ['daily-closing-reports', reportDateRange.start, reportDateRange.end],
    queryFn: () =>
      getDailyClosingReportsByRange(reportDateRange.start, reportDateRange.end),
    enabled: isAdmin && activeTab === 'reportLookup' && isReportRangeValid,
  });

  useEffect(() => {
    if (!dayQuery.data) return;
    const { closing, previousClosing } = dayQuery.data;

    if (closing) {
      setOpeningCash(closing.opening_cash);
      setCashIn(closing.cash_in);
      setCashOut(closing.cash_out);
      setCashCounts({ ...emptyCashCounts(), ...closing.cash_counts });
      setNote(closing.note ?? '');
      return;
    }

    setOpeningCash(previousClosing?.actual_cash ?? 0);
    setCashIn(0);
    setCashOut(0);
    setCashCounts(emptyCashCounts());
    setNote('');
  }, [dayQuery.data]);

  const loadPreviousCashCounts = () => {
    const previousClosing = dayQuery.data?.previousClosing;
    if (!previousClosing) {
      toast.error('불러올 전날 시재가 없습니다.');
      return;
    }
    setCashCounts({
      ...emptyCashCounts(),
      ...previousClosing.cash_counts,
    });
    toast.success('전날 시재를 불러왔습니다.');
  };

  const actualCash = useMemo(
    () =>
      CASH_DENOMINATIONS.reduce(
        (sum, denomination) =>
          sum + denomination * (cashCounts[String(denomination)] ?? 0),
        0,
      ),
    [cashCounts],
  );

  const sales = dayQuery.data?.sales ?? { ovape: 0, eguVape: 0, total: 0 };
  const paymentSales = dayQuery.data?.paymentSales ?? {
    breakdown: [],
    ovapeBreakdown: [],
    eguVapeBreakdown: [],
    itemSummary: [],
    outboundTypeSummary: [],
    deliverySummary: [],
    total: 0,
  };
  const workJournals = dayQuery.data?.workJournals ?? [];
  const workShifts = workJournals.map((journal) => ({
    id: journal.id,
    startTime: journal.start_time.slice(0, 5),
    endTime: journal.end_time.slice(0, 5),
    workerName: journal.worker_name,
  }));
  const cashWorkerName = workShifts.map((shift) => shift.workerName.trim()).filter(Boolean).join(', ');
  const hasWorkerInfo = Boolean(cashWorkerName);
  const expectedCash = openingCash + sales.total + cashIn - cashOut;
  const difference = actualCash - expectedCash;
  const isEditing = Boolean(dayQuery.data?.closing);
  const canModifyClosing = !isEditing || isAdmin || businessDate === today;

  const saveMutation = useMutation({
    mutationFn: () =>
      saveCashClosing({
        businessDate,
        openingCash,
        cashIn,
        cashOut,
        ovapeCashSales: sales.ovape,
        eguCashSales: sales.eguVape,
        expectedCash,
        actualCash,
        cashCounts,
        workShifts,
        workerName: cashWorkerName,
        note: note.trim(),
      }),
    onSuccess: async () => {
      toast.success(isEditing ? '시재가 수정되었습니다.' : '시재가 저장되었습니다.');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: cashManagementKeys.day(businessDate),
        }),
        queryClient.invalidateQueries({
          queryKey: cashManagementKeys.history(),
        }),
      ]);
      window.dispatchEvent(new Event('staff-opening-changed'));
      await refreshStaffOpening();
    },
    onError: (error) => {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : (error as { message?: string })?.message;
      toast.error(
        message
          ? `시재 저장 실패: ${message}`
          : '시재 저장에 실패했습니다. cash_management.sql을 확인해 주세요.',
      );
    },
  });

  const handleSave = () => {
    if (staffOpeningStep === 'attendance') {
      toast.error('시재를 저장하기 전에 근무기록에서 먼저 출근 처리해 주세요.');
      return;
    }
    if (!hasWorkerInfo) {
      toast.error('시재를 저장하려면 해당 날짜의 근무자 정보가 필요합니다.');
      return;
    }
    if (!canModifyClosing) {
      toast.error('staff 계정은 오늘 날짜의 시재만 수정할 수 있습니다.');
      return;
    }
    if (
      staffOpeningStep === 'cash' &&
      requiredOpeningCash !== null &&
      actualCash !== requiredOpeningCash
    ) {
      toast.error(
        `영업 시작 시재는 전날 시재 ${requiredOpeningCash.toLocaleString('ko-KR')}원과 일치해야 합니다.`,
      );
      return;
    }
    if (!isEditing && difference === 0) {
      saveMutation.mutate();
      return;
    }

    const hasDifference = difference !== 0;
    open({
      content: (
        <ConfirmModal
          title={isEditing ? '시재 기록 수정' : '시재 차액 확인'}
          description={
            isEditing
              ? hasDifference
                ? '기존 시재 기록을 수정합니다. 예상 시재와 실제 시재가 다른 상태로 수정하시겠습니까?'
                : '기존에 저장된 시재 기록을 수정하시겠습니까?'
              : '예상 시재와 실제 시재가 다릅니다. 그래도 저장하시겠습니까?'
          }
          confirmLabel={isEditing ? '수정' : '네'}
          cancelLabel="아니오"
          confirmingLabel={isEditing ? '수정 중...' : '저장 중...'}
          onCancel={close}
          onConfirm={async () => {
            try {
              await saveMutation.mutateAsync();
              close();
            } catch {
              // 저장 오류 안내는 saveMutation의 onError에서 표시합니다.
            }
          }}
        />
      ),
      options: { dismissOnBackdrop: false },
    });
  };

  const handleEditHistory = (date: string) => {
    setActiveTab('save');
    setBusinessDate(date);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (dayQuery.isPending) {
    return <Loading size="lg" text="시재 정보를 불러오는 중..." />;
  }

  if (dayQuery.isError) {
    return (
      <div className="mx-auto mt-10 max-w-3xl rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        시재 데이터 표를 불러오지 못했습니다. Supabase에서{' '}
        <code className="font-semibold">docs/cash_management.sql</code>을 먼저
        실행해 주세요.
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <StaffOpeningProgressBanner />
      <div className="flex items-end justify-between border-b border-gray-200">
        <div className="flex min-w-0 overflow-x-auto" role="tablist" aria-label="시재 관리 메뉴">
          {tabOrder.map((tab, index) => {
            if (
              (isReportsPage && (tab === 'save' || tab === 'history')) ||
              (!isReportsPage &&
                (tab === 'report' ||
                  tab === 'reportLookup' ||
                  tab === 'checklist'))
            ) {
              return null;
            }
            if (
              !isAdmin &&
              (tab === 'reportLookup' || tab === 'checklist')
            ) {
              return null;
            }
            const label =
              tab === 'save'
                ? '시재 저장'
                : tab === 'history'
                  ? '시재 이력'
                  : tab === 'report'
                    ? '마감보고서'
                    : tab === 'reportLookup'
                      ? '보고서 조회'
                      : '체크리스트 관리';
            return (
              <div key={tab} className="flex shrink-0 items-center">
                {editingTabOrder && (
                  <button
                    type="button"
                    onClick={() => moveTab(index, -1)}
                    disabled={index === 0}
                    className="h-7 w-6 cursor-pointer text-xs text-gray-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-20"
                    aria-label={`${label} 왼쪽으로 이동`}
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => {
                    if (
                      activeTab === 'reportLookup' &&
                      tab !== 'reportLookup'
                    ) {
                      setReportViewMode('range');
                      setReportStartDate('');
                      setReportEndDate('');
                      setSelectedReportId('');
                    }
                    if (tab === 'report') {
                      setBusinessDate(today);
                    }
                    setActiveTab(tab);
                  }}
                  className={`cursor-pointer border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
                    activeTab === tab
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
                {editingTabOrder && (
                  <button
                    type="button"
                    onClick={() => moveTab(index, 1)}
                    disabled={index === tabOrder.length - 1}
                    className="h-7 w-6 cursor-pointer text-xs text-gray-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-20"
                    aria-label={`${label} 오른쪽으로 이동`}
                  >
                    →
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {isAdmin && <button
          type="button"
          onClick={() => setEditingTabOrder((current) => !current)}
          className={`mb-2 ml-3 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border bg-white transition ${
            editingTabOrder
              ? 'border-brand-300 text-brand-700 shadow-sm'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-700'
          }`}
          aria-label={editingTabOrder ? '탭 순서 변경 완료' : '탭 순서 변경'}
          title={editingTabOrder ? '탭 순서 변경 완료' : '탭 순서 변경'}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Zm7.25-3.25c0-.48-.05-.95-.14-1.4l2.02-1.57-2-3.46-2.48 1a7.4 7.4 0 0 0-2.42-1.4L13.88 2.5h-4l-.35 2.67a7.4 7.4 0 0 0-2.42 1.4l-2.48-1-2 3.46 2.02 1.57a7.18 7.18 0 0 0 0 2.8l-2.02 1.57 2 3.46 2.48-1a7.4 7.4 0 0 0 2.42 1.4l.35 2.67h4l.35-2.67a7.4 7.4 0 0 0 2.42-1.4l2.48 1 2-3.46-2.02-1.57c.09-.45.14-.92.14-1.4Z" />
          </svg>
        </button>}
      </div>

      {activeTab === 'save' && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {isEditing && (
              <span className="self-start rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 sm:self-auto">
                저장된 시재 수정 중
              </span>
            )}
            <div className="w-full sm:w-[280px]">
          <KoreanDatePicker
            value={businessDate}
            onChange={setBusinessDate}
            selectedLabel="선택한 시재 날짜"
          />
            </div>
          </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="전날 시재" value={openingCash} tone="gray" />
        <SummaryCard label="오베이프 현금 매출" value={sales.ovape} tone="brand" prefix="+" />
        <SummaryCard label="이구베이프 현금 매출" value={sales.eguVape} tone="amber" prefix="+" />
        <SummaryCard label="당일 현금 매출 합계" value={sales.total} tone="green" prefix="+" />
      </section>

      <section className="grid items-stretch gap-5 xl:grid-cols-2">
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-gray-900">실제 현금 입력</h2>
                <Button
                  size="xs"
                  variant="gray"
                  onClick={loadPreviousCashCounts}
                  className="border-gray-200 bg-white/80 text-[11px] text-gray-600 shadow-xs hover:border-brand-200 hover:text-brand-700"
                >
                  전날 시재 불러오기
                </Button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                지폐와 동전의 개수를 입력하세요.
              </p>
            </div>
            <div className="text-right">
              <span className="block text-[11px] font-medium text-gray-400">실제 현금 합계</span>
              <strong className="mt-0.5 block text-xl text-brand-700">{formatWon(actualCash)}</strong>
            </div>
          </div>

          <div className="grid flex-1 border-l border-t border-gray-200 md:grid-cols-2">
            {CASH_DENOMINATIONS.map((denomination) => {
              const count = cashCounts[String(denomination)] ?? 0;
              return (
                <label
                  key={denomination}
                  className="grid grid-cols-[minmax(70px,1fr)_80px_minmax(82px,1fr)] items-center gap-3 border-b border-r border-gray-200 px-5 py-2"
                >
                  <span className="text-sm font-medium text-gray-700">
                    {denomination.toLocaleString('ko-KR')}원
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={count || ''}
                    onChange={(event) =>
                      setCashCounts((previous) => ({
                        ...previous,
                        [String(denomination)]: toNonNegativeNumber(event.target.value),
                      }))
                    }
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-right text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-50"
                    placeholder="0"
                    aria-label={`${denomination.toLocaleString('ko-KR')}원 개수`}
                  />
                  <span className="text-right text-xs tabular-nums text-gray-500">
                    {formatWon(denomination * count)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
            <h2 className="font-semibold text-gray-900">근무 및 시재 정산</h2>
            <p className="mt-1 text-xs text-gray-500">근무 정보와 입출금 내역을 확인하고 시재를 저장하세요.</p>
          </div>

          <div className="flex flex-1 flex-col">
            <div className="grid grid-cols-2 gap-4 border-b border-gray-200 p-4">
              <MoneyInput label="시재 입금 (+)" value={cashIn} onChange={setCashIn} />
              <MoneyInput label="출금 (-)" value={cashOut} onChange={setCashOut} />
            </div>

            <div className="grid flex-1 divide-y divide-gray-200 md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="p-4">
                <h3 className="mb-3 text-xs font-semibold text-gray-500">근무자 정보</h3>
                {workShifts.length > 0 ? (
                  <div className="space-y-2">
                    {workShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <span className="text-sm font-medium text-gray-800">{shift.workerName}</span>
                        <span className="shrink-0 text-xs text-gray-500">
                          {shift.startTime} ~ {shift.endTime}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs text-gray-500">
                    선택한 날짜에 등록된 근무일지가 없습니다.
                  </p>
                )}
              </div>

              <label className="block p-4">
                <span className="mb-3 block text-xs font-semibold text-gray-500">메모</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-24 w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-50"
                  placeholder="특이사항을 입력하세요"
                />
              </label>
            </div>

            <div className="border-t border-gray-200 p-4">
              <h3 className="mb-3 text-xs font-semibold text-gray-500">시재 결과</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <AmountRow label="예상" value={expectedCash} strong />
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <AmountRow label="실제" value={actualCash} strong />
                </div>
                <div className={`flex min-w-0 flex-col justify-center rounded-lg border px-4 py-3 ${
                  difference === 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}>
                  <span className="text-xs font-semibold opacity-75">차액</span>
                  <span className="mt-1 whitespace-nowrap text-right text-base font-bold tabular-nums">
                    {difference > 0 ? '+' : ''}{formatWon(difference)}
                  </span>
                </div>
              </div>
              <Button
              className="mt-3 w-full"
              disabled={saveMutation.isPending || !canModifyClosing || !hasWorkerInfo}
              onClick={handleSave}
            >
              {!hasWorkerInfo
                ? '근무자 정보 필요'
                : !canModifyClosing
                ? '수정 권한 없음'
                : saveMutation.isPending
                ? isEditing
                  ? '수정 중...'
                  : '저장 중...'
                : isEditing
                  ? '수정 저장'
                  : '시재 저장'}
              </Button>
            </div>
          </div>
        </div>
      </section>
        </>
      )}

      {activeTab === 'history' && (
      <section className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex justify-end">
          <div className="flex flex-col gap-2 lg:items-end">
            <div className="inline-flex self-start rounded-lg bg-gray-100 p-1 lg:self-auto">
              <button
                type="button"
                onClick={() => setHistoryViewMode('month')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  historyViewMode === 'month'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                월별 보기
              </button>
              <button
                type="button"
                onClick={() => setHistoryViewMode('range')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  historyViewMode === 'range'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                기간 보기
              </button>
            </div>
            {historyViewMode === 'month' ? (
              <input
                type="month"
                value={historyMonth}
                onChange={(event) => setHistoryMonth(event.target.value)}
                className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
            ) : (
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <div className="w-full sm:w-[245px]">
                  <KoreanDatePicker
                    value={historyStartDate}
                    onChange={setHistoryStartDate}
                    selectedLabel="시작 날짜"
                  />
                </div>
                <span className="text-center text-sm text-gray-400">~</span>
                <div className="w-full sm:w-[245px]">
                  <KoreanDatePicker
                    value={historyEndDate}
                    onChange={setHistoryEndDate}
                    selectedLabel="종료 날짜"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        {!isHistoryRangeValid && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            종료 날짜는 시작 날짜보다 빠를 수 없습니다.
          </p>
        )}
        {historyQuery.isPending ? (
          <Loading size="sm" text="이력을 불러오는 중..." />
        ) : historyQuery.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] border-collapse text-sm [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-brand-200">
              <thead className="bg-brand-50 text-left text-xs text-brand-700">
                <tr>
                  <th className="px-3 py-2">날짜</th>
                  <th className="px-3 py-2">근무자</th>
                  <th className="px-3 py-2 text-right">오베이프 현금 매출</th>
                  <th className="px-3 py-2 text-right">이구베이프 현금 매출</th>
                  <th className="px-3 py-2 text-right">별도 입금</th>
                  <th className="px-3 py-2 text-right">출금</th>
                  <th className="px-3 py-2 text-right">예상</th>
                  <th className="px-3 py-2 text-right">실제</th>
                  <th className="px-3 py-2 text-right">차액</th>
                  <th className="px-3 py-2 text-center">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historyQuery.data.map((closing) => {
                  const historyDifference = closing.actual_cash - closing.expected_cash;
                  return (
                    <tr key={closing.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {formatKoreanDate(closing.business_date)}
                      </td>
                      <td className="px-3 py-2.5">{closing.worker_name || '-'}</td>
                      <td className="px-3 py-2.5 text-right">
                        {formatWon(closing.ovape_cash_sales)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {formatWon(closing.egu_cash_sales)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-600">
                        {closing.cash_in > 0 ? '+' : ''}{formatWon(closing.cash_in)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-rose-600">
                        {closing.cash_out > 0 ? '-' : ''}{formatWon(closing.cash_out)}
                      </td>
                      <td className="px-3 py-2.5 text-right">{formatWon(closing.expected_cash)}</td>
                      <td className="px-3 py-2.5 text-right">{formatWon(closing.actual_cash)}</td>
                      <td
                        className={`px-3 py-2.5 text-right font-medium ${
                          historyDifference === 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {historyDifference > 0 ? '+' : ''}{formatWon(historyDifference)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {isAdmin || closing.business_date === today ? (
                          <Button
                            size="sm"
                            variant="gray"
                            onClick={() => handleEditHistory(closing.business_date)}
                          >
                            수정
                          </Button>
                        ) : <span className="text-xs text-gray-400">수정 불가</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-gray-500">저장된 시재가 없습니다.</p>
        )}
      </section>
      )}

      {isReportsPage && activeTab === 'report' && (
        <div>
          <DailyClosingReport
            businessDate={businessDate}
            workJournals={workJournals}
            paymentSales={paymentSales}
            expectedCash={expectedCash}
            actualCash={actualCash}
            hasCashClosing={Boolean(dayQuery.data?.closing)}
            showDatePicker={isAdmin}
            onDateChange={setBusinessDate}
          />
        </div>
      )}

      {isReportsPage && isAdmin && activeTab === 'reportLookup' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
              <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
                <p className="mb-1 text-xs font-semibold text-gray-600">
                  조회 기간
                </p>
                <Dropdown controlledValue={reportViewMode}>
                  <Dropdown.Trigger compact>
                    {reportViewMode === 'month' ? '당월' : '날짜 선택'}
                  </Dropdown.Trigger>
                  <Dropdown.Content compact>
                    {(
                      [
                        { value: 'month', label: '당월' },
                        { value: 'range', label: '날짜 선택' },
                      ] as const
                    ).map((option) => (
                      <Dropdown.Item
                        key={option.value}
                        option={option}
                        compact
                        onSelect={(selected: DropdownOption) =>
                          {
                            setReportViewMode(
                              selected.value as 'month' | 'range',
                            );
                            setSelectedReportId('');
                          }
                        }
                      />
                    ))}
                  </Dropdown.Content>
                </Dropdown>
              </div>
              {reportViewMode === 'range' && (
                <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
                  <p className="mb-1 text-xs font-semibold text-gray-600">
                    날짜 선택
                  </p>
                  <KoreanDateRangePicker
                    startDate={reportStartDate}
                    endDate={reportEndDate}
                    iconOnly
                    onApply={(start, end) => {
                      setReportStartDate(start);
                      setReportEndDate(end);
                      setSelectedReportId('');
                    }}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="font-bold text-gray-900">마감보고서</h2>
              <span className="text-sm font-semibold text-brand-600">
                {reportHistoryQuery.data?.length ?? 0}건
              </span>
            </div>
            {!isReportRangeValid ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                조회할 날짜를 선택해 주세요.
              </p>
            ) : reportHistoryQuery.isPending ? (
              <Loading size="sm" text="보고서를 불러오는 중..." />
            ) : reportHistoryQuery.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-brand-200">
                  <thead className="bg-brand-50 text-left text-xs text-brand-700">
                    <tr>
                      <th className="px-3 py-2.5">마감 날짜</th>
                      <th className="px-3 py-2.5">마감 근무자</th>
                      <th className="px-3 py-2.5 text-right">총 매출</th>
                      <th className="px-3 py-2.5 text-center">시재 현황</th>
                      <th className="px-3 py-2.5 text-right">입력 근무시간</th>
                      <th className="px-3 py-2.5">청소 현황·방식</th>
                      <th className="px-3 py-2.5">특이사항·전달사항</th>
                      <th className="px-3 py-2.5 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportHistoryQuery.data.map((report) => (
                      <tr
                        key={report.id}
                        onClick={() =>
                          setSelectedReportId((current) =>
                            current === report.id ? '' : report.id,
                          )
                        }
                        className={`cursor-pointer hover:bg-brand-50 ${
                          selectedReportId === report.id ? 'bg-brand-50' : ''
                        }`}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {formatKoreanDate(report.business_date)}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-gray-900">
                          {report.closer_worker_name}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          {formatWon(report.total_sales)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                              report.cash_difference === 0
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {report.cash_difference === 0 ? '일치' : '불일치'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {Number(report.input_work_hours).toLocaleString(
                            'ko-KR',
                          )}
                          시간
                        </td>
                        <td className="max-w-[240px] px-3 py-2.5 text-gray-600">
                          {report.cleaning_note || '-'}
                        </td>
                        <td className="max-w-[240px] px-3 py-2.5 text-gray-600">
                          {report.special_note || '-'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Button
                            size="sm"
                            variant="gray"
                            onClick={(event) => {
                              event?.stopPropagation();
                              setSelectedReportId(report.id);
                              setReportEditRequestKey((current) => current + 1);
                            }}
                          >
                            수정
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                선택한 기간에 저장된 마감보고서가 없습니다.
              </p>
            )}
          </section>
          {selectedReportId &&
            reportHistoryQuery.data?.find(
              (report) => report.id === selectedReportId,
            ) && (
              <ReportSnapshotView
                report={
                  reportHistoryQuery.data.find(
                    (report) => report.id === selectedReportId,
                  )!
                }
                editRequestKey={reportEditRequestKey}
              />
            )}
        </div>
      )}

      {isReportsPage && isAdmin && activeTab === 'checklist' && (
        <ChecklistManagement />
      )}
    </main>
  );
}

const SummaryCard = ({
  label,
  value,
  tone,
  prefix = '',
}: {
  label: string;
  value: number;
  tone: 'gray' | 'brand' | 'amber' | 'green';
  prefix?: string;
}) => {
  const toneClass = {
    gray: 'border-gray-200 bg-gray-50 text-gray-800',
    brand: 'border-brand-100 bg-brand-50 text-brand-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-medium opacity-75">{label}</p>
      <p className="mt-2 text-lg font-bold">{prefix}{formatWon(value)}</p>
    </div>
  );
};

const MoneyInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
    <div className="relative">
      <input
        type="number"
        min="0"
        value={value || ''}
        onChange={(event) => onChange(toNonNegativeNumber(event.target.value))}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-8 text-right text-sm outline-none focus:border-brand-400"
        placeholder="0"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
    </div>
  </label>
);

const AmountRow = ({
  label,
  value,
  strong = false,
  prefix = '',
}: {
  label: string;
  value: number;
  strong?: boolean;
  prefix?: string;
}) => (
  <div className="flex min-w-0 flex-col justify-center text-gray-600">
    <span className="text-xs font-semibold text-gray-500">{label}</span>
    <span className={`mt-1 whitespace-nowrap text-right text-base tabular-nums ${strong ? 'font-bold text-gray-900' : ''}`}>
      {prefix}{formatWon(value)}
    </span>
  </div>
);
