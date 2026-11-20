export const LAUNCH_TARGET_ISO = '2026-12-01T12:00:00+03:00';
export const LAUNCH_TARGET_MS = Date.parse(LAUNCH_TARGET_ISO);
export const LAUNCH_REDIRECT_URL = 'https://app.geek-voice.ru';

export interface CountdownSnapshot {
  isLaunched: boolean;
  totalRemainingMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function getCountdownSnapshot(
  nowMs: number,
  targetMs: number = LAUNCH_TARGET_MS,
): CountdownSnapshot {
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const diff = targetMs - safeNow;

  if (diff <= 0) {
    return {
      isLaunched: true,
      totalRemainingMs: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  const days = Math.floor(diff / MS_PER_DAY);
  const hours = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((diff % MS_PER_MINUTE) / MS_PER_SECOND);

  return {
    isLaunched: false,
    totalRemainingMs: diff,
    days,
    hours,
    minutes,
    seconds,
  };
}

export function formatCountdownPart(value: number, minDigits = 2): string {
  const clamped = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return String(clamped).padStart(minDigits, '0');
}

export function pluralizeRu(
  value: number,
  forms: readonly [string, string, string],
): string {
  const abs = Math.abs(Math.floor(Number.isFinite(value) ? value : 0));
  const mod100 = abs % 100;
  const mod10 = abs % 10;

  if (mod100 >= 11 && mod100 <= 19) {
    return forms[2];
  }
  if (mod10 === 1) {
    return forms[0];
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return forms[1];
  }
  return forms[2];
}
