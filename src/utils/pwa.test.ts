import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultInstallGuideTab,
  detectPwaPlatform,
  isStandaloneDisplayMode,
  resolveInstallUiMode,
  resolveLaunchTarget,
} from './pwa.ts';

test('detectPwaPlatform identifies Android, iOS, iPadOS desktop UA, and desktop browsers', () => {
  const android = detectPwaPlatform(
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
    5,
  );
  assert.deepEqual(android, { isIOS: false, isAndroid: true, isMobile: true });

  const iphone = detectPwaPlatform(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
    5,
  );
  assert.deepEqual(iphone, { isIOS: true, isAndroid: false, isMobile: true });

  const ipadDesktopUa = detectPwaPlatform(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    5,
  );
  assert.deepEqual(ipadDesktopUa, { isIOS: true, isAndroid: false, isMobile: true });

  const macDesktop = detectPwaPlatform(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    0,
  );
  assert.deepEqual(macDesktop, { isIOS: false, isAndroid: false, isMobile: false });
});

test('isStandaloneDisplayMode detects display-mode standalone, iOS standalone, and Android TWA referrer', () => {
  assert.equal(isStandaloneDisplayMode({ matchMediaStandalone: true }), true);
  assert.equal(isStandaloneDisplayMode({ matchMediaStandalone: false, navigatorStandalone: true }), true);
  assert.equal(
    isStandaloneDisplayMode({
      matchMediaStandalone: false,
      navigatorStandalone: false,
      referrer: 'android-app://ru.geek.app/',
    }),
    true,
  );
  assert.equal(
    isStandaloneDisplayMode({
      matchMediaStandalone: false,
      navigatorStandalone: false,
      referrer: 'https://example.com/',
    }),
    false,
  );
});

test('resolveInstallUiMode prioritizes installed hidden state, then native prompt, then platform guides', () => {
  assert.equal(
    resolveInstallUiMode({ isInstalled: true, isInstallable: true, isIOS: false, isAndroid: true }),
    'hidden',
  );
  assert.equal(
    resolveInstallUiMode({ isInstalled: false, isInstallable: true, isIOS: false, isAndroid: true }),
    'native-prompt',
  );
  assert.equal(
    resolveInstallUiMode({ isInstalled: false, isInstallable: false, isIOS: true, isAndroid: false }),
    'ios-guide',
  );
  assert.equal(
    resolveInstallUiMode({ isInstalled: false, isInstallable: false, isIOS: false, isAndroid: true }),
    'android-guide',
  );
  assert.equal(
    resolveInstallUiMode({ isInstalled: false, isInstallable: false, isIOS: false, isAndroid: false }),
    'desktop-guide',
  );
});

test('defaultInstallGuideTab defaults to ios on iOS and android elsewhere', () => {
  assert.equal(defaultInstallGuideTab({ isIOS: true, isAndroid: false }), 'ios');
  assert.equal(defaultInstallGuideTab({ isIOS: false, isAndroid: true }), 'android');
  assert.equal(defaultInstallGuideTab({ isIOS: false, isAndroid: false }), 'android');
});

test('resolveLaunchTarget routes PWA shortcuts and query params cleanly', () => {
  assert.equal(resolveLaunchTarget({ search: '', hash: '#prebeta' }), 'prebeta');
  assert.equal(resolveLaunchTarget({ search: '?prebeta=GEEK-1234', hash: '' }), 'prebeta');
  assert.equal(resolveLaunchTarget({ search: '?view=app', hash: '#preview' }), 'preview');
  assert.equal(resolveLaunchTarget({ search: '?view=app', hash: '' }), 'preview');
  assert.equal(resolveLaunchTarget({ search: '', hash: '#preview' }), 'preview');
  assert.equal(resolveLaunchTarget({ search: '', hash: '' }), 'top');
});
