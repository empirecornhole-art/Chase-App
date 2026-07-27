/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ledger: {
          bg: '#F6F4EF',
          ink: '#1C2B24',
          paper: '#FFFFFF',
          rule: '#DAD5C7',
          green: '#2F5D45',
          greenDeep: '#1E3D2C',
          rust: '#B5502F',
          gold: '#B08C3E',
          muted: '#7A7A6E',
        },
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
