export type PreviewServerId = 'cy-4371' | 'hc-node' | 'ma-club';
export type PreviewBadgeSet = 'set1' | 'set2' | 'set3' | '';
export type PreviewPeerNick = 'L30nel' | 'Sergo' | 'Max';

export interface PreviewMessage {
  id: string;
  author: string;
  initials: string;
  avatarColor: string;
  badgeSet: PreviewBadgeSet;
  time: string;
  text: string;
}

export interface PreviewTextChannel {
  id: string;
  name: string;
  messages: PreviewMessage[];
}

export interface PreviewMember {
  id: string;
  nick: PreviewPeerNick;
  initials: string;
  avatarColor: string;
  badgeSet: PreviewBadgeSet;
  online: boolean;
  customStatus: string;
  inVoice: boolean;
  speaking?: boolean;
}

export interface PreviewServer {
  id: PreviewServerId;
  icon: string;
  name: string;
  desc: string;
  voiceChannel: string;
  textChannels: PreviewTextChannel[];
  members: PreviewMember[];
}

export const BADGE_META: Record<Exclude<PreviewBadgeSet, ''>, { label: string; className: string }> = {
  set1: { label: '🌙 LUCY NET', className: 'geek-badge-set1' },
  set2: { label: '⚠️ EDGERUN', className: 'geek-badge-set2' },
  set3: { label: '🔥 SAMURAI', className: 'geek-badge-set3' },
};

export const PREVIEW_PEER_PROFILES: Record<
  PreviewPeerNick,
  { nick: PreviewPeerNick; initials: string; avatarColor: string; badgeSet: PreviewBadgeSet }
> = {
  L30nel: {
    nick: 'L30nel',
    initials: 'L3',
    avatarColor: '#ff2a85',
    badgeSet: 'set3',
  },
  Sergo: {
    nick: 'Sergo',
    initials: 'SE',
    avatarColor: '#3b82f6',
    badgeSet: 'set2',
  },
  Max: {
    nick: 'Max',
    initials: 'MX',
    avatarColor: '#b829ff',
    badgeSet: 'set1',
  },
};

