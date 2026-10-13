/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#F6F5F1', deep: '#EDEBE4' },
        ink: { 900: '#161B19', 800: '#1F2624', line: '#2E3733' },
        main: '#222824',
        sub: '#5E6B63',
        line: '#E2DFD6',
        signal: { DEFAULT: '#256B57', deep: '#1C5142', soft: '#E3EFE9' },
        amber: { DEFAULT: '#D98E1E', soft: '#F7ECD6' },
        online: '#3FA37C',
        danger: { DEFAULT: '#BE4A33', soft: '#F6E2DC' },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', '-apple-system', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['IBM Plex Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
