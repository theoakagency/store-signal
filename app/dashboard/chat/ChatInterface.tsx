'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
  suggestions?: string[]
}

interface ToolStatus {
  tool: string
  message: string
}

const SUGGESTED_PROMPTS = [
  'Why are sales declining?',
  'Who are my top 10 customers?',
  'Which email campaigns are working?',
  'What should I do with my ad budget?',
  'Which promotions are worth running?',
  'How is my organic search performing?',
  'Which customers are at risk of churning?',
  "What's my most profitable product?",
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 60) return mins <= 1 ? 'Just now' : `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function groupConversations(convs: Conversation[]): Record<string, Conversation[]> {
  const groups: Record<string, Conversation[]> = { Today: [], Yesterday: [], 'This week': [], Older: [] }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const weekAgo = today - 7 * 86400000

  for (const c of convs) {
    const t = new Date(c.updated_at).getTime()
    if (t >= today) groups.Today.push(c)
    else if (t >= yesterday) groups.Yesterday.push(c)
    else if (t >= weekAgo) groups['This week'].push(c)
    else groups.Older.push(c)
  }

  return groups
}

// ── Markdown renderer (simple inline) ─────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Headings
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={i} className="font-display text-sm font-semibold text-ink mt-3 mb-1">{line.slice(4)}</h3>)
    } else if (line.startsWith('## ')) {
      nodes.push(<h2 key={i} className="font-display text-base font-semibold text-ink mt-4 mb-1">{line.slice(3)}</h2>)
    } else if (line.startsWith('**') && line.endsWith('**')) {
      nodes.push(<p key={i} className="font-semibold text-ink mb-1">{line.slice(2, -2)}</p>)
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      // Bullet list — collect consecutive items
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('• '))) {
        items.push(lines[i].slice(2))
        i++
      }
      nodes.push(
        <ul key={i} className="list-none space-y-1 my-2">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    } else if (/^\d+\.\s/.test(line)) {
      // Numbered list
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      nodes.push(
        <ol key={i} className="list-none space-y-1 my-2">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2 text-sm">
              <span className="shrink-0 font-data text-[10px] font-semibold text-teal bg-teal/10 rounded px-1.5 py-0.5 h-fit mt-0.5">{j + 1}</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      )
      continue
    } else if (line.startsWith('|')) {
      // Table
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!lines[i].includes('---')) {
          rows.push(lines[i].split('|').filter((c) => c.trim()).map((c) => c.trim()))
        }
        i++
      }
      if (rows.length > 0) {
        nodes.push(
          <div key={i} className="overflow-x-auto my-3 rounded-xl border border-cream-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-cream-2">
                  {rows[0].map((h, j) => (
                    <th key={j} className="px-3 py-2 text-left font-data font-semibold text-ink-2 uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, j) => (
                  <tr key={j} className="border-t border-cream-2 even:bg-cream/50">
                    {row.map((cell, k) => (
                      <td key={k} className="px-3 py-2 text-ink">{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    } else if (line === '') {
      nodes.push(<div key={i} className="h-2" />)
    } else {
      nodes.push(<p key={i} className="text-sm leading-relaxed mb-1">{renderInline(line)}</p>)
    }

    i++
  }

  return <>{nodes}</>
}

function renderInline(text: string): React.ReactNode {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*|\$[\d,]+\.?\d*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
        }
        if (/^\$[\d,]+/.test(part)) {
          return <span key={i} className="font-semibold text-teal-deep">{part}</span>
        }
        return part
      })}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatInterface({
  initialConversationId,
  initialQuestion,
}: {
  initialConversationId?: string
  initialQuestion?: string
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId ?? null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeConv = conversations.find((c) => c.id === activeConvId)

  // ── Load conversations ────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/agent/conversations')
    if (res.ok) {
      const data = await res.json() as { conversations: Conversation[] }
      setConversations(data.conversations)
    }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Auto-send initial question from URL param
  const initialSentRef = useRef(false)
  useEffect(() => {
    if (initialQuestion && !initialSentRef.current) {
      initialSentRef.current = true
      sendMessage(initialQuestion)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion])

  // ── Load messages for active conversation ─────────────────────────────────
  useEffect(() => {
    if (!activeConvId) {
      setMessages([])
      return
    }

    const fetchMessages = async () => {
      const res = await fetch(`/api/agent/conversations/${activeConvId}/messages`)
      if (res.ok) {
        const data = await res.json() as { messages: { id: string; role: 'user' | 'assistant'; content: string }[] }
        setMessages(data.messages.map((m) => ({ ...m })))
      }
    }
    fetchMessages()
  }, [activeConvId])

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, toolStatus])

  // ── Textarea auto-resize ──────────────────────────────────────────────────
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setStreamingText('')
    setToolStatus(null)

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversation_id: activeConvId }),
      })

      if (!res.ok || !res.body) {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulatedText = ''
      let conversationId = activeConvId
      let toolsUsed: string[] = []
      let suggestions: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string
              delta?: string
              tool?: string
              status_message?: string
              conversation_id?: string
              tools_used?: string[]
              suggestions?: string[]
              title?: string
            }

            switch (event.type) {
              case 'text_delta':
                accumulatedText += event.delta ?? ''
                setStreamingText(accumulatedText)
                setToolStatus(null)
                break
              case 'tool_start':
                setToolStatus({ tool: event.tool ?? '', message: event.status_message ?? 'Fetching data…' })
                break
              case 'tool_end':
                setToolStatus(null)
                break
              case 'title_update':
                if (event.conversation_id && event.title) {
                  setConversations((prev) =>
                    prev.map((c) => c.id === event.conversation_id ? { ...c, title: event.title! } : c)
                  )
                }
                break
              case 'suggestions':
                suggestions = event.suggestions ?? []
                break
              case 'done':
                if (event.conversation_id) conversationId = event.conversation_id
                toolsUsed = event.tools_used ?? []
                break
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      // Finalize: replace streaming text with persisted message
      const assistantMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: accumulatedText,
        toolsUsed,
        suggestions,
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamingText('')

      // Update active conversation or switch to new one
      if (conversationId && conversationId !== activeConvId) {
        setActiveConvId(conversationId)
      }
      await loadConversations()
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${(err as Error).message}`,
      }])
    } finally {
      setIsLoading(false)
      setToolStatus(null)
      setStreamingText('')
    }
  }, [activeConvId, isLoading, loadConversations])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const startNewConversation = () => {
    setActiveConvId(null)
    setMessages([])
    setStreamingText('')
    setToolStatus(null)
  }

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/agent/conversations?id=${id}`, { method: 'DELETE' })
    if (activeConvId === id) startNewConversation()
    setConversations((prev) => prev.filter((c) => c.id !== id))
  }

  const saveTitle = async () => {
    if (!activeConvId || !titleDraft.trim()) { setEditingTitle(false); return }
    await fetch('/api/agent/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeConvId, title: titleDraft }),
    })
    setConversations((prev) =>
      prev.map((c) => c.id === activeConvId ? { ...c, title: titleDraft } : c)
    )
    setEditingTitle(false)
  }

  const grouped = groupConversations(conversations)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex -mx-4 -my-6 sm:-mx-6 lg:-mx-8" style={{ height: 'calc(100vh - 58px)' }}>
      {/* ── Conversation sidebar ─────────────────────────────────────────── */}
      <aside className={`${sidebarOpen ? 'w-[280px]' : 'w-0'} shrink-0 bg-charcoal flex flex-col transition-all duration-200 overflow-hidden`}>
        {/* New conversation */}
        <div className="p-3 border-b border-white/[0.06]">
          <button
            onClick={startNewConversation}
            className="w-full rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark transition flex items-center justify-center gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
            New conversation
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-cream/30">No conversations yet</p>
          ) : (
            Object.entries(grouped).map(([group, convs]) =>
              convs.length === 0 ? null : (
                <div key={group}>
                  <div className="px-4 py-2">
                    <p className="text-[10px] font-data uppercase tracking-widest text-cream/25">{group}</p>
                  </div>
                  {convs.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => setActiveConvId(conv.id)}
                      className={`group relative mx-2 mb-0.5 cursor-pointer rounded-lg px-3 py-2.5 transition ${
                        activeConvId === conv.id ? 'bg-white/10' : 'hover:bg-white/[0.06]'
                      }`}
                    >
                      <p className={`truncate text-sm font-medium ${activeConvId === conv.id ? 'text-cream' : 'text-cream/70'}`}>
                        {conv.title ?? 'Untitled conversation'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-cream/30">{relativeTime(conv.updated_at)}</p>
                      <button
                        onClick={(e) => deleteConversation(conv.id, e)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center h-6 w-6 rounded text-cream/30 hover:text-red-400 hover:bg-white/10 transition"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )
            )
          )}
        </div>

        {/* Sidebar footer */}
        <div className="border-t border-white/[0.06] p-3">
          <p className="text-[10px] font-data uppercase tracking-widest text-cream/20 text-center">Store Signal AI</p>
        </div>
      </aside>

      {/* ── Main chat area ────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-w-0 flex-col bg-cream">
        {/* Header */}
        <div className="flex h-[58px] shrink-0 items-center gap-3 border-b border-cream-2 bg-white px-4 shadow-sm">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-cream hover:text-ink transition"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                className="w-full bg-transparent font-display text-sm font-semibold text-ink outline-none border-b border-teal"
              />
            ) : (
              <button
                onClick={() => { setTitleDraft(activeConv?.title ?? ''); setEditingTitle(true) }}
                className="font-display text-sm font-semibold text-ink hover:text-teal transition truncate block max-w-full text-left"
                title="Click to rename"
              >
                {activeConv?.title ?? (messages.length > 0 ? 'New Conversation' : 'Store Signal AI')}
              </button>
            )}
          </div>

          <Link
            href="/dashboard"
            className="text-xs text-ink-3 hover:text-teal transition font-medium hidden sm:block"
          >
            ← Dashboard
          </Link>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 && !isLoading ? (
            /* Empty state — suggested prompts */
            <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto">
              <div className="mb-6">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal/10">
                  <svg className="h-7 w-7 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2.5 21.5l4.5-.838A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8 12h.01M12 12h.01M16 12h.01" strokeLinecap="round" />
                  </svg>
                </div>
                <h2 className="font-display text-xl font-bold text-ink">Store Signal AI</h2>
                <p className="mt-1 text-sm text-ink-3">Ask anything about your business. I have access to your Shopify, Klaviyo, Meta Ads, and more.</p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 w-full">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="rounded-xl border border-cream-2 bg-white px-4 py-3 text-left text-sm text-ink-2 hover:border-teal/30 hover:bg-teal/5 hover:text-ink transition shadow-sm"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Assistant label — first message */}
              {messages.length > 0 && messages[0].role === 'assistant' && (
                <p className="text-[10px] font-data uppercase tracking-widest text-ink-3 text-left">Store Signal AI</p>
              )}

              {messages.map((msg, idx) => (
                <div key={msg.id}>
                  {/* Show label before first assistant message */}
                  {idx > 0 && msg.role === 'assistant' && messages[idx - 1]?.role === 'user' && (
                    <p className="text-[10px] font-data uppercase tracking-widest text-ink-3 text-left mb-1">Store Signal AI</p>
                  )}

                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-teal text-white rounded-2xl rounded-br-md font-display italic text-sm leading-relaxed max-w-[70%]'
                          : 'bg-white text-ink rounded-2xl rounded-bl-md shadow-sm border border-cream-2'
                      }`}
                    >
                      {msg.role === 'assistant'
                        ? renderMarkdown(msg.content)
                        : msg.content
                      }
                    </div>
                  </div>

                  {/* Follow-up suggestions */}
                  {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2 ml-1">
                      {msg.suggestions.map((s, j) => (
                        <button
                          key={j}
                          onClick={() => sendMessage(s)}
                          className="rounded-full border border-teal/30 bg-teal/5 px-3 py-1 text-xs text-teal hover:bg-teal hover:text-white transition font-medium"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Tool status indicator */}
              {toolStatus && (
                <div className="flex items-center gap-2 pl-1">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
                  </span>
                  <span className="font-display italic text-sm text-ink-3">{toolStatus.message}</span>
                </div>
              )}

              {/* Streaming text */}
              {streamingText && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm border border-cream-2">
                    {renderMarkdown(streamingText)}
                    <span className="inline-block h-4 w-0.5 bg-teal ml-0.5 animate-pulse" />
                  </div>
                </div>
              )}

              {/* Typing indicator (before any streaming text) */}
              {isLoading && !streamingText && !toolStatus && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm border border-cream-2">
                    <div className="flex gap-1 items-center h-4">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-teal animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-cream-2 bg-white p-4">
          <div className="relative flex items-end gap-3 rounded-2xl border border-cream-2 bg-cream px-4 py-3 focus-within:border-teal/50 focus-within:ring-1 focus-within:ring-teal/20 transition">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your business…"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none bg-transparent text-sm text-ink placeholder-ink-3 outline-none disabled:opacity-50"
              style={{ maxHeight: '120px' }}
            />
            {input.length > 500 && (
              <span className="absolute bottom-2 left-4 text-[10px] text-ink-3">{input.length}/2000</span>
            )}
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal text-white hover:bg-teal-dark disabled:opacity-40 transition"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-ink-3">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  )
}
