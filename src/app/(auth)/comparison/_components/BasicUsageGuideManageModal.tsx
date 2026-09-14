'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import RichTextNoteEditor from '@/app/_components/RichTextNoteEditor';
import TaggedContent from '@/app/_components/TaggedContent';
import supabase from '@/libs/supabaseClient';
import { getComparisonDevicesWithValues } from '@/app/_domains/_comparison/_services/comparisonDeviceService';

type Step = { id: string; step_order: number; title: string; content: string };
type Note = { device_id: string; step_id: string; content: string };

const guideKey = ['comparison', 'basic-usage-guide-manage'];

export default function BasicUsageGuideManageModal({ onCancel }: { onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedStepId, setSelectedStepId] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [saving, setSaving] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: guideKey,
    queryFn: async () => {
      const [stepsResult, notesResult, deviceData] = await Promise.all([
        supabase.from('comparison_usage_guide_steps').select('id,step_order,title,content').order('step_order'),
        supabase.from('comparison_device_usage_notes').select('device_id,step_id,content'),
        getComparisonDevicesWithValues(),
      ]);
      if (stepsResult.error) throw stepsResult.error;
      if (notesResult.error) throw notesResult.error;
      return { steps: (stepsResult.data ?? []) as Step[], notes: (notesResult.data ?? []) as Note[], ...deviceData };
    },
  });

  const devices = useMemo(() => data?.devices ?? [], [data?.devices]);
  const deviceName = (deviceId: string, index: number) => {
    const nameColumn = data?.columns.find((column) => /기기.*(명|이름)|제품.*(명|이름)/.test(column.name));
    const name = nameColumn && data?.values.find((value) => value.device_id === deviceId && value.column_id === nameColumn.id)?.value;
    return name?.trim() || `기기 ${index + 1}`;
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: guideKey, refetchType: 'none' });
    await queryClient.invalidateQueries({ queryKey: ['comparison', 'basic-usage-guide'] });
    await refetch();
  };

  useEffect(() => {
    if (!selectedDeviceId || !selectedStepId) return;
    setNoteContent((data?.notes ?? []).find((note) => note.device_id === selectedDeviceId && note.step_id === selectedStepId)?.content ?? '');
  }, [data?.notes, selectedDeviceId, selectedStepId]);

  const saveStep = async (step: Step) => {
    setSaving(true);
    try {
      const { data: savedStep, error } = await supabase.rpc('save_comparison_usage_guide_step', {
        p_id: step.id, p_step_order: step.step_order, p_title: step.title, p_content: step.content,
      });
      if (error) throw error;
      queryClient.setQueryData<typeof data>(guideKey, (previous) => previous ? { ...previous, steps: previous.steps.map((item) => item.id === savedStep.id ? savedStep as Step : item) } : previous);
      await refresh();
      toast.success('공통 사용법을 저장했습니다.');
      return true;
    } catch {
      toast.error('공통 사용법 저장에 실패했습니다.');
      return false;
    } finally { setSaving(false); }
  };

  const addStep = async () => {
    if (!newTitle.trim() || !newContent.trim()) { toast.error('제목과 내용을 입력하세요.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('save_comparison_usage_guide_step', {
        p_id: null, p_step_order: Math.max(0, ...(data?.steps.map((step) => step.step_order) ?? [])) + 1, p_title: newTitle, p_content: newContent,
      });
      if (error) throw error;
      setNewTitle(''); setNewContent(''); await refresh(); toast.success('공통 사용법을 추가했습니다.');
    } catch { toast.error('공통 사용법 추가에 실패했습니다.'); } finally { setSaving(false); }
  };

  const saveNote = async () => {
    if (!selectedDeviceId || !selectedStepId || !noteContent.trim()) { toast.error('기기, 삽입 위치, 내용을 모두 선택하세요.'); return; }
    setSaving(true);
    try {
      const { data: savedNote, error } = await supabase.rpc('save_comparison_device_usage_note', {
        p_device_id: selectedDeviceId, p_step_id: selectedStepId, p_content: noteContent,
      });
      if (error) throw error;
      queryClient.setQueryData<typeof data>(guideKey, (previous) => previous ? { ...previous, notes: previous.notes.map((item) => item.device_id === savedNote.device_id && item.step_id === savedNote.step_id ? savedNote as Note : item).concat(previous.notes.some((item) => item.device_id === savedNote.device_id && item.step_id === savedNote.step_id) ? [] : [savedNote as Note]) } : previous);
      await refresh(); toast.success('기기별 안내를 저장했습니다.');
    } catch { toast.error('기기별 안내 저장에 실패했습니다.'); } finally { setSaving(false); }
  };

  const deleteStep = async (step: Step) => {
    if (step.step_order === 1 || !window.confirm(`${step.step_order}단계를 삭제하시겠습니까?\n연결된 기기별 안내도 함께 삭제됩니다.`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('delete_comparison_usage_guide_step', { p_id: step.id });
      if (error) throw error;
      await refresh();
      toast.success(`${step.step_order}단계를 삭제했습니다.`);
    } catch {
      toast.error('단계 삭제에 실패했습니다.');
    } finally { setSaving(false); }
  };

  if (isLoading || !data) return <Loading size="sm" text="불러오는 중..." />;

  return <div className="flex min-h-0 w-full flex-1 flex-col">
    <h2 className="mb-1 text-lg font-semibold">기초 사용법 관리</h2>
    <p className="mb-4 text-sm text-gray-500">공통 단계 아래에 기기별 안내를 넣으면, 해당 단계 바로 다음에 표시됩니다.</p>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
      <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
        <h3 className="mb-3 text-sm font-semibold text-gray-800">공통 사용법</h3>
        <div className="space-y-3">
          {data.steps.map((step) => <EditableStep key={step.id} step={step} disabled={saving} onSave={saveStep} onDelete={() => deleteStep(step)} />)}
        </div>
        <div className="mt-4 border-t border-gray-200 pt-3">
          <p className="mb-2 text-sm font-medium">공통 단계 추가</p>
          <div className="max-w-[704px]"><RichTextNoteEditor value={newTitle} onChange={setNewTitle} placeholder="단계 제목" compact showPreview={false} enableDividers stickyToolbar spellCheck={false} editorClassName="px-5 py-3" editorStyle={{ fontSize: '20px', lineHeight: '1.5', color: '#030712' }} /></div>
          <div className="mt-2 max-w-[704px]"><RichTextNoteEditor value={newContent} onChange={setNewContent} placeholder="안내 내용" compact showPreview={false} enableDividers stickyToolbar spellCheck={false} editorClassName="px-5 py-3" editorStyle={{ fontSize: '18px', lineHeight: '1.625', color: '#111827' }} /></div>
          <Button size="sm" className="mt-2" disabled={saving} onClick={addStep}>단계 추가</Button>
        </div>
      </section>
      <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
        <h3 className="mb-1 text-sm font-semibold text-gray-800">기기별 추가 안내</h3>
        <p className="mb-3 text-xs text-gray-500">선택한 공통 단계 바로 아래에 표시됩니다.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            <option value="">기기 선택</option>{devices.map((device, index) => <option key={device.id} value={device.id}>{deviceName(device.id, index)}</option>)}
          </select>
          <select value={selectedStepId} onChange={(event) => setSelectedStepId(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            <option value="">삽입 위치 선택</option>{data.steps.map((step) => <option key={step.id} value={step.id}>{step.step_order}. {step.title} 다음</option>)}
          </select>
        </div>
        <div className="mt-2 max-w-[704px]"><RichTextNoteEditor value={noteContent} onChange={setNoteContent} placeholder="이 기기에만 필요한 안내를 입력하세요." compact showPreview={false} enableDividers stickyToolbar spellCheck={false} editorClassName="px-5 py-3" editorStyle={{ fontSize: '16px', lineHeight: '1.625', color: '#111827' }} /></div>
        <Button size="sm" className="mt-2" disabled={saving} onClick={saveNote}>기기 안내 저장</Button>
      </section>
    </div>
    <div className="mt-4 flex justify-end border-t border-gray-200 pt-3"><Button size="sm" variant="gray" onClick={onCancel}>닫기</Button></div>
  </div>;
}

function EditableStep({ step, disabled, onSave, onDelete }: { step: Step; disabled: boolean; onSave: (step: Step) => Promise<boolean>; onDelete: () => void }) {
  const [draft, setDraft] = useState(step);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setDraft(step); }, [step]);
  if (!editing) return <div className="max-w-[704px] rounded-xl border border-gray-300 bg-white p-5"><span className="mb-2 block text-xs font-semibold text-brand-600">{step.step_order}단계</span><h4 className="text-xl font-semibold text-gray-950"><TaggedContent inline content={step.title} /></h4><div className="mt-2 text-lg leading-relaxed text-gray-900"><TaggedContent content={step.content} /></div><div className="mt-3 flex justify-end gap-2"><Button size="xs" disabled={disabled} onClick={() => setEditing(true)}>수정</Button>{step.step_order !== 1 && <Button size="xs" variant="danger" disabled={disabled} onClick={onDelete}>삭제</Button>}</div></div>;
  return <div className="max-w-[704px] rounded-xl border border-gray-300 bg-white p-5">
    <span className="mb-2 block text-xs font-semibold text-brand-600">{step.step_order}단계</span>
    <p className="mb-1 text-xs font-medium text-gray-500">제목</p>
    <RichTextNoteEditor value={draft.title} onChange={(title) => setDraft((prev) => ({ ...prev, title }))} disabled={disabled} placeholder="단계 제목" compact showPreview={false} enableDividers stickyToolbar spellCheck={false} editorClassName="px-5 py-3" editorStyle={{ fontSize: '20px', lineHeight: '1.5', color: '#030712' }} />
    <p className="mb-1 mt-3 text-xs font-medium text-gray-500">내용</p>
    <RichTextNoteEditor value={draft.content} onChange={(content) => setDraft((prev) => ({ ...prev, content }))} disabled={disabled} placeholder="안내 내용" compact showPreview={false} enableDividers stickyToolbar spellCheck={false} editorClassName="px-5 py-3" editorStyle={{ fontSize: '18px', lineHeight: '1.625', color: '#111827' }} />
    <div className="mt-2 flex justify-end gap-2"><Button size="xs" disabled={disabled} onClick={async () => { if (await onSave(draft)) setEditing(false); }}>저장</Button><Button size="xs" variant="gray" disabled={disabled} onClick={() => { setDraft(step); setEditing(false); }}>취소</Button>{step.step_order !== 1 && <Button size="xs" variant="danger" disabled={disabled} onClick={onDelete}>삭제</Button>}</div>
  </div>;
}
