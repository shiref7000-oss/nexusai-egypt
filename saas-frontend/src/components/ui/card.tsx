import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({
  className = '',
  children,
  variant = 'default',
  ...props
}: {
  className?: string;
  children: ReactNode;
  variant?: 'default' | 'ghost' | 'elevated';
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.06] transition-colors',
        variant === 'default' && 'bg-panel shadow-soft',
        variant === 'elevated' && 'bg-elevated shadow-card',
        variant === 'ghost' && 'bg-transparent border-transparent',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardBody({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5 sm:p-6', className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
  className = '',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5', className)}>
      <div>
        <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
        {description && <p className="text-subtle mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}