export const PREVIEW_SERVERS: PreviewServer[] = [
  {
    id: 'cy-4371',
    icon: 'НК',
    name: 'Ночной клуб',
    desc: 'Игры, идеи и разговоры после полуночи',
    voiceChannel: 'Ночной эфир',
    textChannels: [
      {
        id: 'игровая-комната',
        name: 'игровая-комната',
        messages: [
          {
            id: 'm1',
            author: 'СИСТЕМА GEEK',
            initials: 'СГ',
            avatarColor: '#00f0ff',
            badgeSet: 'set1',
            time: '00:00',
            text: 'Добро пожаловать в «Ночной клуб»! Прямые звонки, индикатор голоса, фото/видео в чате и синхронизация активны.',
          },
          {
            id: 'm2',
            author: 'L30nel',
            initials: 'L3',
            avatarColor: '#ff2a85',
            badgeSet: 'set3',
            time: '23:42',
            text: 'Залетайте в «Ночной эфир» — тестируем свежую сборку P2P-голоса, пинг держится на нуле и звук кристальный.',
          },
          {
            id: 'm3',
            author: 'Sergo',
            initials: 'SE',
            avatarColor: '#3b82f6',
            badgeSet: 'set2',
            time: '23:44',
            text: 'Уже на месте! Проверили резервный аудиопоток и демонстрацию экрана — всё переключается плавно и без обрывов.',
          },
        ],
      },
      {
        id: 'общий',
        name: 'общий',
        messages: [
          {
            id: 'g1',
            author: 'Max',
            initials: 'MX',
            avatarColor: '#b829ff',
            badgeSet: 'set1',
            time: '22:18',
            text: 'Как вам гексагональные аватары и неоновые наборы рамок профиля?',
          },
          {
            id: 'g2',
            author: 'L30nel',
            initials: 'L3',
            avatarColor: '#ff2a85',
            badgeSet: 'set3',
            time: '22:20',
            text: 'Набор SAMURAI с Джонни — топ. А бинды Ctrl/Alt вообще спасают в катках.',
          },
        ],
      },
      {
        id: 'знакомства',
        name: 'знакомства',
        messages: [
          {
            id: 'z1',
            author: 'Sergo',
            initials: 'SE',
            avatarColor: '#3b82f6',
            badgeSet: 'set2',
            time: '21:10',
            text: 'Ищем тиму на вечерние коопы и обсуждаем свежие сборки.',
          },
        ],
      },
      {
        id: 'музыка',
        name: 'музыка',
        messages: [
          {
            id: 'mu1',
            author: 'Max',
            initials: 'MX',
            avatarColor: '#b829ff',
            badgeSet: 'set1',
            time: '23:15',
            text: '108.4 FM // Вечерний синтвейв и гитарные риффы для кодинга.',
          },
        ],
      },
    ],
    members: [
      {
        id: 'u-l30nel',
        nick: 'L30nel',
        initials: 'L3',
        avatarColor: '#ff2a85',
        badgeSet: 'set3',
        online: true,
        customStatus: 'В эфире GEEK',
        inVoice: true,
        speaking: true,
      },
      {
        id: 'u-sergo',
        nick: 'Sergo',
        initials: 'SE',
        avatarColor: '#3b82f6',
        badgeSet: 'set2',
        online: true,
        customStatus: 'Настройка P2P узла',
        inVoice: true,
      },
      {
        id: 'u-max',
        nick: 'Max',
        initials: 'MX',
        avatarColor: '#b829ff',
        badgeSet: 'set1',
        online: true,
        customStatus: 'Читает чат',
        inVoice: false,
      },
    ],
  },
  {
    id: 'hc-node',
    icon: 'HC',
    name: 'Кибер Узел',
    desc: 'Технологии, код и ночные эфиры',
    voiceChannel: 'Техно-стрим',
    textChannels: [
      {
        id: 'код-и-архитектура',
        name: 'код-и-архитектура',
        messages: [
          {
            id: 'h1',
            author: 'Sergo',
            initials: 'SE',
            avatarColor: '#3b82f6',
            badgeSet: 'set2',
            time: '19:40',
            text: 'Перевели голосовые комнаты на прямые WebRTC P2P-каналы с резервным релеем.',
          },
          {
            id: 'h2',
            author: 'Max',
            initials: 'MX',
            avatarColor: '#b829ff',
            badgeSet: 'set1',
            time: '19:45',
            text: 'Отличный апдейт! Ждём наборы ранних тестировщиков в @geek_mes.',
          },
        ],
      },
      {
        id: 'релизы',
        name: 'релизы',
        messages: [
          {
            id: 'hr1',
            author: 'СИСТЕМА GEEK',
            initials: 'СГ',
            avatarColor: '#00f0ff',
            badgeSet: 'set1',
            time: '18:00',
            text: 'Любые вопросы и предложения по функциям приходят нам на admin@geek-voice.ru.',
          },
        ],
      },
    ],
    members: [
      {
        id: 'u-sergo-hc',
        nick: 'Sergo',
        initials: 'SE',
        avatarColor: '#3b82f6',
        badgeSet: 'set2',
        online: true,
        customStatus: 'Собирает билд',
        inVoice: true,
        speaking: true,
      },
      {
        id: 'u-max-hc',
        nick: 'Max',
        initials: 'MX',
        avatarColor: '#b829ff',
        badgeSet: 'set1',
        online: true,
        customStatus: 'В коде',
        inVoice: false,
      },
      {
        id: 'u-l30nel-hc',
        nick: 'L30nel',
        initials: 'L3',
        avatarColor: '#ff2a85',
        badgeSet: 'set3',
        online: false,
        customStatus: '',
        inVoice: false,
      },
    ],
  },
  {
    id: 'ma-club',
    icon: 'MA',
    name: 'Мастерская',
    desc: 'Музыка, творчество и совместные проекты',
    voiceChannel: 'Студия #1',
    textChannels: [
      {
        id: 'идеи-комьюнити',
        name: 'идеи-комьюнити',
        messages: [
          {
            id: 'ma1',
            author: 'Max',
            initials: 'MX',
            avatarColor: '#b829ff',
            badgeSet: 'set1',
            time: '20:05',
            text: 'Добавили шторку регулировки камер и фильтр 18+ со спойлером прямо в чате.',
          },
        ],
      },
    ],
    members: [
      {
        id: 'u-max-ma',
        nick: 'Max',
        initials: 'MX',
        avatarColor: '#b829ff',
        badgeSet: 'set1',
        online: true,
        customStatus: 'Рисует рамки',
        inVoice: true,
      },
      {
        id: 'u-l30nel-ma',
        nick: 'L30nel',
        initials: 'L3',
        avatarColor: '#ff2a85',
        badgeSet: 'set3',
        online: true,
        customStatus: 'Тестирует звук',
        inVoice: false,
      },
      {
        id: 'u-sergo-ma',
        nick: 'Sergo',
        initials: 'SE',
        avatarColor: '#3b82f6',
        badgeSet: 'set2',
        online: false,
        customStatus: '',
        inVoice: false,
      },
    ],
  },
];

