"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useRef } from "react";
import Button from "@/app/_components/Button";
import { formatPhoneNumber } from "@/app/_utils/utils";

// ============================================================================
// 폼 검증 스키마
// ============================================================================

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "이름을 입력하세요." })
    .transform((v) => (v.toUpperCase() === "X" ? "X" : v)),
  phone: z
    .string()
    .trim()
    .min(1, { message: "전화번호를 입력하세요." })
    .refine((v) => v.toUpperCase() === "X" || /^[0-9]{10,11}$/.test(v), {
      message: "10-11자리 숫자만 입력하세요. (정보 없을 경우 X 입력)",
    })
    .transform((v) => (v.toUpperCase() === "X" ? "X" : v)),
  gender: z.enum(["male", "female"]),
  address: z
    .string()
    .trim()
    .max(200, { message: "주소지는 200자 이하로 입력하세요." })
    .optional(),
  note: z
    .string()
    .trim()
    .max(500, { message: "메모는 500자 이하로 입력하세요." })
    .optional(),
});

type FormValues = z.infer<typeof schema>;

export type CustomerCreateValues = FormValues;
export type CustomerCreateAction = "customer-only" | "add-outbound";

// ============================================================================
// 컴포넌트
// ============================================================================

export default function CustomerCreateModal({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (
    values: CustomerCreateValues,
    action: CustomerCreateAction,
  ) => Promise<boolean | void> | boolean | void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  // ========================================================================
  // 상태 관리
  // ========================================================================
  const [showConfirm, setShowConfirm] = useState(false);
  const [formData, setFormData] = useState<CustomerCreateValues | null>(null);
  const canSubmitRef = useRef(true); // 중복 제출 방지용

  // ========================================================================
  // React Hook Form 설정
  // ========================================================================
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    mode: "onChange",
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      phone: "",
      gender: "male",
      address: "",
      note: "",
    },
  });

  const canSubmit = isValid;

  // ========================================================================
  // 이벤트 핸들러
  // ========================================================================

  /**
   * 폼 제출 시 확인 화면으로 이동
   */
  const handleFormSubmit = (values: FormValues) => {
    if (!canSubmit) {
      return;
    }
    setFormData(values);
    setShowConfirm(true);

    canSubmitRef.current = true;
  };

  /**
   * 확인 화면에서 최종 제출
   */
  const handleConfirm = async (action: CustomerCreateAction) => {
    if (!formData || !canSubmitRef.current || isSubmitting) {
      return;
    }

    canSubmitRef.current = false;

    try {
      const succeeded = await onSubmit(formData, action);
      if (succeeded === false) {
        canSubmitRef.current = true;
      }
    } catch (error) {
      canSubmitRef.current = true;
      throw error;
    }
  };

  // ========================================================================
  // 확인 화면 렌더링
  // ========================================================================
  const confirmContent =
    showConfirm && formData ? (
      <div className="w-full flex flex-col min-h-0">
        <h2 className="text-lg font-semibold mb-4 shrink-0">고객 정보 확인</h2>

        <div className="overflow-y-auto min-h-0 flex-1">
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-600">이름:</span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.name}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">
                  전화번호:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.phone === "X"
                    ? "X"
                    : formatPhoneNumber(formData.phone)}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">성별:</span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.gender === "male" ? "남자" : "여자"}
                </p>
              </div>
              {formData.note && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    특이사항:
                  </span>
                  <p className="text-base text-gray-900">{formData.note}</p>
                </div>
              )}
              {formData.address && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    주소지:
                  </span>
                  <p className="text-base text-gray-900 whitespace-pre-wrap">
                    {formData.address}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="text-center py-4">
            <p className="text-gray-700 text-sm">
              위 정보로 고객을 등록하시겠습니까?
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-gray-200 shrink-0">
          <Button
            onClick={() => setShowConfirm(false)}
            disabled={isSubmitting}
            size="sm"
            variant="gray"
          >
            이전
          </Button>
          <Button
            disabled={isSubmitting || !canSubmit}
            onClick={() => handleConfirm("customer-only")}
            size="sm"
            variant="secondary"
          >
            {isSubmitting ? "등록 중..." : "고객 등록"}
          </Button>
          <Button
            disabled={isSubmitting || !canSubmit}
            onClick={() => handleConfirm("add-outbound")}
            size="sm"
          >
            {isSubmitting ? "등록 중..." : "출고 이력 추가"}
          </Button>
        </div>
      </div>
    ) : null;

  // ========================================================================
  // 입력 폼 렌더링
  // ========================================================================
  return (
    <>
      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        className={`w-full min-h-0 flex-col ${showConfirm ? "hidden" : "flex"}`}
        noValidate
      >
        <h2 className="text-lg font-semibold mb-3 shrink-0">고객 추가</h2>

        <div className="space-y-3 overflow-y-auto min-h-0 flex-1">
          {/* 기본 정보 입력 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              이름 <span className="text-rose-600">*</span>
            </label>
            <input
              className="w-full rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="홍길동 / 정보 없을 경우 X"
              aria-invalid={!!errors.name || undefined}
              {...register("name")}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              전화번호 <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="'-' 없이 숫자만 (ex: 01012345678) / 정보 없을 경우 X"
              aria-invalid={!!errors.phone || undefined}
              {...register("phone")}
            />
            {errors.phone && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.phone.message}
              </p>
            )}
          </div>

          <div>
            <span className="block text-sm font-medium mb-1">
              성별 <span className="text-rose-600">*</span>
            </span>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="radio" value="male" {...register("gender")} />
                남자
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="radio" value="female" {...register("gender")} />
                여자
              </label>
            </div>
            {errors.gender && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.gender.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">특이사항</label>
            <textarea
              className="w-full min-h-24 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="고객,결제 관련 특이사항을 입력하세요. (선택)"
              aria-invalid={!!errors.note || undefined}
              {...register("note")}
            />
            {errors.note && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.note.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">주소지</label>
            <input
              type="text"
              className="w-full rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="주소지를 입력하세요. (선택)"
              aria-invalid={!!errors.address || undefined}
              {...register("address")}
            />
            {errors.address && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.address.message}
              </p>
            )}
          </div>

        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6 shrink-0">
          <Button
            size="sm"
            variant="gray"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            취소
          </Button>
          <Button size="sm" type="submit" disabled={isSubmitting || !canSubmit}>
            {isSubmitting ? "등록 중..." : "등록"}
          </Button>
        </div>
      </form>
      {confirmContent}
    </>
  );
}
