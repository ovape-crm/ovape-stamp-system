'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import InventoryTabs from '@/app/(auth)/_components/InventoryTabs';
import Button from '@/app/_components/Button';
import { useModal } from '@/app/_contexts/ModalContext';
import { InboundFilters } from '@/app/_domains/_inbound/_queryKeys/inboundKeys';
import { inboundKeys } from '@/app/_domains/_inbound/_queryKeys/inboundKeys';
import { createInboundOrder } from '@/app/_domains/_inbound/_services/inboundService';
import toast from 'react-hot-toast';
import InboundCreateModal, {
  InboundCreateFormValues,
} from './_components/InboundCreateModal';
import InboundSearchBox from './_components/InboundSearchBox';
import InboundList from './_components/InboundList';

const InboundPage = () => {
  const queryClient = useQueryClient();
  const { open, close } = useModal();
  const [filters, setFilters] = useState<InboundFilters>({});

  const handleCreateInbound = async (values: InboundCreateFormValues) => {
    try {
      await createInboundOrder({
        partnerId: values.partnerId,
        orderDate: values.orderDate,
        note: values.note?.trim() ? values.note.trim() : null,
        items: values.items.map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity,
          note: item.note?.trim() ? item.note.trim() : null,
        })),
      });
      toast.success('입고가 추가되었습니다.');
      close();
      queryClient.invalidateQueries({ queryKey: inboundKeys.lists() });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '입고 추가에 실패했습니다.',
      );
      throw error;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-4">
      <InventoryTabs />
      <InboundSearchBox onSearch={setFilters} />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() =>
            open({
              content: (
                <InboundCreateModal
                  onSubmit={handleCreateInbound}
                  onCancel={close}
                />
              ),
              options: {
                dismissOnBackdrop: false,
                dismissOnEsc: true,
                maxWidthClassName: 'max-w-4xl',
              },
            })
          }
        >
          입고 추가
        </Button>
      </div>
      <InboundList filters={filters} />
    </div>
  );
};

export default InboundPage;
