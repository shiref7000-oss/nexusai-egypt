import type { ReactNode } from 'react';

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-white mb-3">{title}</h2>
      <div className="prose-legal text-sm text-zinc-400 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}
