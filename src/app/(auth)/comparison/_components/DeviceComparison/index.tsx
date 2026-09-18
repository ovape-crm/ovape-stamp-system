"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useModal } from "@/app/_contexts/ModalContext";
import { getComparisonColumns } from "@/app/_domains/_comparison/_services/comparisonColumnService";
import { ComparisonDeviceType } from "@/app/_domains/_comparison/_types/comparison.types";
import { comparisonKeys } from "@/app/_domains/_comparison/_queryKeys/comparisonKeys";
import { EmptySlot, FilledSlot } from "./ComparisonSlot";
import DeviceSelectModal from "../DeviceSelectModal";
import ComparisonExpandView from "./ComparisonExpandView";
import BasicUsageGuideView from "../BasicUsageGuideView";
import DeviceUsageGuideView from "../DeviceUsageGuideView";
import DevicePhotoView from "../DevicePhotoView";
import DeviceDefectView from "../DeviceDefectView";
import Button from "@/app/_components/Button";
import { getComparisonDeviceName } from '../../_utils/deviceName';
import type { GuideView } from '../GuideNavigationDropdown';

type ValueMap = Record<string, string>;

type Slot =
  | { type: "empty" }
  | { type: "filled"; device: ComparisonDeviceType; valueMap: ValueMap };

const MAX_SLOTS = 4;
const INITIAL_SLOTS = 2;

