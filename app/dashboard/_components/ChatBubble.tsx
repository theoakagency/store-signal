'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface MinMessage {
  role: 'user' | 'assistant'
  content: string
}

function renderTextPreview(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/#{1,3}\s/g, '')
    .replace(/^[-•]\s/gm, '')
    .slice(0, 200)
}

export default function ChatBubble() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<MinMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [toolMessage, setToolMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ALL hooks must be declared before any conditional returns

  useEffect(() => {
    const saved = localStorage.getItem('ss_bubble_open')
    if (saved === 'true') setIsOpen(true)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 200)
  }, [isOpen])

  const toggleOpen = () => {
    setIsOpen((prev) => {
      localStorage.setItem('ss_bubble_open', String(!prev))
      return !prev
    })
  }

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setIsLoading(true)
    setStreamingText('')
    setToolMessage('')

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      if (!res.ok || !res.body) {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Try the full chat →' }])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; delta?: string; status_message?: string }
            if (event.type === 'text_delta') {
              accumulated += event.delta ?? ''
              setStreamingText(accumulated)
              setToolMessage('')
            } else if (event.type === 'tool_start') {
              setToolMessage(event.status_message ?? 'Fetching data…')
            } else if (event.type === 'tool_end') {
              setToolMessage('')
            }
          } catch { /* ignore */ }
        }
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])
      setStreamingText('')
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Network error — please try again.' }])
    } finally {
      setIsLoading(false)
      setStreamingText('')
      setToolMessage('')
    }
  }, [isLoading])

  // Don't render on the full chat page — AFTER all hooks
  if (pathname === '/dashboard/chat') return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Slide-up panel */}
      {isOpen && (
        <div
          className="w-[380px] rounded-2xl bg-white shadow-2xl border border-cream-2 flex flex-col overflow-hidden"
          style={{ height: '520px', animation: 'bubbleSlideUp 0.2s ease-out' }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-cream-2 px-4 py-3 bg-charcoal">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
              </span>
              <span className="font-display text-sm font-semibold text-cream">Store Signal AI</span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/chat"
                className="text-[10px] font-medium text-cream/40 hover:text-teal transition"
              >
                Open full chat →
              </Link>
              <button
                onClick={toggleOpen}
                className="flex h-6 w-6 items-center justify-center rounded text-cream/40 hover:text-cream transition"
              >
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6h8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-cream">
            {messages.length === 0 && !isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <p className="text-sm font-display font-semibold text-ink">Ask me anything</p>
                <p className="mt-1 text-xs text-ink-3">Revenue, customers, campaigns, ads — I have access to all your data.</p>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-teal text-white font-display italic rounded-br-sm'
                          : 'bg-white text-ink rounded-bl-sm border border-cream-2 shadow-sm'
                      }`}
                    >
                      {renderTextPreview(msg.content)}
                    </div>
                  </div>
                ))}

                {toolMessage && (
                  <div className="flex items-center gap-1.5 pl-1">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75" />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-teal" />
                    </span>
                    <span className="font-display italic text-xs text-ink-3">{toolMessage}</span>
                  </div>
                )}

                {streamingText && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-white px-3 py-2 text-xs text-ink border border-cream-2 shadow-sm">
                      {renderTextPreview(streamingText)}
                      <span className="inline-block h-3 w-0.5 bg-teal ml-0.5 animate-pulse" />
                    </div>
                  </div>
                )}

                {isLoading && !streamingText && !toolMessage && (
                  <div className="flex justify-start">
                    <div className="rounded-xl rounded-bl-sm bg-white px-3 py-2 border border-cream-2 shadow-sm">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="h-1.5 w-1.5 rounded-full bg-teal animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-cream-2 p-3 bg-white">
            <div className="flex items-center gap-2 rounded-xl border border-cream-2 bg-cream px-3 py-2 focus-within:border-teal/50 transition">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(input) }}
                placeholder="Ask anything about your business…"
                disabled={isLoading}
                className="flex-1 bg-transparent text-xs text-ink placeholder-ink-3 outline-none disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={isLoading || !input.trim()}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal text-white hover:bg-teal-dark disabled:opacity-40 transition"
              >
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6h8M6 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bubble toggle button */}
      <button
        onClick={toggleOpen}
        title="Ask Store Signal AI"
        className={`group flex h-[52px] w-[52px] items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 ${
          isOpen ? 'bg-charcoal' : 'bg-teal'
        }`}
      >
        {isOpen ? (
          <svg className="h-5 w-5 text-cream" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 6h12" strokeLinecap="round" />
          </svg>
        ) : (
          <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2.5 21.5l4.5-.838A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 12h.01M12 12h.01M16 12h.01" strokeLinecap="round" />
          </svg>
        )}
      </button>

      <style>{`
        @keyframes bubbleSlideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
