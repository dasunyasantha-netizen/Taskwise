/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'tw-primary':        '#0073ea',
        'tw-primary-dark':   '#0060c0',
        'tw-primary-light':  '#cce4ff',
        'tw-success':        '#00c875',
        'tw-success-light':  '#b3f5d8',
        'tw-warning':        '#fdab3d',
        'tw-warning-light':  '#fef0d6',
        'tw-danger':         '#e2445c',
        'tw-danger-light':   '#fcd6dc',
        'tw-purple':         '#a358df',
        'tw-purple-light':   '#ecdeff',
        'tw-teal':           '#0ebdcc',
        'tw-teal-light':     '#ccf5f8',
        'tw-orange':         '#ff7575',
        'tw-orange-light':   '#ffe5e5',
        'tw-indigo':         '#4353ff',
        'tw-indigo-light':   '#dde0ff',
        'tw-bg':             '#f5f6f8',
        'tw-surface':        '#ffffff',
        'tw-border':         '#e6e9ef',
        'tw-text':           '#323338',
        'tw-text-secondary': '#676879',
        'tw-hover':          '#f0f2f5',
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
        'card':  '0 1px 4px rgba(0,0,0,0.08)',
        'panel': '0 4px 16px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        'xl':  '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
}
