'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import { getComparisonColumns } from '@/app/_domains/_comparison/_services/comparisonColumnService';
import { comparisonKeys } from '@/app/_domains/_comparison/_queryKeys/comparisonKeys';
import supabase from '@/libs/supabaseClient';

export default function ComparisonPrintVisibilityModal({ onCancel }: { onCancel: () => void }) {
  const queryClient = useQueryClient(); const { data: columns = [], isLoading } = useQuery({ queryKey: comparisonKeys.columns(), queryFn: getComparisonColumns });
  const [visible, setVisible] = useState<Record<string, boolean>>({}); const [saving, setSaving] = useState(false);
  const checked = (id: string, fallback?: boolean) => visible[id] ?? fallback ?? true;
  const save = async () => { setSaving(true); try { const results = await Promise.all(columns.map((column) => supabase.rpc('save_comparison_column_visibility', { p_column_id: column.id, p_is_visible: checked(column.id, column.is_visible_in_comparison) }))); if (results.some(({ error }) => error)) throw new Error(); await queryClient.invalidateQueries({ queryKey: comparisonKeys.columns() }); toast.success('표 출력 항목을 저장했습니다.'); onCancel(); } catch { toast.error('표 출력 항목 저장에 실패했습니다.'); } finally { setSaving(false); } };
  return <div className="w-full"><h2 className="mb-2 text-lg font-semibold">표 출력 여부</h2><p className="mb-4 text-sm text-gray-500">체크한 항목만 기기 비교표에 표시됩니다.</p>{isLoading ? <Loading size="sm" text="불러오는 중..." /> : <div className="space-y-2">{columns.map((column) => <label key={column.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50"><span className="text-sm text-gray-800">{column.name}</span><input type="checkbox" checked={checked(column.id, column.is_visible_in_comparison)} onChange={(event) => setVisible((prev) => ({ ...prev, [column.id]: event.target.checked }))} className="h-4 w-4 cursor-pointer accent-brand-500" /></label>)}</div>}<div className="mt-5 flex justify-end gap-2"><Button size="sm" variant="gray" onClick={onCancel}>취소</Button><Button size="sm" disabled={saving || isLoading} onClick={save}>저장</Button></div></div>;
}
