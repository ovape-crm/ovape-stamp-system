import { LogCategoryEnum, PaymentTypeEnum } from "@/app/_enums/enums";
import { createLog } from "@/app/_domains/_log/_services/logService";
import supabase from "@/libs/supabaseClient";

const weekdayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

export const formatOutboundMemoRemark = ({ content, createdAt, workerName }: { content: string; createdAt: string; workerName: string }) => {
  const date = new Date(createdAt);
  const dateParts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((value) => value.type === type)?.value ?? "";
  const dateText = `${part("year")}년 ${part("month")}월 ${part("day")}일`;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" }).format(date);
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return `출고 특이사항\n날짜 : ${dateText} ${weekdayNames[weekdayIndex]}\n작업자 : ${workerName}\n내용 : ${content.trim()}`;
};

export const getOutboundMemoRemarkContent = (note: string) => {
  const matched = note.match(/(?:^|\n)내용\s*:\s*([\s\S]*)$/u);
  return matched?.[1]?.trim() ?? note;
};

export const syncOutboundMemoRemark = async ({ customerId, sourceLogId, content, createdAt, workerName }: { customerId: string; sourceLogId: string; content: string; createdAt: string; workerName: string }) => {
  const { data: existing, error } = await supabase.from("logs").select("id").eq("customer_id", customerId).contains("jsonb", { outboundMemoSourceLogId: sourceLogId }).maybeSingle();
  if (error) throw error;
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    if (existing) {
      const { error: deleteError } = await supabase.from("logs").delete().eq("id", existing.id);
      if (deleteError) throw deleteError;
    }
    return;
  }
  const note = formatOutboundMemoRemark({ content: trimmedContent, createdAt, workerName });
  if (existing) {
    const { error: updateError } = await supabase.from("logs").update({ note }).eq("id", existing.id);
    if (updateError) throw updateError;
    return;
  }
  await createLog(LogCategoryEnum.STAMP.value, customerId, "no-stamp", note, { paymentType: PaymentTypeEnum.REMARK.value, outboundMemoSourceLogId: sourceLogId });
};
