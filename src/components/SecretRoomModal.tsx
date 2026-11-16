import { useCallback, useEffect, useState } from 'react';
import { Delete, KeyRound, Lock, ShieldAlert, X } from 'lucide-react';
import {
  CODE_LENGTH,
  appendDigit,
  clearDigits,
  createInitialKeypadState,
  formatCodeSlots,
  removeDigit,
  submitCode,
  type KeypadState,
} from '../utils/secretCode';
import { playKeypadTone } from '../utils/rickrollAudio';
import { RickrollStage } from './RickrollStage';

interface SecretRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function SecretRoomModal({ isOpen, onClose }: SecretRoomModalProps) {
  const [keypad, setKeypad] = useState<KeypadState>(createInitialKeypadState);

  const applyUpdate = useCallback((updater: (prev: KeypadState) => KeypadState) => {
    setKeypad((prev) => {
      const next = updater(prev);
      if (next.status === 'unlocked' && prev.status !== 'unlocked') {
        playKeypadTone('unlock');
      } else if (next.status === 'error' && next.attempts > prev.attempts) {
        playKeypadTone('error');
      } else if (next.digits.length > prev.digits.length) {
        playKeypadTone('digit');
      }
      return next;
    });
  }, []);

  const handleDigit = useCallback(
    (digit: string) => {
      applyUpdate((prev) => appendDigit(prev, digit));
    },
    [applyUpdate],
  );

  const handleBackspace = useCallback(() => {
    applyUpdate((prev) => removeDigit(prev));
  }, [applyUpdate]);

  const handleClear = useCallback(() => {
    applyUpdate((prev) => clearDigits(prev));
  }, [applyUpdate]);

  const handleSubmit = useCallback(() => {
    applyUpdate((prev) => submitCode(prev));
  }, [applyUpdate]);

  const handleResetKeypad = useCallback(() => {
    setKeypad(createInitialKeypadState());
  }, []);

  // Reset keypad when modal closes
  useEffect(() => {
    if (!isOpen) {
      setKeypad(createInitialKeypadState());
    }
  }, [isOpen]);

  // Keyboard support inside the secret room
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (keypad.status === 'unlocked') {
        return;
      }

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        handleDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        handleBackspace();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, keypad.status, handleDigit, handleBackspace, handleSubmit, onClose]);

  if (!isOpen) {
    return null;
  }

  const slots = formatCodeSlots(keypad.digits);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#06030c]/92"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-room-title"
      data-testid="secret-room-modal"
    >
      <div className="relative w-full max-w-xl rounded-3xl bg-[#150f24] border border-[#00f0ff]/45 shadow-neon-cyan p-6 sm:p-8 overflow-hidden">
        {/* Decorative HUD corners */}
        <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-[#00f0ff] pointer-events-none" />
        <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-[#ff007f] pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-[#fcee0a] pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-[#00f0ff] pointer-events-none" />

        {keypad.status === 'unlocked' ? (
          <RickrollStage onClose={onClose} onResetKeypad={handleResetKeypad} />
        ) : (
          <div className="flex flex-col items-center">
            {/* Header */}
            <div className="w-full flex items-start justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#00f0ff]/10 border border-[#00f0ff]/40 text-[#00f0ff] flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-mono-tech text-[#00f0ff] tracking-widest uppercase">
                    СЕКРЕТНАЯ КОМНАТА
                  </p>
                  <h2
                    id="secret-room-title"
                    className="font-cyber font-black text-xl sm:text-2xl text-white"
                  >
                    КОД-ПАРОЛЬ ПАНЕЛЬ
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть панель доступа"
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/15 text-slate-300 hover:text-white hover:border-[#ff007f] flex items-center justify-center transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-300 text-center max-w-md mb-6">
              Введите {CODE_LENGTH}-значный код доступа на цифровой панели или с клавиатуры, чтобы открыть скрытый протокол Geek.
            </p>

            {/* 4-Slot PIN Display */}
            <div
              key={keypad.attempts}
              className={`grid grid-cols-4 gap-3 mb-4 w-full max-w-xs ${
                keypad.status === 'error' ? 'animate-shake' : ''
              }`}
              aria-label={`Введено цифр: ${keypad.digits.length} из ${CODE_LENGTH}`}
              data-testid="keypad-display"
            >
              {slots.map((digit, index) => {
                const isFilled = digit !== '';
                const isError = keypad.status === 'error';
                return (
                  <div
                    key={index}
                    className={`h-16 rounded-2xl border flex items-center justify-center font-cyber font-black text-2xl tabular-nums transition-colors ${
                      isError
                        ? 'bg-[#ff007f]/15 border-[#ff007f] text-[#ff007f]'
                        : isFilled
                          ? 'bg-[#00f0ff]/15 border-[#00f0ff] text-white shadow-neon-cyan'
                          : 'bg-[#0b0714] border-white/15 text-slate-500'
                    }`}
                  >
                    {isFilled ? digit : '•'}
                  </div>
                );
              })}
            </div>

            {/* Status / Error message */}
            <div className="min-h-7 mb-5 flex items-center justify-center">
              {keypad.errorMessage ? (
                <p
                  role="alert"
                  className="text-xs sm:text-sm font-mono-tech text-[#ff007f] flex items-center gap-2"
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{keypad.errorMessage}</span>
                </p>
              ) : (
                <p className="text-xs font-mono-tech text-slate-400">
                  Ожидание ввода 4-значного кода...
                </p>
              )}
            </div>

            {/* Numeric Keypad Grid */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-5">
              {KEYPAD_DIGITS.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigit(digit)}
                  aria-label={`Цифра ${digit}`}
                  className="h-14 rounded-2xl bg-[#1c1432] border border-white/15 hover:border-[#00f0ff] hover:bg-[#23193e] active:scale-95 text-white font-cyber font-bold text-xl tabular-nums transition-all focus-visible:outline-2 focus-visible:outline-[#00f0ff]"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClear}
                aria-label="Очистить код"
                className="h-14 rounded-2xl bg-[#0b0714] border border-white/15 hover:border-[#fcee0a] text-slate-300 hover:text-[#fcee0a] font-cyber font-bold text-xs tracking-wider transition-all focus-visible:outline-2 focus-visible:outline-[#fcee0a]"
              >
                СБРОС
              </button>

              <button
                type="button"
                onClick={() => handleDigit('0')}
                aria-label="Цифра 0"
                className="h-14 rounded-2xl bg-[#1c1432] border border-white/15 hover:border-[#00f0ff] hover:bg-[#23193e] active:scale-95 text-white font-cyber font-bold text-xl tabular-nums transition-all focus-visible:outline-2 focus-visible:outline-[#00f0ff]"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                aria-label="Удалить последнюю цифру"
                className="h-14 rounded-2xl bg-[#0b0714] border border-white/15 hover:border-[#ff007f] text-slate-300 hover:text-[#ff007f] flex items-center justify-center transition-all focus-visible:outline-2 focus-visible:outline-[#ff007f]"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Submit button */}
            <button
              type="button"
              onClick={handleSubmit}
              className="cyber-btn w-full max-w-xs py-3.5 px-6 bg-gradient-to-r from-[#00f0ff] to-[#ff007f] text-[#0b0714] font-cyber font-black text-sm tracking-wider flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <KeyRound className="w-4 h-4" />
              <span>ПОДТВЕРДИТЬ КОД</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