export const PREVIEW_QUICK_QUESTIONS: string[] = [
  'Когда релиз и бета?',
  'Как работает P2P-голос?',
  'Сколько разработчиков делают Geek?',
  'Как позвонить другу 1-на-1?',
  'Будет ли бесплатно?',
];

export function pickServerPeer(
  serverId: PreviewServerId,
  preferredNick?: PreviewPeerNick | string,
  offset: number = 0,
): PreviewMember {
  const srv = PREVIEW_SERVERS.find((s) => s.id === serverId) ?? PREVIEW_SERVERS[0];
  const online = srv.members.filter((m) => m.online);
  const pool = online.length > 0 ? online : srv.members;
  if (preferredNick) {
    const exact = pool.find((m) => m.nick.toLowerCase() === preferredNick.toLowerCase());
    if (exact) return exact;
  }
  return pool[Math.abs(offset) % pool.length];
}

export function formatMsgTime(now: Date): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function createUserPreviewMessage(
  rawText: string,
  now: Date = new Date(),
  maxChars: number = 220,
): PreviewMessage | null {
  const text = rawText.trim();
  if (!text) return null;

  return {
    id: `user-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    author: 'Вы (Гость)',
    initials: 'ГО',
    avatarColor: '#3b82f6',
    badgeSet: 'set1',
    time: formatMsgTime(now),
    text: text.slice(0, maxChars),
  };
}

export function generatePreviewPeerReply(
  rawQuestion: string,
  serverId: PreviewServerId,
  channelId: string,
  now: Date = new Date(),
  replyIndex: number = 0,
): PreviewMessage | null {
  const clean = rawQuestion.trim();
  if (!clean) return null;

  const q = clean.toLowerCase().replace(/ё/g, 'е');
  let preferredAuthor: PreviewPeerNick | undefined;
  let answerText: string;

  if (/команд|разработ|кто\s+дела|кто\s+созда|сколько\s+(людей|человек|вас)|энтузиазм|авторы/.test(q)) {
    preferredAuthor = 'Sergo';
    answerText =
      'Geek пилим втроём — L30nel, Sergo и Max на чистом энтузиазме в свободное время. Стараемся проработать каждую деталь — от звука до интерфейса!';
  } else if (/pre-?beta|пре-?бета|1-?на-?1|один\s+на\s+один|код\s+доступ|пригласит|позвонить\s+другу|другу/.test(q)) {
    preferredAuthor = serverId === 'hc-node' ? 'Sergo' : 'L30nel';
    answerText =
      'Переключайся на кнопку «PRE-BETA СВЯЗЬ 1-НА-1» сверху или иконку PB слева: получишь одноразовый код GK-XXXX-XXXX на 2 человек. Общий лимит — 30 минут, при выходе твой таймер сразу ставится на паузу.';
  } else if (/голос|звук|микрофон|webrtc|p2p|пинг|задерж|эхо|звон|слыш|релей|relay/.test(q)) {
    preferredAuthor = 'Sergo';
    answerText =
      'Голос работает напрямую через WebRTC P2P с аппаратным эхоподавлением. Если жёсткий NAT или провайдер режет UDP, канал через пару секунд сам переключится на резервный серверный аудиопоток без наложений.';
  } else if (/приват|шифр|безопас|e2e|утеч|данн|слеж/.test(q)) {
    preferredAuthor = 'Max';
    answerText =
      'Личные и групповые каналы проектируются со сквозным шифрованием, а в Pre-Beta комнатах сигнал идёт только между двумя подключёнными участниками без лишних посредников.';
  } else if (/релиз|когда\s+выйд|бета|тест|старт|дорожн|roadmap|план/.test(q)) {
    preferredAuthor = serverId === 'cy-4371' ? 'L30nel' : 'Max';
    answerText =
      'Запуск идёт поэтапно: ядро и текстовые каналы уже готовы, сейчас допиливаем P2P-голос и шифрование. Приглашения на закрытое тестирование раздаём в Telegram @geek_mes.';
  } else if (/цен|бесплат|платн|подписк|стои|деньг|донат|нитро|nitro/.test(q)) {
    preferredAuthor = 'Max';
    answerText =
      'Да, всё базовое будет бесплатным: создание серверов, текстовые каналы, голосовой чат с высоким битрейтом и демонстрация экрана без искусственных ограничений.';
  } else if (/устройств|платформ|windows|mac|linux|ios|android|телефон|мобил|браузер|скачат|пк/.test(q)) {
    preferredAuthor = 'Sergo';
    answerText =
      'Сначала откроемся прямо в браузере и в лёгком десктоп-клиенте для Windows, macOS и Linux, а следующим шагом выйдут нативные приложения для iOS и Android.';
  } else if (/discord|дискорд|импорт|перенес/.test(q)) {
    preferredAuthor = serverId === 'hc-node' ? 'Sergo' : 'Max';
    answerText =
      'На третьем этапе дорожной карты добавим инструмент быстрого переноса структуры серверов, ролей и каналов из Discord, а также кастомные темы оформления.';
  } else if (/рамк|знач|аватар|тема|интерфейс|дизайн|музык|радио|108\.4|камер|экран|18\+/.test(q)) {
    preferredAuthor = 'Max';
    answerText =
      'В интерфейсе есть гексагональные аватары, наборы неоновых рамок (LUCY NET, EDGERUN, SAMURAI), шторка камеры, фильтр 18+ со спойлером и фоновый стрим 108.4 FM.';
  } else if (/контакт|почт|связат|обратн|помощ|поддерж|баг|ошибк|предлож/.test(q)) {
    preferredAuthor = serverId === 'ma-club' ? 'Max' : 'L30nel';
    answerText =
      'Напиши нам через форму «Обратная связь» ниже на странице или напрямую на admin@geek-voice.ru — все сообщения попадают напрямую нашей тройке разработчиков.';
  } else if (/^(привет|здаров|здравств|хай|ку|салют|йо|hello|hi|hey|как\s+дела|кто\s+тут|вы\s+тут)\b/.test(q)) {
    preferredAuthor = serverId === 'cy-4371' ? 'L30nel' : undefined;
    answerText = `Привет! Добро пожаловать в #${channelId}. Тут в сети L30nel, Sergo и Max — спрашивай про релиз, P2P-голос, Pre-Beta связь 1-на-1, платформы или нашу разработку.`;
  } else {
    const snippet = clean.length > 52 ? `${clean.slice(0, 52)}...` : clean;
    answerText = `По вопросу «${snippet}»: в #${channelId} мы как раз тестируем превью-клиент Geek. У нас команда из трёх разработчиков (L30nel, Sergo и Max), прямой P2P-голос, Pre-Beta звонки 1-на-1 по коду, перенос серверов в плане и бесплатный базовый доступ. Спроси подробнее про любую из этих тем!`;
  }

  const peer = pickServerPeer(serverId, preferredAuthor, replyIndex);
  return {
    id: `reply-${now.getTime()}-${replyIndex}-${Math.random().toString(36).slice(2, 6)}`,
    author: peer.nick,
    initials: peer.initials,
    avatarColor: peer.avatarColor,
    badgeSet: peer.badgeSet,
    time: formatMsgTime(now),
    text: answerText,
  };
}

