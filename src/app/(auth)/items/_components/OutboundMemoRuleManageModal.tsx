"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import { Dropdown, type DropdownOption } from "@/app/_components/Dropdown";
import { useItemCategories } from "@/app/_domains/_item/_hooks/useItemCategories";
import { useOutboundMemoRules } from "@/app/_domains/_item/_hooks/useOutboundMemoRules";
import { getAllItemsForBulk } from "@/app/_domains/_item/_services/itemBulkService";
import {
  deleteOutboundMemoRule,
  outboundMemoRuleKey,
  saveOutboundMemoRule,
} from "@/app/_domains/_item/_services/outboundMemoRuleService";
import type {
  OutboundMemoRule,
  OutboundMemoRuleOutboundType,
  OutboundMemoRuleTargetType,
} from "@/app/_domains/_item/_types/outboundMemoRule.types";

const initialMessage = "";
const outboundTypeOptions: Array<{
  value: OutboundMemoRuleOutboundType;
  label: string;
}> = [
  { value: "standard", label: "일반 출고" },
  { value: "exchange_in", label: "교환입고" },
  { value: "exchange_out", label: "교환출고" },
  { value: "service", label: "서비스" },
  { value: "price_adjust", label: "가격조정" },
];
const allOutboundTypes = outboundTypeOptions.map((option) => option.value);
const getRuleTargetLabel = (rule: OutboundMemoRule) =>
  rule.target_type === "category"
    ? (rule.item_categories?.name ?? "삭제된 품목 종류")
    : (rule.items?.item_name ?? "삭제된 품목");

export default function OutboundMemoRuleManageModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { categories } = useItemCategories();
  const { rules, isLoading, isError } = useOutboundMemoRules();
  const itemsQuery = useQuery({
    queryKey: ["items", "all-for-outbound-memo-rules"],
    queryFn: getAllItemsForBulk,
    staleTime: 60_000,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetType, setTargetType] =
    useState<OutboundMemoRuleTargetType>("category");
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [applicableOutboundTypes, setApplicableOutboundTypes] =
    useState<OutboundMemoRuleOutboundType[]>(allOutboundTypes);
  const [isRequired, setIsRequired] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [itemSearch, setItemSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [view, setView] = useState<"create" | "list">("create");
  const [ruleSearch, setRuleSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  const selectedCategory = categories.find(
    (category) => String(category.id) === targetId,
  );
  const selectedItem = itemsQuery.data?.find(
    (item) => String(item.id) === targetId,
  );
  const filteredItems = useMemo(() => {
    const keyword = itemSearch.trim().toLocaleLowerCase("ko-KR");
    if (!keyword) return [];
    return (itemsQuery.data ?? [])
      .filter(
        (item) =>
          item.is_use &&
          `${item.item_name} ${item.item_code}`
            .toLocaleLowerCase("ko-KR")
            .includes(keyword),
      )
      .slice(0, 20);
  }, [itemSearch, itemsQuery.data]);
  const filteredRules = useMemo(() => {
    const keyword = ruleSearch.trim().toLocaleLowerCase("ko-KR");
    return rules.filter((rule) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? rule.is_active : !rule.is_active);
      if (!matchesStatus) return false;
      if (!keyword) return true;
      const outboundLabels = (
        rule.applicable_outbound_types?.length
          ? rule.applicable_outbound_types
          : allOutboundTypes
      )
        .map(
          (value) =>
            outboundTypeOptions.find((option) => option.value === value)?.label,
        )
        .join(" ");
      return `${getRuleTargetLabel(rule)} ${rule.message} ${outboundLabels}`
        .toLocaleLowerCase("ko-KR")
        .includes(keyword);
    });
  }, [ruleSearch, rules, statusFilter]);

  const resetForm = () => {
    setEditingId(null);
    setTargetType("category");
    setTargetId("");
    setMessage(initialMessage);
    setApplicableOutboundTypes(allOutboundTypes);
    setIsRequired(false);
    setIsActive(true);
    setItemSearch("");
  };

  const changeTargetType = (next: OutboundMemoRuleTargetType) => {
    setTargetType(next);
    setTargetId("");
    setItemSearch("");
  };

  const startEditing = (rule: OutboundMemoRule) => {
    setEditingId(rule.id);
    setTargetType(rule.target_type);
    setTargetId(String(rule.category_id ?? rule.item_id ?? ""));
    setMessage(rule.message);
    setApplicableOutboundTypes(
      rule.applicable_outbound_types?.length
        ? rule.applicable_outbound_types
        : allOutboundTypes,
    );
    setIsRequired(rule.is_required);
    setIsActive(rule.is_active);
    setItemSearch("");
    setView("create");
  };

  const handleSave = async () => {
    if (!targetId || !message.trim() || !applicableOutboundTypes.length) return;
    setIsSaving(true);
    try {
      await saveOutboundMemoRule(
        {
          targetType,
          targetId,
          message,
          autoSelectMemo: true,
          applicableOutboundTypes,
          isRequired,
          isActive,
        },
        editingId ?? undefined,
      );
      await queryClient.invalidateQueries({ queryKey: outboundMemoRuleKey });
      toast.success(
        editingId ? "메모 알림을 수정했습니다." : "메모 알림을 추가했습니다.",
      );
      const wasEditing = Boolean(editingId);
      resetForm();
      if (wasEditing) setView("list");
    } catch (error) {
      const code = (error as { code?: string })?.code;
      toast.error(
        code === "23505"
          ? "선택한 대상에는 이미 메모 알림이 있습니다. 기존 규칙을 수정해 주세요."
          : "메모 알림 저장에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 메모 알림 규칙을 삭제할까요?")) return;
    try {
      await deleteOutboundMemoRule(id);
      await queryClient.invalidateQueries({ queryKey: outboundMemoRuleKey });
      if (editingId === id) resetForm();
      toast.success("메모 알림을 삭제했습니다.");
    } catch {
      toast.error("메모 알림 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="flex max-h-[calc(90vh-2rem)] min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            출고 메모 알림 관리
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            품목 종류나 특정 품목을 선택했을 때 표시할 메모 안내를 설정합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white text-xl leading-none text-gray-500 hover:bg-gray-50 hover:text-gray-800"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      <div className="mt-4 grid shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-gray-300 bg-white">
        <button
          type="button"
          onClick={() => {
            resetForm();
            setView("create");
          }}
          className={`h-10 cursor-pointer text-sm font-semibold transition ${
            view === "create"
              ? "bg-brand-500 text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          알림 등록
        </button>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setView("list");
          }}
          className={`h-10 cursor-pointer text-sm font-semibold transition ${
            view === "list"
              ? "bg-brand-500 text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          등록된 알림 {rules.length > 0 ? `(${rules.length})` : ""}
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {isError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            설정 테이블을 불러오지 못했습니다. Supabase에서
            <code className="mx-1 font-semibold">
              docs/outbound_memo_rules.sql
            </code>
            을 먼저 실행해 주세요.
          </div>
        ) : (
          <>
            {view === "create" && (
              <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <span className="text-xs font-semibold text-gray-600">
                      적용 기준
                    </span>
                    <div className="mt-1.5 sm:hidden">
                      <Dropdown controlledValue={targetType}>
                        <Dropdown.Trigger>
                          {targetType === "category"
                            ? "품목 종류"
                            : "특정 품목"}
                        </Dropdown.Trigger>
                        <Dropdown.Content>
                          <Dropdown.Item
                            option={{ value: "category", label: "품목 종류" }}
                            onSelect={(option: DropdownOption) =>
                              changeTargetType(
                                option.value as OutboundMemoRuleTargetType,
                              )
                            }
                          />
                          <Dropdown.Item
                            option={{ value: "item", label: "특정 품목" }}
                            onSelect={(option: DropdownOption) =>
                              changeTargetType(
                                option.value as OutboundMemoRuleTargetType,
                              )
                            }
                          />
                        </Dropdown.Content>
                      </Dropdown>
                    </div>
                    <div className="mt-1.5 hidden grid-cols-2 overflow-hidden rounded-lg border border-gray-300 bg-white sm:grid">
                      {(["category", "item"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => changeTargetType(type)}
                          className={`h-10 cursor-pointer text-sm font-semibold transition ${
                            targetType === type
                              ? "bg-brand-500 text-white"
                              : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {type === "category" ? "품목 종류" : "특정 품목"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-gray-600">
                      적용 대상
                    </span>
                    {targetType === "category" ? (
                      <div className="mt-1.5">
                        <Dropdown controlledValue={targetId}>
                          <Dropdown.Trigger>
                            {selectedCategory?.name ?? "품목 종류 선택"}
                          </Dropdown.Trigger>
                          <Dropdown.Content>
                            {categories.map((category) => (
                              <Dropdown.Item
                                key={category.id}
                                option={{
                                  value: String(category.id),
                                  label: category.name,
                                }}
                                onSelect={(option: DropdownOption) =>
                                  setTargetId(String(option.value))
                                }
                              />
                            ))}
                          </Dropdown.Content>
                        </Dropdown>
                      </div>
                    ) : (
                      <div className="relative mt-1.5">
                        <input
                          type="text"
                          value={
                            selectedItem ? selectedItem.item_name : itemSearch
                          }
                          onChange={(event) => {
                            setTargetId("");
                            setItemSearch(event.target.value);
                          }}
                          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                          placeholder="품목명을 입력하세요"
                        />
                        {selectedItem && (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetId("");
                              setItemSearch("");
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-500"
                            aria-label="선택 해제"
                          >
                            ×
                          </button>
                        )}
                        {!selectedItem && itemSearch.trim() && (
                          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                            {filteredItems.length ? (
                              filteredItems.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setTargetId(String(item.id));
                                    setItemSearch("");
                                  }}
                                  className="block w-full cursor-pointer border-b border-gray-100 px-3 py-2.5 text-left last:border-0 hover:bg-gray-50"
                                >
                                  <span className="block text-sm font-medium text-gray-900">
                                    {item.item_name}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {item.item_categories?.name ?? "미분류"}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <p className="px-3 py-4 text-center text-sm text-gray-400">
                                검색 결과가 없습니다.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <label className="block text-xs font-semibold text-gray-600">
                  안내 문구
                  <input
                    type="text"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    placeholder="메모에 필요한 내용을 입력해 주세요."
                  />
                </label>

                <div>
                  <span className="text-xs font-semibold text-gray-600">
                    적용 출고 유형 <span className="text-rose-600">*</span>
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {outboundTypeOptions.map((option) => {
                      const checked = applicableOutboundTypes.includes(
                        option.value,
                      );
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setApplicableOutboundTypes((current) =>
                              checked
                                ? current.filter(
                                    (value) => value !== option.value,
                                  )
                                : [...current, option.value],
                            )
                          }
                          className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                            checked
                              ? "border-brand-500 bg-brand-50 text-brand-700"
                              : "border-gray-300 bg-white text-gray-500 hover:border-brand-300"
                          }`}
                        >
                          {checked && <span className="mr-1">✓</span>}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {!applicableOutboundTypes.length && (
                    <p className="mt-1.5 text-xs font-medium text-rose-600">
                      적용할 출고 유형을 하나 이상 선택해 주세요.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-gray-700">
                  <RuleCheckbox
                    label="메모 작성 필수"
                    checked={isRequired}
                    onChange={setIsRequired}
                  />
                  <RuleCheckbox
                    label="사용"
                    checked={isActive}
                    onChange={setIsActive}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  {editingId && (
                    <Button
                      size="sm"
                      variant="gray"
                      onClick={() => {
                        resetForm();
                        setView("list");
                      }}
                    >
                      취소
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={
                      isSaving ||
                      !targetId ||
                      !message.trim() ||
                      !applicableOutboundTypes.length
                    }
                  >
                    {isSaving ? "저장 중..." : editingId ? "수정" : "알림 추가"}
                  </Button>
                </div>
              </section>
            )}

            {view === "list" && (
              <section className="space-y-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                    <div className="relative">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                        aria-hidden="true"
                      >
                        <path
                          d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                        />
                      </svg>
                      <input
                        type="text"
                        value={ruleSearch}
                        onChange={(event) => setRuleSearch(event.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        placeholder="대상, 안내 문구, 출고 유형 검색"
                      />
                      {ruleSearch && (
                        <button
                          type="button"
                          onClick={() => setRuleSearch("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-gray-700"
                          aria-label="검색어 지우기"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <Dropdown controlledValue={statusFilter}>
                      <Dropdown.Trigger>
                        {statusFilter === "active"
                          ? "사용 중"
                          : statusFilter === "inactive"
                            ? "사용 안 함"
                            : "전체 상태"}
                      </Dropdown.Trigger>
                      <Dropdown.Content>
                        {[
                          { value: "all", label: "전체 상태" },
                          { value: "active", label: "사용 중" },
                          { value: "inactive", label: "사용 안 함" },
                        ].map((option) => (
                          <Dropdown.Item
                            key={option.value}
                            option={option}
                            onSelect={(selected: DropdownOption) =>
                              setStatusFilter(
                                selected.value as "all" | "active" | "inactive",
                              )
                            }
                          />
                        ))}
                      </Dropdown.Content>
                    </Dropdown>
                  </div>
                </div>

                <div className="mb-3 flex items-center justify-start gap-3">
                  <p className="text-xs text-gray-600 sm:text-sm">
                    검색 결과{" "}
                    <span className="font-semibold text-brand-600">
                      {filteredRules.length}
                    </span>
                    {rules.length > 0 && ` / ${rules.length}`}
                  </p>
                </div>
                {isLoading ? (
                  <p className="py-5 text-center text-sm text-gray-400">
                    불러오는 중...
                  </p>
                ) : filteredRules.length ? (
                  <div className="space-y-2">
                    {filteredRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                              {rule.target_type === "category"
                                ? "품목 종류"
                                : "특정 품목"}
                            </span>
                            <strong className="text-sm text-gray-900">
                              {getRuleTargetLabel(rule)}
                            </strong>
                            {!rule.is_active && (
                              <span className="text-xs font-semibold text-gray-400">
                                사용 안 함
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-gray-600">
                            {rule.message}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            {(rule.applicable_outbound_types?.length
                              ? rule.applicable_outbound_types
                              : allOutboundTypes
                            )
                              .map(
                                (value) =>
                                  outboundTypeOptions.find(
                                    (option) => option.value === value,
                                  )?.label,
                              )
                              .filter(Boolean)
                              .join(" · ")}
                            {rule.is_required ? " · 작성 필수" : " · 선택 입력"}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button
                            size="xs"
                            variant="gray"
                            onClick={() => startEditing(rule)}
                          >
                            수정
                          </Button>
                          <Button
                            size="xs"
                            variant="danger"
                            onClick={() => handleDelete(rule.id)}
                          >
                            삭제
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-gray-300 py-6 text-center text-sm text-gray-400">
                    {rules.length
                      ? "검색 조건에 맞는 알림이 없습니다."
                      : "등록된 메모 알림이 없습니다."}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RuleCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 cursor-pointer accent-brand-500"
      />
      {label}
    </label>
  );
}
