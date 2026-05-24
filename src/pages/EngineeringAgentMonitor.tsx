import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SystemStatus {
  apiStatus: 'healthy' | 'unhealthy' | 'loading';
  dbStatus: 'healthy' | 'unhealthy' | 'loading';
  lastBuildTimestamp: string | null;
}

const SystemStatusCard: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus>({
    apiStatus: 'loading',
    dbStatus: 'loading',
    lastBuildTimestamp: null,
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/system-status'); // Assuming a new API endpoint
        if (response.ok) {
          const data = await response.json();
          setStatus({
            apiStatus: data.apiStatus ? 'healthy' : 'unhealthy',
            dbStatus: data.dbStatus ? 'healthy' : 'unhealthy',
            lastBuildTimestamp: data.lastBuildTimestamp || null,
          });
        } else {
          setStatus({
            apiStatus: 'unhealthy',
            dbStatus: 'unhealthy',
            lastBuildTimestamp: null,
          });
        }
      } catch (error) {
        console.error('Failed to fetch system status:', error);
        setStatus({
          apiStatus: 'unhealthy',
          dbStatus: 'unhealthy',
          lastBuildTimestamp: null,
        });
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: 'healthy' | 'unhealthy' | 'loading') => {
    if (status === 'loading') {
      return <Badge variant="outline" className="bg-blue-100 text-blue-800"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</Badge>;
    }
    return status === 'healthy' ? (
      <Badge variant="outline" className="bg-green-100 text-green-800">Healthy</Badge>
    ) : (
      <Badge variant="destructive">Unhealthy</Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span>API Status:</span>
          {getStatusBadge(status.apiStatus)}
        </div>
        <div className="flex items-center justify-between">
          <span>Database Status:</span>
          {getStatusBadge(status.dbStatus)}
        </div>
        <div className="flex items-center justify-between">
          <span>Last Build:</span>
          {status.lastBuildTimestamp ? (
            <Badge variant="outline">
              {formatDistanceToNow(new Date(status.lastBuildTimestamp), { addSuffix: true })}
            </Badge>
          ) : (
            <Badge variant="secondary">N/A</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemStatusCard;