export interface PreviewVoicePeer {
  id: string;
  nick: string;
  initials: string;
  avatarColor: string;
  speaking: boolean;
  inCam: boolean;
  inScreen: boolean;
  isGuest?: boolean;
}

export function getVoicePeersForServer(
  server: PreviewServer,
  voiceServerId: PreviewServerId | null,
  options: {
    micMuted?: boolean;
    deafened?: boolean;
    camActive?: boolean;
    screenActive?: boolean;
  } = {},
): PreviewVoicePeer[] {
  const isGuestInThisServer = voiceServerId === server.id;
  const guestPeer: PreviewVoicePeer[] = isGuestInThisServer
    ? [
        {
          id: 'guest-self',
          nick: 'Вы (Гость)',
          initials: 'ГО',
          avatarColor: '#3b82f6',
          speaking: !options.micMuted && !options.deafened,
          inCam: Boolean(options.camActive),
          inScreen: Boolean(options.screenActive),
          isGuest: true,
        },
      ]
    : [];

  const memberPeers: PreviewVoicePeer[] = server.members
    .filter((m) => m.online && m.inVoice)
    .map((m) => ({
      id: m.id,
      nick: m.nick,
      initials: m.initials,
      avatarColor: m.avatarColor,
      speaking: Boolean(m.speaking),
      inCam: false,
      inScreen: false,
    }));

  return [...guestPeer, ...memberPeers];
}

