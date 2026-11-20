/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        finance: {
          bg: '#0B0F19',
          card: '#111827',
          cardHover: '#1F2937',
          border: '#1E293B',
          textMuted: '#94A3B8',
          // 美股綠漲紅跌，台股紅漲綠跌
          bullGreen: '#10B981',
          bearRed: '#EF4444',
        }
      }
    },
  },
  plugins: [],
}
