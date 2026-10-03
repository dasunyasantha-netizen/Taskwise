'use client';

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { parseDigits } from 'libphonenumber-js/max';
import './digits.css';

type Props = { id?: string; label: string; value: string; onChange: (value: string) => void;
  length: number; maximum?: number; autoComplete?: string; normalize?: (value: string) => string; otp?: boolean };

/** One native field preserves keyboard editing, autofill and accessibility; each digit has its own visible box. */
export default function DigitField({ id, label, value, onChange, length, maximum = length,
  autoComplete = 'one-time-code', normalize, otp = false }: Props) {
  const generated = useId();
  const inputId = id || generated;
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState(0);
  const pendingSelection = useRef<number | null>(null);
  const clean = (raw: string) => (normalize ? normalize(raw) : parseDigits(raw)).slice(0, maximum);
  // Replacing a controlled input's value (e.g. stripping a trunk prefix or
  // limiting its length) otherwise moves the native caret to the end.
  useLayoutEffect(() => {
    if (pendingSelection.current === null || !input.current) return;
    const position = Math.min(pendingSelection.current, input.current.value.length);
    input.current.setSelectionRange(position, position);
    pendingSelection.current = null;
  });
  const update = (next: string, position: number) => {
    pendingSelection.current = next !== value || position !== cursor ? position : null;
    if (input.current) {
      if (input.current.value !== next) input.current.value = next;
      input.current.setSelectionRange(position, position);
    }
    onChange(next);
    setCursor(position);
  };
  const columns = length > 10 ? Math.ceil(length / 2) : length;
  return <div className={`digit-field${otp ? ' digit-field--otp' : ''}`} style={{ '--digit-columns': columns } as CSSProperties}>
    <label htmlFor={inputId}>{label}</label>
    <div className="digit-field__control" onMouseDown={event => {
      const slot = (event.target as HTMLElement).closest<HTMLElement>('[data-digit-index]');
      if (!slot) return;
      event.preventDefault();
      const position = Math.min(Number(slot.dataset.digitIndex), value.length);
      input.current?.focus(); input.current?.setSelectionRange(position, Math.min(position + 1, value.length));
      setCursor(position);
    }}>
      <input ref={input} id={inputId} className="digit-field__input" type="text" inputMode="numeric" required
        autoComplete={autoComplete} pattern={otp ? `[0-9]{${length}}` : '[0-9]+'} maxLength={maximum + 8}
        value={value} onFocus={event => { setFocused(true); setCursor(event.currentTarget.selectionStart ?? value.length); }}
        onBlur={() => setFocused(false)} onSelect={event => setCursor(event.currentTarget.selectionStart ?? value.length)}
        onChange={event => {
          const raw = event.currentTarget.value;
          const position = event.currentTarget.selectionStart ?? raw.length;
          const next = clean(raw);
          update(next, Math.min(clean(raw.slice(0, position)).length, next.length));
        }}
        onPaste={event => { event.preventDefault(); const next = clean(event.clipboardData.getData('text')); update(next, next.length); }} />
      <div className="digit-field__slots" aria-hidden="true">
        {Array.from({ length }, (_, index) => <span key={index} data-digit-index={index}
          className={`digit-field__slot${focused && Math.min(cursor, length - 1) === index ? ' digit-field__slot--active' : ''}`}>
          {value[index] || (focused && cursor === index ? <span className="digit-field__caret" /> : <span className="digit-field__placeholder">·</span>)}
        </span>)}
      </div>
    </div>
  </div>;
}
