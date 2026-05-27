'use client';

interface InventoryStatusProps {
  quantity: number;
}

const InventoryStatus = ({ quantity }: InventoryStatusProps) => {
  return (
    <section className="flex-1 h-full flex flex-col bg-gradient-to-br from-brand-50 to-brand-100 rounded-lg shadow-sm border border-brand-200 p-6">
      <h2 className="text-xl font-semibold text-brand-700 mb-6 pb-3 border-b border-brand-200">
        재고 현황
      </h2>

      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-baseline gap-2">
          <span className="text-7xl sm:text-8xl font-black bg-gradient-to-br from-brand-600 to-brand-800 bg-clip-text text-transparent tabular-nums">
            {quantity.toLocaleString()}
          </span>
          <span className="text-2xl font-semibold text-brand-700">개</span>
        </div>
      </div>
    </section>
  );
};

export default InventoryStatus;
