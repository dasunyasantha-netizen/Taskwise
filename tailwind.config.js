/** @type {import('tailwindcss').Config} */

// Every colour resolves to a CSS variable so light/dark themes swap at runtime.
// Semantic tokens (tw-*) live in src/index.css; the stock palette (red-50,
// gray-700, …) lives in src/styles/palette.css (generated).
const v = name => `rgb(var(--${name}) / <alpha-value>)`

const FAMILIES = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
const palette = Object.fromEntries(FAMILIES.map(f => [f, Object.fromEntries(SHADES.map(s => [s, v(`c-${f}-${s}`)]))]))

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ...palette,
        'tw-primary':        v('tw-primary'),
        'tw-primary-dark':   v('tw-primary-dark'),
        'tw-primary-light':  v('tw-primary-light'),
        'tw-primary-text':   v('tw-primary-text'),
        'tw-success':        v('tw-success'),
        'tw-success-light':  v('tw-success-light'),
        'tw-warning':        v('tw-warning'),
        'tw-warning-light':  v('tw-warning-light'),
        'tw-danger':         v('tw-danger'),
        'tw-danger-light':   v('tw-danger-light'),
        'tw-purple':         v('tw-purple'),
        'tw-purple-light':   v('tw-purple-light'),
        'tw-teal':           v('tw-teal'),
        'tw-teal-light':     v('tw-teal-light'),
        'tw-orange':         v('tw-orange'),
        'tw-orange-light':   v('tw-orange-light'),
        'tw-indigo':         v('tw-indigo'),
        'tw-indigo-light':   v('tw-indigo-light'),
        'tw-bg':             v('tw-bg'),
        'tw-surface':        v('tw-surface'),
        'tw-surface-2':      v('tw-surface-2'),
        'tw-border':         v('tw-border'),
        'tw-border-strong':  v('tw-border-strong'),
        'tw-text':           v('tw-text'),
        'tw-text-secondary': v('tw-text-secondary'),
        'tw-text-muted':     v('tw-text-muted'),
        'tw-hover':          v('tw-hover'),
      },
      fontFamily: {
        sans: ['Figtree', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs':   ['0.8rem',  { lineHeight: '1.2rem' }],
        'sm':   ['0.9rem',  { lineHeight: '1.35rem' }],
        'base': ['1rem',    { lineHeight: '1.5rem' }],
        'lg':   ['1.125rem',{ lineHeight: '1.75rem' }],
        'xl':   ['1.25rem', { lineHeight: '1.85rem' }],
        '2xl':  ['1.5rem',  { lineHeight: '2rem' }],
      },
      boxShadow: {
        'card':  'var(--shadow-card)',
        'panel': 'var(--shadow-panel)',
        'glow':  '0 0 18px -6px rgba(0,115,234,0.7)',
        'cta':   '0 4px 14px -4px rgba(0,115,234,0.75)',
      },
      borderRadius: {
        'xl':  '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      keyframes: {
        'fade-in':  { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in':   { from: { opacity: '0', transform: 'translateY(6px) scale(.98)' }, to: { opacity: '1', transform: 'none' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-in':  'fade-in .15s ease-out',
        'pop-in':   'pop-in .18s ease-out',
        'slide-up': 'slide-up .22s cubic-bezier(.2,.8,.2,1)',
        'slide-in': 'slide-in .22s cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
}
