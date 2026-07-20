'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import {
  getCashClosing,
  getCashClosingHistory,
  getDailyCashSales,
  getPreviousClosing,
  saveCashClosing,
} from '@/app/_domains/_cashManagement/_services/cashManagementService';
import { cashManagementKeys } from '@/app/_domains/_cashManagement/_queryKeys/cashManagementKeys';
import {
  CASH_DENOMINATIONS,
  CashCounts,
} from '@/app/_domains/_cashManagement/_types/cashManagement.types';
import KoreanDatePicker, { formatKoreanDate } from '@/app/_components/KoreanDatePicker';
import { getWorkJournalsByDate } from '@/app/_domains/_workJournal/_services/workJournalService';
import { useModal } from '@/app/_contexts/ModalContext';
import ConfirmModal from '@/app/(auth)/_components/ConfirmModal';

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
  const queryClient = useQueryClient();
  const { open, close } = useModal();
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

  const historyDateRange =
    historyViewMode === 'month'
      ? getMonthDateRange(historyMonth)
      : { start: historyStartDate, end: historyEndDate };
  const isHistoryRangeValid =
    Boolean(historyDateRange.start && historyDateRange.end) &&
    historyDateRange.start <= historyDateRange.end;

  const dayQuery = useQuery({
    queryKey: cashManagementKeys.day(businessDate),
    queryFn: async () => {
      const [closing, previousClosing, sales, workJournals] = await Promise.all([
        getCashClosing(businessDate),
        getPreviousClosing(businessDate),
        getDailyCashSales(businessDate),
        getWorkJournalsByDate(businessDate),
      ]);
      return { closing, previousClosing, sales, workJournals };
    },
  });

  const historyQuery = useQuery({
    queryKey: cashManagementKeys.history(historyDateRange.start, historyDateRange.end),
    queryFn: () => getCashClosingHistory(historyDateRange.start, historyDateRange.end),
    enabled: isHistoryRangeValid,
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
  const workJournals = dayQuery.data?.workJournals ?? [];
  const workShifts = workJournals.map((journal) => ({
    id: journal.id,
    startTime: journal.start_time.slice(0, 5),
    endTime: journal.end_time.slice(0, 5),
    workerName: journal.worker_name,
  }));
  const expectedCash = openingCash + sales.total + cashIn - cashOut;
  const difference = actualCash - expectedCash;

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
        workerName: workShifts
          .map((shift) => shift.workerName.trim())
          .filter(Boolean)
          .join(', '),
        note: note.trim(),
      }),
    onSuccess: async () => {
      toast.success('시재가 저장되었습니다.');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: cashManagementKeys.day(businessDate),
        }),
        queryClient.invalidateQueries({
          queryKey: cashManagementKeys.history(),
        }),
      ]);
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
    if (difference === 0) {
      saveMutation.mutate();
      return;
    }

    open({
      content: (
        <ConfirmModal
          title="시재 차액 확인"
          description="예상 시재와 실제 시재가 다릅니다. 그래도 저장하시겠습니까?"
          confirmLabel="네"
          cancelLabel="아니오"
          confirmingLabel="저장 중..."
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">시재 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            현금·현금영수증 매출만 자동으로 반영됩니다.
          </p>
        </div>
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
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-gray-900">실제 현금 입력</h2>
              <p className="mt-1 text-xs text-gray-500">
                지폐와 동전의 개수를 입력하세요.
              </p>
            </div>
            <div className="text-right">
              <span className="block text-[11px] font-medium text-gray-400">실제 현금 합계</span>
              <strong className="mt-0.5 block text-xl text-brand-700">{formatWon(actualCash)}</strong>
            </div>
          </div>

          <div className="grid h-[260px] gap-x-6 px-5 py-2 md:grid-cols-2">
            {CASH_DENOMINATIONS.map((denomination) => {
              const count = cashCounts[String(denomination)] ?? 0;
              return (
                <label
                  key={denomination}
                  className="grid grid-cols-[minmax(70px,1fr)_80px_minmax(82px,1fr)] items-center gap-3 border-b border-gray-100 py-2 last:border-b-0 md:[&:nth-last-child(2)]:border-b-0"
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

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">시재 계산</h2>
            <p className="mt-1 text-xs text-gray-500">오늘 보유해야 할 현금과 실제 현금을 비교합니다.</p>
          </div>

          <div className="h-[260px] px-5 py-2">
            <div className="flex h-1/4 items-center border-b border-gray-100">
              <CalculationMoneyRow
                label="전날 시재"
                value={openingCash}
                onChange={setOpeningCash}
              />
            </div>
            <div className="flex h-1/4 items-center border-b border-gray-100">
              <CalculationMoneyRow label="오베이프 현금 매출" value={sales.ovape} readOnly />
            </div>
            <div className="flex h-1/4 items-center border-b border-gray-100">
              <CalculationMoneyRow label="이구베이프 현금 매출" value={sales.eguVape} readOnly />
            </div>
            <div className="flex h-1/4 items-center">
              <div className="grid w-full grid-cols-2 gap-3">
                  <MoneyInput label="별도 입금 (+)" value={cashIn} onChange={setCashIn} />
                  <MoneyInput label="출금 (-)" value={cashOut} onChange={setCashOut} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="font-semibold text-gray-900">근무 및 시재 정산</h2>
        </div>
        <div className="grid divide-y divide-gray-100 xl:grid-cols-[1fr_1.25fr_1fr] xl:divide-x xl:divide-y-0">
          <div className="p-5">
            <h3 className="mb-3 text-xs font-semibold text-gray-500">근무자 정보</h3>
              {workShifts.length > 0 ? (
                <div className="space-y-2">
                  {workShifts.map((shift) => (
                  <div
                    key={shift.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                  >
                    <span className="text-sm font-medium text-gray-800">
                      {shift.workerName}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {shift.startTime} ~ {shift.endTime}
                    </span>
                  </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg bg-gray-50 px-3 py-3 text-center text-xs text-gray-500">
                  선택한 날짜에 등록된 근무일지가 없습니다.
                </p>
              )}
          </div>

          <label className="block p-5">
            <span className="mb-3 block text-xs font-semibold text-gray-500">메모</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-28 w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-50"
                placeholder="특이사항을 입력하세요"
              />
          </label>

          <div className="flex flex-col p-5">
            <h3 className="mb-3 text-xs font-semibold text-gray-500">시재 결과</h3>
            <div className="flex-1 space-y-3 text-sm">
              <div className="border-b border-gray-100 pb-3">
                <AmountRow label="예상 시재" value={expectedCash} strong />
              </div>
              <div className="border-b border-gray-100 pb-3">
                <AmountRow label="실제 시재" value={actualCash} strong />
              </div>
              <div className={`flex items-center justify-between font-bold ${
                difference === 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                <span>시재 차액</span>
                <span>{difference > 0 ? '+' : ''}{formatWon(difference)}</span>
              </div>
            </div>

            <Button
              className="mt-5 w-full"
              disabled={saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending ? '저장 중...' : '시재 저장'}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">최근 시재 이력</h2>
            <p className="mt-1 text-xs text-gray-500">월별 또는 원하는 기간의 시재 기록을 확인하세요.</p>
          </div>
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
            <table className="w-full min-w-[940px] text-sm">
              <thead className="bg-brand-50 text-left text-xs text-brand-700">
                <tr>
                  <th className="px-3 py-2">날짜</th>
                  <th className="px-3 py-2">근무자</th>
                  <th className="px-3 py-2 text-right">오베이프 현금 매출</th>
                  <th className="px-3 py-2 text-right">이구베이프 현금 매출</th>
                  <th className="px-3 py-2 text-right">예상 시재</th>
                  <th className="px-3 py-2 text-right">실제 시재</th>
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
                        <Button
                          size="sm"
                          variant="gray"
                          onClick={() => handleEditHistory(closing.business_date)}
                        >
                          수정
                        </Button>
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

const CalculationMoneyRow = ({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
}) => (
  <label className="flex w-full items-center justify-between gap-4">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <div className="relative w-[190px] shrink-0">
      <input
        type="number"
        min="0"
        value={value || ''}
        readOnly={readOnly}
        onChange={(event) => onChange?.(toNonNegativeNumber(event.target.value))}
        className={`w-full rounded-lg border px-3 py-2 pr-8 text-right text-sm outline-none ${
          readOnly
            ? 'border-gray-200 bg-gray-50 text-gray-700'
            : 'border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-50'
        }`}
        placeholder="0"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
        원
      </span>
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
  <div className="flex items-center justify-between text-gray-600">
    <span>{label}</span>
    <span className={strong ? 'font-bold text-gray-900' : ''}>{prefix}{formatWon(value)}</span>
  </div>
);
