/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        steppe: {
          sky: "var(--steppe-sky)",
          night: "var(--steppe-night)",
          gold: "var(--steppe-gold)",
          amber: "var(--steppe-amber)",
          earth: "var(--steppe-earth)",
          rust: "var(--steppe-rust)",
          sage: "var(--steppe-sage)",
          cream: "var(--steppe-cream)",
          smoke: "var(--steppe-smoke)",
          shadow: "var(--steppe-shadow)",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
