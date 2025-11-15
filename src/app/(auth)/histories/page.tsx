'use client';

import StampHistories from './_components/StampHistories';

export default function HistoriesPage() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 mb-10">
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6">
        <h2 className="text-xl font-semibold text-brand-700 mb-4 pb-3 border-b border-brand-100">
          스탬프 이력
        </h2>
        <StampHistories />
      </div>
    </section>
  );
}
