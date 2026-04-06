/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{svelte,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {},
      fontFamily: {
        mono: ['"JetBrainsMono Nerd Font"', '"FiraCode Nerd Font"', '"Hack Nerd Font"', 'ui-monospace', 'monospace'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif']
      },
      fontSize: {
        'xs': '10px',
        'sm': '11px',
        'base': '12px',
        'lg': '13px',
        'xl': '14px',
        '2xl': '15px',
        '3xl': '16px',
        '4xl': '18px',
        '5xl': '20px'
      },
      borderRadius: {
        'sm': '3px',
        DEFAULT: '4px',
        'lg': '6px',
        'xl': '8px'
      },
      spacing: {
        'xs': '2px',
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px'
      }
    }
  },
  plugins: []
};
