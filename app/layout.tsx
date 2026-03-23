import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Store Signal',
  description: 'Shopify analytics for high-growth brands',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  )
}
