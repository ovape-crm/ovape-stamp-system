"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect, useState, useRef } from "react";
import Button from "@/app/_components/Button";
import { formatPhoneNumber } from "@/app/_utils/utils";
import { Dropdown } from "@/app/_components/Dropdown";
import supabase from "@/libs/supabaseClient";

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
  is_stamp_eligible: z.boolean(),
  adult_verification_method: z.enum(["unverified", "physical_id", "bbaton"]),
  adult_verification_request_id: z.string().optional(),
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
}).superRefine((value, context) => {
  if (
    value.adult_verification_method === "bbaton" &&
    !value.adult_verification_request_id
  ) {
    context.addIssue({
      code: "custom",
      path: ["adult_verification_request_id"],
      message: "완료된 비바톤 인증 기록을 선택해 주세요.",
    });
  }
});

type FormValues = z.infer<typeof schema>;

export type CustomerCreateValues = FormValues;
export type CustomerCreateAction = "customer-only" | "add-outbound";

type CompletedVerification = {
  id: string;
  request_label: string;
  completed_at: string | null;
};

const adultVerificationLabels = {
  unverified: "미확인",
  physical_id: "직접 확인",
  bbaton: "비바톤 확인",
} as const;

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
  const [completedVerifications, setCompletedVerifications] = useState<CompletedVerification[]>([]);
  const [isVerificationLoading, setIsVerificationLoading] = useState(false);
  const canSubmitRef = useRef(true); // 중복 제출 방지용

  // ========================================================================
  // React Hook Form 설정
  // ========================================================================
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    mode: "onChange",
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      phone: "",
      gender: "male",
      is_stamp_eligible: true,
      adult_verification_method: "unverified",
      adult_verification_request_id: "",
      address: "",
      note: "",
    },
  });

  const adultVerificationMethod = watch("adult_verification_method");
  const selectedVerificationId = watch("adult_verification_request_id");

  useEffect(() => {
    if (adultVerificationMethod !== "bbaton") return;

    let active = true;
    const loadCompletedVerifications = async () => {
      setIsVerificationLoading(true);
      const { data, error } = await supabase
        .from("adult_verification_requests")
        .select("id, request_label, completed_at")
        .eq("status", "completed")
        .is("customer_id", null)
        .order("completed_at", { ascending: false });
      if (active) {
        setCompletedVerifications(error ? [] : (data ?? []));
        setIsVerificationLoading(false);
      }
    };
    void loadCompletedVerifications();
    return () => {
      active = false;
    };
  }, [adultVerificationMethod]);

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
              <div>
                <span className="text-sm font-medium text-gray-600">
                  적립 대상:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.is_stamp_eligible ? "적립" : "미적립"}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">
                  성인 확인:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {adultVerificationLabels[formData.adult_verification_method]}
                  {formData.adult_verification_method === "bbaton"
                    ? ` · ${completedVerifications.find((item) => item.id === formData.adult_verification_request_id)?.request_label ?? "인증 기록"}`
                    : ""}
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
            <span className="block text-sm font-medium mb-1">적립 대상</span>
            <Controller
              name="is_stamp_eligible"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-4">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={field.value}
                      onChange={() => field.onChange(true)}
                    />
                    적립
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={!field.value}
                      onChange={() => field.onChange(false)}
                    />
                    미적립
                  </label>
                </div>
              )}
            />
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
            <textarea
              rows={3}
              className="w-full min-h-20 resize-y rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder={
                "주소지를 입력하세요. (선택)\nex) OO구 도로명주소 OO건물 OO동 OO호 (공동현관 : 비밀번호 or X)"
              }
              aria-invalid={!!errors.address || undefined}
              {...register("address")}
            />
            {errors.address && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.address.message}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
            <span className="block text-sm font-medium text-gray-900">
              성인 확인 여부 <span className="text-rose-600">*</span>
            </span>
            <Controller
              name="adult_verification_method"
              control={control}
              render={({ field }) => (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["unverified", "physical_id", "bbaton"] as const).map(
                    (method) => (
                      <label
                        key={method}
                        className={`flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2 text-xs font-medium transition sm:text-sm ${
                          field.value === method
                            ? "border-brand-400 bg-white text-brand-700 shadow-sm"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          checked={field.value === method}
                          onChange={() => {
                            field.onChange(method);
                            if (method !== "bbaton") {
                              setValue("adult_verification_request_id", "", {
                                shouldValidate: true,
                              });
                            }
                          }}
                        />
                        {adultVerificationLabels[method]}
                      </label>
                    ),
                  )}
                </div>
              )}
            />

            {adultVerificationMethod === "bbaton" && (
              <div className="mt-3">
                <Dropdown
                  controlledValue={selectedVerificationId}
                  disabled={
                    isVerificationLoading || completedVerifications.length === 0
                  }
                >
                  <Dropdown.Trigger neutral>
                    {isVerificationLoading
                      ? "인증 기록 불러오는 중..."
                      : completedVerifications.find(
                            (item) => item.id === selectedVerificationId,
                          )?.request_label ??
                        (completedVerifications.length > 0
                          ? "완료된 비바톤 인증 선택"
                          : "연결 가능한 인증 기록 없음")}
                  </Dropdown.Trigger>
                  <Dropdown.Content neutral>
                    {completedVerifications.map((item) => (
                      <Dropdown.Item
                        key={item.id}
                        neutral
                        option={{
                          value: item.id,
                          label: `${item.request_label}${
                            item.completed_at
                              ? ` · ${new Date(item.completed_at).toLocaleDateString("ko-KR")}`
                              : ""
                          }`,
                        }}
                        onSelect={(option) =>
                          setValue(
                            "adult_verification_request_id",
                            String(option.value),
                            { shouldValidate: true },
                          )
                        }
                      />
                    ))}
                  </Dropdown.Content>
                </Dropdown>
                {errors.adult_verification_request_id && (
                  <p className="mt-1 text-xs text-rose-600">
                    {errors.adult_verification_request_id.message}
                  </p>
                )}
              </div>
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
