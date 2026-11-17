export type PreviewChannelId = 'general' | 'ideas' | 'beta';

export interface PreviewMessage {
  id: string;
  author: string;
  roleColor: 'cyan' | 'pink' | 'yellow';
  time: string;
  text: string;
}

export interface PreviewChannel {
  id: PreviewChannelId;
  name: string;
  topic: string;
  messages: PreviewMessage[];
}

export const PREVIEW_CHANNELS: PreviewChannel[] = [
  {
    id: 'general',
    name: 'общий-чат',
    topic: 'Живое общение комьюнити и тесты голосовых комнат',
    messages: [
      {
        id: 'g1',
        author: 'Niko',
        roleColor: 'cyan',
        time: '20:14',
        text: 'Кто сегодня залетит в голосовой канал тестировать шумоподавление?',
      },
      {
        id: 'g2',
        author: 'Vex',
        roleColor: 'pink',
        time: '20:15',
        text: 'Я уже в комнате! Звук чистый, без эха даже с механикой.',
      },
      {
        id: 'g3',
        author: 'Kira',
        roleColor: 'yellow',
        time: '20:16',
        text: 'Интерфейс ощущается очень лёгким, ничего лишнего на экране.',
      },
    ],
  },
  {
    id: 'ideas',
    name: 'идеи-комьюнити',
    topic: 'Предложения по новым функциям и темам оформления Geek',
    messages: [
      {
        id: 'i1',
        author: 'Artyom',
        roleColor: 'yellow',
        time: '19:40',
        text: 'Было бы круто иметь горячие клавиши для быстрого переключения комнат.',
      },
      {
        id: 'i2',
        author: 'DevTeam',
        roleColor: 'cyan',
        time: '19:44',
        text: 'Записали в бэклог! Также готовим кастомные цветовые пресеты для серверов.',
      },
    ],
  },
  {
    id: 'beta',
    name: 'новости-беты',
    topic: 'Объявления от разработчиков и наборы на закрытый тест',
    messages: [
      {
        id: 'b1',
        author: 'GeekCore',
        roleColor: 'pink',
        time: '18:00',
        text: 'Собираем первые отзывы через форму ниже — всё читаем лично на admin@geek-voice.ru.',
      },
      {
        id: 'b2',
        author: 'Alex',
        roleColor: 'cyan',
        time: '18:12',
        text: 'Ждём инвайты в @geek_mes!',
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
    roleColor: 'cyan',
    time: `${hh}:${mm}`,
    text: text.slice(0, 220),
  };
}
