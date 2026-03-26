export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 rounded-lg bg-cream-3" />
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-24 rounded-lg bg-cream-3" />
        ))}
      </div>
      <div className="rounded-2xl border border-cream-3 bg-white p-6">
        <div className="h-5 w-40 rounded-lg bg-cream-3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 flex-1 rounded bg-cream-3" />
              <div className="h-4 w-20 rounded bg-cream-3" />
              <div className="h-4 w-16 rounded bg-cream-3" />
              <div className="h-4 w-16 rounded bg-cream-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
