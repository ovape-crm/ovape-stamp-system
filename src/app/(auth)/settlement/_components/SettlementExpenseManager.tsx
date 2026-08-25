"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import Loading from "@/app/_components/Loading";
import { Dropdown, DropdownOption } from "@/app/_components/Dropdown";
import {
  cancelSettlementExpenseRecurrence,
  createSettlementExpenseCategory,
  createSettlementExpense,
  deleteSettlementExpense,
  getSettlementExpenseCategories,
  getSettlementExpenses,
  updateSettlementExpense,
} from "@/app/_domains/_settlement/_services/settlementService";
import { SettlementStore } from "@/app/_domains/_settlement/_types/settlement.types";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const storeOptions: { value: SettlementStore; label: string }[] = [
  { value: "ovape", label: "오베이프" },
  { value: "eguvape", label: "이구베이프" },
  { value: "common", label: "공통" },
  { value: "other", label: "그 외" },
];
const storeLabels = Object.fromEntries(storeOptions.map((option) => [option.value, option.label]));
const fieldClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export default function SettlementExpenseManager() {
  const currentDate = today();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentDate.slice(0, 7));
  const [expenseDate, setExpenseDate] = useState(currentDate);
  const [categoryId, setCategoryId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [store, setStore] = useState<SettlementStore>("ovape");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState(Number(currentDate.slice(8, 10)));
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState("");
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const range = { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
  const queryKey = ["settlement-expenses", range.start, range.end];
  const expensesQuery = useQuery({ queryKey, queryFn: () => getSettlementExpenses(range.start, range.end) });
  const categoriesQuery = useQuery({ queryKey: ["settlement-expense-categories"], queryFn: getSettlementExpenseCategories });
  const selectedCategory = categoriesQuery.data?.find((item) => item.id === categoryId);
  const categoryMutation = useMutation({
    mutationFn: createSettlementExpenseCategory,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["settlement-expense-categories"] }); setNewCategory(""); toast.success("비용 카테고리가 생성되었습니다."); },
    onError: () => toast.error("카테고리 생성에 실패했습니다."),
  });
  const createMutation = useMutation({
    mutationFn: createSettlementExpense,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["settlement-expense-total"] }),
      ]);
      setAmount(""); setNote("");
      toast.success("기타비용이 추가되었습니다.");
    },
    onError: () => toast.error("기타비용 추가에 실패했습니다."),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Parameters<typeof updateSettlementExpense>[1] }) => updateSettlementExpense(id, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["settlement-expense-total"] }),
      ]);
      setEditingId(""); setAmount(""); setNote(""); setIsRecurring(false); setRecurrenceEndDate("");
      toast.success("기타비용이 수정되었습니다.");
    },
    onError: () => toast.error("기타비용 수정에 실패했습니다."),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSettlementExpense,
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey }), queryClient.invalidateQueries({ queryKey: ["settlement-expense-total"] })]); toast.success("기타비용이 삭제되었습니다."); },
    onError: () => toast.error("기타비용 삭제에 실패했습니다."),
  });
  const cancelMutation = useMutation({
    mutationFn: ({ id, cancelledOn }: { id: string; cancelledOn: string }) => cancelSettlementExpenseRecurrence(id, cancelledOn),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey }); await queryClient.invalidateQueries({ queryKey: ["settlement-expense-total"] }); toast.success("월 반복이 취소되었습니다."); },
    onError: () => toast.error("월 반복 취소에 실패했습니다."),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!selectedCategory || !Number.isFinite(numericAmount) || numericAmount <= 0) return toast.error("항목과 금액을 확인해 주세요.");
    const values = { expenseDate, categoryId: selectedCategory.id, category: selectedCategory.name, amount: Math.floor(numericAmount), store, isRecurring, recurrenceDay: isRecurring ? recurrenceDay : null, recurrenceEndDate, note };
    if (editingId) updateMutation.mutate({ id: editingId, values });
    else createMutation.mutate(values);
  };
  const startEditing = (expense: NonNullable<typeof expensesQuery.data>[number]) => {
    const matchingCategory = categoriesQuery.data?.find((category) => category.id === expense.category_id || category.name === expense.category);
    setEditingId(expense.id);
    setExpenseDate(expense.expense_date);
    setCategoryId(matchingCategory?.id ?? "");
    setAmount(String(expense.amount));
    setStore(expense.store);
    setIsRecurring(expense.is_recurring);
    setRecurrenceDay(expense.recurrence_day ?? Number(expense.expense_date.slice(8, 10)));
    setRecurrenceEndDate(expense.recurrence_end_date ?? "");
    setNote(expense.note ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEditing = () => {
    setEditingId(""); setAmount(""); setNote(""); setIsRecurring(false); setRecurrenceEndDate("");
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div><h1 className="text-lg font-bold text-gray-900">기타비용 관리</h1><p className="mt-1 text-sm text-gray-500">인건비, 월세, 관리비, A/S 택배비 등 매출 외 비용을 등록합니다.</p></div>
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:flex-row sm:items-end">
          <Field label="비용 카테고리 생성" className="sm:w-[280px]"><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="새 카테고리 이름" className={fieldClass} /></Field>
          <Button type="button" variant="gray" onClick={() => { if (!newCategory.trim()) return toast.error("카테고리 이름을 입력해 주세요."); categoryMutation.mutate(newCategory); }} disabled={categoryMutation.isPending}>카테고리 생성</Button>
        </div>
        {editingId && <div className="mt-3 flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700"><span className="font-semibold">비용 항목을 수정하는 중입니다.{isRecurring ? " 반복 규칙 전체에 적용됩니다." : ""}</span><button type="button" onClick={cancelEditing} className="cursor-pointer font-semibold hover:underline">수정 취소</button></div>}
        <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="발생일"><input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className={fieldClass} required /></Field>
          <Field label="비용 항목"><Dropdown controlledValue={categoryId}><Dropdown.Trigger>{selectedCategory?.name ?? "카테고리 선택"}</Dropdown.Trigger><Dropdown.Content>{(categoriesQuery.data ?? []).map((category) => <Dropdown.Item key={category.id} option={{ value: category.id, label: category.name }} onSelect={(option: DropdownOption) => setCategoryId(String(option.value))} />)}</Dropdown.Content></Dropdown></Field>
          <Field label="금액"><input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="금액 입력" className={fieldClass} required /></Field>
          <Field label="비용 매장"><div className="grid h-10 grid-cols-4 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">{storeOptions.map((option) => <button key={option.value} type="button" onClick={() => setStore(option.value)} className={`cursor-pointer border-r border-gray-200 px-1 text-xs font-semibold last:border-r-0 ${store === option.value ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{option.label}</button>)}</div></Field>
          <Field label="메모" className="sm:col-span-2 lg:col-span-2"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="선택 입력" className={fieldClass} /></Field>
          <div className="flex items-end"><label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="h-4 w-4 accent-brand-500" />매월 지정일 반복</label></div>
          <div className="flex items-end justify-end"><Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editingId ? "수정 저장" : "비용 추가"}</Button></div>
          {isRecurring && <><Field label="매월 반복일"><div className="relative"><input type="number" min="1" max="31" value={recurrenceDay} onChange={(e) => setRecurrenceDay(Math.min(31, Math.max(1, Number(e.target.value))))} className={`${fieldClass} pr-8`} /><span className="pointer-events-none absolute right-3 top-2.5 text-sm text-gray-500">일</span></div></Field><Field label="반복 종료일"><input type="date" min={expenseDate} value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} className={fieldClass} /><span className="mt-1 text-xs text-gray-500">비우면 취소할 때까지 반복</span></Field></>}
        </form>
      </section>

      <div className="flex items-center justify-between gap-3"><p className="text-xs text-gray-600 sm:text-sm"><span className="font-semibold text-brand-600">{expensesQuery.data?.length ?? 0}</span>건</p><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${fieldClass} w-[180px] cursor-pointer`} /></div>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {expensesQuery.isPending ? <Loading size="sm" text="비용을 불러오는 중..." /> : expensesQuery.data?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-sm"><thead className="bg-gray-50/70 text-left text-xs text-gray-600"><tr><th className="px-4 py-3">시작일</th><th className="px-4 py-3">항목</th><th className="px-4 py-3">매장</th><th className="px-4 py-3">반복</th><th className="px-4 py-3">메모</th><th className="px-4 py-3 text-right">금액</th><th className="px-4 py-3 text-center">관리</th></tr></thead><tbody className="divide-y divide-gray-100">{expensesQuery.data.map((expense) => { const displayDay = expense.recurrence_day ?? Number(expense.expense_date.slice(8, 10)); return <tr key={expense.id}><td className="px-4 py-3">{expense.expense_date}</td><td className="px-4 py-3 font-semibold text-gray-900">{expense.category}</td><td className="px-4 py-3">{storeLabels[expense.store]}</td><td className="px-4 py-3">{expense.is_recurring ? expense.recurrence_cancelled_on ? `${displayDay}일 · 취소됨` : `${displayDay}일${expense.recurrence_end_date ? ` · ${expense.recurrence_end_date}까지` : " · 계속"}` : "일회성"}</td><td className="px-4 py-3 text-gray-500">{expense.note || "-"}</td><td className="px-4 py-3 text-right font-semibold">{expense.amount.toLocaleString("ko-KR")}원</td><td className="px-4 py-3 text-center"><div className="flex justify-center gap-2"><Button size="xs" variant="gray" onClick={() => startEditing(expense)}>수정</Button>{expense.is_recurring && !expense.recurrence_cancelled_on && <Button size="xs" variant="secondary" onClick={() => cancelMutation.mutate({ id: expense.id, cancelledOn: currentDate })}>반복 취소</Button>}<Button size="xs" variant="gray" onClick={() => deleteMutation.mutate(expense.id)}>삭제</Button></div></td></tr>; })}</tbody></table></div> : <p className="px-4 py-10 text-center text-sm text-gray-500">등록된 기타비용이 없습니다.</p>}
      </section>
    </div>
  );
}

const Field = ({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) => <label className={`flex min-w-0 flex-col ${className}`}><span className="mb-1 text-xs font-semibold text-gray-600">{label}</span>{children}</label>;
