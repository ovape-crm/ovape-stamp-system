import { LogActorUserInfo } from "@/app/_domains/_log/_types/log.types";

const LogActorInfo = ({
  users,
  created_at,
  updated_at,
  jsonb,
}: {
  users: LogActorUserInfo;
  created_at: string;
  updated_at?: string;
  jsonb?: Record<string, unknown>;
}) => {
  const createdWorkerName =
    typeof jsonb?.createdWorkerName === "string" ? jsonb.createdWorkerName : "";
  const modifiedWorkerName =
    typeof jsonb?.modifiedWorkerName === "string"
      ? jsonb.modifiedWorkerName
      : "";
  const modifiedAt =
    typeof jsonb?.modifiedAt === "string" ? jsonb.modifiedAt : updated_at;
  const reservationCreatedWorkerName =
    typeof jsonb?.reservationCreatedWorkerName === "string"
      ? jsonb.reservationCreatedWorkerName
      : "";
  const reservationCreatedAt =
    typeof jsonb?.reservationCreatedAt === "string"
      ? jsonb.reservationCreatedAt
      : "";
  const confirmedWorkerName =
    typeof jsonb?.confirmedWorkerName === "string"
      ? jsonb.confirmedWorkerName
      : "";
  const confirmedAt =
    typeof jsonb?.confirmedAt === "string" ? jsonb.confirmedAt : "";
  const hasReservationConfirmationActors = Boolean(
    reservationCreatedWorkerName &&
      reservationCreatedAt &&
      confirmedWorkerName &&
      confirmedAt,
  );
  const userDisplay =
    users?.oss_role === "master" || users?.oss_role === "admin"
      ? users.oss_role === "master" ? "마스터" : "관리자"
      : createdWorkerName || users?.name || users?.email || "알 수 없음";

  const storedModificationHistory = Array.isArray(jsonb?.modificationHistory)
    ? jsonb.modificationHistory.filter(
        (
          item,
        ): item is {
          workerName: string;
          modifiedAt: string;
        } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).workerName === "string" &&
          typeof (item as Record<string, unknown>).modifiedAt === "string",
      )
    : [];
  const modificationHistory =
    storedModificationHistory.length > 0
      ? storedModificationHistory
      : modifiedWorkerName && modifiedAt
        ? [{ workerName: modifiedWorkerName, modifiedAt }]
        : [];
  const formatDate = (value: string) =>
    new Date(value).toLocaleString("ko-KR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  const createdDateText = formatDate(created_at);

  return (
    <div>
      {hasReservationConfirmationActors ? (
        <>
          <div className="text-xs text-gray-500">
            작업자 ·{" "}
            <span className="font-medium text-gray-700">
              {reservationCreatedWorkerName}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {formatDate(reservationCreatedAt)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            작업자 ·{" "}
            <span className="font-medium text-gray-700">
              {confirmedWorkerName}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {formatDate(confirmedAt)}
          </div>
        </>
      ) : (
        <>
          <div className="text-xs text-gray-500">
            작업자 ·{" "}
            <span className="font-medium text-gray-700">{userDisplay}</span>
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {createdDateText}
          </div>
        </>
      )}
      {modificationHistory.map((history, index) => (
        <div
          key={`${history.modifiedAt}-${history.workerName}-${index}`}
          className="mt-1"
        >
          <div className="text-xs text-gray-500">
            수정{" "}
            <span className="font-medium text-gray-700">
              {history.workerName}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {formatDate(history.modifiedAt)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default LogActorInfo;
