export type LaunchSource = 'pickiti' | 'syswise';

const SOURCE_STORAGE_KEY = 'taskwise_launch_source';
const ORIGIN_STORAGE_KEY = 'taskwise_launcher_origin';

export function safeLauncherOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const production =
      url.protocol === 'https:' &&
      (url.hostname === 'syswise.lk' || url.hostname === 'www.syswise.lk');
    const local =
      url.protocol === 'http:' &&
      url.port === '3100' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    return production || local ? url.origin : null;
  } catch {
    return null;
  }
}

export function captureLauncherOrigin(search = window.location.search): string | null {
  const explicit = safeLauncherOrigin(new URLSearchParams(search).get('launcher_origin'));
  if (explicit) {
    try {
      localStorage.setItem(ORIGIN_STORAGE_KEY, explicit);
    } catch {
      // The current navigation can still return correctly without persistence.
    }
    return explicit;
  }
  return currentLauncherOrigin();
}

export function currentLauncherOrigin(): string | null {
  try {
    return safeLauncherOrigin(localStorage.getItem(ORIGIN_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function captureLaunchSource(search = window.location.search): LaunchSource {
  // Capture both protocol fields together before an app removes its SSO query string.
  captureLauncherOrigin(search);

  const explicit = new URLSearchParams(search).get('source');
  const source: LaunchSource =
    explicit === 'pickiti'
      ? 'pickiti'
      : explicit === 'syswise'
        ? 'syswise'
        : currentLaunchSource();
  if (explicit === 'pickiti' || explicit === 'syswise') {
    try {
      localStorage.setItem(SOURCE_STORAGE_KEY, source);
    } catch {
      // Storage may be unavailable; this page still uses the explicit value.
    }
  }
  return source;
}

export function currentLaunchSource(): LaunchSource {
  try {
    return localStorage.getItem(SOURCE_STORAGE_KEY) === 'pickiti' ? 'pickiti' : 'syswise';
  } catch {
    return 'syswise';
  }
}

export function launcherName(source: LaunchSource = currentLaunchSource()): 'Pickiti' | 'SysWise' {
  return source === 'pickiti' ? 'Pickiti' : 'SysWise';
}

export function launcherHomeUrl(source: LaunchSource = currentLaunchSource()): string {
  const local =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const fallbackOrigin = local ? 'http://localhost:3100' : window.location.origin;
  const origin = currentLauncherOrigin() || fallbackOrigin;
  return `${origin}${source === 'pickiti' ? '/pickiti' : '/apps'}`;
}
