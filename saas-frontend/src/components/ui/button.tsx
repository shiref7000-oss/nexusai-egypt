import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
  {
    variants: {
      variant: {
        default:
          'bg-foreground text-surface hover:bg-zinc-200 shadow-soft active:scale-[0.98]',
        secondary:
          'bg-elevated text-foreground border border-white/[0.08] hover:bg-zinc-800 hover:border-white/[0.12]',
        ghost: 'text-zinc-400 hover:text-foreground hover:bg-white/[0.04]',
        outline:
          'border border-white/[0.1] bg-transparent text-foreground hover:bg-white/[0.04]',
        destructive: 'bg-red-500/90 text-white hover:bg-red-500',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-xs rounded-md',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';
