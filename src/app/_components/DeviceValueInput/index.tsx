'use client';

import RichTextNoteEditor from '@/app/_components/RichTextNoteEditor';

const DeviceValueInput = ({
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) => (
  <RichTextNoteEditor
    value={value}
    onChange={onChange}
    disabled={disabled}
    enableLinks
    compact
    showPreview={false}
    placeholder={`${placeholder} 문장을 선택한 뒤 위 버튼으로 서식을 적용하세요.`}
  />
);

export default DeviceValueInput;
