/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "../**/*.html",
    "../**/*.js",
    "!../node_modules",
    "!../**/node_modules/**",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
