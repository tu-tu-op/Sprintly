import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/providers/**/*.{ts,tsx}",
    "./src/styles/**/*.{ts,tsx,css}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        "on-primary-container": "#340080",
        "error-container": "#93000a",
        "glass-border": "rgba(255, 255, 255, 0.1)",
        "on-surface": "#e5e2e1",
        "outline-variant": "#494454",
        "on-tertiary-fixed-variant": "#653e00",
        "surface-container-lowest": "#0e0e0e",
        "surface-container": "#201f1f",
        "tertiary-fixed": "#ffddb8",
        "primary-container": "#a078ff",
        "on-error-container": "#ffdad6",
        "on-background": "#e5e2e1",
        "on-error": "#690005",
        "on-tertiary-fixed": "#2a1700",
        "on-secondary-fixed": "#001f26",
        "surface-bright": "#3a3939",
        "on-tertiary": "#472a00",
        "inverse-primary": "#6d3bd7",
        surface: "#131313",
        "surface-variant": "#353534",
        "inverse-surface": "#e5e2e1",
        "indigo-accent": "#6366F1",
        "on-primary": "#3c0091",
        "inverse-on-surface": "#313030",
        tertiary: "#ffb95f",
        "surface-container-highest": "#353534",
        "surface-graphite": "#171717",
        "on-surface-variant": "#cbc3d7",
        "surface-container-low": "#1c1b1b",
        "primary-fixed": "#e9ddff",
        "secondary-fixed": "#acedff",
        "secondary-container": "#03b5d3",
        "tertiary-container": "#ca8100",
        "on-primary-fixed-variant": "#5516be",
        "on-tertiary-container": "#3e2400",
        error: "#ffb4ab",
        "on-primary-fixed": "#23005c",
        "success-streak": "#22C55E",
        "on-secondary-fixed-variant": "#004e5c",
        "secondary-fixed-dim": "#4cd7f6",
        "surface-tint": "#d0bcff",
        "on-secondary-container": "#00424e",
        "surface-container-high": "#2a2a2a",
        "tertiary-fixed-dim": "#ffb95f",
        "surface-elevated": "#262626",
        outline: "#958ea0",
        "on-secondary": "#003640",
        "primary-fixed-dim": "#d0bcff",
        "surface-dim": "#131313",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "0.5rem",
        full: "0.75rem",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Chivo", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist", "ui-monospace", "SFMono-Regular", "monospace"],
        "display-lg": ["Chivo", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "body-md": ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "body-sm": ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "body-lg": ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "headline-lg-mobile": ["Chivo", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "label-sm-mono": ["Geist", "ui-monospace", "SFMono-Regular", "monospace"],
        "headline-md": ["Chivo", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "headline-lg": ["Chivo", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "label-md": ["Geist", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "display-lg": [
          "48px",
          {
            lineHeight: "56px",
            letterSpacing: "-0.02em",
            fontWeight: "800",
          },
        ],
        "body-md": [
          "16px",
          {
            lineHeight: "24px",
            fontWeight: "400",
          },
        ],
        "body-sm": [
          "14px",
          {
            lineHeight: "20px",
            fontWeight: "400",
          },
        ],
        "body-lg": [
          "18px",
          {
            lineHeight: "28px",
            fontWeight: "400",
          },
        ],
        "headline-lg-mobile": [
          "24px",
          {
            lineHeight: "32px",
            fontWeight: "700",
          },
        ],
        "label-sm-mono": [
          "12px",
          {
            lineHeight: "16px",
            letterSpacing: "0.05em",
            fontWeight: "500",
          },
        ],
        "headline-md": [
          "24px",
          {
            lineHeight: "32px",
            fontWeight: "600",
          },
        ],
        "headline-lg": [
          "32px",
          {
            lineHeight: "40px",
            letterSpacing: "-0.01em",
            fontWeight: "700",
          },
        ],
        "label-md": [
          "14px",
          {
            lineHeight: "20px",
            letterSpacing: "0.02em",
            fontWeight: "500",
          },
        ],
      },
      spacing: {
        unit: "4px",
        "margin-mobile": "16px",
        "margin-desktop": "32px",
        "container-max": "1440px",
        "sidebar-width": "260px",
        gutter: "24px",
      },
      boxShadow: {
        shell: "0 1px 0 rgba(255,255,255,0.06)",
        panel: "0 20px 60px rgba(0,0,0,0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
