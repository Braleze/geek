import { CheckCircle2, Clock3, Cpu, Rocket } from 'lucide-react';

interface RoadmapPhase {
  step: string;
  phase: string;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: 'done' | 'active' | 'upcoming';
}

const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    step: '01',
    phase: 'Этап 01',
    title: 'Ядро платформы и чаты',
    description:
      'Архитектура серверов, текстовые каналы, ролевая модель доступа и мгновенная доставка сообщений без задержек.',
    statusLabel: 'Завершено',
    statusTone: 'done',
  },
  {
    step: '02',
    phase: 'Этап 02',
    title: 'P2P Голос и шифрование',
    description:
      'Голосовые комнаты со сверхнизким пингом, умное шумоподавление, пространственное аудио и E2E-защита звонков.',
    statusLabel: 'В разработке',
    statusTone: 'active',
  },
  {
    step: '03',
    phase: 'Этап 03',
    title: 'SDK для ботов и импорт',
    description:
      'Открытый API для ботов, вебхуки, кастомные темы оформления и быстрый перенос структуры серверов.',
    statusLabel: 'Запланировано',
    statusTone: 'upcoming',
  },
  {
    step: '04',
    phase: 'Этап 04',
    title: 'Публичный релиз и клиенты',
    description:
      'Закрытое бета-тестирование с комьюнити из Telegram и выпуск нативных приложений для ПК и смартфонов.',
    statusLabel: 'Скоро',
    statusTone: 'upcoming',
  },
];

export function RoadmapSection() {
  return (
    <section
      id="roadmap"
      aria-labelledby="roadmap-heading"
      className="w-full max-w-6xl mx-auto mt-20 text-left"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <p className="text-xs font-mono-tech text-[#00f0ff] tracking-widest uppercase mb-2">
            ПЛАН РАЗВИТИЯ ПЛАТФОРМЫ
          </p>
          <h2
            id="roadmap-heading"
            className="font-cyber font-black text-3xl md:text-4xl text-white uppercase"
          >
            Дорожная карта
          </h2>
        </div>
        <p className="text-sm text-slate-400 max-w-md">
          Последовательно запускаем ключевые модули от текстового ядра до нативных клиентов и открытого API.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {ROADMAP_PHASES.map((item) => {
          const isDone = item.statusTone === 'done';
          const isActive = item.statusTone === 'active';
          const borderClass = isDone
            ? 'border-[#00f0ff]/45 hover:border-[#00f0ff]'
            : isActive
              ? 'border-[#ff007f]/55 hover:border-[#ff007f]'
              : 'border-white/15 hover:border-[#fcee0a]/60';

          const statusTextColor = isDone
            ? 'text-[#00f0ff]'
            : isActive
              ? 'text-[#ff007f]'
              : 'text-[#fcee0a]';

          const StatusIcon = isDone
            ? CheckCircle2
            : isActive
              ? Cpu
              : item.step === '04'
                ? Rocket
                : Clock3;

          return (
            <article
              key={item.step}
              className={`p-6 rounded-2xl bg-[#150f24]/85 border ${borderClass} transition-colors duration-200 flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-4 text-xs font-mono-tech">
                  <span className="text-slate-400">{item.phase}</span>
                  <span className={`flex items-center gap-1.5 ${statusTextColor}`}>
                    <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.statusLabel}</span>
                  </span>
                </div>

                <h3 className="font-cyber font-bold text-lg text-white mb-2.5">
                  {item.step}. {item.title}
                </h3>

                <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
