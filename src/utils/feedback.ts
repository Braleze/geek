export interface FeedbackInput {
  name: string;
  email: string;
  message: string;
}

export interface FeedbackErrors {
  name?: string;
  email?: string;
  message?: string;
}

export interface FeedbackEntry {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

export interface FeedbackValidationResult {
  valid: boolean;
  errors: FeedbackErrors;
  normalized: FeedbackInput;
}

const STORAGE_KEY = 'geek_feedback_entries_v1';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateFeedbackInput(input: FeedbackInput): FeedbackValidationResult {
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  const errors: FeedbackErrors = {};

  if (name.length < 2) {
    errors.name = 'Укажите имя (минимум 2 символа).';
  }

  if (!email) {
    errors.email = 'Укажите email для обратной связи.';
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = 'Введите корректный email (например, name@domain.ru).';
  }

  if (message.length < 5) {
    errors.message = 'Опишите ваш вопрос (минимум 5 символов).';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: { name, email, message },
  };
}

export function createFeedbackEntry(
  input: FeedbackInput,
  now: Date = new Date(),
  randomSuffix: number = Math.floor(1000 + Math.random() * 9000),
): FeedbackEntry {
  return {
    id: `GK-${randomSuffix}`,
    name: input.name.trim(),
    email: input.email.trim(),
    message: input.message.trim(),
    createdAt: now.toISOString(),
  };
}

export function loadFeedbackEntries(): FeedbackEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFeedbackEntry(entry: FeedbackEntry): FeedbackEntry[] {
  const existing = loadFeedbackEntries();
  const next = [entry, ...existing].slice(0, 10);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }
  return next;
}
