/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable prettier/prettier */
import type { Config } from "tailwindcss";

const config = {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: "2rem",
			screens: {
				"2xl": "1400px",
			},
		},
		extend: {
			colors: {
				border: "hsl(var(--border))",
				foreground: "hsl(var(--foreground))",
				background: "hsl(var(--background))",

				// Primary
				primary: "#6500C4",
				"primary-container": "#830EF9",
				"on-primary": "#FFFFFF",
				"on-primary-container": "#E9D5FF",

				// Secondary
				secondary: "#525B8E",
				"secondary-container": "#BBC3FD",
				"on-secondary-container": "#464F81",

				// Tertiary
				tertiary: "#7B3500",
				"tertiary-container": "#A04700",

				// Error
				error: "#BA1A1A",
				"error-container": "#FFDAD6",
				"on-error-container": "#93000A",

				// Surface
				surface: "#FAF8FF",
				"surface-dim": "#D7D9EA",
				"surface-bright": "#FAF8FF",
				"surface-container-lowest": "#FFFFFF",
				"surface-container-low": "#F3F2FF",
				"surface-container": "#EBEDFE",
				"surface-container-high": "#E6E7F8",
				"surface-container-highest": "#E0E1F3",
				"surface-variant": "#E0E1F3",

				// Text
				"on-surface": "#181B27",
				"on-surface-variant": "#4C4356",

				// Inverse (dark sidebar/shell)
				"inverse-surface": "#2D303D",
				"inverse-on-surface": "#EFF0FF",
				"inverse-primary": "#D7BAFF",

				// Outline
				outline: "#7D7388",
				"outline-variant": "#CEC2D9",

				// Background (shadcn compat)
				"on-background": "#181B27",

				// Shadcn semantic tokens — wired to :root CSS custom properties
				// so bg-popover / text-popover-foreground / bg-accent /
				// text-accent-foreground / bg-muted utilities resolve correctly
				// (P13.10: these color keys were missing, leaving dropdowns unstyled).
				"popover": "hsl(var(--popover))",
				"popover-foreground": "hsl(var(--popover-foreground))",
				"accent": "hsl(var(--accent))",
				"accent-foreground": "hsl(var(--accent-foreground))",
				"muted": "hsl(var(--muted))",
				"muted-foreground": "hsl(var(--muted-foreground))",

				// Sidebar active nav fill (Material 3 token from locked design)
				"on-secondary-fixed-variant": "#3A4375",

				// Status — keep green-1 for small visual indicators (online dot)
				green: {
					1: "#00C48C",
				},
			},
			fontFamily: {
				sans: ["var(--font-hanken-grotesk)", "ui-sans-serif", "system-ui", "sans-serif"],
				mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
			},
			fontSize: {
				"display-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }],
				"display-lg-mobile": ["26px", { lineHeight: "32px", fontWeight: "700" }],
				"headline-md": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
				"headline-sm": ["20px", { lineHeight: "28px", fontWeight: "600" }],
				"body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
				"body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
				"label-caps": ["11px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "700" }],
				"label-mono": ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "500" }],
			},
			keyframes: {
				"accordion-down": {
					from: { height: "0" },
					to: { height: "var(--radix-accordion-content-height)" },
				},
				"accordion-up": {
					from: { height: "var(--radix-accordion-content-height)" },
					to: { height: "0" },
				},
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
			},
			backgroundImage: {
				hero: "url('/images/hero-background.png')",
			},
		},
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
