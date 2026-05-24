import { useEffect, useState, useCallback, useRef } from 'react';
import { tikTokConnectApi, type TikTokSessionStatus, type TikTokAuditEvent } from '@/lib/adminApi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardBody } from '@/components/ui/card';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    expired: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    disconnected: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${colors[status] || colors.disconnected}`}>
      {status}
    </span>
  );
}

export default function TikTokConnectPage() {
  const [status, setStatus] = useState<TikTokSessionStatus | null>(null);
  const [screenshot, setScreenshot] = useState<string>('');
  const [auditEvents, setAuditEvents] = useState<TikTokAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loginChecked, setLoginChecked] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, auditRes] = await Promise.all([
        tikTokConnectApi.sessionStatus(),
        tikTokConnectApi.auditLog(),
      ]);
      if (statusRes.success) setStatus(statusRes.data);
      if (auditRes.success) setAuditEvents(auditRes.data.events);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const loadScreenshot = useCallback(async () => {
    try {
      const res = await tikTokConnectApi.screenshot();
      if (res.success && res.data.screenshot) {
        setScreenshot(res.data.screenshot);
      }
    } catch { /* silent */ }
  }, []);

  const checkLogin = useCallback(async () => {
    try {
      const res = await tikTokConnectApi.checkLogin();
      if (res.success && res.data.loggedIn) {
        setLoginChecked(true);
        toast.success(`Logged in as @${res.data.username || 'unknown'}! Session saved.`);
        await loadStatus();
        // Clear login poll
        if (loginPollRef.current) clearInterval(loginPollRef.current);
      }
    } catch { /* silent */ }
  }, [loadStatus]);

  useEffect(() => {
    loadStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (loginPollRef.current) clearInterval(loginPollRef.current);
    };
  }, [loadStatus]);

  // Start screenshot + login polling when connected
  useEffect(() => {
    if (status?.browserActive && !loginChecked) {
      pollRef.current = setInterval(loadScreenshot, 1500);
      loginPollRef.current = setInterval(checkLogin, 3000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (loginPollRef.current) clearInterval(loginPollRef.current);
      };
    }
  }, [status?.browserActive, loginChecked, loadScreenshot, checkLogin]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await tikTokConnectApi.connect();
      if (res.success) {
        setScreenshot(res.data.screenshot);
        setLoginChecked(false);
        await loadStatus();
        toast.success('Browser launched. Log into TikTok in the viewer below.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to launch browser');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await tikTokConnectApi.disconnect();
      setScreenshot('');
      setLoginChecked(false);
      await loadStatus();
      toast.success('Session disconnected');
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const handleScreenshotClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!status?.browserActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const naturalW = 1280;
    const naturalH = 800;
    const scaleX = naturalW / rect.width;
    const scaleY = naturalH / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    try {
      await tikTokConnectApi.click(x, y);
    } catch { /* silent */ }
  };

  const handleType = async () => {
    if (!inputText.trim()) return;
    try {
      await tikTokConnectApi.type(inputText);
      setInputText('');
    } catch {
      toast.error('Failed to send input');
    }
  };

  const handleKey = async (key: string) => {
    try {
      await tikTokConnectApi.key(key);
    } catch { /* silent */ }
  };

  const handleFocusField = async (field: 'email' | 'password' | 'login-button') => {
    try {
      await tikTokConnectApi.focusField(field);
    } catch { /* silent */ }
  };

  const handleReconnect = async () => {
    await handleDisconnect();
    setTimeout(() => handleConnect(), 500);
  };

  if (loading) return <div className="p-6 text-subtle">Loading...</div>;

  const isConnected = status?.connected || status?.browserActive;

  return (
    <div className="p-4 space-y-4">
      {/* Status Panel */}
      <Card>
        <CardHeader
          title="TikTok Account Connection"
          description="Connect your TikTok account using a secure remote browser. Your credentials are never stored."
          action={
            <div className="flex gap-2">
              {isConnected ? (
                <>
                  <Button size="sm" variant="outline" onClick={handleReconnect}>
                    Reconnect
                  </Button>
                  <Button size="sm" variant="default" onClick={handleDisconnect}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={handleConnect} disabled={connecting}>
                  {connecting ? 'Launching...' : 'Connect TikTok'}
                </Button>
              )}
            </div>
          }
        />
        <CardBody>
          {status ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-subtle">Status</span>
                <div className="mt-1">
                  <StatusBadge status={status.status} />
                </div>
              </div>
              <div>
                <span className="text-subtle">Username</span>
                <p className="font-medium">@{status.username || 'N/A'}</p>
              </div>
              <div>
                <span className="text-subtle">Last Login</span>
                <p className="font-medium">
                  {status.lastLoginAt ? new Date(status.lastLoginAt).toLocaleString() : 'Never'}
                </p>
              </div>
              <div>
                <span className="text-subtle">Browser</span>
                <p className="font-medium">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${status.browserActive ? 'bg-emerald-500' : 'bg-slate-500'}`}
                  />{' '}
                  {status.browserActive ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-subtle text-sm">No TikTok account connected.</p>
          )}
          {status?.errorMessage && (
            <p className="text-red-400 text-xs mt-2">Error: {status.errorMessage}</p>
          )}
        </CardBody>
      </Card>

      {/* Remote Browser Viewer */}
      {isConnected && !loginChecked && (
        <Card>
          <CardHeader
            title="Remote Browser — TikTok Login"
            description="Click to interact. Type your credentials below. Log in manually. Your credentials are never stored."
          />
          <CardBody>
            <div className="space-y-3">
              {/* Screenshot display */}
              <div
                className="relative border border-white/10 rounded-lg overflow-hidden bg-black cursor-crosshair"
                style={{ aspectRatio: '1280/800', maxHeight: '60vh' }}
                onClick={handleScreenshotClick}
              >
                {screenshot ? (
                  <img
                    src={screenshot}
                    alt="TikTok browser"
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-subtle">
                    Loading browser view...
                  </div>
                )}
              </div>

              {/* Form field helpers */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => handleFocusField('email')}>
                  Click Email/Username
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleFocusField('password')}>
                  Click Password
                </Button>
                <Button size="sm" variant="default" onClick={() => handleFocusField('login-button')}>
                  Click Login
                </Button>
              </div>

              {/* Input controls */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type here, then press Send..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleType();
                  }}
                  className="flex-1 h-9 rounded-md border border-white/10 bg-panel px-3 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-white/20"
                />
                <Button size="sm" onClick={handleType}>Send</Button>
                <Button size="sm" variant="outline" onClick={() => handleKey('Tab')}>Tab</Button>
                <Button size="sm" variant="outline" onClick={() => handleKey('Enter')}>Enter</Button>
                <Button size="sm" variant="outline" onClick={() => handleKey('Escape')}>Esc</Button>
              </div>
              <p className="text-xs text-subtle">
                Use the buttons above to focus fields, then type below. After logging in, the session is detected automatically within ~3 seconds.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Post-Login Status */}
      {isConnected && loginChecked && (
        <Card>
          <CardHeader title="Connected" description="Session saved. Messages are syncing in the TikTok Inbox." />
          <CardBody>
            <p className="text-sm">
              Visit{' '}
              <a href="/admin/inbox/tiktok" className="text-primary hover:underline">
                TikTok Inbox
              </a>{' '}
              to view and reply to messages.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Audit Log */}
      <Card>
        <CardHeader title="Audit Log" description="Recent TikTok connection events" />
        <CardBody>
          {auditEvents.length === 0 ? (
            <p className="text-subtle text-sm">No events yet.</p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {auditEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-2 text-xs py-1 border-b border-white/[0.04]">
                  <span className="text-subtle w-32 flex-shrink-0">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      event.event_type === 'connect' || event.event_type === 'login_detected'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : event.event_type === 'disconnect' || event.event_type === 'session_expired'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-slate-500/10 text-slate-400'
                    }`}
                  >
                    {event.event_type}
                  </span>
                  <span className="text-subtle truncate">
                    {typeof event.details === 'object'
                      ? JSON.stringify(event.details).slice(0, 80)
                      : String(event.details)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
