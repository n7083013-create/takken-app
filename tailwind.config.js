/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#e8f5e9',
          100: '#c8e6c9',
          200: '#a5d6a7',
          300: '#81c784',
          400: '#66bb6a',
          500: '#4caf50',
          600: '#43a047',
          700: '#388e3c',
          800: '#2e7d32',
          900: '#1b5e20',
          DEFAULT: '#2E7D32',
          dark: '#1B5E20',
        },
        accent: {
          DEFAULT: '#FF8F00',
          light: '#FFB300',
          dark: '#E65100',
        },
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        surface: '#F8FAF8',
        card: '#FFFFFF',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
