'use client';

import { useParams, useRouter } from 'next/navigation';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import NotFoundView from '@/app/_components/NotFoundView';
import { useInventory } from '@/app/_domains/_inventory/_hooks/useInventory';
import ItemInfo from './_components/ItemInfo';
import InventoryStatus from './_components/InventoryStatus';

export default function InventoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id as string;
  const { item, isLoading, error } = useInventory(itemId);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loading size="lg" text="재고 정보 불러오는 중..." />
      </div>
    );
  }

  if (error || !item) {
    return <NotFoundView full={false} />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
          재고 상세
        </h1>
        <Button onClick={() => router.push('/inventory')} variant="tertiary">
          ← 목록으로
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-6 mb-6 items-stretch">
        <div className="flex-1 self-stretch">
          <ItemInfo item={item} />
        </div>
        <div className="flex-1 self-stretch">
          <InventoryStatus quantity={item.inventory_quantity} />
        </div>
      </div>
    </div>
  );
}
