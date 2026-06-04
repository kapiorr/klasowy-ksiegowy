/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        ink: '#0f1117',
        paper: '#f5f3ee',
        sage: {
          50: '#f2f7f2',
          100: '#e0ece0',
          200: '#c2d9c2',
          400: '#6fa86f',
          600: '#4a8c4a',
          700: '#3a6e3a',
        },
        amber: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        rose: {
          400: '#fb7185',
          500: '#f43f5e',
        }
      }
    },
  },
  plugins: [],
}
