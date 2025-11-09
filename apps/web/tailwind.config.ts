import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0E7C7B',
          light: '#4EB6B4',
          dark: '#0A4F4E',
        },
      },
    },
  },
  plugins: [forms],
};

export default config;
