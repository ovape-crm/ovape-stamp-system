'use client';

const TagHelpTooltip = () => {
  return (
    <div className="relative group">
      <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center cursor-default select-none">
        ?
      </span>
      <div className="absolute left-0 top-6 z-50 hidden group-hover:block w-60 bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg leading-relaxed">
        <p className="font-semibold mb-1.5">서식 태그 사용법</p>
        <p>
          <span className="text-red-400">&lt;red&gt;</span>텍스트
          <span className="text-red-400">&lt;/red&gt;</span> →{' '}
          <span className="text-red-400">빨간색</span>
        </p>
        <p>
          <span className="text-gray-300">&lt;bold&gt;</span>텍스트
          <span className="text-gray-300">&lt;/bold&gt;</span> →{' '}
          <span className="font-extrabold">굵게</span>
        </p>
        <p>
          <span className="text-gray-300">&lt;line&gt;</span>텍스트
          <span className="text-gray-300">&lt;/line&gt;</span> →{' '}
          <span className="line-through">취소선</span>
        </p>
        <p>
          <span className="text-blue-400">&lt;link url=&quot;URL&quot;&gt;</span>
          텍스트<span className="text-blue-400">&lt;/link&gt;</span> →{' '}
          <span className="text-blue-400 underline">링크</span>
        </p>
      </div>
    </div>
  );
};

export default TagHelpTooltip;
