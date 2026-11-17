export type FeedbackTopic = 'Закрытая бета' | 'Идея / Фича' | 'Сотрудничество' | 'Общий вопрос';

export const FEEDBACK_TOPICS: FeedbackTopic[] = [
  'Закрытая бета',
  'Идея / Фича',
  'Сотрудничество',
  'Общий вопрос',
];

export interface FeedbackInput {
  name: string;
  email: string;
  message: string;
  topic?: FeedbackTopic;
}

export interface FeedbackErrors {
  name?: string;
  email?: string;
  message?: string;
}

export type FeedbackDeliveryStatus = 'sent' | 'fallback';

export interface FeedbackEntry {
  id: string;
  name: string;
  email: string;
  message: string;
  topic: FeedbackTopic;
  createdAt: string;
  deliveryStatus?: FeedbackDeliveryStatus;
}

export interface FeedbackValidationResult {
  valid: boolean;
  errors: FeedbackErrors;
  normalized: Required<FeedbackInput>;
}

export interface FeedbackSubmitOutcome {
  ok: boolean;
  delivery: FeedbackDeliveryStatus;
  errorMessage?: string;
}

export const FEEDBACK_TARGET_EMAIL = 'admin@geek-voice.ru';
export const FEEDBACK_ENDPOINT = './api/feedback.php';

const STORAGE_KEY = 'geek_feedback_entries_v1';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeFeedbackTopic(raw?: string): FeedbackTopic {
  if (raw && (FEEDBACK_TOPICS as string[]).includes(raw)) {
    return raw as FeedbackTopic;
  }
  return 'Общий вопрос';
}

export function validateFeedbackInput(input: FeedbackInput): FeedbackValidationResult {
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  const topic = normalizeFeedbackTopic(input.topic);
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
    normalized: { name, email, message, topic },
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
    topic: normalizeFeedbackTopic(input.topic),
    createdAt: now.toISOString(),
  };
}

export function buildFeedbackMailtoUrl(
  entry: Pick<FeedbackEntry, 'id' | 'name' | 'email' | 'message' | 'topic'>,
): string {
  const topic = normalizeFeedbackTopic(entry.topic);
  const subject = `[Geek · ${topic}] Обращение ${entry.id} от ${entry.name}`;
  const body = [
    `Номер обращения: ${entry.id}`,
    `Тема: ${topic}`,
    `Имя: ${entry.name}`,
    `Email для ответа: ${entry.email}`,
    '',
    'Сообщение:',
    entry.message,
  ].join('\n');

  return `mailto:${FEEDBACK_TARGET_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function submitFeedbackRequest(
  entry: FeedbackEntry,
  honeypot = '',
  fetchFn: typeof fetch = fetch,
): Promise<FeedbackSubmitOutcome> {
  try {
    const response = await fetchFn(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        id: entry.id,
        name: entry.name,
        email: entry.email,
        topic: entry.topic,
        message: entry.message,
        _gotcha: honeypot,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return { ok: true, delivery: 'fallback' };
    }

    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (response.ok && payload?.ok === true) {
      return { ok: true, delivery: 'sent' };
    }

    return {
      ok: false,
      delivery: 'fallback',
      errorMessage: payload?.error || 'Не удалось отправить сообщение на сервер.',
    };
  } catch {
    return {
      ok: false,
      delivery: 'fallback',
      errorMessage: 'Не удалось связаться с почтовым обработчиком сервера.',
    };
  }
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
