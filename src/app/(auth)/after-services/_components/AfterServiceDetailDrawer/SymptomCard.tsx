'use client';

interface SymptomCardProps {
  symptom: string;
}

const SymptomCard = ({ symptom }: SymptomCardProps) => {
  return (
    <div className="mb-6 bg-gradient-to-br from-rose-50 to-orange-50/50 rounded-xl p-5 border-l-4 border-rose-400">
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-5 h-5 text-rose-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h4 className="text-sm font-bold text-rose-700">증상</h4>
      </div>
      <p className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed pl-7">
        {symptom}
      </p>
    </div>
  );
};

export default SymptomCard;

