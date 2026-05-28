import { useState, useRef, useEffect, useMemo } from 'react'
import { MessageCircle, Send, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import InlineMarkup from '../components/ui/InlineMarkup'
import { answerQuestion } from '../assistant/answerEngine.js'
import { getSuggestedQuestions } from '../assistant/questionCatalog.js'
import { filterQuestionBankGrouped } from '../assistant/questionBank.js'

function renderAnswerText(text) {
  const parts = String(text || '').split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const inner = part.replace(/^```(?:json)?\n?/, '').replace(/```$/, '')
      return (
        <pre key={i} className="mt-2 p-2 bg-black/50 rounded-lg text-[10px] font-mono text-green-300 overflow-x-auto max-h-48 overflow-y-auto">
          {inner}
        </pre>
      )
    }
    return (
      <span key={i} className="whitespace-pre-wrap">
        <InlineMarkup text={part} />
      </span>
    )
  })
}

export default function AskLogPanel({ logData, mask, collapsed, widthPct, onToggleCollapse }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Upload a log file, then ask questions here. Answers use only parsed data from your file (no cloud API).',
    },
  ])
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showAllQuestions, setShowAllQuestions] = useState(false)
  const [questionFilter, setQuestionFilter] = useState('')
  const bottomRef = useRef(null)
  const suggested = getSuggestedQuestions(12)

  const questionGroups = useMemo(
    () => filterQuestionBankGrouped(questionFilter),
    [questionFilter]
  )

  const visibleQuestionCount = useMemo(
    () => questionGroups.reduce((n, [, items]) => n + items.length, 0),
    [questionGroups]
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadedFile = logData?.metadata?.filename
  useEffect(() => {
    if (!loadedFile) return
    setMessages([
      {
        role: 'assistant',
        text: `Log loaded: **${mask(loadedFile)}**. Ask anything about this log — open **Example questions** or type in your own words.`,
      },
    ])
  }, [loadedFile, mask])

  function ask(question) {
    const q = question.trim()
    if (!q) return
    setInput('')
    const userMsg = { role: 'user', text: q }
    const result = answerQuestion(q, logData, { mask })
    const assistantMsg = {
      role: 'assistant',
      text: result.text,
      followUps: result.followUps,
    }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
  }

  if (collapsed) {
    return (
      <div className="flex flex-col bg-surface border-l border-white/5 flex-shrink-0" style={{ width: '3rem' }}>
        <div className="p-2 border-b border-white/5">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-full h-8 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors flex items-center justify-center"
            title="Expand Ask Log panel"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <MessageCircle size={14} className="text-accent/70" />
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col bg-surface border-l border-white/5 flex-shrink-0 min-w-0"
      style={{ width: `${widthPct}%` }}
    >
      <div className="flex-shrink-0 p-3 border-b border-white/5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
              <MessageCircle size={16} className="text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate">Ask Log</h2>
              <p className="text-[10px] text-white/30 font-mono truncate">Local · no API key</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1.5 rounded text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors flex-shrink-0"
            title="Collapse Ask Log panel"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[95%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-elevated text-white/80 border border-white/10'
              }`}
            >
              {msg.role === 'assistant' ? renderAnswerText(msg.text) : msg.text}
              {msg.followUps?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {msg.followUps.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => ask(f)}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-accent hover:bg-accent/10 border border-white/10"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 p-3 border-t border-white/5">
        <button
          type="button"
          onClick={() => setShowAllQuestions((v) => !v)}
          className="w-full flex items-center justify-between px-2 py-1.5 mb-2 bg-accent/10 border border-accent/30 rounded-lg text-[10px] text-accent hover:bg-accent/15"
        >
          <span>Example questions</span>
          {showAllQuestions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showAllQuestions && (
          <div className="mb-2 space-y-2">
            <input
              type="search"
              value={questionFilter}
              onChange={(e) => setQuestionFilter(e.target.value)}
              placeholder="Search questions…"
              className="w-full bg-elevated border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
            />
            <p className="text-[10px] text-white/35 px-0.5">
              {questionFilter.trim()
                ? 'Matching example phrasings'
                : 'Generic example phrasings — scroll or search to narrow'}
            </p>
            <div className="max-h-64 overflow-y-auto space-y-2 p-2 bg-elevated/50 border border-white/5 rounded-lg">
              {visibleQuestionCount === 0 ? (
                <p className="text-[10px] text-white/40">No matches — try &quot;slow&quot;, &quot;error&quot;, or &quot;COLLSCAN&quot;.</p>
              ) : (
                questionGroups.map(([cat, items]) => (
                  <div key={cat}>
                    <div className="text-[9px] text-accent/80 font-medium uppercase tracking-wider mb-0.5 sticky top-0 bg-elevated/95 py-0.5">
                      {cat}
                    </div>
                    <ul className="space-y-0.5 mb-2">
                      {items.map((item) => (
                        <li key={item.question}>
                          <button
                            type="button"
                            onClick={() => ask(item.question)}
                            className="text-left text-[10px] text-white/50 hover:text-accent w-full"
                          >
                            {item.question}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowSuggestions((v) => !v)}
          className="w-full flex items-center justify-between px-2 py-1.5 mb-2 bg-elevated border border-white/10 rounded-lg text-[10px] text-white/50 hover:border-accent/30"
        >
          <span>Quick picks</span>
          {showSuggestions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showSuggestions && (
          <div className="max-h-24 overflow-y-auto mb-2 space-y-1">
            {suggested.map((s) => (
              <button
                key={s.text}
                type="button"
                onClick={() => ask(s.text)}
                className="block w-full text-left text-[10px] px-2 py-1 rounded bg-white/5 text-white/50 hover:text-accent hover:bg-accent/5"
              >
                {s.text}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1 mb-2">
          {suggested.slice(0, 4).map((s) => (
            <button
              key={s.text}
              type="button"
              onClick={() => ask(s.text)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/50 hover:text-accent border border-white/10"
            >
              {s.text}
            </button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            ask(input)
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ask(input)
              }
            }}
            placeholder={logData ? 'Ask about this log…' : 'Upload a log first…'}
            disabled={!logData}
            rows={2}
            className="flex-1 bg-elevated border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-accent/50 disabled:opacity-40 resize-none"
          />
          <button
            type="submit"
            disabled={!logData || !input.trim()}
            className="px-3 py-2 bg-accent text-black font-medium rounded-lg hover:bg-accent/90 disabled:opacity-40 self-end"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}
