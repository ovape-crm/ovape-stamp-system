interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

const Loading = ({ size = 'md', text }: LoadingProps) => {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };

  const containerPadding = {
    sm: 'py-4',
    md: 'py-10',
    lg: 'py-20',
  };

  return (
    <div
      className={`flex flex-col items-center justify-center ${containerPadding[size]}`}
    >
      <div className="relative flex items-center justify-center mb-3">
        <div
          className={`${sizeClasses[size]} rounded-full bg-brand-500 relative`}
          style={{
            animation: 'flash 0.5s ease-out infinite alternate',
          }}
        />
      </div>
      {text && <p className="text-brand-400 text-sm">{text}</p>}
    </div>
  );
};

export default Loading;
