import { useCallback, useEffect, useState } from 'react';
import {
  detectPwaPlatform,
  isStandaloneDisplayMode,
  resolveInstallUiMode,
  type InstallUiMode,
} from '../utils/pwa';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

interface SharedPwaState {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
}

const listeners = new Set<() => void>();
let initialized = false;
let sharedState: SharedPwaState = {
  deferredPrompt: null,
  isInstalled: false,
};

function readStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as NavigatorWithStandalone;
  return isStandaloneDisplayMode({
    matchMediaStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    navigatorStandalone: nav.standalone,
    referrer: document.referrer,
  });
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function ensureGlobalListeners(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  if (readStandalone()) {
    sharedState = { deferredPrompt: null, isInstalled: true };
  }

  const mediaQuery = window.matchMedia?.('(display-mode: standalone)');

  const handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault();
    sharedState = {
      ...sharedState,
      deferredPrompt: event as BeforeInstallPromptEvent,
    };
    notifyListeners();
  };

  const handleAppInstalled = () => {
    sharedState = {
      deferredPrompt: null,
      isInstalled: true,
    };
    notifyListeners();
  };

  const handleDisplayModeChange = () => {
    if (readStandalone()) {
      sharedState = {
        deferredPrompt: null,
        isInstalled: true,
      };
      notifyListeners();
    }
  };

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
  mediaQuery?.addEventListener?.('change', handleDisplayModeChange);
}

export function usePWAInstall(): {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  uiMode: InstallUiMode;
  install: () => Promise<boolean>;
} {
  ensureGlobalListeners();

  const [state, setState] = useState<SharedPwaState>(() => ({
    deferredPrompt: sharedState.deferredPrompt,
    isInstalled: sharedState.isInstalled || readStandalone(),
  }));

  const platform =
    typeof window !== 'undefined'
      ? detectPwaPlatform(window.navigator.userAgent, window.navigator.maxTouchPoints ?? 0)
      : { isIOS: false, isAndroid: false, isMobile: false };

  useEffect(() => {
    ensureGlobalListeners();
    const sync = () => {
      setState({
        deferredPrompt: sharedState.deferredPrompt,
        isInstalled: sharedState.isInstalled || readStandalone(),
      });
    };
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const promptEvent = sharedState.deferredPrompt;
    if (!promptEvent) return false;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        sharedState = {
          deferredPrompt: null,
          isInstalled: true,
        };
        notifyListeners();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const isInstallable = state.deferredPrompt !== null && !state.isInstalled;
  const uiMode = resolveInstallUiMode({
    isInstalled: state.isInstalled,
    isInstallable,
    isIOS: platform.isIOS,
    isAndroid: platform.isAndroid,
  });

  return {
    isInstallable,
    isInstalled: state.isInstalled,
    isIOS: platform.isIOS,
    isAndroid: platform.isAndroid,
    isMobile: platform.isMobile,
    uiMode,
    install,
  };
}
