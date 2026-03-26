export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Metrics row */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 rounded bg-cream-3" />
          <div className="h-8 w-40 rounded-lg bg-cream-3" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-cream-3 bg-white px-5 py-5">
              <div className="h-3 w-20 rounded bg-cream-3" />
              <div className="mt-2 h-8 w-28 rounded-lg bg-cream-3" />
              <div className="mt-1.5 h-3 w-16 rounded bg-cream-3" />
            </div>
          ))}
        </div>
      </div>
      {/* AI insights skeleton */}
      <div className="rounded-2xl border border-cream-3 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-44 rounded-lg bg-cream-3" />
          <div className="h-8 w-28 rounded-lg bg-cream-3" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-cream-2 bg-cream p-4">
              <div className="h-3 w-20 rounded bg-cream-3 mb-2" />
              <div className="h-4 w-full rounded bg-cream-3 mb-1.5" />
              <div className="h-3 w-3/4 rounded bg-cream-3" />
            </div>
          ))}
        </div>
      </div>
      {/* Health score + revenue skeleton */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-cream-3 bg-white p-6 col-span-1">
          <div className="h-5 w-36 rounded-lg bg-cream-3 mb-4" />
          <div className="h-32 w-32 mx-auto rounded-full bg-cream-3" />
        </div>
        <div className="rounded-2xl border border-cream-3 bg-white p-6 col-span-2">
          <div className="h-5 w-40 rounded-lg bg-cream-3 mb-4" />
          <div className="h-28 w-full rounded-xl bg-cream-3" />
        </div>
      </div>
    </div>
  )
}
