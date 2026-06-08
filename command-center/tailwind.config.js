/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // <-- This line makes your Dark Mode button work!
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}