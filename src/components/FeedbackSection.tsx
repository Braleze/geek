import { useEffect, useState, type CSSProperties, type FormEvent, type PointerEvent } from 'react';
import { CheckCircle2, Loader2, Mail, MessageSquare, Send, Tag, User } from 'lucide-react';
import {
  FEEDBACK_TARGET_EMAIL,
  FEEDBACK_TOPICS,
  buildFeedbackMailtoUrl,
  createFeedbackEntry,
  loadFeedbackEntries,
  saveFeedbackEntry,
  submitFeedbackRequest,
  validateFeedbackInput,
  type FeedbackEntry,
  type FeedbackErrors,
  type FeedbackTopic,
} from '../utils/feedback';

export function FeedbackSection() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<FeedbackTopic>('Закрытая бета');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<FeedbackErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);
  const [submittedEntry, setSubmittedEntry] = useState<FeedbackEntry | null>(null);
  const [history, setHistory] = useState<FeedbackEntry[]>([]);

  useEffect(() => {
    setHistory(loadFeedbackEntries());
  }, []);

  const handleCardPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const result = validateFeedbackInput({ name, email, message, topic });

    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setSubmitWarning(null);
    setIsSubmitting(true);

    const baseEntry = createFeedbackEntry(result.normalized);
    const outcome = await submitFeedbackRequest(baseEntry, honeypot);

    const savedEntry: FeedbackEntry = {
      ...baseEntry,
      deliveryStatus: outcome.delivery,
    };
    const updatedHistory = saveFeedbackEntry(savedEntry);

    setIsSubmitting(false);
    setSubmitWarning(outcome.errorMessage ?? null);
    setSubmittedEntry(savedEntry);
    setHistory(updatedHistory);
    setName('');
    setEmail('');
    setMessage('');
    setHoneypot('');
  };

  const handleSendAnother = () => {
    setSubmittedEntry(null);
    setSubmitWarning(null);
    setErrors({});
  };

  return (
    <section
      id="feedback"
      aria-labelledby="feedback-heading"
      className="w-full max-w-4xl mx-auto mt-20 mb-12 text-left"
    >
      <div className="text-center mb-10">
        <p className="text-xs font-mono-tech text-[#00f0ff] tracking-widest uppercase mb-2">
          ЗАДАТЬ ВОПРОС КОМАНДЕ
        </p>
        <h2
          id="feedback-heading"
          className="font-cyber font-black text-3xl md:text-4xl text-white uppercase mb-3"
        >
          Обратная связь
        </h2>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          Оставьте имя, ваш email для ответа и задайте любой вопрос о платформе Geek. Все обращения направляются на{' '}
          <a
            href={`mailto:${FEEDBACK_TARGET_EMAIL}`}
            className="text-[#00f0ff] hover:underline font-mono-tech"
          >
            {FEEDBACK_TARGET_EMAIL}
          </a>
          .
        </p>
      </div>

      <div
        onPointerMove={handleCardPointerMove}
        style={{ '--spot-color': 'rgba(0, 240, 255, 0.16)' } as CSSProperties}
        className="neon-card p-6 sm:p-8 rounded-3xl bg-[#150f24]/90 border border-[#00f0ff]/40 hover:border-[#00f0ff]/75 hover:shadow-neon-cyan transition-all duration-300"
      >
        <div className="relative z-10">
          {submittedEntry ? (
            <div
              role="status"
              data-testid="feedback-success"
              className="flex flex-col items-center text-center py-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#00f0ff]/15 border border-[#00f0ff]/60 text-[#00f0ff] flex items-center justify-center shadow-neon-cyan mb-4">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <p className="text-xs font-mono-tech text-[#00f0ff] tracking-widest uppercase mb-1">
                {submittedEntry.deliveryStatus === 'sent'
                  ? `ОБРАЩЕНИЕ ${submittedEntry.id} ОТПРАВЛЕНО НА ${FEEDBACK_TARGET_EMAIL.toUpperCase()}`
                  : `ОБРАЩЕНИЕ ${submittedEntry.id} ПРИНЯТО`}
              </p>
              <h3 className="font-cyber font-bold text-xl text-white mb-2">
                Спасибо, {submittedEntry.name}!
              </h3>
              <p className="text-sm text-slate-300 max-w-md mb-5">
                {submittedEntry.deliveryStatus === 'sent' ? (
                  <>
                    Письмо («{submittedEntry.topic}») доставлено команде на{' '}
                    <span className="text-[#00f0ff] font-mono-tech">{FEEDBACK_TARGET_EMAIL}</span>. Ответ придёт на адрес{' '}
                    <span className="text-[#00f0ff] font-mono-tech">{submittedEntry.email}</span>.
                  </>
                ) : (
                  <>
                    {submitWarning ? `${submitWarning} ` : ''}
                    Обращение сохранено («{submittedEntry.topic}»). Вы также можете продублировать его на{' '}
                    <a
                      href={buildFeedbackMailtoUrl(submittedEntry)}
                      className="text-[#00f0ff] hover:underline font-mono-tech"
                    >
                      {FEEDBACK_TARGET_EMAIL}
                    </a>{' '}
                    — ответ придёт на <span className="text-[#00f0ff] font-mono-tech">{submittedEntry.email}</span>.
                  </>
                )}
              </p>

              <div className="w-full max-w-lg rounded-2xl bg-[#0b0714] border border-white/10 p-4 text-left text-xs text-slate-300 mb-6">
                <p className="text-slate-400 font-mono-tech mb-1">
                  Тема: <span className="text-[#fcee0a]">{submittedEntry.topic}</span>
                </p>
                <p className="leading-relaxed">{submittedEntry.message}</p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleSendAnother}
                  className="cyber-btn px-6 py-3 text-xs font-cyber font-bold bg-[#1c1432] border border-[#00f0ff]/60 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#0b0714] cursor-pointer"
                >
                  ОТПРАВИТЬ ЕЩЁ ОДИН ВОПРОС
                </button>
                {submittedEntry.deliveryStatus !== 'sent' && (
                  <a
                    href={buildFeedbackMailtoUrl(submittedEntry)}
                    className="cyber-btn px-6 py-3 text-xs font-cyber font-bold bg-[#1c1432] border border-[#fcee0a]/70 text-[#fcee0a] hover:bg-[#fcee0a] hover:text-[#0b0714] flex items-center gap-2"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>ОТКРЫТЬ ПОЧТУ ({FEEDBACK_TARGET_EMAIL})</span>
                  </a>
                )}
                <a
                  href="https://t.me/geek_mes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cyber-btn px-6 py-3 text-xs font-cyber font-bold bg-[#1c1432] border border-[#ff007f]/60 text-[#ff007f] hover:bg-[#ff007f] hover:text-white flex items-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>НАПИСАТЬ В TELEGRAM</span>
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {/* Spam honeypot */}
              <input
                type="text"
                name="_gotcha"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label
                    htmlFor="feedback-name"
                    className="block text-xs font-mono-tech text-slate-300 uppercase tracking-wider mb-2"
                  >
                    Ваше имя
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#00f0ff]/70 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="feedback-name"
                      name="name"
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                      }}
                      placeholder="Например, Алексей"
                      aria-invalid={Boolean(errors.name)}
                      className={`w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#0b0714] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition-colors ${
                        errors.name
                          ? 'border-[#ff007f] focus:border-[#ff007f]'
                          : 'border-white/15 focus:border-[#00f0ff]'
                      }`}
                    />
                  </div>
                  {errors.name && (
                    <p role="alert" className="mt-1.5 text-xs font-mono-tech text-[#ff007f]">
                      {errors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="feedback-email"
                    className="block text-xs font-mono-tech text-slate-300 uppercase tracking-wider mb-2"
                  >
                    Email для ответа
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#ff007f]/75 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="feedback-email"
                      name="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                      }}
                      placeholder="name@example.com"
                      aria-invalid={Boolean(errors.email)}
                      className={`w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#0b0714] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition-colors ${
                        errors.email
                          ? 'border-[#ff007f] focus:border-[#ff007f]'
                          : 'border-white/15 focus:border-[#00f0ff]'
                      }`}
                    />
                  </div>
                  {errors.email && (
                    <p role="alert" className="mt-1.5 text-xs font-mono-tech text-[#ff007f]">
                      {errors.email}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="feedback-topic"
                  className="block text-xs font-mono-tech text-slate-300 uppercase tracking-wider mb-2"
                >
                  Тема обращения
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-[#fcee0a]/75 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    id="feedback-topic"
                    name="topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value as FeedbackTopic)}
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#0b0714] border border-white/15 focus:border-[#00f0ff] focus:outline-none text-sm text-white transition-colors"
                  >
                    {FEEDBACK_TOPICS.map((item) => (
                      <option key={item} value={item} className="bg-[#150f24] text-white">
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="feedback-message"
                  className="block text-xs font-mono-tech text-slate-300 uppercase tracking-wider mb-2"
                >
                  Ваш вопрос или сообщение
                </label>
                <div className="relative">
                  <MessageSquare className="w-4 h-4 text-[#fcee0a]/75 absolute left-4 top-4 pointer-events-none" />
                  <textarea
                    id="feedback-message"
                    name="message"
                    rows={4}
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
                    }}
                    placeholder="Напишите вопрос по функционалу, закрытой бете или сотрудничеству..."
                    aria-invalid={Boolean(errors.message)}
                    className={`w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#0b0714] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition-colors resize-y ${
                      errors.message
                        ? 'border-[#ff007f] focus:border-[#ff007f]'
                        : 'border-white/15 focus:border-[#00f0ff]'
                    }`}
                  />
                </div>
                {errors.message && (
                  <p role="alert" className="mt-1.5 text-xs font-mono-tech text-[#ff007f]">
                    {errors.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                <p className="text-xs text-slate-400 font-mono-tech">
                  Почта:{' '}
                  <a
                    href={`mailto:${FEEDBACK_TARGET_EMAIL}`}
                    className="text-[#00f0ff] hover:underline"
                  >
                    {FEEDBACK_TARGET_EMAIL}
                  </a>{' '}
                  · Чат:{' '}
                  <a
                    href="https://t.me/geek_mes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00f0ff] hover:underline"
                  >
                    @geek_mes
                  </a>
                </p>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="cyber-btn px-7 py-3.5 bg-gradient-to-r from-[#00f0ff] via-[#ff007f] to-[#fcee0a] text-[#0b0714] font-cyber font-black text-xs sm:text-sm tracking-wider flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-70 shadow-pink-button-glow cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>ОТПРАВКА...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>ОТПРАВИТЬ ВОПРОС</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {history.length > 0 && (
            <div className="mt-6 pt-5 border-t border-white/10">
              <p className="text-xs font-mono-tech text-slate-400 uppercase tracking-wider mb-3">
                Ваши отправленные обращения ({history.length})
              </p>
              <div className="space-y-2">
                {history.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-[#0b0714]/80 border border-white/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="text-[#00f0ff] font-mono-tech mr-2">{item.id}</span>
                      <span className="text-white font-semibold mr-2">{item.name}</span>
                      <span className="text-slate-400 font-mono-tech mr-2">({item.email})</span>
                      {item.topic && (
                        <span className="text-[#ff007f] font-mono-tech">· {item.topic}</span>
                      )}
                      <p className="text-slate-300 truncate mt-1">{item.message}</p>
                    </div>
                    <span className="text-[11px] font-mono-tech text-[#fcee0a] shrink-0">
                      {item.deliveryStatus === 'sent' ? 'На admin@geek-voice.ru' : 'Сохранено'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
