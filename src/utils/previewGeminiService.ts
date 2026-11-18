import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { PREVIEW_SERVERS, type PreviewMessage, type PreviewServerId } from './platformPreview.ts';
import {
  MAX_UNLOCKED_QUESTION_CHARS,
  MAX_UNLOCKED_REPLY_CHARS,
  buildPeerPreviewMessage,
  buildPreviewGeminiPromptContents,
  buildPreviewGeminiSystemInstruction,
  buildUnlockActivatedMessage,
  buildUnlockedGeminiSystemInstruction,
  buildUnlockedPromptContents,
  buildUnlockedReplyMessage,
  buildVoiceUnlockActivatedMessage,
  getConfiguredPreviewUnlockCode,
  getConfiguredPreviewVoiceCode,
  isPromptInjectionOrOffTopic,
  isValidPreviewUnlockAttempt,
  isValidPreviewVoiceUnlockAttempt,
  resolveSafeOffTopicReply,
  sanitizeMultilineUserPrompt,
  sanitizePreviewHistory,
  sanitizeUserQuestion,
  signPreviewUnlockToken,
  truncateUnlockedReply,
  validateAndNormalizeGeminiReply,
  verifyPreviewUnlockToken,
} from './previewChatGuard.ts';

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | null = null;

export function isPreviewGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function getVoiceUnlockHmacSecret(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
  const voiceCode = getConfiguredPreviewVoiceCode(process.env.PREVIEW_VOICE_UNLOCK_CODE);
  const sessionSecret =
    process.env.PREVIEW_VOICE_HMAC_SECRET?.trim() ?? 'geek-live-voice-session-key';
  return `${apiKey}::${voiceCode}::${sessionSecret}`;
}

export function tryVerifyVoiceUnlockCode(
  rawInput: string,
): { matched: true; voiceUnlockToken: string; reply: PreviewMessage } | { matched: false } {
  const voiceCode = getConfiguredPreviewVoiceCode(process.env.PREVIEW_VOICE_UNLOCK_CODE);
  if (!isValidPreviewVoiceUnlockAttempt(rawInput, voiceCode)) {
    return { matched: false };
  }
  return {
    matched: true,
    voiceUnlockToken: signPreviewUnlockToken(getVoiceUnlockHmacSecret()),
    reply: buildVoiceUnlockActivatedMessage(new Date()),
  };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_NOT_CONFIGURED');
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedKey = apiKey;
  }
  return cachedClient;
}

export interface PreviewGeminiRequest {
  question: unknown;
  serverId: unknown;
  channelId: unknown;
  history: unknown;
  unlockToken?: unknown;
}

export const PREVIEW_GEMINI_MODEL = 'gemini-3.1-flash-lite';

export async function generateLivePreviewPeerReply(
  input: PreviewGeminiRequest,
): Promise<
  | {
      ok: true;
      reply: PreviewMessage;
      guarded: boolean;
      unlocked?: boolean;
      unlockToken?: string;
      voiceUnlocked?: boolean;
      voiceUnlockToken?: string;
    }
  | { ok: false; status: number; reason: string; message: string }
