// Tiny "?" info icon with a hover tooltip — explains metric jargon inline.
// Uses the native title attribute (reliable, accessible, zero positioning bugs).

import { HelpCircle } from 'lucide-react'
import { GLOSSARY } from '../../lib/glossary'

export default function InfoTip({ term, text, size = 12, className = '' }) {
  const tip = text || (term ? GLOSSARY[term] : '') || ''
  if (!tip) return null
  return (
    <span
      title={tip}
      role="img"
      aria-label={tip}
      className={`inline-flex items-center text-gray-300 hover:text-gray-500 cursor-help align-middle ${className}`}
    >
      <HelpCircle size={size} />
    </span>
  )
}
