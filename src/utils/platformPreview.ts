export type PreviewServerId = 'cy-4371' | 'hc-node' | 'ma-club';
export type PreviewBadgeSet = 'set1' | 'set2' | 'set3' | '';

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
  nick: string;
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
            author: 'Niko',
            initials: 'NI',
            avatarColor: '#ff2a85',
            badgeSet: 'set3',
            time: '23:42',
            text: 'Залетайте в «Ночной эфир» — вчера в логах ретранслятора выловил пакет MTk4Nw==, кто помнит старый интернет-хит с кассетой, сразу узнает год. А стабильный релиз узла выйдет ровно через 0b101000 циклов после него.',
          },
          {
            id: 'm3',
            author: 'Kira',
            initials: 'KI',
            avatarColor: '#3b82f6',
            badgeSet: 'set2',
            time: '23:44',
            text: 'Уже на месте! Кстати, пока ковыряла сборку SAMURAI, нашла в дампе пару простых множителей из хроники Пондсмита: первый равен 0x1F, а второй в ASCII отвечает за заглавную литеру C. Их произведение — ровно год той самой башни.',
          },
        ],
      },
      {
        id: 'общий',
        name: 'общий',
        messages: [
          {
            id: 'g1',
            author: 'Artyom',
            initials: 'AR',
            avatarColor: '#10b981',
            badgeSet: 'set1',
            time: '22:18',
            text: 'Как вам гексагональные аватары и неоновые наборы рамок профиля?',
          },
          {
            id: 'g2',
            author: 'Vex',
            initials: 'VX',
            avatarColor: '#b829ff',
            badgeSet: 'set2',
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
            author: 'Lina',
            initials: 'LI',
            avatarColor: '#ff2a85',
            badgeSet: 'set1',
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
            author: 'Silver',
            initials: 'SV',
            avatarColor: '#ff003c',
            badgeSet: 'set3',
            time: '23:15',
            text: '108.4 FM // Вечерний синтвейв и гитарные риффы для кодинга.',
          },
        ],
      },
    ],
    members: [
      {
        id: 'u-niko',
        nick: 'Niko',
        initials: 'NI',
        avatarColor: '#ff2a85',
        badgeSet: 'set3',
        online: true,
        customStatus: 'В эфире GEEK',
        inVoice: true,
        speaking: true,
      },
      {
        id: 'u-kira',
        nick: 'Kira',
        initials: 'KI',
        avatarColor: '#3b82f6',
        badgeSet: 'set2',
        online: true,
        customStatus: 'Настройка P2P узла',
        inVoice: true,
      },
      {
        id: 'u-vex',
        nick: 'Vex',
        initials: 'VX',
        avatarColor: '#b829ff',
        badgeSet: 'set1',
        online: true,
        customStatus: 'Читает чат',
        inVoice: false,
      },
      {
        id: 'u-artyom',
        nick: 'Artyom',
        initials: 'AR',
        avatarColor: '#10b981',
        badgeSet: 'set1',
        online: false,
        customStatus: '',
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
            author: 'DevCore',
            initials: 'DC',
            avatarColor: '#00f0ff',
            badgeSet: 'set1',
            time: '19:40',
            text: 'Перевели голосовые комнаты на прямые WebRTC P2P-каналы с резервным релеем.',
          },
          {
            id: 'h2',
            author: 'Alex',
            initials: 'AL',
            avatarColor: '#3b82f6',
            badgeSet: 'set2',
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
        id: 'u-dev',
        nick: 'DevCore',
        initials: 'DC',
        avatarColor: '#00f0ff',
        badgeSet: 'set1',
        online: true,
        customStatus: 'Собирает билд',
        inVoice: true,
        speaking: true,
      },
      {
        id: 'u-alex',
        nick: 'Alex',
        initials: 'AL',
        avatarColor: '#3b82f6',
        badgeSet: 'set2',
        online: true,
        customStatus: 'В коде',
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
            author: 'Muse',
            initials: 'MU',
            avatarColor: '#ff2a85',
            badgeSet: 'set2',
            time: '20:05',
            text: 'Добавили шторку регулировки камер и фильтр 18+ со спойлером прямо в чате.',
          },
        ],
      },
    ],
    members: [
      {
        id: 'u-muse',
        nick: 'Muse',
        initials: 'MU',
        avatarColor: '#ff2a85',
        badgeSet: 'set2',
        online: true,
        customStatus: 'Рисует рамки',
        inVoice: true,
      },
    ],
  },
];

export function createUserPreviewMessage(
  rawText: string,
  now: Date = new Date(),
): PreviewMessage | null {
  const text = rawText.trim();
  if (!text) return null;

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  return {
    id: `user-${now.getTime()}`,
    author: 'Вы (Гость)',
    initials: 'ГО',
    avatarColor: '#3b82f6',
    badgeSet: 'set1',
    time: `${hh}:${mm}`,
    text: text.slice(0, 220),
  };
}
