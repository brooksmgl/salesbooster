import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}', './lib/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--sb-color-background) / <alpha-value>)',
        foreground: 'rgb(var(--sb-color-foreground) / <alpha-value>)',
        muted: 'rgb(var(--sb-color-muted) / <alpha-value>)',
        accent: 'rgb(var(--sb-color-accent) / <alpha-value>)',
        accentMuted: 'rgb(var(--sb-color-accent-muted) / <alpha-value>)',
        border: 'rgb(var(--sb-color-border) / <alpha-value>)',
        panel: 'rgb(var(--sb-color-panel) / <alpha-value>)',
        danger: 'rgb(var(--sb-color-danger) / <alpha-value>)',
      },
      borderRadius: {
        xl: '12px',
      },
    },
  },
  plugins: [],
};

export default config;
