import type { ReactNode } from 'react';
import { PageMeta } from './PageMeta';
import { PublicNav } from './PublicNav';
import { PublicFooter } from './PublicFooter';

export function PublicLayout({
  children,
  title,
  description,
  className = '',
}: {
  children: ReactNode;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`min-h-screen bg-surface text-foreground flex flex-col ${className}`}>
      <PageMeta title={title} description={description} />
      <div className="pointer-events-none fixed inset-0 landing-grid opacity-[0.3]" aria-hidden />
      <PublicNav />
      <main className="flex-1 pt-16">{children}</main>
      <PublicFooter />
    </div>
  );
}
