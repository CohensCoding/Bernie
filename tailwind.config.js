/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'hsl(222 47% 6%)',
          muted: 'hsl(222 35% 9%)',
          elevated: 'hsl(222 28% 12%)'
        },
        fg: {
          DEFAULT: 'hsl(210 40% 98%)',
          muted: 'hsl(215 20% 70%)'
        },
        border: 'hsl(217 19% 22%)',
        accent: {
          DEFAULT: 'hsl(156 72% 45%)',
          muted: 'hsl(156 72% 35%)'
        }
      }
    },
  },
  plugins: [],
}

