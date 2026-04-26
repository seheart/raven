/** @type {import('tailwindcss').Config} */
// Tailwind v4: design tokens live in src/app.css under @theme.
// This file only configures content scanning.
export default {
  content: ['./index.html', './src/**/*.{svelte,js,ts,jsx,tsx}'],
  plugins: []
};
