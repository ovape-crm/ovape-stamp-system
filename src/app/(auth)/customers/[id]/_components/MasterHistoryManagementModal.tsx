"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/app/_components/Button";
import { Dropdown } from "@/app/_components/Dropdown";
import {
  HistoryTransferCustomer,
  searchHistoryTransferCustomers,
} from "@/app/_domains/_log/_services/logService";
import { getWorkerNames } from "@/app/_domains/_workJournal/_services/workJournalService";

type Props = {
  initialCustomer: HistoryTransferCustomer;
  initialCreatedAt: string;
  initialWorkerName: string;
  onSubmit: (values: {
    customer: HistoryTransferCustomer;
    createdAt: string;
    workerName: string;
  }) => Promise<void>;
  onCancel: () => void;
};

const toLocalDateTimeValue = (value: string) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export default function MasterHistoryManagementModal({
  initialCustomer,
  initialCreatedAt,
  initialWorkerName,
  onSubmit,
  onCancel,
}: Props) {
  const [customerQuery, setCustomerQuery] = useState("");
  const [matches, setMatches] = useState<HistoryTransferCustomer[]>([]);
  const [customer, setCustomer] = useState(initialCustomer);
  const [createdAt, setCreatedAt] = useState(toLocalDateTimeValue(initialCreatedAt));
  const [workerNames, setWorkerNames] = useState<string[]>([]);
  const [workerName, setWorkerName] = useState(initialWorkerName);
  const [savingAction, setSavingAction] = useState<"transfer" | "time" | "worker" | null>(null);

  useEffect(() => {
    void getWorkerNames().then((names) => {
      setWorkerNames(Array.from(new Set([...names, initialWorkerName].filter(Boolean))));
    });
  }, [initialWorkerName]);

  useEffect(() => {
    const query = customerQuery.trim();
    if (!query) {
      setMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchHistoryTransferCustomers(query).then(setMatches).catch(() => setMatches([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [customerQuery]);

  const workerOptions = useMemo(
    () => workerNames.map((name) => ({ label: name, value: name })),
    [workerNames],
  );

  const submit = async (
    action: "transfer" | "time" | "worker",
  ) => {
    if (!createdAt || !workerName) return;
    const values = {
      customer: action === "transfer" ? customer : initialCustomer,
      createdAt:
        action === "time"
          ? new Date(createdAt).toISOString()
          : initialCreatedAt,
      workerName: action === "worker" ? workerName : initialWorkerName,
    };
    setSavingAction(action);
    try {
      await onSubmit(values);
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <div className="w-full px-1 py-1 sm:px-2">
      <h2 className="text-lg font-bold text-gray-900">이력 관리</h2>
      <p className="mt-1 text-sm text-gray-500">각 항목은 따로 적용됩니다. 변경 전 정보는 이력에 보존됩니다.</p>
      <div className="mt-5 space-y-5">
        <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
          <p className="text-sm font-semibold text-gray-800">이력 이전</p>
          <p className="mt-1 text-xs text-gray-500">현재 작업 시간과 작업자를 그대로 유지해 다른 고객에게 이전합니다.</p>
          <div className="mt-3 flex gap-2">
            <input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder={`${customer.name} · ${customer.phone}`} className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            <Button size="sm" onClick={() => void submit("transfer")} disabled={savingAction !== null || customer.id === initialCustomer.id}>{savingAction === "transfer" ? "이전 중..." : "이력 이전"}</Button>
          </div>
          {matches.length > 0 && (
          <div className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 overscroll-contain">
            {matches.map((item) => (
              <button key={item.id} type="button" onClick={() => { setCustomer(item); setCustomerQuery(""); }} className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-white">
                <span className="font-semibold text-gray-800">{item.name}</span><span className="text-gray-500">{item.phone}</span>
              </button>
            ))}
          </div>
          )}
          <p className="mt-2 text-xs text-gray-500">선택됨: <span className="font-semibold text-gray-700">{customer.name} · {customer.phone}</span></p>
        </section>
        <section>
          <p className="text-sm font-semibold text-gray-700">작업 시간 변경</p>
          <div className="mt-1.5 flex gap-2">
            <input type="datetime-local" value={createdAt} onChange={(event) => setCreatedAt(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            <Button size="sm" onClick={() => void submit("time")} disabled={savingAction !== null}>{savingAction === "time" ? "변경 중..." : "시간 변경"}</Button>
          </div>
        </section>
        <section>
          <p className="text-sm font-semibold text-gray-700">작업자 변경</p>
          <div className="mt-1.5 flex gap-2">
          <Dropdown controlledValue={workerName}>
            <Dropdown.Trigger neutral className="h-11 min-w-0 flex-1 px-3 py-0 text-sm">{workerName || "작업자를 선택하세요"}</Dropdown.Trigger>
            <Dropdown.Content neutral maxHeightClass="max-h-48">
              {workerOptions.map((option) => <Dropdown.Item key={option.value} option={option} neutral onSelect={() => setWorkerName(String(option.value))} />)}
            </Dropdown.Content>
          </Dropdown>
          <Button size="sm" onClick={() => void submit("worker")} disabled={savingAction !== null || !workerName}>{savingAction === "worker" ? "변경 중..." : "작업자 변경"}</Button>
          </div>
        </section>
      </div>
      <div className="mt-6 flex justify-end"><Button variant="secondary" onClick={onCancel} disabled={savingAction !== null}>닫기</Button></div>
    </div>
  );
}