export default function DeviceComparison() {
  const { open, close } = useModal();
  const { data: columns = [] } = useQuery({
    queryKey: comparisonKeys.columns(),
    queryFn: getComparisonColumns,
  });
  const [slots, setSlots] = useState<Slot[]>(
    Array.from({ length: INITIAL_SLOTS }, () => ({ type: "empty" })),
  );
  const [basicGuideTarget, setBasicGuideTarget] = useState<Extract<Slot, { type: "filled" }> | null>(null);
  const [customerRequiredGuideTarget, setCustomerRequiredGuideTarget] = useState<Extract<Slot, { type: "filled" }> | null>(null);
  const [deviceUsageTarget, setDeviceUsageTarget] = useState<Extract<Slot, { type: "filled" }> | null>(null);
  const [devicePhotoTarget, setDevicePhotoTarget] = useState<Extract<Slot, { type: "filled" }> | null>(null);
  const [deviceDefectTarget, setDeviceDefectTarget] = useState<Extract<Slot, { type: "filled" }> | null>(null);

  // 모달에서 선택된 슬롯 인덱스를 클로저 없이 참조하기 위해 ref 사용
  const targetSlotRef = useRef<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const filledSlots = slots.filter(
    (s): s is Extract<Slot, { type: "filled" }> => s.type === "filled",
  );
  const filledDeviceIds = filledSlots.map((s) => s.device.id);

  const handleAddSlot = (index: number) => {
    targetSlotRef.current = index;
    open({
      content: (
        <DeviceSelectModal
          excludeDeviceIds={filledDeviceIds}
          onSelect={(device, valueMap) => {
            const idx = targetSlotRef.current;
            if (idx === null) return;
            setSlots((prev) =>
              prev.map((slot, i) =>
                i === idx ? { type: "filled", device, valueMap } : slot,
              ),
            );
            close();
          }}
          onCancel={close}
        />
      ),
      options: { dismissOnBackdrop: true, dismissOnEsc: true },
    });
  };

  const handleRemoveSlot = (index: number) => {
    setSlots((prev) =>
      prev.map((slot, i) => (i === index ? { type: "empty" } : slot)),
    );
  };

  const handleAppendSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    setSlots((prev) => [...prev, { type: "empty" }]);
  };

  const handleRemoveLastSlot = () => {
    if (slots.length <= INITIAL_SLOTS) return;
    setSlots((prev) => prev.slice(0, -1));
  };

  const openGuide = (target: Extract<Slot, { type: "filled" }>, view: GuideView) => {
    setBasicGuideTarget(view === 'basic' ? target : null);
    setCustomerRequiredGuideTarget(view === 'customerRequired' ? target : null);
    setDevicePhotoTarget(view === 'photo' ? target : null);
    setDeviceUsageTarget(view === 'usage' ? target : null);
    setDeviceDefectTarget(view === 'defect' ? target : null);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* 슬롯 영역 */}
      <div className="flex flex-col sm:flex-row gap-4 flex-1 min-h-0">
        {slots.map((slot, index) =>
          slot.type === "empty" ? (
            <EmptySlot key={index} onAdd={() => handleAddSlot(index)} />
          ) : (
            <FilledSlot
              key={slot.device.id}
              columns={columns}
              valueMap={slot.valueMap}
              onRemove={() => handleRemoveSlot(index)}
              onOpenBasicGuide={() => openGuide(slot, 'basic')}
              onOpenCustomerRequiredGuide={() => openGuide(slot, 'customerRequired')}
              onOpenDeviceUsage={() => openGuide(slot, 'usage')}
              onOpenDevicePhoto={() => openGuide(slot, 'photo')}
              onOpenDeviceDefect={() => openGuide(slot, 'defect')}
            />
          ),
        )}
      </div>

      {/* 슬롯 추가/제거 + 확대 */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {slots.length < MAX_SLOTS && (
            <Button size="sm" variant="secondary" onClick={handleAppendSlot}>
              슬롯 추가
            </Button>
          )}
          {slots.length > INITIAL_SLOTS && (
            <Button size="sm" variant="gray" onClick={handleRemoveLastSlot}>
              슬롯 제거
            </Button>
          )}
        </div>
        {filledSlots.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsExpanded(true)}
          >
            비교하기
          </Button>
        )}
      </div>

      {isExpanded && (
        <ComparisonExpandView
          columns={columns}
          filledSlots={filledSlots}
          onClose={() => setIsExpanded(false)}
        />
      )}
      {basicGuideTarget && <BasicUsageGuideView devices={[{ id: basicGuideTarget.device.id, name: getComparisonDeviceName(columns, basicGuideTarget.valueMap, '기기 사용법') }]} onNavigate={(view) => openGuide(basicGuideTarget, view)} onClose={() => setBasicGuideTarget(null)} />}
      {customerRequiredGuideTarget && <BasicUsageGuideView devices={[{ id: customerRequiredGuideTarget.device.id, name: getComparisonDeviceName(columns, customerRequiredGuideTarget.valueMap, '기기 사용법') }]} kind="customerRequired" title="고객 필수 안내" onNavigate={(view) => openGuide(customerRequiredGuideTarget, view)} onClose={() => setCustomerRequiredGuideTarget(null)} />}
      {deviceUsageTarget && <DeviceUsageGuideView deviceId={deviceUsageTarget.device.id} deviceName={getComparisonDeviceName(columns, deviceUsageTarget.valueMap, '기기 사용법')} legacyImageUrl={columns.find((column) => column.name === '기기 사용법') ? deviceUsageTarget.valueMap[columns.find((column) => column.name === '기기 사용법')!.id] : ''} onNavigate={(view) => openGuide(deviceUsageTarget, view)} onClose={() => setDeviceUsageTarget(null)} />}
      {devicePhotoTarget && <DevicePhotoView deviceId={devicePhotoTarget.device.id} deviceName={getComparisonDeviceName(columns, devicePhotoTarget.valueMap)} onNavigate={(view) => openGuide(devicePhotoTarget, view)} onClose={() => setDevicePhotoTarget(null)} />}
      {deviceDefectTarget && <DeviceDefectView deviceId={deviceDefectTarget.device.id} deviceName={getComparisonDeviceName(columns, deviceDefectTarget.valueMap)} onNavigate={(view) => openGuide(deviceDefectTarget, view)} onClose={() => setDeviceDefectTarget(null)} />}
    </div>
  );
}
