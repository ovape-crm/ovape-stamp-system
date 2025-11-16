import { getActionText } from '@/app/_utils/utils';

const ActionInfoLabel = ({ action }: { action: string }) => {
  const actionInfo = getActionText(action);
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${actionInfo.color}`}
    >
      {actionInfo.text}
    </span>
  );
};

export default ActionInfoLabel;
