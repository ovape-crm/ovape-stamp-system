import { getActionText } from '@/app/_utils/utils';

interface ActionInfoLabelProps {
  action: string;
  breakStatusLine?: boolean;
}

const MULTILINE_AS_STATUS_ACTIONS = new Set([
  'after-service-repair_returned_completed',
  'after-service-other',
  'after-service-other_in_progress',
]);

const ActionInfoLabel = ({
  action,
  breakStatusLine = false,
}: ActionInfoLabelProps) => {
  const actionInfo = getActionText(action);
  const shouldBreakLine =
    breakStatusLine && MULTILINE_AS_STATUS_ACTIONS.has(action);
  const [statusName, statusDetail] = shouldBreakLine
    ? actionInfo.text.split(' (')
    : [actionInfo.text];

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${actionInfo.color} ${
        shouldBreakLine ? 'inline-flex flex-col items-center leading-tight' : ''
      }`}
    >
      <span>{statusName}</span>
      {statusDetail && <span>({statusDetail}</span>}
    </span>
  );
};

export default ActionInfoLabel;
