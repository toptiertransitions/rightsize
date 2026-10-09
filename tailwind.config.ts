import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // CSS variables (defaults in app/globals.css = the original Top Tier
        // greens) so a community brand can recolor the app (lib/brands).
        forest: {
          DEFAULT: "rgb(var(--forest-600) / <alpha-value>)",
          50: "rgb(var(--forest-50) / <alpha-value>)",
          100: "rgb(var(--forest-100) / <alpha-value>)",
          200: "rgb(var(--forest-200) / <alpha-value>)",
          300: "rgb(var(--forest-300) / <alpha-value>)",
          400: "rgb(var(--forest-400) / <alpha-value>)",
          500: "rgb(var(--forest-500) / <alpha-value>)",
          600: "rgb(var(--forest-600) / <alpha-value>)",
          700: "rgb(var(--forest-700) / <alpha-value>)",
          800: "rgb(var(--forest-800) / <alpha-value>)",
          900: "rgb(var(--forest-900) / <alpha-value>)",
        },
        // Accent color for a brand's secondary color; defaults to forest.
        accent: {
          DEFAULT: "rgb(var(--accent-600) / <alpha-value>)",
          50: "rgb(var(--accent-50) / <alpha-value>)",
          100: "rgb(var(--accent-100) / <alpha-value>)",
          200: "rgb(var(--accent-200) / <alpha-value>)",
          300: "rgb(var(--accent-300) / <alpha-value>)",
          400: "rgb(var(--accent-400) / <alpha-value>)",
          500: "rgb(var(--accent-500) / <alpha-value>)",
          600: "rgb(var(--accent-600) / <alpha-value>)",
          700: "rgb(var(--accent-700) / <alpha-value>)",
          800: "rgb(var(--accent-800) / <alpha-value>)",
          900: "rgb(var(--accent-900) / <alpha-value>)",
        },
        cream: {
          DEFAULT: "#F5F0E8",
          50: "#fdfcfa",
          100: "#F5F0E8",
          200: "#ece3d1",
          300: "#ddd1b8",
          400: "#ccb99a",
          500: "#b89e7a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
