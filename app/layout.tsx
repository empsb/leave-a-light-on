import type { Metadata, Viewport } from "next"
import { Bitcount_Single, Geist_Mono } from "next/font/google"
import "./globals.css"

const bitcountSingle = Bitcount_Single({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-bitcount-single",
})

const geistMono = Geist_Mono({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-geist-mono",
})

export const metadata: Metadata = {
    metadataBase: new URL("https://leave-a-light-on-rho.vercel.app"),

    title: "Leave a Light On",
    description:
        "Read a note from a stranger. Leave a light on for the next person.",

    applicationName: "Leave a Light On",

    openGraph: {
        title: "Leave a Light On",
        description:
            "Read a note from a stranger. Leave a light on for the next person.",
        type: "website",
        siteName: "Leave a Light On",
    },

    twitter: {
        card: "summary_large_image",
        title: "Leave a Light On",
        description:
            "Read a note from a stranger. Leave a light on for the next person.",
    },
}

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: "#060a33",
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html
            lang="en"
            className={`${bitcountSingle.variable} ${geistMono.variable}`}
        >
            <body>{children}</body>
        </html>
    )
}
