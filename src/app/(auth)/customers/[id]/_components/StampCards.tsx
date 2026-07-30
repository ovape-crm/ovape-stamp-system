interface StampCardsProps {
  count: number;
  compact?: boolean;
  pendingAmount?: number;
}

const StampCards = ({
  count,
  compact = false,
  pendingAmount = 0,
}: StampCardsProps) => {
  const completedCards = Math.floor(count / 10); // 완성된 카드 수
  const currentStamps = count % 10; // 현재 카드의 스탬프 수
  const hasCurrentCard = count > 0; // 현재 진행 중인 카드가 있는지

  // 5x2 그리드 (총 10칸)
  const stampSlots = Array.from({ length: 10 }, (_, i) => i);

  if (compact) {
    const projectedStamps = currentStamps + pendingAmount;
    const hasRolledOver = projectedStamps >= 10;
    const previewCount = hasRolledOver
      ? projectedStamps % 10
      : projectedStamps;
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="grid grid-cols-10 gap-2">
          {stampSlots.map((slot) => {
            const isCurrent = !hasRolledOver && slot < currentStamps;
            const isPending = hasRolledOver
              ? slot < previewCount
              : slot >= currentStamps && slot < previewCount;
            return (
              <div
                key={slot}
                className={`flex aspect-square min-w-0 items-center justify-center rounded-lg border-2 text-xl transition-all duration-300 ${
                  isCurrent
                    ? "border-brand-500 bg-gradient-to-br from-brand-400 to-brand-500 text-white shadow-md"
                    : isPending
                      ? "border-brand-400 bg-gradient-to-br from-brand-100 to-brand-200 text-white"
                      : "border-dashed border-gray-200 bg-gray-50 text-gray-300"
                }`}
              >
                {isCurrent || isPending ? "🍩" : ""}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 카드 스택 (진행 중인 카드 + 완성된 카드들이 겹쳐진 형태) */}
      {(hasCurrentCard || completedCards > 0) && (
        <div className="relative">
          {/* 상태 표시 */}
          <div className="text-center mb-4 flex items-center justify-center gap-3">
            {currentStamps > 0 && (
              <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-brand-100 text-brand-700">
                진행 중: {currentStamps}/10
              </span>
            )}
            {completedCards > 0 && (
              <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-brand-200 text-brand-800">
                완성: {completedCards}장
              </span>
            )}
          </div>

          {/* 카드들이 쌓인 영역 */}
          <div
            className="relative flex items-center justify-center"
            style={{ minHeight: '280px' }}
          >
            {/* 완성된 카드들 (개수만큼 쌓임) */}
            {completedCards > 0 &&
              [...Array(completedCards)].map((_, index) => (
                <div
                  key={`completed-${index}`}
                  className="absolute w-80 bg-white rounded-xl border-2 border-brand-200 shadow-lg p-6"
                  style={{
                    transform: `translate(${8 * (index + 1)}px, ${
                      -8 * (index + 1)
                    }px)`,
                    zIndex: 5 - index,
                  }}
                >
                  <div className="grid grid-cols-5 gap-3">
                    {stampSlots.map((slot) => (
                      <div key={slot} className="aspect-square" />
                    ))}
                  </div>
                </div>
              ))}

            {/* 진행 중인 카드 (맨 앞) - 항상 표시 */}
            <div
              className="relative w-80 bg-white rounded-xl border-2 border-brand-200 p-6 shadow-xl"
              style={{ zIndex: 10 }}
            >
              <div className="grid grid-cols-5 gap-3">
                {stampSlots.map((slot) => (
                  <div
                    key={slot}
                    className={`
                      aspect-square rounded-lg border-2 flex items-center justify-center text-2xl
                      transition-all duration-300
                      ${
                        slot < currentStamps
                          ? 'bg-gradient-to-br from-brand-400 to-brand-500 border-brand-500 shadow-md'
                          : 'bg-gray-50 border-gray-200 border-dashed'
                      }
                    `}
                  >
                    {slot < currentStamps && (
                      <span className="text-white">🍩</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 스탬프가 하나도 없을 때 */}
      {!hasCurrentCard && completedCards === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-300 text-6xl mb-4">📋</div>
          <p className="text-gray-500">아직 스탬프가 없습니다.</p>
          <p className="text-sm text-gray-400 mt-2">
            첫 스탬프를 적립해보세요!
          </p>
        </div>
      )}

      {/* 총 스탬프 개수 표시 */}
      <div className="text-center pt-4 border-t border-brand-200">
        <p className="text-sm text-gray-600">
          총 스탬프:{' '}
          <span className="font-bold text-brand-600 text-lg">{count}</span>개
        </p>
      </div>
    </div>
  );
};

export default StampCards;
