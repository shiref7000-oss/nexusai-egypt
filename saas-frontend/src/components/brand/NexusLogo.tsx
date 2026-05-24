import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function NexusMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('h-8 w-8', className)}
      aria-hidden
    >
      <rect x="1" y="1" width="30" height="30" rx="9" className="stroke-white/12" strokeWidth="1" />
      <path
        d="M9 22V10l7 7 7-7v12"
        className="stroke-zinc-200"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="11" r="1.5" className="fill-zinc-400" />
    </svg>
  );
}

export function NexusLogo({
  className,
  href = '/',
  showWordmark = true,
}: {
  className?: string;
  href?: string;
  showWordmark?: boolean;
}) {
  return (
    <Link
      to={href}
      className={cn('inline-flex items-center gap-2.5 group', className)}
      aria-label="NexusAI home"
    >
      <NexusMark className="transition-transform duration-300 group-hover:scale-[1.02]" />
      {showWordmark && (
        <span className="font-display text-[17px] font-semibold tracking-tight text-foreground">
          Nexus<span className="text-zinc-500 font-medium">AI</span>
        </span>
      )}
    </Link>
  );
}
