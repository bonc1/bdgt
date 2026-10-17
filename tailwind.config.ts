import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        paper: {
          DEFAULT: "#f4f4f2",
          light: "#f8f8f7",
          card: "#ffffff",
          dim: "#ecece9",
          active: "#d6d6cf",
        },
        ink: {
          DEFAULT: "#282825",
          deep: "#0c0d0d",
          secondary: "#64645e",
          tertiary: "#8f8f89",
          border: "#c5c5ba",
        },
        brand: {
          green: "#529a6a",
          greenDeep: "#057b40",
          greenWash: "#e7f4eb",
          greenActive: "#b5e3c4",
          coral: "#eb5b55",
          coralWash: "#fdeeed",
          coralActive: "#fbc8c5",
          orange: "#f09236",
          orangeWash: "#fdeee0",
          orangeActive: "#faca9e",
          blue: "#2173be",
          blueWash: "#e1edfe",
          blueActive: "#b8d5ff",
          purple: "#c455eb",
          purpleWash: "#f6e6fc",
          purpleActive: "#edc6fb",
          yellow: "#ffe81a",
        },
      },
      boxShadow: {
        editorial:
          "0px 4px 8px 0px rgba(143, 143, 137, 0.12), 0px 0px 24px 0px rgba(143, 143, 137, 0.10)",
        sheet:
          "0 -7px 64px rgba(0, 0, 0, 0.08), 0 8px 32px rgba(0, 0, 0, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
