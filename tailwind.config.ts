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
				primary: "#6E3BB5",
				"primary-container": "#834ACB",
				"on-primary": "#FFFFFF",
				"on-primary-container": "#F1E7FC",

				// DotTime reference accents: lilac panels and the coral stat card
				lilac: "#F1E7FC",
				"lilac-soft": "#FDF4FE",
				coral: "#E66F72",

				// Secondary
				secondary: "#5B5B66",
				"secondary-container": "#F1E7FC",
				"on-secondary-container": "#4B2A86",

				// Tertiary
				tertiary: "#B8434B",
				"tertiary-container": "#D6535B",

				// Error
				error: "#BA1A1A",
				"error-container": "#FFDAD6",
				"on-error-container": "#93000A",

				// Success and warning (W8 status tokens)
				success: "#1B6D3C",
				"on-success": "#FFFFFF",
				"success-container": "#C9F2D5",
				"on-success-container": "#0B3D20",
				warning: "#7A5900",
				"on-warning": "#FFFFFF",
				"warning-container": "#FFE3A1",
				"on-warning-container": "#3F2E00",

				// Surface
				surface: "#FFFFFF",
				"surface-dim": "#E6E6E6",
				"surface-bright": "#FFFFFF",
				"surface-container-lowest": "#FFFFFF",
				"surface-container-low": "#F8F8F8",
				"surface-container": "#F3F3F3",
				"surface-container-high": "#EDEDED",
				"surface-container-highest": "#E6E6E6",
				"surface-variant": "#EDEDED",

				// Text
				"on-surface": "#0A0A0A",
				"on-surface-variant": "#525252",

				// Inverse (dark sidebar/shell)
				"inverse-surface": "#1C1C1E",
				"inverse-on-surface": "#F5F5F5",
				"inverse-primary": "#CDB2F0",

				// Outline
				outline: "#8C8C8C",
				"outline-variant": "#E6E6E6",

				// Background (shadcn compat)
				"on-background": "#0A0A0A",

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
				"on-secondary-fixed-variant": "#4B2A86",

				// Status — keep green-1 for small visual indicators (online dot)
				green: {
					1: "#00C48C",
				},
			},
			fontFamily: {
				sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
				mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
			},
			fontSize: {
				"display-lg": ["34px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "700" }],
				"display-lg-mobile": ["26px", { lineHeight: "32px", fontWeight: "700" }],
				"headline-md": ["24px", { lineHeight: "34px", letterSpacing: "-0.01em", fontWeight: "600" }],
				"headline-sm": ["20px", { lineHeight: "30px", fontWeight: "600" }],
				"body-lg": ["16px", { lineHeight: "26px", fontWeight: "400" }],
				"body-md": ["15px", { lineHeight: "24px", fontWeight: "400" }],
				"label-caps": ["12px", { lineHeight: "18px", letterSpacing: "0.06em", fontWeight: "700" }],
				"label-mono": ["13px", { lineHeight: "20px", letterSpacing: "0.01em", fontWeight: "500" }],
			},
			borderRadius: {
				card: "1.5rem",
				tray: "2rem",
			},
			boxShadow: {
				card: "0 1px 2px rgb(10 10 10 / 0.04), 0 8px 24px rgb(10 10 10 / 0.06)",
				float: "0 16px 48px rgb(131 74 203 / 0.18)",
			},
			keyframes: {
				marquee: {
					from: { transform: "translateX(0)" },
					to: { transform: "translateX(-50%)" },
				},
				"float-slow": {
					"0%, 100%": { transform: "translateY(0)" },
					"50%": { transform: "translateY(-8px)" },
				},
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
				marquee: "marquee 32s linear infinite",
				"float-slow": "float-slow 6s ease-in-out infinite",
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
