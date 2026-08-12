"use client";

import { Controller, Resolver, useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import Button from "@/app/_components/Button";
import { formatPhoneNumber } from "@/app/_utils/utils";
import { Dropdown } from "@/app/_components/Dropdown";
import supabase from "@/libs/supabaseClient";

type FormValues = {
  name: string;
  phone: string;
  gender: "male" | "female";
  is_stamp_eligible: boolean;
  adult_verification_method: "" | "physical_id" | "bbaton";
  adult_verification_request_id?: string;
  address?: string;
  note?: string;
};

const schema = z
  .object({
    name: z.coerce
      .string()
      .trim()
      .min(1, { message: "이름을 입력하세요." })
      .transform((v) => (v.toUpperCase() === "X" ? "X" : v)),
    phone: z.coerce
      .string()
      .trim()
      .min(1, { message: "전화번호를 입력하세요." })
      .refine((v) => v.toUpperCase() === "X" || /^[0-9]{10,11}$/.test(v), {
        message: "10-11자리 숫자만 입력하세요. (정보 없을 경우 X 입력)",
      })
      .transform((v) => (v.toUpperCase() === "X" ? "X" : v)),
    gender: z.enum(["male", "female"]),
    is_stamp_eligible: z.boolean(),
    adult_verification_method: z.enum(["", "physical_id", "bbaton"]),
    adult_verification_request_id: z.string().optional(),
    address: z.coerce
      .string()
      .trim()
      .max(200, { message: "주소지는 200자 이하로 입력해주세요." })
      .optional(),
    note: z.coerce
      .string()
      .trim()
      .max(500, { message: "특이사항은 500자 이하로 입력해주세요." })
      .optional(),
  })
  .superRefine((value, context) => {
    if (!value.adult_verification_method) {
      context.addIssue({
        code: "custom",
        path: ["adult_verification_method"],
        message: "성인 확인 방법을 선택해 주세요.",
      });
    }
    if (
      value.adult_verification_method === "bbaton" &&
      !value.adult_verification_request_id
    ) {
      context.addIssue({
        code: "custom",
        path: ["adult_verification_request_id"],
        message: "인증된 고객을 선택해 주세요.",
      });
    }
  });

type CompletedVerification = {
  id: string;
  request_label: string;
  completed_at: string | null;
};

const adultVerificationLabels = {
  physical_id: "직접 확인",
  bbaton: "성인 인증 링크확인",
} as const;

// 안전한 resolver 생성자 (커스텀)
const safeResolver = (schema: z.ZodTypeAny) => async (data: unknown) => {
  try {
    const parsed = await schema.safeParseAsync(data);
    if (parsed.success) return { values: parsed.data, errors: {} };

    // Zod 에러를 react-hook-form 형식으로 변환
    const formattedErrors = parsed.error.format();
    const errors: Record<string, { type: string; message: string }> = {};

    Object.keys(formattedErrors).forEach((key) => {
      if (key !== "_errors" && formattedErrors[key]?._errors?.length > 0) {
        errors[key] = {
          type: "validation",
          message: formattedErrors[key]._errors[0],
        };
      }
    });

    return { values: {}, errors };
  } catch (err) {
    console.error("[safeResolver Error]", err);
    return { values: {}, errors: {} };
  }
};

export default function CustomerEditModal({
  isAdmin,
  customer,
  onSubmit,
  onCancel,
  onDelete,
}: {
  isAdmin: boolean;
  customer: {
    name: string;
    phone: string;
    gender?: "male" | "female";
    is_stamp_eligible?: boolean;
    adult_verified?: boolean;
    adult_verification_method?: "bbaton" | "physical_id" | "manual" | null;
    address?: string | null;
    note?: string | null;
  };
  onSubmit: (values: FormValues) => Promise<void> | void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [formData, setFormData] = useState<FormValues | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [completedVerifications, setCompletedVerifications] = useState<
    CompletedVerification[]
  >([]);
  const [isVerificationLoading, setIsVerificationLoading] = useState(false);
  const savingRef = useRef(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    mode: "onChange",
    resolver: safeResolver(schema) as Resolver<FormValues, unknown>,
    defaultValues: {
      name: customer.name,
      phone: customer.phone,
      gender: customer.gender || "male",
      is_stamp_eligible: customer.is_stamp_eligible ?? true,
      adult_verification_method: customer.adult_verified
        ? customer.adult_verification_method === "bbaton"
          ? "bbaton"
          : "physical_id"
        : "",
      adult_verification_request_id:
        customer.adult_verified &&
        customer.adult_verification_method === "bbaton"
          ? "__current__"
          : "",
      address: customer.address || "",
      note: customer.note || "",
    },
  });

  const adultVerificationMethod = watch("adult_verification_method");
  const selectedVerificationId = watch("adult_verification_request_id");

  useEffect(() => {
    if (adultVerificationMethod !== "bbaton") return;
    let active = true;
    const loadCompletedVerifications = async () => {
      setIsVerificationLoading(true);
      const koreaOffsetMs = 9 * 60 * 60 * 1000;
      const koreaNow = new Date(Date.now() + koreaOffsetMs);
      const todayStart = new Date(
        Date.UTC(
          koreaNow.getUTCFullYear(),
          koreaNow.getUTCMonth(),
          koreaNow.getUTCDate(),
        ) - koreaOffsetMs,
      );
      const tomorrowStart = new Date(
        todayStart.getTime() + 24 * 60 * 60 * 1000,
      );
      const { data, error } = await supabase
        .from("adult_verification_requests")
        .select("id, request_label, completed_at")
        .eq("status", "completed")
        .is("customer_id", null)
        .gte("completed_at", todayStart.toISOString())
        .lt("completed_at", tomorrowStart.toISOString())
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

  const handleFormSubmit = (values: FormValues) => {
    // Check if form is valid before proceeding
    if (!isValid) {
      return;
    }
    setFormData(values);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!formData || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await onSubmit(formData);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  if (showDeleteConfirm) {
    return (
      <div className="w-full">
        <h2 className="text-lg font-semibold mb-4 text-rose-600">
          고객 삭제 확인
        </h2>

        <div className="bg-rose-50 rounded-lg p-4 mb-6 border border-rose-200">
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium text-rose-600">이름:</span>
              <p className="text-base font-semibold text-gray-900">
                {customer.name}
              </p>
            </div>
            <div>
              <span className="text-sm font-medium text-rose-600">
                전화번호:
              </span>
              <p className="text-base font-semibold text-gray-900">
                {formatPhoneNumber(customer?.phone)}
              </p>
            </div>
            {customer.note && (
              <div>
                <span className="text-sm font-medium text-rose-600">메모:</span>
                <p className="text-base text-gray-900">{customer.note}</p>
              </div>
            )}
          </div>
        </div>

        <div className="text-center py-4">
          <p className="text-gray-700 text-sm">
            이 작업은 되돌릴 수 없습니다. 고객을 삭제하시겠습니까?
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button
            variant="gray"
            size="sm"
            onClick={() => setShowDeleteConfirm(false)}
            disabled={isDeleting}
          >
            취소
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            disabled={isDeleting}
            onClick={async () => {
              try {
                setIsDeleting(true);
                await onDelete();
              } finally {
                setIsDeleting(false);
              }
            }}
          >
            {isDeleting ? "삭제 중..." : "삭제"}
          </Button>
        </div>
      </div>
    );
  }

  if (showConfirm && formData) {
    return (
      <div className="w-full">
        <h2 className="text-lg font-semibold mb-4">고객 정보 수정 확인</h2>

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
                {formData.adult_verification_method === "physical_id"
                  ? "직접 확인"
                  : formData.adult_verification_request_id === "__current__"
                    ? "현재 링크 인증 유지"
                    : "성인 인증 링크확인"}
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
            위 정보로 고객 정보를 수정하시겠습니까?
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button
            variant="gray"
            size="sm"
            onClick={() => setShowConfirm(false)}
          >
            취소
          </Button>
          <Button
            disabled={isSubmitting || isSaving || !isValid}
            onClick={handleConfirm}
            size="sm"
          >
            {isSaving ? "수정 중..." : "수정"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className="w-full"
      noValidate
    >
      <h2 className="text-lg font-semibold mb-3">고객 정보 수정</h2>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-sm font-medium mb-1">
              이름 <span className="text-rose-600">*</span>
            </label>
            <input
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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

          <div className="min-w-0">
            <label className="block text-sm font-medium mb-1">
              전화번호 <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              maxLength={11}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="숫자만 / 정보 없을 경우 X"
              aria-invalid={!!errors.phone || undefined}
              {...register("phone", {
                onChange: (event) => {
                  const value = event.target.value.toUpperCase();
                  event.target.value =
                    value === "X" ? "X" : value.replace(/\D/g, "");
                },
              })}
            />
            {errors.phone && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.phone.message}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <span className="block text-sm font-medium mb-1">
              성별 <span className="text-rose-600">*</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <label className="cursor-pointer text-center text-sm">
                <input
                  className="peer sr-only"
                  type="radio"
                  value="male"
                  {...register("gender")}
                />
                <span className="block rounded-lg border border-gray-200 bg-white px-2 py-2 font-medium text-gray-600 transition hover:border-gray-300 peer-checked:border-brand-400 peer-checked:text-brand-700 peer-checked:shadow-sm">
                  남자
                </span>
              </label>
              <label className="cursor-pointer text-center text-sm">
                <input
                  className="peer sr-only"
                  type="radio"
                  value="female"
                  {...register("gender")}
                />
                <span className="block rounded-lg border border-gray-200 bg-white px-2 py-2 font-medium text-gray-600 transition hover:border-gray-300 peer-checked:border-brand-400 peer-checked:text-brand-700 peer-checked:shadow-sm">
                  여자
                </span>
              </label>
            </div>
            {errors.gender && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.gender.message}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <span className="block text-sm font-medium mb-1">
              적립 대상 <span className="text-rose-600">*</span>
            </span>
            <Controller
              name="is_stamp_eligible"
              control={control}
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-2">
                  <label className="cursor-pointer text-center text-sm">
                    <input
                      type="radio"
                      className="peer sr-only"
                      checked={field.value}
                      onChange={() => field.onChange(true)}
                    />
                    <span className="block rounded-lg border border-gray-200 bg-white px-2 py-2 font-medium text-gray-600 transition hover:border-gray-300 peer-checked:border-brand-400 peer-checked:text-brand-700 peer-checked:shadow-sm">
                      적립
                    </span>
                  </label>
                  <label className="cursor-pointer text-center text-sm">
                    <input
                      type="radio"
                      className="peer sr-only"
                      checked={!field.value}
                      onChange={() => field.onChange(false)}
                    />
                    <span className="block rounded-lg border border-gray-200 bg-white px-2 py-2 font-medium text-gray-600 transition hover:border-gray-300 peer-checked:border-brand-400 peer-checked:text-brand-700 peer-checked:shadow-sm">
                      미적립
                    </span>
                  </label>
                </div>
              )}
            />
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-900">
            성인 확인 여부 <span className="text-rose-600">*</span>
          </span>
          <Controller
            name="adult_verification_method"
            control={control}
            render={({ field }) => (
              <div className="mt-1 grid grid-cols-2 gap-3">
                {(["physical_id", "bbaton"] as const).map((method) => (
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
                ))}
              </div>
            )}
          />
          {errors.adult_verification_method && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.adult_verification_method.message}
            </p>
          )}
          {adultVerificationMethod === "bbaton" && (
            <div className="mt-3">
              <Dropdown
                controlledValue={selectedVerificationId}
                disabled={
                  isVerificationLoading || completedVerifications.length === 0
                }
              >
                <Dropdown.Trigger neutral>
                  {selectedVerificationId === "__current__"
                    ? "현재 링크 인증 유지"
                    : isVerificationLoading
                      ? "인증 기록 불러오는 중..."
                      : (completedVerifications.find(
                          (item) => item.id === selectedVerificationId,
                        )?.request_label ??
                        (completedVerifications.length > 0
                          ? "인증된 고객 선택"
                          : "오늘 인증된 고객 없음"))}
                </Dropdown.Trigger>
                <Dropdown.Content neutral maxHeightClass="max-h-48">
                  {customer.adult_verified &&
                    customer.adult_verification_method === "bbaton" && (
                      <Dropdown.Item
                        neutral
                        option={{
                          value: "__current__",
                          label: "현재 링크 인증 유지",
                        }}
                        onSelect={() =>
                          setValue(
                            "adult_verification_request_id",
                            "__current__",
                            { shouldValidate: true },
                          )
                        }
                      />
                    )}
                  {completedVerifications.map((item) => (
                    <Dropdown.Item
                      key={item.id}
                      neutral
                      option={{ value: item.id, label: item.request_label }}
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

        <div>
          <label className="mb-1 block text-sm font-medium">
            특이사항{" "}
            <span className="text-[0.625rem] font-normal text-gray-400">
              (선택)
            </span>
          </label>
          <textarea
            rows={2}
            className="min-h-16 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            placeholder="고객, 결제 관련 특이사항을 입력하세요."
            aria-invalid={!!errors.note || undefined}
            {...register("note")}
          />
          {errors.note && (
            <p className="mt-1 text-xs text-rose-600">{errors.note.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            <span className="block">
              주소지{" "}
              <span className="text-[0.625rem] font-normal text-gray-400">
                (선택)
              </span>
            </span>
            <span className="mt-0.5 block text-sm font-medium leading-snug text-gray-600">
              ex) OO구 도로명주소 OO건물 OO동 OO호 (공동현관 : 비밀번호 or X)
            </span>
          </label>
          <textarea
            rows={2}
            className="min-h-16 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            placeholder="주소지를 입력하세요."
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

      <div
        className={`pt-4 border-t border-gray-200 flex justify-between mt-4 ${
          isAdmin ? "justify-between" : "justify-end"
        }`}
      >
        {isAdmin && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              고객 삭제
            </Button>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="gray" size="sm" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" disabled={isSubmitting} size="sm">
            {isSubmitting ? "수정 중..." : "수정"}
          </Button>
        </div>
      </div>
    </form>
  );
}
