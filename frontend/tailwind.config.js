/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],

  // Force light mode — never inherit OS dark mode
  darkMode: 'class',

  theme: {
    extend: {
      // ── Color Palette ──────────────────────────────────────
      colors: {
        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        pension: {
          light: "#fef9c3",
          mid:   "#fbbf24",
          dark:  "#d97706",
        },
        liquid: {
          light: "#d1fae5",
          mid:   "#10b981",
          dark:  "#047857",
        },
        risk: {
          light: "#fee2e2",
          mid:   "#f87171",
          dark:  "#dc2626",
        },
        grace: {
          light: "#fffbeb",
          mid:   "#f59e0b",
          dark:  "#b45309",
        },
      },

      // ── Typography ─────────────────────────────────────────
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body:    ["Nunito", "sans-serif"],
        mono:    ["JetBrains Mono", "monospace"],
      },

      // ── Border radius ──────────────────────────────────────
      borderRadius: {
        "xl":  "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },

      // ── Shadows ────────────────────────────────────────────
      boxShadow: {
        "card":       "0 2px 12px -2px rgba(79, 70, 229, 0.08), 0 1px 4px -1px rgba(0,0,0,0.04)",
        "card-hover": "0 8px 24px -4px rgba(79, 70, 229, 0.16), 0 2px 8px -2px rgba(0,0,0,0.06)",
        "vault":      "0 16px 48px -8px rgba(79, 70, 229, 0.45), 0 4px 16px -4px rgba(0,0,0,0.12)",
        "action":     "0 8px 20px -4px rgba(79, 70, 229, 0.5)",
      },

      // ── Animation ──────────────────────────────────────────
      animation: {
        "pulse-slow":     "pulse 3s ease-in-out infinite",
        "bounce-gentle":  "bounce 2s ease-in-out infinite",
        "spin-slow":      "spin 3s linear infinite",
        "fade-up":        "fadeUp 0.4s ease-out",
        "slide-in":       "slideIn 0.3s ease-out",
        "shimmer":        "shimmer 1.4s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%":   { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },

      // ── Spacing ────────────────────────────────────────────
      spacing: {
        safe: "env(safe-area-inset-bottom, 16px)",
      },

      // ── Screen sizes ───────────────────────────────────────
      screens: {
        xs: "375px",
        sm: "390px",
        md: "430px",
      },
    },
  },
  plugins: [],
};
