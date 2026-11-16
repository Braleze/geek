import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'beta',
    question: 'Когда выйдет Geek и как попасть на закрытое тестирование?',
    answer:
      'Запуск проходит поэтапно. Первые приглашения в закрытую бету, ранние привилегии и доступ к тестовым голосовым нодам будут распределяться среди участников Telegram-канала @geek_mes.',
  },
  {
    id: 'pricing',
    question: 'Будет ли платформа бесплатной для обычных пользователей и комьюнити?',
    answer:
      'Да. Создание серверов, текстовые каналы, голосовой чат с высоким битрейтом и демонстрация экрана будут доступны бесплатно без искусственных ограничений базовых функций.',
  },
  {
    id: 'privacy',
    question: 'Как в Geek устроены приватность и низкая задержка голоса?',
    answer:
      'Голосовые комнаты используют прямые P2P-маршруты и независимые ноды с минимальным пингом, а личные и групповые каналы защищаются сквозным шифрованием.',
  },
  {
    id: 'bots',
    question: 'Можно ли будет переносить ботов и структуру серверов из Discord?',
    answer:
      'На третьем этапе дорожной карты появится открытый SDK для разработчиков, поддержка вебхуков и инструмент быстрого импорта ролей, категорий и каналов.',
  },
  {
    id: 'platforms',
    question: 'На каких устройствах будет работать клиент Geek?',
    answer:
      'На старте платформа откроется в браузере и в виде лёгкого десктоп-приложения для Windows, macOS и Linux, а затем выйдут нативные клиенты для iOS и Android.',
  },
];

export function FaqSection() {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0].id);

  const toggleItem = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="w-full max-w-4xl mx-auto mt-20 mb-8 text-left"
    >
      <div className="text-center mb-10">
        <p className="text-xs font-mono-tech text-[#ff007f] tracking-widest uppercase mb-2">
          ОТВЕТЫ НА ГЛАВНОЕ
        </p>
        <h2
          id="faq-heading"
          className="font-cyber font-black text-3xl md:text-4xl text-white uppercase"
        >
          Частые вопросы
        </h2>
      </div>

      <div className="space-y-3">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = openId === item.id;
          return (
            <div
              key={item.id}
              className={`rounded-2xl bg-[#150f24]/85 border transition-all duration-200 ${
                isOpen
                  ? 'border-[#00f0ff]/75 shadow-[0_0_24px_rgba(0,240,255,0.25)]'
                  : 'border-white/12 hover:border-[#00f0ff]/45 hover:bg-[#1c1432]/90'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${item.id}`}
                className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#00f0ff] rounded-2xl"
              >
                <span className="font-cyber font-bold text-sm sm:text-base text-white">
                  <span className="text-[#00f0ff] font-mono-tech mr-2.5">
                    0{index + 1}.
                  </span>
                  {item.question}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-[#00f0ff] shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div
                  id={`faq-panel-${item.id}`}
                  className="px-6 pb-5 pt-1 text-sm text-slate-300 leading-relaxed border-t border-white/5"
                >
                  {item.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
