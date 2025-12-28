'use client';

interface NoteCardProps {
  note: string;
}

const NoteCard = ({ note }: NoteCardProps) => {
  return (
    <div className="mb-6 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border-l-4 border-gray-400">
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-5 h-5 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        <h4 className="text-sm font-bold text-gray-700">메모</h4>
      </div>
      <p className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed pl-7">
        {note}
      </p>
    </div>
  );
};

export default NoteCard;

