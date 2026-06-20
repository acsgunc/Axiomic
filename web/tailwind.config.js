/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Axiomic dark palette.
        base: {
          900: '#0b0f17',
          800: '#111827',
          700: '#1a2233',
          600: '#232d42',
        },
        accent: {
          DEFAULT: '#3b82f6',
          up: '#26a69a',
          down: '#ef5350',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
