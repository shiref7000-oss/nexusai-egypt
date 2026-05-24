import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AgentSmokeTestCardProps {
  taskId: string;
}

export const AgentSmokeTestCard: React.FC<AgentSmokeTestCardProps> = ({ taskId }) => {
  const [timestamp, setTimestamp] = useState<string>('');

  useEffect(() => {
    const updateTimestamp = () => {
      setTimestamp(new Date().toLocaleString());
    };
    updateTimestamp();
    const intervalId = setInterval(updateTimestamp, 1000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Smoke Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p><strong>Status:</strong> OK</p>
        <p><strong>Task ID:</strong> {taskId}</p>
        <p><strong>Timestamp:</strong> {timestamp}</p>
      </CardContent>
    </Card>
  );
};
