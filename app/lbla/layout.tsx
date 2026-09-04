import LblaTopbar from './_components/LblaTopbar'
import { LblaAccessProvider } from './_components/LblaAccessProvider'
import { getLblaAccess } from '@/lib/lblaAuth'

export const metadata = {
  title: 'LBLA Team Tools',
}

export default async function LblaLayout({ children }: { children: React.ReactNode }) {
  // Resolved once here so client pages can hide links to tools the user lacks.
  const access = await getLblaAccess()

  return (
    <LblaAccessProvider value={access}>
      <div className="flex min-h-screen flex-col bg-cream">
        <LblaTopbar />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </LblaAccessProvider>
  )
}
