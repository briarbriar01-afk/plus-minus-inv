import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tahoma', 'Arial', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        paper: '0 25px 75px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
