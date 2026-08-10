import { getActionText } from "@/app/_utils/utils";

interface ActionInfoLabelProps {
  action: string;
  breakStatusLine?: boolean;
  matchStoreLabel?: boolean;
}

const MULTILINE_AS_STATUS_ACTIONS = new Set([
  "after-service-repair_returned_completed",
  "after-service-other",
  "after-service-other_in_progress",
]);

const ActionInfoLabel = ({
  action,
  breakStatusLine = false,
  matchStoreLabel = false,
}: ActionInfoLabelProps) => {
  const actionInfo = getActionText(action);
  const shouldBreakLine =
    breakStatusLine && MULTILINE_AS_STATUS_ACTIONS.has(action);
  const [statusName, statusDetail] = shouldBreakLine
    ? actionInfo.text.split(" (")
    : [actionInfo.text];

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-center text-xs font-semibold whitespace-nowrap ${actionInfo.color} ${
        matchStoreLabel ? "h-7 w-full px-2" : "px-3 py-1"
      } ${shouldBreakLine ? "flex-col leading-tight" : ""}`}
    >
      <span>{statusName}</span>
      {statusDetail && <span>({statusDetail}</span>}
    </span>
  );
};

export default ActionInfoLabel;
