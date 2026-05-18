/** @type {import('tailwindcss').Config} */

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],

  theme: {
    extend: {
      screens: {
        mq450: { max: "450px" },
        mq675: { max: "675px" },
        mq800: { max: "800px" },
      },

      colors: {
        primary: {
          500: "#4f46e5",
          600: "#4338ca",
        },

        secondary: {
          100: "#f3f4f6",
          200: "#e5e7eb",
          400: "#9ca3af",
          500: "#6b7280",
          700: "#374151",
        },
      },

      boxShadow: {
        modal: "0px 20px 60px rgba(16,24,40,0.18)",
      },

      borderRadius: {
        "4xl": "32px",
      },
    },
  },

  plugins: [],
};