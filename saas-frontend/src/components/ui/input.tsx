import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-white/[0.08] bg-elevated px-3.5 text-sm text-foreground',
        'placeholder:text-zinc-500 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15 focus-visible:border-white/[0.12]',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex w-full rounded-lg border border-white/[0.08] bg-elevated px-3.5 py-2.5 text-sm text-foreground',
      'placeholder:text-zinc-500 transition-colors resize-y min-h-[80px]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15 focus-visible:border-white/[0.12]',
      className
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      className={cn(
        'flex h-10 w-full rounded-lg border border-white/[0.08] bg-elevated px-3 text-sm text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15',
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
