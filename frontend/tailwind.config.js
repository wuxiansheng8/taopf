/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bgDark: "#080b10",
        cardBg: "rgba(20, 26, 38, 0.45)",
        cardBorder: "rgba(255, 255, 255, 0.06)",
        accentBlue: "#3b82f6",
        accentGreen: "#10b981",
        accentRed: "#ef4444",
        accentYellow: "#f59e0b"
      },
      fontFamily: {
        sans: ["Outfit", "Noto Sans SC", "sans-serif"]
      }
    },
  },
  plugins: [],
}
