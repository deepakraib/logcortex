/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0F1117',
        surface: '#161B22',
        elevated: '#1C2333',
        accent: '#00D4AA',
        danger: '#EF4444',
        warning: '#F59E0B',
        caution: '#EAB308',
        success: '#10B981',
      },
      fontFamily: {
        ui: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Ubuntu', 'Cantarell', 'sans-serif'],
        mono: ['ui-monospace', 'Cascadia Code', 'Source Code Pro', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
