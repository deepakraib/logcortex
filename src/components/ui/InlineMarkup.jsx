import React from 'react'

/**
 * Safely renders a tiny inline-markup subset without using innerHTML.
 * Supports:
 * - **bold**
 * - `inline code`
 */
export default function InlineMarkup({ text }) {
  const source = String(text ?? '')
  const parts = source.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={index} className="text-white font-semibold">
              {part.slice(2, -2)}
            </strong>
          )
        }

        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={index} className="font-mono text-xs bg-black/40 text-green-300 px-1.5 py-0.5 rounded">
              {part.slice(1, -1)}
            </code>
          )
        }

        return <React.Fragment key={index}>{part}</React.Fragment>
      })}
    </>
  )
}
