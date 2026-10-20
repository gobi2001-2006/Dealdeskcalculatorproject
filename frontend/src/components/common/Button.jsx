import { Link } from 'react-router-dom'

export function Button({
  children,
  to,
  type = 'button',
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  disabled = false,
  onClick,
  className = '',
  'aria-label': ariaLabel,
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none'

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-3.5 py-2 gap-2',
    lg: 'text-base px-4 py-2.5 gap-2.5',
  }

  const variantStyles = {
    primary:
      'bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs border border-emerald-800 focus-visible:ring-emerald-600',
    secondary:
      'bg-slate-900 hover:bg-slate-800 text-white shadow-xs border border-slate-900 focus-visible:ring-slate-700',
    outline:
      'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs focus-visible:ring-slate-400',
    subtle:
      'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 focus-visible:ring-slate-400',
    ghost:
      'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 focus-visible:ring-slate-400',
  }

  const classes = `${baseStyles} ${sizeStyles[size] || sizeStyles.md} ${
    variantStyles[variant] || variantStyles.primary
  } ${className}`

  const iconElement = Icon ? (
    <Icon
      className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'}
      aria-hidden="true"
    />
  ) : null

  // Prevent duplicate '+' if an icon is already provided and label starts with '+'
  const cleanChildren =
    Icon && typeof children === 'string' && children.trimStart().startsWith('+')
      ? children.replace(/^\s*\+\s*/, '')
      : children

  const content = (
    <>
      {Icon && iconPosition === 'left' && iconElement}
      <span>{cleanChildren}</span>
      {Icon && iconPosition === 'right' && iconElement}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={classes} aria-label={ariaLabel} {...props}>
        {content}
      </Link>
    )
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      {...props}
    >
      {content}
    </button>
  )
}

export default Button
