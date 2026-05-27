'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '@/app/_components/Button';
import {
  createPartner,
  updatePartner,
  deletePartner,
} from '@/app/_domains/_partner/_services/partnerService';
import { usePartners } from '@/app/_domains/_partner/_hooks/usePartners';
import { partnerKeys } from '@/app/_domains/_partner/_queryKeys/partnerKeys';
import { PartnerType } from '@/app/_domains/_partner/_types/partner.types';
import toast from 'react-hot-toast';

interface PartnerManageModalProps {
  onClose: () => void;
}

type PartnerForm = {
  name: string;
  customerServicePhone: string;
  asServicePhone: string;
  link: string;
  note: string;
};

const emptyForm: PartnerForm = {
  name: '',
  customerServicePhone: '',
  asServicePhone: '',
  link: '',
  note: '',
};

const toNullable = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const PartnerManageModal = ({ onClose }: PartnerManageModalProps) => {
  const queryClient = useQueryClient();
  const { partners } = usePartners();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: partnerKeys.lists() });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setView('form');
  };

  const openEdit = (partner: PartnerType) => {
    setEditingId(partner.id);
    setForm({
      name: partner.name,
      customerServicePhone: partner.customer_service_phone ?? '',
      asServicePhone: partner.as_service_phone ?? '',
      link: partner.link ?? '',
      note: partner.note ?? '',
    });
    setView('form');
  };

  const backToList = () => {
    setView('list');
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('거래처 이름을 입력해주세요.');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        customerServicePhone: toNullable(form.customerServicePhone),
        asServicePhone: toNullable(form.asServicePhone),
        link: toNullable(form.link),
        note: toNullable(form.note),
      };
      if (editingId) {
        await updatePartner(editingId, payload);
        toast.success('거래처가 수정되었습니다.');
      } else {
        await createPartner(payload);
        toast.success('거래처가 추가되었습니다.');
      }
      refresh();
      backToList();
    } catch {
      toast.error(
        editingId ? '거래처 수정에 실패했습니다.' : '거래처 추가에 실패했습니다.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsSubmitting(true);
    try {
      await deletePartner(id);
      refresh();
      toast.success('거래처가 삭제되었습니다.');
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === '23503') {
        toast.error('연결된 이력이 있어 삭제할 수 없습니다.');
      } else {
        toast.error('거래처 삭제에 실패했습니다.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">
            {view === 'form'
              ? editingId
                ? '거래처 수정'
                : '거래처 추가'
              : '거래처 관리'}
          </h2>
          {view === 'list' && (
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
              {partners.length}
            </span>
          )}
        </div>
        {view === 'list' && (
          <Button size="sm" onClick={openCreate}>
            거래처 추가
          </Button>
        )}
      </div>

      {view === 'list' ? (
        <>
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto p-0.5">
            {partners.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                등록된 거래처가 없습니다.
              </p>
            ) : (
              partners.map((partner, index) => {
                const hasDetails =
                  partner.customer_service_phone ||
                  partner.as_service_phone ||
                  partner.link ||
                  partner.note;

                return (
                  <div
                    key={partner.id}
                    className="flex flex-col gap-2 px-3 py-2.5 rounded-lg bg-white border border-gray-100 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold">
                          {index + 1}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {partner.name}
                        </span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="xs"
                          variant="gray"
                          onClick={() => openEdit(partner)}
                        >
                          수정
                        </Button>
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => handleDelete(partner.id)}
                          disabled={isSubmitting}
                        >
                          삭제
                        </Button>
                      </div>
                    </div>

                    {hasDetails && (
                      <dl className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1 text-xs pl-1 border-t border-gray-200 pt-2">
                        {partner.customer_service_phone && (
                          <>
                            <dt className="text-gray-400">고객센터</dt>
                            <dd className="text-gray-700 font-mono truncate">
                              {partner.customer_service_phone}
                            </dd>
                          </>
                        )}
                        {partner.as_service_phone && (
                          <>
                            <dt className="text-gray-400">A/S</dt>
                            <dd className="text-gray-700 font-mono truncate">
                              {partner.as_service_phone}
                            </dd>
                          </>
                        )}
                        {partner.link && (
                          <>
                            <dt className="text-gray-400">링크</dt>
                            <dd className="truncate" title={partner.link}>
                              <a
                                href={partner.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-600 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {partner.link}
                              </a>
                            </dd>
                          </>
                        )}
                        {partner.note && (
                          <>
                            <dt className="text-gray-400">비고</dt>
                            <dd
                              className="text-gray-700 truncate"
                              title={partner.note}
                            >
                              {partner.note}
                            </dd>
                          </>
                        )}
                      </dl>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button size="sm" variant="gray" onClick={onClose}>
              닫기
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">
                거래처 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="거래처 이름"
                autoFocus
                className="px-3 py-1.5 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">
                고객센터 전화번호
              </label>
              <input
                type="text"
                value={form.customerServicePhone}
                onChange={(e) =>
                  setForm({ ...form, customerServicePhone: e.target.value })
                }
                placeholder="고객센터 전화번호"
                className="px-3 py-1.5 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">
                A/S 전화번호
              </label>
              <input
                type="text"
                value={form.asServicePhone}
                onChange={(e) =>
                  setForm({ ...form, asServicePhone: e.target.value })
                }
                placeholder="A/S 전화번호"
                className="px-3 py-1.5 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">링크</label>
              <input
                type="text"
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                placeholder="https://..."
                className="px-3 py-1.5 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">비고</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="비고"
                className="px-3 py-1.5 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="gray"
              onClick={backToList}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSubmitting || !form.name.trim()}
            >
              {editingId ? '저장' : '추가'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default PartnerManageModal;
