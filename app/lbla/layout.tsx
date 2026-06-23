import LblaTopbar from './_components/LblaTopbar'

export const metadata = {
  title: 'LashBox LA Team Tools',
}

export default function LblaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <LblaTopbar />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
