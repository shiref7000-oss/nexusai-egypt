import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

export function SettingsSection({
  id,
  title,
  description,
  children,
  action,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card>
        <CardBody>
          <CardHeader title={title} description={description} action={action} />
          {children}
        </CardBody>
      </Card>
    </section>
  );
}