> {
  const rawQuestion = typeof input.question === 'string' ? input.question : '';
  const voiceCheck = tryVerifyVoiceUnlockCode(rawQuestion);
  if (voiceCheck.matched) {
    return {
      ok: true,
      reply: voiceCheck.reply,
      guarded: false,
      voiceUnlocked: true,
      voiceUnlockToken: voiceCheck.voiceUnlockToken,
    };
  }

  if (!isPreviewGeminiConfigured()) {
    return {
      ok: false,
      status: 503,
      reason: 'GEMINI_NOT_CONFIGURED',
      message: 'Gemini API key is not configured on the server.',
    };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
  const unlockCode = getConfiguredPreviewUnlockCode(process.env.PREVIEW_UNLOCK_CODE);
  const hmacSecret = `${apiKey}::${unlockCode}`;

  if (isValidPreviewUnlockAttempt(rawQuestion, unlockCode)) {
    const unlockToken = signPreviewUnlockToken(hmacSecret);
    return {
      ok: true,
      reply: buildUnlockActivatedMessage(new Date()),
      guarded: false,
      unlocked: true,
      unlockToken,
    };
  }

  const isUnlocked = verifyPreviewUnlockToken(input.unlockToken, hmacSecret);
  if (isUnlocked) {
    const cleanPrompt = sanitizeMultilineUserPrompt(rawQuestion, MAX_UNLOCKED_QUESTION_CHARS);
    if (!cleanPrompt) {
      return {
        ok: false,
        status: 400,
        reason: 'EMPTY_QUESTION',
        message: 'Сообщение не должно быть пустым.',
      };
    }

    const history = sanitizePreviewHistory(input.history, MAX_UNLOCKED_QUESTION_CHARS);
    const contents = buildUnlockedPromptContents(cleanPrompt, history);
    const ai = getGeminiClient();
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model: PREVIEW_GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: buildUnlockedGeminiSystemInstruction(),
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });
        const text = truncateUnlockedReply(response.text ?? '', MAX_UNLOCKED_REPLY_CHARS);
        if (text) {
          return {
            ok: true,
            reply: buildUnlockedReplyMessage(text, new Date()),
            guarded: false,
          };
        }
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    }

    const errMsg = lastError instanceof Error ? lastError.message : 'Upstream Gemini request failed.';
    return {
      ok: false,
      status: 502,
      reason: 'GEMINI_UPSTREAM_ERROR',
      message: errMsg,
    };
  }

  const cleanQuestion = sanitizeUserQuestion(rawQuestion);
  if (!cleanQuestion) {
    return {
      ok: false,
      status: 400,
      reason: 'EMPTY_QUESTION',
      message: 'Сообщение не должно быть пустым.',
    };
  }

  const server =
    PREVIEW_SERVERS.find((s) => s.id === input.serverId) ?? PREVIEW_SERVERS[0];
  const serverId: PreviewServerId = server.id;
  const channel =
    server.textChannels.find((c) => c.id === input.channelId) ?? server.textChannels[0];
  const history = sanitizePreviewHistory(input.history);
  const lastAuthor = history.length > 0 ? history[history.length - 1].author : undefined;

  if (isPromptInjectionOrOffTopic(cleanQuestion)) {
    const safe = resolveSafeOffTopicReply(serverId, channel.id, lastAuthor);
    return {
      ok: true,
      reply: buildPeerPreviewMessage(safe.author, safe.text, new Date(), 'live-guard'),
      guarded: true,
    };
  }

  const systemInstruction = buildPreviewGeminiSystemInstruction(
    server.name,
    channel.name,
    lastAuthor,
  );
  const contents = buildPreviewGeminiPromptContents(cleanQuestion, history, channel.name);

  const ai = getGeminiClient();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: PREVIEW_GEMINI_MODEL,
        contents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              author: {
                type: Type.STRING,
                enum: ['L30nel', 'Sergo', 'Max'],
                description: 'Ник участника сервера, который отвечает в чате.',
              },
              text: {
                type: Type.STRING,
                description:
                  'Короткий живой ответ участника чата Geek (1-3 предложения на русском, без упоминания ИИ).',
              },
            },
            required: ['author', 'text'],
          },
        },
      });

      const validated = validateAndNormalizeGeminiReply(response.text ?? '', 'L30nel');
      if (validated.ok) {
        return {
          ok: true,
          reply: buildPeerPreviewMessage(validated.author, validated.text, new Date(), 'live'),
          guarded: false,
        };
      }

      // Model violated persona/safety guard: keep client dialogue strictly safe and in-character
      const safe = resolveSafeOffTopicReply(serverId, channel.id, lastAuthor);
      return {
        ok: true,
        reply: buildPeerPreviewMessage(safe.author, safe.text, new Date(), 'live-guard'),
        guarded: true,
      };
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : 'Upstream Gemini request failed.';
  return {
    ok: false,
    status: 502,
    reason: 'GEMINI_UPSTREAM_ERROR',
    message: errMsg,
  };
}
