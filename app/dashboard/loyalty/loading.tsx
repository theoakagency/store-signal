export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 rounded-lg bg-cream-3" />
          <div className="mt-1.5 h-3 w-28 rounded bg-cream-3" />
        </div>
        <div className="h-9 w-24 rounded-lg bg-cream-3" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-cream-3 bg-white p-5">
            <div className="h-3 w-24 rounded bg-cream-3" />
            <div className="mt-2 h-8 w-32 rounded-lg bg-cream-3" />
            <div className="mt-1.5 h-3 w-20 rounded bg-cream-3" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-cream-3 bg-white p-6">
        <div className="h-5 w-52 rounded-lg bg-cream-3 mb-5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-cream-3 bg-cream p-4">
              <div className="h-3 w-16 rounded bg-cream-3" />
              <div className="mt-1.5 h-7 w-20 rounded-lg bg-cream-3" />
              <div className="mt-1 h-3 w-24 rounded bg-cream-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
