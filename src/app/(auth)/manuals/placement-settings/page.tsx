"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import { useModal } from "@/app/_contexts/ModalContext";
import StampConfirmModal from "@/app/(auth)/customers/_components/StampConfirmModal";

type PreviewVariant = "normal" | "x-unified" | "x-male" | "x-female" | "demo" | "adjustment";
type PreviewFlow = "add" | "edit";

const variants: Array<{ value: PreviewVariant; label: string; description: string }> = [
  { value: "normal", label: "일반 고객", description: "일반 고객 출고 이력 모달" },
  { value: "x-unified", label: "X 고객", description: "통합 X 고객 모달" },
  { value: "x-male", label: "X 고객(남)", description: "미적립 남자 고객 모달" },
  { value: "x-female", label: "X 고객(여)", description: "미적립 여자 고객 모달" },
  { value: "demo", label: "시연용", description: "시연용 처리 모달" },
  { value: "adjustment", label: "재고조정", description: "재고조정 처리 모달" },
];

const targets = {
  normal: { name: "홍길동", phone: "010-1234-5678", address: "서울시", is_stamp_eligible: true },
  "x-unified": { name: "X", phone: "X", gender: "special" as const, is_stamp_eligible: false },
  "x-male": { name: "X", phone: "X", gender: "male" as const, is_stamp_eligible: false },
  "x-female": { name: "X", phone: "X", gender: "female" as const, is_stamp_eligible: false },
  demo: { name: "시연용", phone: "-", is_stamp_eligible: false },
  adjustment: { name: "재고조정", phone: "-", is_stamp_eligible: false },
};

export default function ManualPlacementSettingsPage() {
  const { open, close } = useModal();
  const [variant, setVariant] = useState<PreviewVariant>("normal");
  const [flow, setFlow] = useState<PreviewFlow>("add");

  const openPreview = () => {
    const target = targets[variant];
    const previewOnly = async () => {
      toast("미리보기에서는 실제 출고 데이터가 저장되지 않습니다.");
    };
    open({
      content: (
        <StampConfirmModal
          target={target}
          mode={flow}
          amount={flow === "edit" ? 1 : undefined}
          initialAction={flow === "edit" ? "기기 1개" : undefined}
          editTitle="출고 이력 수정 미리보기"
          onEditSubmit={previewOnly}
          onConfirm={previewOnly}
          onCancel={close}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true, size: "max-w-6xl" },
    });
  };

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-950">공용 모달 매뉴얼 배치</h1>
            <p className="mt-1 text-sm text-gray-600">실제 출고 데이터는 저장하지 않고 공용 출고 모달을 열어 매뉴얼 위치를 설정합니다.</p>
          </div>
          <Link href="/manuals" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm hover:border-brand-300 hover:text-brand-700">
            매뉴얼로 돌아가기
          </Link>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-800">모달 유형</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {variants.map((item) => (
                <button key={item.value} type="button" onClick={() => setVariant(item.value)} className={`rounded-xl border p-3 text-left transition ${variant === item.value ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-gray-200 bg-gray-50/70 hover:border-brand-300"}`}>
                  <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                  <span className="mt-1 block text-xs text-gray-500">{item.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-800">작업 유형</p>
            <div className="grid max-w-md grid-cols-2 gap-2">
              <Button type="button" variant={flow === "add" ? "primary" : "gray"} onClick={() => setFlow("add")}>출고 처리</Button>
              <Button type="button" variant={flow === "edit" ? "primary" : "gray"} onClick={() => setFlow("edit")}>출고 수정</Button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-sm font-semibold text-gray-800">배치 방법</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-600">
              <li>미리보기 모달을 연 뒤 우측 하단의 <b>매뉴얼 배치</b>를 누릅니다.</li>
              <li>모달 안에서 설명을 연결할 버튼이나 입력칸을 선택합니다.</li>
              <li>9개 기준점과 X/Y 값을 이용해 1px 단위로 위치를 조절합니다.</li>
            </ol>
          </div>

          <Button size="md" className="min-h-12 w-full sm:w-auto" onClick={openPreview}>선택한 공용 모달 미리보기</Button>
        </div>
      </div>
    </section>
  );
}
