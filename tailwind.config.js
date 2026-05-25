/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // 値だけは theme.ts (Forest Green #1B7A3D) と一致させ、ブランド分裂を防ぐ。
      // semantic 色は constants/theme.ts の Colors.{success,warning,error,accent,surface} と完全一致。
      colors: {
        primary: {
          50:  '#E8F5EC',
          100: '#C8E6CF',
          200: '#A5D6B0',
          300: '#7CC68F',
          400: '#52B370',
          500: '#34A853',  // = Brand.green500 (light variant)
          600: '#1B7A3D',  // = Brand.green600 (canonical)
          700: '#145C2E',  // = Brand.green700 (dark variant)
          800: '#0E4621',
          900: '#082E16',
          DEFAULT: '#1B7A3D',
          dark: '#145C2E',
        },
        accent: {
          DEFAULT: '#E8860C',
          light: '#F5A623',
          dark: '#C2690A',
        },
        success: '#0F9D58',
        warning: '#F29D0B',
        error: '#D93025',
        surface: '#F5F6F3',
        card: '#FFFFFF',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
