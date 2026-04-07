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
        'tw-warning':        '#fdab3d',
        'tw-danger':         '#e2445c',
        'tw-purple':         '#a358df',
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
      boxShadow: {
        'card': '0 1px 4px rgba(0,0,0,0.08)',
        'panel': '0 4px 16px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
}
