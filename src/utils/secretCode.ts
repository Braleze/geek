export const SECRET_CODE = '2027';
export const CODE_LENGTH = 4;

export type KeypadStatus = 'locked' | 'error' | 'unlocked';

export interface KeypadState {
  digits: string;
  status: KeypadStatus;
  attempts: number;
  errorMessage: string | null;
}

export function createInitialKeypadState(): KeypadState {
  return {
    digits: '',
    status: 'locked',
    attempts: 0,
    errorMessage: null,
  };
}

export function verifySecretCode(code: string): boolean {
  return code.trim() === SECRET_CODE;
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
      attempts: state.attempts + 1,
      errorMessage: `Введите ${CODE_LENGTH} цифры кода доступа`,
    };
  }

  if (verifySecretCode(state.digits)) {
    return {
      ...state,
      status: 'unlocked',
      errorMessage: null,
    };
  }

  return {
    ...state,
    status: 'error',
    attempts: state.attempts + 1,
    errorMessage: 'Неверный код доступа. Попробуйте снова.',
  };
}

export function formatCodeSlots(digits: string): string[] {
  return Array.from({ length: CODE_LENGTH }, (_, index) => digits[index] ?? '');
}
