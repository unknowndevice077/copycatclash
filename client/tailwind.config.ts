import type { Config } from 'tailwindcss';

/** Theme tokens: arcade-meets-sketchbook. Colors are CSS variables so high-contrast mode can swap them. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: 'rgb(var(--c-night) / <alpha-value>)',
        night2: 'rgb(var(--c-night2) / <alpha-value>)',
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        paperdim: 'rgb(var(--c-paperdim) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        coral: 'rgb(var(--c-coral) / <alpha-value>)',
        volt: 'rgb(var(--c-volt) / <alpha-value>)',
        sun: 'rgb(var(--c-sun) / <alpha-value>)',
        mint: 'rgb(var(--c-mint) / <alpha-value>)',
        grape: 'rgb(var(--c-grape) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Lilita One"', '"Bangers"', 'system-ui', 'sans-serif'],
        body: ['Nunito', 'system-ui', 'sans-serif'],
      },
      borderWidth: { 3: '3px', 5: '5px' },
      boxShadow: {
        chunky: '0 6px 0 0 rgb(var(--c-ink))',
        'chunky-sm': '0 3px 0 0 rgb(var(--c-ink))',
        'chunky-lg': '0 10px 0 0 rgb(var(--c-ink))',
        glowA: '0 0 0 4px rgb(var(--c-coral) / 0.5), 0 0 40px 8px rgb(var(--c-coral) / 0.55)',
        glowB: '0 0 0 4px rgb(var(--c-volt) / 0.5), 0 0 40px 8px rgb(var(--c-volt) / 0.55)',
      },
      borderRadius: { blob: '28px 22px 30px 20px / 22px 30px 20px 28px' },
      keyframes: {
        wiggle: { '0%,100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg)' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        shake: {
          '0%,100%': { transform: 'translate(0,0)' },
          '20%': { transform: 'translate(-8px,4px)' },
          '40%': { transform: 'translate(7px,-5px)' },
          '60%': { transform: 'translate(-5px,-3px)' },
          '80%': { transform: 'translate(4px,5px)' },
        },
      },
      animation: {
        wiggle: 'wiggle 1.2s ease-in-out infinite',
        floaty: 'floaty 3s ease-in-out infinite',
        shake: 'shake 0.5s ease-in-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
