/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07182f',
        navy: '#0b2748',
        pitch: '#0f5132',
        gold: '#d7b562',
        frost: '#f5f8fb',
      },
      boxShadow: {
        panel: '0 18px 45px rgba(7, 24, 47, 0.12)',
      },
    },
  },
  plugins: [],
};
