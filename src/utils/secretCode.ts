export const CODE_LENGTH = 4;

export type KeypadStatus = 'locked' | 'error' | 'unlocked';
export type SecretReward = 'rickroll' | 'cyberpunk';

export interface KeypadState {
  digits: string;
  status: KeypadStatus;
  unlockedReward: SecretReward | null;
  attempts: number;
  errorMessage: string | null;
}

const VAULT_DIGESTS: Record<string, SecretReward> = {
  ce926369550a595a: 'rickroll',
  e68654a845d9b010: 'cyberpunk',
};

export function hashAccessCode(input: string): string {
  const salted = `gk::vault::${input.trim()}::relic9`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < salted.length; i++) {
    const c = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i * 17), 0x85ebca6b);
  }
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h2 ^= h2 >>> 15;
  h2 = Math.imul(h2, 0xc2b2ae35);
  h2 ^= h2 >>> 16;
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function createInitialKeypadState(): KeypadState {
  return {
    digits: '',
    status: 'locked',
    unlockedReward: null,
    attempts: 0,
    errorMessage: null,
  };
}

export function resolveSecretCode(code: string): SecretReward | null {
  const normalized = code.trim();
  if (normalized.length !== CODE_LENGTH || !/^\d+$/.test(normalized)) {
    return null;
  }
  const digest = hashAccessCode(normalized);
  return VAULT_DIGESTS[digest] ?? null;
}

export function verifySecretCode(code: string): boolean {
  return resolveSecretCode(code) !== null;
}

export function appendDigit(state: KeypadState, digit: string): KeypadState {
  if (state.status === 'unlocked') {
    return state;
  }
  if (!/^\d$/.test(digit)) {
    return state;
  }

  const baseDigits = state.status === 'error' ? '' : state.digits;
  if (baseDigits.length >= CODE_LENGTH) {
    return state;
  }

  const nextDigits = baseDigits + digit;

  if (nextDigits.length === CODE_LENGTH) {
    return submitCode({
      ...state,
      digits: nextDigits,
      status: 'locked',
      errorMessage: null,
    });
  }

  return {
    ...state,
    digits: nextDigits,
    status: 'locked',
    errorMessage: null,
  };
}

export function removeDigit(state: KeypadState): KeypadState {
  if (state.status === 'unlocked') {
    return state;
  }
  if (state.status === 'error') {
    return {
      ...state,
      digits: '',
      status: 'locked',
      errorMessage: null,
    };
  }
  return {
    ...state,
    digits: state.digits.slice(0, -1),
    status: 'locked',
    errorMessage: null,
  };
}

export function clearDigits(state: KeypadState): KeypadState {
  if (state.status === 'unlocked') {
    return state;
  }
  return {
    ...state,
    digits: '',
    status: 'locked',
    unlockedReward: null,
    errorMessage: null,
  };
}

export function submitCode(state: KeypadState): KeypadState {
  if (state.status === 'unlocked') {
    return state;
  }

  if (state.digits.length < CODE_LENGTH) {
    return {
      ...state,
      status: 'error',
      unlockedReward: null,
      attempts: state.attempts + 1,
      errorMessage: `Введите ${CODE_LENGTH} цифры кода доступа`,
    };
  }

  const reward = resolveSecretCode(state.digits);
  if (reward !== null) {
    return {
      ...state,
      status: 'unlocked',
      unlockedReward: reward,
      errorMessage: null,
    };
  }

  return {
    ...state,
    status: 'error',
    unlockedReward: null,
    attempts: state.attempts + 1,
    errorMessage: 'Неверный код доступа. Попробуйте снова.',
  };
}

export function formatCodeSlots(digits: string): string[] {
  return Array.from({ length: CODE_LENGTH }, (_, index) => digits[index] ?? '');
}
