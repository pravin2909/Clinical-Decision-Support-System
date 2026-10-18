/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (flip in dark mode via CSS variables)
        app: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        surface2: "rgb(var(--surface-2) / <alpha-value>)",
        content: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--text-muted) / <alpha-value>)",
        line: "rgb(var(--border) / <alpha-value>)",

        // Primary — neutral slate (monochrome base)
        brand: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
        // The primary accent — clinical green (#36B76B)
        accent: {
          50: "#ecfaf1",
          100: "#d4f1e0",
          200: "#a8e4c3",
          300: "#71d19f",
          400: "#4ac07e",
          500: "#36b76b",
          600: "#2a9d59",
          700: "#238049",
          800: "#1f6a3e",
          900: "#184f30",
        },
        // Secondary accent — warm amber (#F4A13A) for alt metrics / warnings
        secondary: {
          50: "#fef6ec",
          100: "#fdead0",
          200: "#fbd49c",
          300: "#f8bc68",
          400: "#f6ab4b",
          500: "#f4a13a",
          600: "#df8921",
          700: "#b96b1b",
          800: "#92551d",
          900: "#78461c",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        soft: "0 4px 16px rgba(16,24,40,0.06)",
      },
    },
  },
  plugins: [],
};
