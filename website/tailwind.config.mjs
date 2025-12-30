/** @type {import('tailwindcss').Config} */
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['JetBrains Mono', 'Fira Code', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        background: '#020202', // 极致黑
        surface: '#0A0A0A',
        surface2: '#121212',
        border: '#1F1F1F',
        primary: '#FFFFFF', // 主色留白
        accent: '#00F0FF', // Cyberpunk Cyan
      },
      animation: {
        'grid-flow': 'grid-flow 20s linear infinite',
        'spin-slow': 'spin 12s linear infinite',
      },
      keyframes: {
        'grid-flow': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(40px)' },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
  darkMode: 'class',
};
