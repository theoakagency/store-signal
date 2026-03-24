'use client'

import { useRouter } from 'next/navigation'

interface AskAiRowProps {
  prompts: string[]
  label?: string
}

/**
 * A row of "Ask AI" prompt pills that navigate to /dashboard/chat?q=<prompt>
 */
export default function AskAiRow({ prompts, label = 'Ask AI' }: AskAiRowProps) {
  const router = useRouter()

  const handleClick = (prompt: string) => {
    router.push(`/dashboard/chat?q=${encodeURIComponent(prompt)}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-data text-[10px] uppercase tracking-widest text-ink-3 mr-1">{label}</span>
      {prompts.map((prompt) => (
        <button
          key={prompt}
          onClick={() => handleClick(prompt)}
          className="inline-flex items-center gap-1.5 rounded-full border border-teal/25 bg-teal/5 px-3 py-1.5 text-xs font-medium text-teal hover:bg-teal hover:text-white transition"
        >
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1l1.2 3.8H11l-3 2.2 1.2 3.8L6 8.5l-3.2 2.3L4 7 1 4.8h3.8L6 1z" />
          </svg>
          {prompt}
        </button>
      ))}
    </div>
  )
}
