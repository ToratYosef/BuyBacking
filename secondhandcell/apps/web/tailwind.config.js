/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2fbf4',
          100: '#d9f3e1',
          200: '#b4e8c6',
          300: '#87dba7',
          400: '#52c980',
          500: '#22b45c',
          600: '#18984a',
          700: '#14773b',
          800: '#115c30',
          900: '#0d4a27'
        }
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
};
