import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className="fixed bottom-4 left-4 right-4 sm:right-auto z-50 max-w-sm rounded-xl bg-[#1a0d24]/95 border border-[#fcee0a]/70 text-[#fcee0a] shadow-neon-yellow backdrop-blur-md px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-medium"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <WifiOff className="w-4 h-4 shrink-0 text-[#fcee0a]" />
      <span>Нет подключения к сети — голосовая связь и чат временно недоступны</span>
    </div>
  );
}
