'use client';

import { useState } from 'react';
import Button from '@/app/_components/Button';
import { useModal } from '@/app/_contexts/ModalContext';
import { useUser } from '@/app/_contexts/UserContext';
import { useItemCategories } from '@/app/_domains/_item/_hooks/useItemCategories';
import { InventoryFilters } from '@/app/_domains/_inventory/_queryKeys/inventoryKeys';
import InventoryTabs from '@/app/(auth)/_components/InventoryTabs';
import InventorySearchBox from './_components/InventorySearchBox';
import InventoryList from './_components/InventoryList';
import PartnerManageModal from './_components/PartnerManageModal';

const InventoryPage = () => {
  const { open, close } = useModal();
  const { isAdmin } = useUser();
  const { categories } = useItemCategories();
  const [filters, setFilters] = useState<InventoryFilters>({});

  const handleSearch = (newFilters: InventoryFilters) => {
    setFilters(newFilters);
  };

  const openPartnerManage = () => {
    open({
      content: <PartnerManageModal onClose={close} />,
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-4">
      <InventoryTabs />
      <InventorySearchBox categories={categories} onSearch={handleSearch} />

      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openPartnerManage}>
            거래처 관리
          </Button>
        </div>
      )}

      <InventoryList filters={filters} />
    </div>
  );
};

export default InventoryPage;
