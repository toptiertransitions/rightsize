import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: "#2E6B4F",
          50: "#f0f7f4",
          100: "#daeee5",
          200: "#b7ddcc",
          300: "#8cc5ae",
          400: "#5fa78a",
          500: "#3e8b6e",
          600: "#2E6B4F",
          700: "#255840",
          800: "#204834",
          900: "#1c3c2c",
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
