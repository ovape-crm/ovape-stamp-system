interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'gray';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

const Button = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  children,
  onClick,
  disabled = false,
  className = '',
}: ButtonProps) => {
  // 공통 기본 스타일
  const baseClasses = [
    'rounded-lg',
    'font-medium',
    'transition-colors',
    'shadow-sm',
    'focus-visible:outline-none',
    'focus-visible:ring-2',
    'focus-visible:ring-offset-2',
    'disabled:opacity-50',
    'disabled:cursor-not-allowed',
    'disabled:pointer-events-none',
    'cursor-pointer',
  ];

  // variant별 스타일
  const variantClasses = {
    primary: [
      'bg-gradient-to-r',
      'from-brand-500',
      'to-brand-600',
      'text-white',
      'hover:from-brand-600',
      'hover:to-brand-700',
      'focus-visible:ring-brand-500',
      'disabled:from-brand-300',
      'disabled:to-brand-400',
    ],
    secondary: [
      'bg-white/70',
      'border',
      'border-brand-200',
      'text-brand-700',
      'hover:bg-brand-50',
      'hover:border-brand-300',
      'focus-visible:ring-brand-500',
      'disabled:bg-gray-100',
      'disabled:border-gray-200',
    ],
    tertiary: [
      'text-brand-700',
      'bg-brand-50',
      'border',
      'border-brand-200',
      'hover:bg-brand-100',
      'hover:border-brand-300',
      'focus-visible:ring-brand-500',
      'disabled:bg-gray-50',
      'disabled:border-gray-200',
    ],
    gray: [
      'text-gray-700',
      'bg-white',
      'border',
      'border-gray-300',
      'hover:bg-gray-50',
      'focus-visible:ring-gray-500',
      'disabled:bg-gray-100',
      'disabled:border-gray-200',
    ],
  };

  // size별 스타일
  const sizeClasses = {
    xs: ['px-2', 'py-1', 'text-xs'],
    sm: ['px-4', 'py-2', 'text-sm'],
    md: ['px-6', 'py-2', 'text-base'],
    lg: ['px-8', 'py-3', 'text-lg'],
  };

  const allClasses = [
    ...baseClasses,
    ...variantClasses[variant],
    ...sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={allClasses}
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;
