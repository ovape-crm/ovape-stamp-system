'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showConfirmDialog } from '@/app/_components/AppDialog';
import Button from '@/app/_components/Button';
import KoreanDatePicker from '@/app/_components/KoreanDatePicker';
import Loading from '@/app/_components/Loading';
import { useUser } from '@/app/_contexts/UserContext';
import { useItems } from '@/app/_domains/_item/_hooks/useItems';
import type { LiqudStandCell, LiqudStandSection } from '@/app/_domains/_liqudStand/_types/liqudStand.types';
import {
  clearLiqudCell,
  createLiqudSection,
  deleteLiqudStandLine,
  deleteLiqudSection,
  getLiqudStand,
  moveLiqudStandCell,
  resizeLiqudSection,
  saveLiqudCell,
  updateLiqudSection,
  updateLiqudSettings,
} from '@/app/_domains/_liqudStand/_services/liqudStandService';

const queryKey = ['liqud-stand'] as const;
const consumables = [
  { name: '발라 0.6', color: '#ff1717' }, { name: '리부트 0.6', color: '#f050d8' },
  { name: '하복 0.25', color: '#f4b323' }, { name: '발라 0.8', color: '#4776bf' },
  { name: '맥 0.8', color: '#fff200' }, { name: '맥 1.0', color: '#8ed252' },
  { name: '스퀘어팟레드', color: '#29aeca' },
];
type StatusFilter = 'all' | 'black' | 'blue' | 'red';
type CellPosition = { sectionId: string; row: number; column: number; cell: LiqudStandCell };

const getDays = (date: string | null) => {
  if (!date) return 0;
  const today = new Date();
  const start = new Date(`${date}T00:00:00`);
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((current.getTime() - start.getTime()) / 86400000));
};

