const FOLLOW_UP_REMARK_PREFIX = "[처리 필요 등록]";

export const isFollowUpRemarkNote = (note: string | null | undefined) =>
  (note ?? "").startsWith(FOLLOW_UP_REMARK_PREFIX);

export const getFollowUpRemarkContent = (note: string | null | undefined) =>
  (note ?? "").replace(/^(?:\[처리 필요 등록\]\s*)+/, "");

export const formatFollowUpRemarkNote = (content: string) =>
  `${FOLLOW_UP_REMARK_PREFIX}\n${getFollowUpRemarkContent(content)}`;
