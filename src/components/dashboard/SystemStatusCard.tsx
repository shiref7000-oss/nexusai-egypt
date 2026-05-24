import React, { useEffect, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { apiClient } from '@/lib/api-client';

interface SystemStatus {
  apiStatus: 'online' | 'offline';
  databaseStatus: 'online' | 'offline';
  lastSuccessfulBuild: string | null;
}

export function SystemStatusCard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSystemStatus = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get<SystemStatus>('/api/system-status');
        setStatus(response.data);
      } catch (err) {
        console.error('Failed to fetch system status:', err);
        setError('Failed to load system status.');
      } finally {
        setLoading(false);
      }
    };

    fetchSystemStatus();
    const interval = setInterval(fetchSystemStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loading status...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>System Status</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between">
          <span>API Status:</span>
          <Badge variant={status?.apiStatus === 'online' ? 'default' : 'destructive'}>
            {status?.apiStatus || 'unknown'}
          </Badge>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span>Database Status:</span>
          <Badge variant={status?.databaseStatus === 'online' ? 'default' : 'destructive'}>
            {status?.databaseStatus || 'unknown'}
          </Badge>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span>Last Build:</span>
          <span className="text-sm text-muted-foreground">
            {status?.lastSuccessfulBuild
              ? new Date(status.lastSuccessfulBuild).toLocaleString()
              : 'N/A'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