export default function LiqudStandPage() {
  const { isAdmin } = useUser();
  const client = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sectionFilters, setSectionFilters] = useState<Record<string, StatusFilter>>({});
  const [selectedDate, setSelectedDate] = useState('');
  const [itemNameSearch, setItemNameSearch] = useState('');
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [allowMultipleSections, setAllowMultipleSections] = useState(false);
  const [editing, setEditing] = useState<{ section: LiqudStandSection; row: number; column: number; cell?: LiqudStandCell } | null>(null);
  const [moveSource, setMoveSource] = useState<CellPosition | null>(null);
  const [resizeConfirm, setResizeConfirm] = useState<{
    section: LiqudStandSection;
    direction: 'row' | 'column';
    index: number;
    itemNames: string[];
  } | null>(null);
  const [lineDeleteMode, setLineDeleteMode] = useState<{
    sectionId: string;
    direction: 'row' | 'column';
  } | null>(null);
  const [lineAddConfirm, setLineAddConfirm] = useState<{
    section: LiqudStandSection;
    direction: 'row' | 'column';
  } | null>(null);
  const [layoutEditingSectionId, setLayoutEditingSectionId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const query = useQuery({ queryKey, queryFn: getLiqudStand, retry: false });
  const refresh = () => client.invalidateQueries({ queryKey });
  const mutation = useMutation({
    mutationFn: async (task: () => Promise<void>) => task(),
    onSuccess: refresh,
    onError: (error: { message?: string; code?: string }) => {
      console.error('시연대 저장 오류:', error);
      const schemaError =
        error.code === 'PGRST204' ||
        error.code === '42703' ||
        error.message?.includes('secondary_item_name') ||
        error.message?.includes('item_name');
      toast.error(
        schemaError
          ? '시연대 DB가 이전 버전입니다. 최신 liqud_stand.sql을 다시 실행해 주세요.'
          : `시연대 저장 실패${error.message ? `: ${error.message}` : ''}`,
      );
    },
  });

  const handleCellMove = async (
    source: CellPosition,
    target: { sectionId: string; row: number; column: number; cell?: LiqudStandCell },
  ) => {
    if (source.sectionId === target.sectionId && source.row === target.row && source.column === target.column) {
      setMoveSource(null);
      return;
    }
    if (target.cell?.item_name) {
      const sourceItems = [source.cell.item_name, source.cell.secondary_item_name]
        .filter(Boolean)
        .join(' / ');
      const targetItems = [target.cell.item_name, target.cell.secondary_item_name]
        .filter(Boolean)
        .join(' / ');
      if (!(await showConfirmDialog({ title: '품목 위치 교환', description: `‘${sourceItems}’와 ‘${targetItems}’의 위치를 교환할까요?`, confirmLabel: '위치 교환' }))) {
        setMoveSource(null);
        return;
      }
    }
    mutation.mutate(async () => {
      await moveLiqudStandCell(
        { ...source, cellId: source.cell.id },
        { ...target, cellId: target.cell?.id },
      );
      toast.success(target.cell?.item_name ? '두 칸의 위치를 교환했습니다.' : '시연대 칸을 이동했습니다.');
    });
    setMoveSource(null);
  };

  const requestLineDelete = (
    section: LiqudStandSection,
    direction: 'row' | 'column',
    targetIndex: number,
  ) => {
    const targetCells = section.liqud_stand_cells.filter((cell) =>
      direction === 'row'
        ? cell.row_index === targetIndex
        : cell.column_index === targetIndex,
    );
    const itemNames = [...new Set(
      targetCells.flatMap((cell) => [cell.item_name, cell.secondary_item_name]).filter(Boolean),
    )] as string[];
    setResizeConfirm({ section, direction, index: targetIndex, itemNames });
    setLineDeleteMode(null);
  };

  if (query.isPending) return <Loading size="lg" text="시연대를 불러오는 중..." />;
  if (query.isError || !query.data) {
    const error = query.error as { code?: string; message?: string; details?: string; hint?: string } | null;
    const errorText = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' · ');
    return (
      <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
        <p className="font-semibold">시연대 DB를 불러오지 못했습니다.</p>
        <p className="mt-2 break-words text-sm">{errorText || 'liqud_stand.sql을 실행해 주세요.'}</p>
      </div>
    );
  }
  const { settings, sections } = query.data;
  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'black', label: `당일~${settings.blue_days - 1}일` },
    { value: 'blue', label: `${settings.blue_days}일~${settings.red_days - 1}일` },
    { value: 'red', label: `${settings.red_days}일~` },
  ];
  const getCellStatus = (cell: LiqudStandCell): Exclude<StatusFilter, 'all'> => {
    const days = getDays(cell.installed_on);
    return days >= settings.red_days ? 'red' : days >= settings.blue_days ? 'blue' : 'black';
  };
  const visibleSections = selectedSectionIds.length
    ? sections.filter((section) => selectedSectionIds.includes(section.id))
    : sections;
  const normalizedItemNameSearch = itemNameSearch
    .trim()
    .toLocaleLowerCase('ko-KR');
  const matchesItemNameSearch = (cell?: LiqudStandCell) => {
    if (!normalizedItemNameSearch) return true;
    return [cell?.items?.item_name, cell?.item_name, cell?.secondary_item?.item_name, cell?.secondary_item_name]
      .some((name) =>
        name?.toLocaleLowerCase('ko-KR').includes(normalizedItemNameSearch),
      );
  };
  const dateConsumableCounts = visibleSections
    .flatMap((section) => section.liqud_stand_cells)
    .filter((cell) =>
      selectedDate &&
      cell.item_name &&
      cell.installed_on === selectedDate &&
      matchesItemNameSearch(cell),
    )
    .reduce<Record<string, number>>((result, cell) => {
      const name = cell.consumable_type || '미지정';
      result[name] = (result[name] ?? 0) + 1;
      return result;
    }, {});

  return (
    <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
          <div className="grid w-full gap-4 text-left sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-2 flex min-h-6 items-center text-xs font-semibold text-gray-500">날짜</p>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><KoreanDatePicker value={selectedDate} onChange={setSelectedDate} selectedLabel="선택한 교체 날짜" /></div>
                {selectedDate && <Button size="xs" variant="gray" onClick={() => setSelectedDate('')}>해제</Button>}
              </div>
            </div>
            <label className="block min-w-0 sm:border-l sm:border-gray-200 sm:pl-4">
              <span className="mb-2 flex min-h-6 items-center text-xs font-semibold text-gray-500">
                품목명
              </span>
              <span className="relative block">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
                  />
                </svg>
                <input
                  value={itemNameSearch}
                  onChange={(event) => setItemNameSearch(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  placeholder="품목명 입력"
                />
                {itemNameSearch && (
                  <button
                    type="button"
                    onClick={() => setItemNameSearch('')}
                    aria-label="품목명 검색어 지우기"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300"
                  >
                    ×
                  </button>
                )}
              </span>
            </label>
          </div>
          <div className="text-left lg:border-l lg:border-gray-200 lg:pl-4">
            <div className="mb-2 flex min-h-6 items-center gap-2">
              <p className="text-xs font-semibold text-gray-500">구역</p>
              <label className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold leading-none transition ${allowMultipleSections ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                <input
                  type="checkbox"
                  checked={allowMultipleSections}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setAllowMultipleSections(checked);
                    if (!checked) setSelectedSectionIds((current) => current.slice(-1));
                  }}
                  className="peer sr-only"
                />
                <span className="relative h-4 w-7 rounded-full bg-gray-300 transition peer-checked:bg-brand-500 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-3" />
                중복 선택
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setSelectedSectionIds([])} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${selectedSectionIds.length === 0 ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'}`}>전체</button>
              {sections.map((section) => {
                const selected = selectedSectionIds.includes(section.id);
                return <button key={section.id} type="button" onClick={() => setSelectedSectionIds((current) => selected ? current.filter((id) => id !== section.id) : allowMultipleSections ? [...current, section.id] : [section.id])} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${selected ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'}`}>{section.name}</button>;
              })}
            </div>
          </div>
          <div className="relative text-left lg:border-l lg:border-gray-200 lg:pl-4">
            <p className="mb-2 flex min-h-6 items-center text-xs font-semibold text-gray-500">기간</p>
            <div className={`flex flex-wrap items-center gap-1.5 ${isAdmin ? 'pr-20' : ''}`}>
              {filterOptions.map(({ value, label }) => {
                return <button key={value} onClick={() => { setFilter(value !== 'all' && filter === value ? 'all' : value); setSectionFilters({}); }} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${filter === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'}`}>{label}</button>;
              })}
            </div>
            {isAdmin && (
              <div className="absolute right-0 top-1/2 flex -translate-y-1/2 flex-col items-stretch gap-1 border-l border-gray-200 pl-3">
                <ThresholdEditor blue={settings.blue_days} red={settings.red_days} onSave={(blue, red) => mutation.mutate(async () => { await updateLiqudSettings(blue, red); toast.success('색상 기준이 저장되었습니다.'); })} />
                <SectionCreator onCreate={(name) => mutation.mutate(async () => { await createLiqudSection(name, sections.length); toast.success(`'${name}' 표가 추가되었습니다.`); })} />
              </div>
            )}
          </div>
        </div>
        {selectedDate && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.keys(dateConsumableCounts).length ? Object.entries(dateConsumableCounts).map(([name, count]) => (
              <span key={name} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-700">{name} {count}개</span>
            )) : <p className="text-sm text-gray-400">선택한 날짜에 등록된 소모품이 없습니다.</p>}
          </div>
        )}
      </div>

      {moveSource && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-amber-800">
            {moveSource.cell.item_name} 이동 중 · 이동할 칸을 선택하세요.
          </p>
          <Button size="xs" variant="gray" onClick={() => setMoveSource(null)}>이동 취소</Button>
        </div>
      )}
      {lineDeleteMode && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-rose-700">
            삭제할 {lineDeleteMode.direction === 'row' ? '가로줄' : '세로줄'}의 아무 칸이나 선택하세요.
          </p>
          <Button size="xs" variant="gray" onClick={() => setLineDeleteMode(null)}>선택 취소</Button>
        </div>
      )}

      {visibleSections.map((section) => (
        <section key={section.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {isAdmin && layoutEditingSectionId === section.id ? (
                <SectionNameEditor
                  name={section.name}
                  onChange={(name) => mutation.mutate(async () => {
                    await updateLiqudSection(section.id, { name });
                    toast.success('표 이름이 변경되었습니다.');
                  })}
                />
              ) : <h2 className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900">{section.name}</h2>}
              {filterOptions.map(({ value, label }) => {
                const sectionFilter = sectionFilters[section.id] ?? filter;
                return <button key={value} type="button" onClick={() => setSectionFilters((current) => ({ ...current, [section.id]: value !== 'all' && sectionFilter === value ? 'all' : value }))} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${sectionFilter === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'}`}>{label}</button>;
              })}
              {(() => {
                const activeFilter = sectionFilters[section.id] ?? filter;
                const consumableCounts = section.liqud_stand_cells
                  .filter((cell) =>
                    cell.item_name &&
                    (!selectedDate || cell.installed_on === selectedDate) &&
                    matchesItemNameSearch(cell) &&
                    (activeFilter === 'all' || getCellStatus(cell) === activeFilter),
                  )
                  .reduce<Record<string, number>>((result, cell) => {
                    const name = cell.consumable_type || '미지정';
                    result[name] = (result[name] ?? 0) + 1;
                    return result;
                  }, {});
                const entries = Object.entries(consumableCounts);
                return entries.length ? (
                  <div className="ml-1 flex flex-wrap items-center gap-1.5 border-l border-gray-200 pl-2">
                    {entries.map(([name, count]) => <span key={name} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{name} {count}개</span>)}
                  </div>
                ) : null;
              })()}
            </div>
            {isAdmin && layoutEditingSectionId !== section.id && (
              <Button size="xs" variant="gray" onClick={() => setLayoutEditingSectionId(section.id)}>표 편집</Button>
            )}
            {isAdmin && layoutEditingSectionId === section.id && <div className="flex flex-wrap gap-1">
              <Button size="xs" variant="gray" onClick={() => setLineAddConfirm({ section, direction: 'row' })}>가로줄 추가</Button>
              <Button size="xs" variant="gray" onClick={() => setLineAddConfirm({ section, direction: 'column' })}>세로줄 추가</Button>
              <Button size="xs" variant={lineDeleteMode?.sectionId === section.id && lineDeleteMode.direction === 'row' ? 'danger' : 'gray'} disabled={section.row_count <= 1} onClick={() => setLineDeleteMode((current) => current?.sectionId === section.id && current.direction === 'row' ? null : { sectionId: section.id, direction: 'row' })}>가로줄 선택 삭제</Button>
              <Button size="xs" variant={lineDeleteMode?.sectionId === section.id && lineDeleteMode.direction === 'column' ? 'danger' : 'gray'} disabled={section.column_count <= 1} onClick={() => setLineDeleteMode((current) => current?.sectionId === section.id && current.direction === 'column' ? null : { sectionId: section.id, direction: 'column' })}>세로줄 선택 삭제</Button>
              <Button size="xs" variant="danger" disabled={sections.length <= 1} onClick={async () => { const confirmed = await showConfirmDialog({ title: '구역 표 삭제', description: `‘${section.name}’ 표와 안의 데이터를 모두 삭제할까요?`, confirmLabel: '표 삭제', tone: 'danger' }); if (confirmed) mutation.mutate(async () => { await deleteLiqudSection(section.id); toast.success('구역 표가 삭제되었습니다.'); }); }}>표 삭제</Button>
              <Button size="xs" onClick={() => { setLayoutEditingSectionId(null); setLineDeleteMode(null); }}>편집 완료</Button>
            </div>}
          </div>
          <div className="overflow-x-auto">
            <div className="grid w-full min-w-[900px] gap-1" style={{ gridTemplateColumns: `repeat(${section.column_count}, minmax(0, 1fr))` }}>
              {Array.from({ length: section.row_count * section.column_count }, (_, index) => {
                const row = Math.floor(index / section.column_count); const column = index % section.column_count;
                const cell = section.liqud_stand_cells.find((c) => c.row_index === row && c.column_index === column);
                const days = getDays(cell?.installed_on ?? null);
                const status: Exclude<StatusFilter, 'all'> = days >= settings.red_days ? 'red' : days >= settings.blue_days ? 'blue' : 'black';
                const activeFilter = sectionFilters[section.id] ?? filter;
                const matchesStatus = activeFilter === 'all' || (Boolean(cell?.item_name) && activeFilter === status);
                const matchesDate = !selectedDate || (Boolean(cell?.item_name) && cell?.installed_on === selectedDate);
                const matchesSearch = matchesItemNameSearch(cell);
                const visible = matchesStatus && matchesDate && matchesSearch;
                const bg = consumables.find((c) => c.name === cell?.consumable_type)?.color ?? '#ffffff';
                const position = cell ? { sectionId: section.id, row, column, cell } : null;
                const isMovingSource = moveSource?.sectionId === section.id && moveSource.row === row && moveSource.column === column;
                const isLineDeleteActive = lineDeleteMode?.sectionId === section.id;
                return <button
                  key={`${row}-${column}`}
                  draggable={Boolean(isAdmin && cell?.item_name && !isLineDeleteActive)}
                  onDragStart={(event) => {
                    if (!position) return;
                    event.dataTransfer.setData('application/json', JSON.stringify(position));
                    event.dataTransfer.effectAllowed = 'move';
                    setMoveSource(position);
                  }}
                  onDragEnd={() => setMoveSource(null)}
                  onDragOver={(event) => { if (isAdmin) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
                  onDrop={(event) => {
                    event.preventDefault();
                    try {
                      const source = JSON.parse(event.dataTransfer.getData('application/json')) as CellPosition;
                      handleCellMove(source, { sectionId: section.id, row, column, cell });
                    } catch { setMoveSource(null); }
                  }}
                  onPointerDown={() => {
                    if (!position || !isAdmin || isLineDeleteActive) return;
                    longPressTimer.current = setTimeout(() => {
                      suppressClick.current = true;
                      setMoveSource(position);
                      toast('이동할 칸을 선택하세요.', { icon: '↔️' });
                    }, 500);
                  }}
                  onPointerUp={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                  onPointerCancel={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                  onPointerLeave={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                  onClick={() => {
                    if (isLineDeleteActive) {
                      requestLineDelete(
                        section,
                        lineDeleteMode.direction,
                        lineDeleteMode.direction === 'row' ? row : column,
                      );
                      return;
                    }
                    if (suppressClick.current) { suppressClick.current = false; return; }
                    if (moveSource) {
                      handleCellMove(moveSource, { sectionId: section.id, row, column, cell });
                      return;
                    }
                    setEditing({ section, row, column, cell });
                  }}
                  className={`flex min-h-[98px] flex-col overflow-hidden rounded border bg-white p-0 text-center transition ${visible ? '' : 'invisible pointer-events-none'} ${isMovingSource ? 'border-amber-500 ring-4 ring-amber-200' : 'border-gray-300'} ${isLineDeleteActive ? 'cursor-crosshair hover:border-rose-500 hover:ring-2 hover:ring-rose-200' : isAdmin ? 'cursor-grab hover:ring-2 hover:ring-brand-300 active:cursor-grabbing' : 'cursor-pointer hover:ring-2 hover:ring-brand-200'}`}
                >
                  <span className={`flex w-full shrink-0 items-center justify-between gap-1 border-b border-[#dec79f] bg-[#f3dfbd] px-2 py-1 text-sm font-semibold leading-tight ${status === 'red' ? 'text-red-600' : status === 'blue' ? 'text-blue-600' : 'text-gray-900'}`}>
                    <span className="text-[11px] font-bold text-amber-900/60">1-{column + 1}</span>
                    <span>{cell?.installed_on ? `${cell.installed_on.slice(2, 4)}년 ${cell.installed_on.slice(5).replace('-', '월 ')}일` : '\u00a0'}</span>
                  </span>
                  <div className="flex min-h-12 w-full flex-1 flex-col justify-center border-b border-gray-200 bg-white px-2 py-1">
                    <span className="block text-sm font-semibold leading-tight text-gray-900">{cell?.items?.item_name ?? cell?.item_name ?? '빈 칸'}</span>
                    {cell?.secondary_item_name && (
                      <span className="mt-0.5 block border-t border-black/10 pt-0.5 text-sm font-semibold">
                        {cell.secondary_item?.item_name ?? cell.secondary_item_name}
                      </span>
                    )}
                  </div>
                  <span
                    className="block w-full shrink-0 px-2 py-1 text-xs font-bold leading-tight text-gray-900"
                    style={{ backgroundColor: cell?.consumable_type ? bg : '#f3f4f6' }}
                  >
                    {cell?.consumable_type || '\u00a0'}
                  </span>
                </button>;
              })}
            </div>
          </div>
        </section>
      ))}
      {editing && <CellEditor target={editing} canClear={isAdmin} onClose={() => setEditing(null)} onSave={(values) => mutation.mutate(async () => { await saveLiqudCell({ sectionId: editing.section.id, rowIndex: editing.row, columnIndex: editing.column, ...values }); setEditing(null); toast.success('시연대 칸이 저장되었습니다.'); })} onClear={() => mutation.mutate(async () => { await clearLiqudCell(editing.section.id, editing.row, editing.column); setEditing(null); })} />}
      {resizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-xl font-bold text-rose-600">!</div>
            <h3 className="mt-4 text-base font-bold text-gray-900">
              {resizeConfirm.direction === 'row' ? '가로줄' : '세로줄'} {resizeConfirm.index + 1}번을 삭제하시겠습니까?
            </h3>
            {resizeConfirm.itemNames.length ? (
              <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-left">
                <p className="mb-2 text-xs font-semibold text-rose-600">함께 삭제되는 품목</p>
                <div className="flex flex-wrap gap-1.5">
                  {resizeConfirm.itemNames.map((name) => (
                    <span key={name} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm">{name}</span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">선택한 줄은 비어 있습니다.</p>
            )}
            <p className="mt-4 text-sm text-gray-600">삭제한 줄과 데이터는 복구할 수 없습니다.</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="gray" onClick={() => setResizeConfirm(null)}>아니오</Button>
              <Button variant="danger" onClick={() => {
                const { section, direction, index } = resizeConfirm;
                mutation.mutate(async () => {
                  await deleteLiqudStandLine(section, direction, index);
                  toast.success(`${direction === 'row' ? '가로줄' : '세로줄'}이 삭제되었습니다.`);
                });
                setResizeConfirm(null);
              }}>네</Button>
            </div>
          </div>
        </div>
      )}
      {lineAddConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">+</div>
            <h3 className="mt-4 text-base font-bold text-gray-900">
              {lineAddConfirm.direction === 'row' ? '가로줄' : '세로줄'}을 추가하시겠습니까?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {lineAddConfirm.section.name}의 마지막에 새 {lineAddConfirm.direction === 'row' ? '가로줄' : '세로줄'}이 추가됩니다.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="gray" onClick={() => setLineAddConfirm(null)}>아니오</Button>
              <Button onClick={() => {
                const { section, direction } = lineAddConfirm;
                mutation.mutate(async () => {
                  await resizeLiqudSection(
                    section,
                    direction === 'row' ? section.row_count + 1 : section.row_count,
                    direction === 'column' ? section.column_count + 1 : section.column_count,
                  );
                  toast.success(`${direction === 'row' ? '가로줄' : '세로줄'}이 추가되었습니다.`);
                });
                setLineAddConfirm(null);
              }}>네</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SectionNameEditor({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const nextName = draft.trim();
  const changed = Boolean(nextName) && nextName !== name;

  return <>
    <div className="flex items-center gap-2">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className={`rounded-lg border px-3 py-2 font-semibold outline-none transition focus:ring-2 focus:ring-brand-100 ${changed ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-white'}`}
      />
      {changed && <Button size="xs" onClick={() => setConfirming(true)}>변경</Button>}
    </div>
    {confirming && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-xl text-brand-700">?</div>
          <h3 className="mt-4 text-base font-bold text-gray-900">표 이름을 변경하시겠습니까?</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-gray-50 p-3">
              <span className="block text-xs text-gray-400">변경 전</span>
              <p className="mt-2 break-words font-semibold text-gray-700">{name}</p>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <span className="block text-xs text-brand-400">변경 후</span>
              <p className="mt-2 break-words font-semibold text-brand-700">{nextName}</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button variant="gray" onClick={() => setConfirming(false)}>아니오</Button>
            <Button onClick={() => { onChange(nextName); setConfirming(false); }}>네</Button>
          </div>
        </div>
      </div>
    )}
  </>;
}

function ThresholdEditor({ blue, red, onSave }: { blue: number; red: number; onSave: (b: number, r: number) => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [b, setB] = useState(blue);
  const [r, setR] = useState(red);
  const close = () => { setOpen(false); setConfirming(false); setB(blue); setR(red); };

  return <>
    <Button size="xs" variant="gray" className="h-7 w-[68px] !px-2 !py-1 !text-[11px]" onClick={() => setOpen(true)}>기준 변경</Button>
    {open && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {!confirming ? <>
          <div className="border-b border-gray-100 bg-gradient-to-r from-brand-50 to-white px-6 py-5"><h2 className="text-lg font-bold text-gray-900">날짜 색상 기준 변경</h2><p className="mt-1 text-xs text-gray-500">교체일로부터 경과한 날짜에 적용됩니다.</p></div>
          <div className="grid grid-cols-2 gap-4 p-6">
            <label className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-700">파랑 기준<input type="number" min={1} value={b} onChange={(e) => setB(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-center text-lg font-bold outline-none focus:ring-2 focus:ring-blue-200" /><span className="mt-1 block text-center text-xs font-normal">일 이후</span></label>
            <label className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">빨강 기준<input type="number" min={2} value={r} onChange={(e) => setR(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-center text-lg font-bold outline-none focus:ring-2 focus:ring-red-200" /><span className="mt-1 block text-center text-xs font-normal">일 이후</span></label>
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4"><Button variant="gray" onClick={close}>취소</Button><Button disabled={b < 1 || r <= b || (b === blue && r === red)} onClick={() => setConfirming(true)}>저장</Button></div>
        </> : <div className="p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-xl text-brand-700">?</div>
          <h3 className="mt-4 text-base font-bold text-gray-900">색상 기준을 적용하시겠습니까?</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-gray-50 p-3"><span className="block text-xs text-gray-400">이전</span><p className="mt-1"><span className="text-blue-600">파랑 {blue}일</span><br/><span className="text-red-600">빨강 {red}일</span></p></div>
            <div className="rounded-xl bg-brand-50 p-3"><span className="block text-xs text-brand-400">이후</span><p className="mt-1 font-semibold"><span className="text-blue-600">파랑 {b}일</span><br/><span className="text-red-600">빨강 {r}일</span></p></div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2"><Button variant="gray" onClick={() => setConfirming(false)}>아니오</Button><Button onClick={() => { onSave(b, r); setOpen(false); setConfirming(false); }}>네</Button></div>
        </div>}
      </div>
    </div>, document.body)}
  </>;
}

function SectionCreator({ onCreate }: { onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState('');
  const close = () => { setOpen(false); setConfirming(false); setName(''); };

  return <>
    <Button size="xs" className="h-7 w-[68px] !px-2 !py-1 !text-[11px]" onClick={() => setOpen(true)}>표 추가</Button>
    {open && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {!confirming ? <>
          <div className="border-b border-gray-100 bg-gradient-to-r from-brand-50 to-white px-6 py-5"><h2 className="text-lg font-bold text-gray-900">새 구역 표 추가</h2><p className="mt-1 text-xs text-gray-500">시연대 위치를 구분할 표 이름을 입력하세요.</p></div>
          <div className="p-6"><label className="block text-sm font-semibold text-gray-700">표 이름<input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && setConfirming(true)} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100" placeholder="예: 2구역" /></label></div>
          <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4"><Button variant="gray" onClick={close}>취소</Button><Button disabled={!name.trim()} onClick={() => setConfirming(true)}>저장</Button></div>
        </> : <div className="p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-xl text-brand-700">+</div>
          <h3 className="mt-4 text-lg font-bold text-gray-900">{name.trim()}</h3>
          <p className="mt-2 text-sm text-gray-600">위 이름으로 생성하시겠습니까?</p>
          <div className="mt-6 grid grid-cols-2 gap-2"><Button variant="gray" onClick={() => setConfirming(false)}>아니오</Button><Button onClick={() => { onCreate(name.trim()); close(); }}>네</Button></div>
        </div>}
      </div>
    </div>, document.body)}
  </>;
}

function CellEditor({ target, canClear, onClose, onSave, onClear }: { target: { cell?: LiqudStandCell }; canClear: boolean; onClose: () => void; onSave: (v: { itemName: string; secondaryItemName: string; consumableType: string; installedOn: string; note: string }) => void; onClear: () => void }) {
  const [search, setSearch] = useState('');
  const [itemNames, setItemNames] = useState(
    [target.cell?.item_name, target.cell?.secondary_item_name].filter(Boolean) as string[],
  );
  const [consumableType, setConsumableType] = useState(target.cell?.consumable_type ?? consumables[0].name);
  const [installedOn, setInstalledOn] = useState(target.cell?.installed_on ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(target.cell?.note ?? '');
  const [confirmClear, setConfirmClear] = useState(false);
  const { items } = useItems({ searchKeyword: search, isUse: true });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/60 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-brand-50 to-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">시연대 칸 편집</h2>
            <p className="mt-0.5 text-xs text-gray-500">품목과 소모품, 교체 날짜를 설정하세요.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-gray-400 hover:bg-white hover:text-gray-700">×</button>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">품목</label>
            {itemNames.length > 0 && (
              <div className="mb-2 space-y-2">
                {itemNames.map((name, index) => (
                  <div key={name} className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-800">{name}</p>
                      <p className="mt-0.5 text-xs text-brand-500">{index + 1}번째 품목 · 품목관리 제품과 연결됨</p>
                    </div>
                    <Button size="xs" variant="gray" onClick={() => setItemNames((previous) => previous.filter((itemName) => itemName !== name))}>제거</Button>
                  </div>
                ))}
              </div>
            )}
            {itemNames.length < 2 && (
              <div className="relative">
                <input value={search} autoFocus onChange={(e) => setSearch(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100" placeholder={itemNames.length ? '두 번째 품목을 검색하세요' : '품목명으로 검색하세요'} />
                {search.trim() && (
                  <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                    {items.filter((item) => !itemNames.includes(item.item_name)).length ? items.filter((item) => !itemNames.includes(item.item_name)).map((item) => (
                      <button key={item.id} type="button" onClick={() => { setItemNames((previous) => [...previous, item.item_name].slice(0, 2)); setSearch(''); }} className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-3 text-left last:border-0 hover:bg-brand-50">
                        <div><p className="text-sm font-medium text-gray-900">{item.item_name}</p><p className="mt-0.5 text-xs text-gray-400">{item.item_code}</p></div>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600">{item.item_categories?.name ?? '미분류'}</span>
                      </button>
                    )) : <p className="px-4 py-6 text-center text-sm text-gray-400">검색 결과가 없습니다.</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <span className="mb-2 block text-sm font-semibold text-gray-700">소모품</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {consumables.map((consumable) => {
                const selected = consumableType === consumable.name;
                return (
                  <button key={consumable.name} type="button" onClick={() => setConsumableType(consumable.name)} className={`relative min-h-12 rounded-xl border-2 px-3 py-2 text-sm font-bold text-gray-900 transition hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-gray-900 ring-2 ring-gray-900/15' : 'border-transparent'}`} style={{ backgroundColor: consumable.color }}>
                    {consumable.name}
                    {selected && <span className="absolute right-2 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-xs text-white">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-gray-700">교체 날짜<input type="date" value={installedOn} onChange={(e) => setInstalledOn(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100" /></label>
            <label className="block text-sm font-semibold text-gray-700">메모<input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100" placeholder="선택 입력" /></label>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          {canClear ? <Button
            variant="danger"
            onClick={() => target.cell?.item_name ? setConfirmClear(true) : onClear()}
          >
            빈 칸으로 변경
          </Button> : <span />}
          <div className="flex gap-2"><Button variant="gray" onClick={onClose}>취소</Button><Button disabled={!itemNames.length || !installedOn} onClick={() => itemNames.length && onSave({ itemName: itemNames[0], secondaryItemName: itemNames[1] ?? '', consumableType, installedOn, note })}>변경사항 저장</Button></div>
        </div>
      </div>
      {canClear && confirmClear && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/45 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-xl text-rose-600">!</div>
            <h3 className="mt-4 text-base font-bold text-gray-900">
              {[target.cell?.item_name, target.cell?.secondary_item_name]
                .filter(Boolean)
                .join(' / ')}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              위 품목의 시연대 데이터를 초기화하시겠습니까?
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="gray" onClick={() => setConfirmClear(false)}>아니오</Button>
              <Button variant="danger" onClick={onClear}>네</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
