export interface PwaPlatformInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
}

export type InstallUiMode =
  | 'hidden'
  | 'native-prompt'
  | 'ios-guide'
  | 'android-guide'
  | 'desktop-guide';

export type InstallGuideTab = 'android' | 'ios' | 'desktop';

export type LaunchTarget = 'preview' | 'top';

export function detectPwaPlatform(userAgent: string, maxTouchPoints = 0): PwaPlatformInfo {
  const ua = userAgent || '';
  const isClassicIOS = /iPad|iPhone|iPod/i.test(ua);
  const isIPadOSDesktop = /Macintosh/i.test(ua) && maxTouchPoints > 1;
  const isIOS = isClassicIOS || isIPadOSDesktop;
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobile|Tablet/i.test(ua);
  return { isIOS, isAndroid, isMobile };
}

export function isStandaloneDisplayMode(input: {
  matchMediaStandalone: boolean;
  navigatorStandalone?: boolean;
  referrer?: string;
}): boolean {
  if (input.matchMediaStandalone) return true;
  if (input.navigatorStandalone === true) return true;
  if (typeof input.referrer === 'string' && input.referrer.startsWith('android-app://')) {
    return true;
  }
  return false;
}

export function resolveInstallUiMode(input: {
  isInstalled: boolean;
  isInstallable: boolean;
  isIOS: boolean;
  isAndroid: boolean;
}): InstallUiMode {
  if (input.isInstalled) return 'hidden';
  if (input.isInstallable) return 'native-prompt';
  if (input.isIOS) return 'ios-guide';
  if (input.isAndroid) return 'android-guide';
  return 'desktop-guide';
}

export function defaultInstallGuideTab(input: {
  isIOS: boolean;
  isAndroid: boolean;
}): InstallGuideTab {
  if (input.isIOS) return 'ios';
  if (input.isAndroid) return 'android';
  return 'android';
}

export function resolveLaunchTarget(input: { search: string; hash: string }): LaunchTarget {
  const hash = (input.hash || '').trim().toLowerCase();
  try {
    const params = new URLSearchParams(input.search || '');
    if (params.get('view') === 'app' || hash === '#preview') {
      return 'preview';
    }
  } catch {
    if (hash === '#preview') {
      return 'preview';
    }
  }
  return 'top';
}