export function toggleVoiceForViewedServer(
  currentVoiceServerId: PreviewServerId | null,
  viewedServerId: PreviewServerId,
): PreviewServerId | null {
  return currentVoiceServerId === viewedServerId ? null : viewedServerId;
}

export function shouldPlayL30nelVoiceAudio(state: {
  voiceServerId: PreviewServerId | null;
  preBetaMode: boolean;
}): boolean {
  return !state.preBetaMode && state.voiceServerId === 'cy-4371';
}

export type PreviewShortcutAction =
  | 'exitFullscreen'
  | 'fullscreen'
  | 'mic'
  | 'deafen'
  | 'cam'
  | null;

export function resolvePreviewShortcutAction(input: {
  key: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isFullscreen: boolean;
  isEditableTarget?: boolean;
}): PreviewShortcutAction {
  if (input.key === 'Escape') {
    return input.isFullscreen ? 'exitFullscreen' : null;
  }
  if (!input.altKey || input.ctrlKey || input.metaKey || input.isEditableTarget) {
    return null;
  }
  const code = input.code ?? '';
  const lower = input.key.toLowerCase();
  if (code === 'KeyM' || lower === 'm' || lower === 'ь') return 'mic';
  if (code === 'KeyD' || lower === 'd' || lower === 'в') return 'deafen';
  if (code === 'KeyC' || lower === 'c' || lower === 'с') return 'cam';
  if (code === 'KeyF' || lower === 'f' || lower === 'а') return 'fullscreen';
  return null;
}

const VOICE_UNLOCK_DIGEST = '74f2eeeb6697b4fe';

export function normalizeLocalVoiceCandidate(rawInput: string): string {
  const withoutZeroWidth = String(rawInput ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '');
  let trimmed = withoutZeroWidth.trim();
  const cmdMatch = /^\/(?:voice|voicetest)\s+(.+)$/i.exec(trimmed);
  if (cmdMatch) {
    trimmed = cmdMatch[1].trim();
  }
  return trimmed
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/^[`'"«»\s]+|[`'"«»\s]+$/g, '')
    .toLowerCase();
}

export function hashLocalVoiceCode(input: string): string {
  const salted = `gk::voice-test::${input.trim().toLowerCase()}::node7`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < salted.length; i += 1) {
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

export function matchesLocalVoiceUnlockCode(rawInput: string): boolean {
  const candidate = normalizeLocalVoiceCandidate(rawInput);
  if (!candidate) return false;
  return hashLocalVoiceCode(candidate) === VOICE_UNLOCK_DIGEST;
}

export function buildLocalVoiceUnlockMessage(now: Date = new Date()): PreviewMessage {
  return {
    id: `voice-unlock-local-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    author: 'СИСТЕМА GEEK',
    initials: 'СГ',
    avatarColor: '#10b981',
    badgeSet: 'set1',
    time: formatMsgTime(now),
    text: '🎙️ Тестовый живой голосовой канал «🔊 Live Голос (Тест)» открыт в списке голосовых каналов! Подключайтесь для проверки WebRTC / аудио, камеры, экрана и Эхо-теста. Чтобы снова скрыть канал, отправьте /voice-lock.',
  };
}

export const PREVIEW_DESKTOP_BREAKPOINT = 1024;

export interface PreviewPanelsState {
  showChannels: boolean;
  showMembers: boolean;
}

export function getInitialPreviewPanels(viewportWidth: number): PreviewPanelsState {
  const isDesktop = viewportWidth >= PREVIEW_DESKTOP_BREAKPOINT;
  return {
    showChannels: isDesktop,
    showMembers: isDesktop,
  };
}

export function togglePreviewPanel(
  current: PreviewPanelsState,
  panel: 'channels' | 'members',
  isCompactViewport: boolean,
): PreviewPanelsState {
  if (panel === 'channels') {
    const nextChannels = !current.showChannels;
    return {
      showChannels: nextChannels,
      showMembers: isCompactViewport && nextChannels ? false : current.showMembers,
    };
  }
  const nextMembers = !current.showMembers;
  return {
    showChannels: isCompactViewport && nextMembers ? false : current.showChannels,
    showMembers: nextMembers,
  };
}
