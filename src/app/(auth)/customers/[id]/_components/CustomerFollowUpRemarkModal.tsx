'use client';

import { useState } from 'react';
import Button from '@/app/_components/Button';
import { completeCustomerFollowUpRemark, type CustomerFollowUpRemark } from '@/app/_domains/_customer/_services/customerFollowUpRemarkService';
import { resolveCurrentWorkerName } from '@/app/_domains/_workJournal/_utils/currentWorker';
import { addStamp } from '@/app/_domains/_stamp/_services/stampService';
import { PaymentTypeEnum } from '@/app/_enums/enums';
import toast from 'react-hot-toast';

const CustomerFollowUpRemarkModal = ({
  remark,
  isAdmin,
  onCancel,
  onSuccess,
}: {
  remark: CustomerFollowUpRemark;
  isAdmin: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}) => {
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const complete = async () => {
    if (!content.trim() || isSaving) return;
    try {
      setIsSaving(true);
      const completedAt = new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date());
      await addStamp(
        String(remark.customer_id),
        0,
        `[처리 완료]\n최초 작성: ${new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(remark.created_at))} · ${remark.created_by_name}\n작성 내용: ${remark.content}\n처리일: ${completedAt}\n처리 내용: ${content.trim()}`,
        PaymentTypeEnum.REMARK.value,
      );
      const workerName = isAdmin ? '관리자' : await resolveCurrentWorkerName() || '직원';
      await completeCustomerFollowUpRemark({
        id: remark.id,
        content: content.trim(),
        workerName,
      });
      toast.success('처리 내용을 기록했습니다.');
      onSuccess();
    } catch {
      toast.error('처리 내용을 저장하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="w-full" aria-labelledby="follow-up-complete-title">
      <h2 id="follow-up-complete-title" className="text-lg font-bold text-gray-900">처리 필요 특이사항</h2>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold text-amber-800">최초 작성 · {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(remark.created_at))} · {remark.created_by_name}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-900">{remark.content}</p>
      </div>
      <label className="mt-4 block text-sm font-semibold text-gray-700">처리 내용 <span className="text-rose-600">*</span></label>
      <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="어떻게 처리했는지 입력하세요" rows={5} className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="gray" size="sm" onClick={onCancel} disabled={isSaving}>취소</Button>
        <Button type="button" size="sm" onClick={complete} disabled={!content.trim() || isSaving}>{isSaving ? '저장 중...' : '처리 완료'}</Button>
      </div>
    </section>
  );
};

export default CustomerFollowUpRemarkModal;
