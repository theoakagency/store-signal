export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 w-56 rounded-lg bg-cream-3" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-2xl border border-cream-3 bg-white p-5">
            <div className="h-3 w-20 rounded bg-cream-3" />
            <div className="mt-2 h-8 w-24 rounded-lg bg-cream-3" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-cream-3 bg-white p-6">
        <div className="h-5 w-44 rounded-lg bg-cream-3 mb-4" />
        <div className="h-48 w-full rounded-xl bg-cream-3" />
      </div>
      <div className="rounded-2xl border border-cream-3 bg-white p-6">
        <div className="h-5 w-36 rounded-lg bg-cream-3 mb-4" />
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-10 w-full rounded-lg bg-cream-3" />
          ))}
        </div>
      </div>
    </div>
  )
}
