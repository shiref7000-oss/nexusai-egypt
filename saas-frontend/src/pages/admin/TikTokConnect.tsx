import { useEffect, useState, useCallback, useRef } from 'react';
import { tikTokConnectApi, type TikTokSessionStatus, type TikTokAuditEvent } from '@/lib/adminApi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { RefreshCw, ArrowLeft, ArrowRight, RotateCcw, Trash2, LogIn } from 'lucide-react';

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
  const [loginChecked, setLoginChecked] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  // ── Batched typing: buffer keystrokes, flush every 300ms ──

  const typeBuffer = useRef<string>('');
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBuffer = useCallback(async () => {
    const text = typeBuffer.current;
    typeBuffer.current = '';
    if (!text) return;
    try {
      await tikTokConnectApi.fill(text);
    } catch { /* */ }
  }, []);

  const appendToBuffer = useCallback((char: string) => {
    typeBuffer.current += char;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushBuffer, 300);
  }, [flushBuffer]);

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
        if (loginPollRef.current) clearInterval(loginPollRef.current);
      }
    } catch { /* silent */ }
  }, [loadStatus]);

  useEffect(() => {
    loadStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (loginPollRef.current) clearInterval(loginPollRef.current);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushBuffer();
    };
  }, [loadStatus]);

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
        toast.success('Browser launched. Click inside the viewer and type directly.');
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

  // ── Direct mouse click on screenshot ──

  const handleViewerClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!status?.browserActive) return;
    // Flush any pending text before clicking (user is changing fields)
    flushBuffer();
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    try { await tikTokConnectApi.click(x, y); } catch { /* */ }
    // Focus the viewer for keyboard capture
    viewerRef.current?.focus();
    setKeyboardFocused(true);
  };

  // ── Scroll support ──

  const handleViewerWheel = async (e: React.WheelEvent<HTMLDivElement>) => {
    if (!status?.browserActive) return;
    e.preventDefault();
    try { await tikTokConnectApi.scroll(e.deltaY); } catch { /* */ }
  };

  // ── Direct keyboard capture (batched for low latency) ──

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!status?.browserActive) return;
    e.stopPropagation();

    // Special keys — send immediately as single key press
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Backspace' || e.key === 'Escape') {
      e.preventDefault();
      // Flush any pending text before sending the special key
      flushBuffer();
      try { await tikTokConnectApi.key(e.key); } catch { /* */ }
      return;
    }
    if (e.key.startsWith('Arrow')) {
      flushBuffer();
      try { await tikTokConnectApi.key(e.key); } catch { /* */ }
      return;
    }

    // Ctrl+V paste — send full clipboard text instantly
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      flushBuffer();
      try {
        const text = await navigator.clipboard.readText();
        if (text) await tikTokConnectApi.fill(text);
      } catch { /* */ }
      return;
    }

    // Ctrl+A — send as key combo
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      flushBuffer();
      try { await tikTokConnectApi.key('Control+a'); } catch { /* */ }
      return;
    }

    // Printable characters — buffer them, send in batches
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      appendToBuffer(e.key);
    }
  };

  // ── Toolbar actions ──

  const handleRefresh = async () => {
    try { await tikTokConnectApi.refresh(); toast.success('Page refreshed'); } catch { toast.error('Refresh failed'); }
  };
  const handleBack = async () => {
    try { await tikTokConnectApi.back(); } catch { toast.error('Back failed'); }
  };
  const handleForward = async () => {
    try { await tikTokConnectApi.forward(); } catch { toast.error('Forward failed'); }
  };
  const handleNavigateLogin = async () => {
    try { await tikTokConnectApi.navigate('https://www.tiktok.com/login'); toast.success('Navigated to login'); } catch { toast.error('Navigate failed'); }
  };
  const handleClearCookies = async () => {
    try {
      await tikTokConnectApi.clearCookies();
      setLoginChecked(false);
      toast.success('Cookies cleared, returned to login page');
    } catch { toast.error('Clear cookies failed'); }
  };
  const handleRestart = async () => {
    setConnecting(true);
    try {
      const res = await tikTokConnectApi.restart();
      if (res.success) {
        setScreenshot(res.data.screenshot);
        setLoginChecked(false);
        await loadStatus();
        toast.success('Browser session restarted');
      }
    } catch { toast.error('Restart failed'); } finally { setConnecting(false); }
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
                  <Button size="sm" variant="outline" onClick={handleRestart} disabled={connecting}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restart
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
                <div className="mt-1"><StatusBadge status={status.status} /></div>
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
                  <span className={`inline-block w-2 h-2 rounded-full ${status.browserActive ? 'bg-emerald-500' : 'bg-slate-500'}`} />{' '}
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

      {/* Remote Browser with Toolbar */}
      {isConnected && !loginChecked && (
        <Card>
          <CardHeader
            title="Remote Browser"
            description={
              keyboardFocused
                ? 'Keyboard active — type directly. Click outside to release.'
                : 'Click inside the browser to activate keyboard input.'
            }
            action={
              <div className="flex gap-1 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleBack} title="Back">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={handleForward} title="Forward">
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={handleRefresh} title="Refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={handleNavigateLogin} title="Go to Login">
                  <LogIn className="h-3.5 w-3.5 mr-1" />Login
                </Button>
                <Button size="sm" variant="outline" onClick={handleClearCookies} title="Clear Cookies">
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Clear
                </Button>
                <Button size="sm" variant="outline" onClick={handleRestart} title="Restart Session">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />Restart
                </Button>
              </div>
            }
          />
          <CardBody>
            <div
              ref={viewerRef}
              tabIndex={0}
              className="relative border-2 border-zinc-600 rounded-lg overflow-hidden bg-black cursor-crosshair outline-none"
              style={{ aspectRatio: '1280/800', maxHeight: '55vh' }}
              onClick={handleViewerClick}
              onWheel={handleViewerWheel}
              onKeyDown={handleKeyDown}
              onFocus={() => setKeyboardFocused(true)}
              onBlur={() => setKeyboardFocused(false)}
            >
              {screenshot ? (
                <img
                  src={screenshot}
                  alt="TikTok browser"
                  className="w-full h-full object-contain select-none"
                  draggable={false}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                  Loading browser view...
                </div>
              )}
              {keyboardFocused && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-emerald-500/90 text-white text-xs px-2 py-0.5 rounded-full z-10">
                  Keyboard Active
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-2 text-center">
              Click inside the browser to activate direct keyboard input. Your keystrokes are sent to TikTok.
              Supports: typing, Enter, Tab, Backspace, arrows, Ctrl+V paste, Ctrl+A select all.
            </p>
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
