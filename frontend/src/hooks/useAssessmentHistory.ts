import { useState, useCallback } from 'react'
import type { BuildabilityAssessment } from '../types/assessment'

const HISTORY_KEY = 'cover_history'
const ASSESSMENT_PREFIX = 'cover_assessment_'
const MAX_ENTRIES = 20

export interface HistoryEntry {
  id: string
  address: string
  date: string // ISO
  verdicts: { type: string; verdict: string }[]
  zone: string
  confidence: number
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HistoryEntry[]
  } catch {
    return []
  }
}

function writeHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function generateId(address: string): string {
  const ts = Date.now()
  const slug = address.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60)
  return `${slug}_${ts}`
}

/** Strip parcel.geometry to reduce localStorage footprint. */
function stripGeometry(assessment: BuildabilityAssessment): BuildabilityAssessment {
  if (!assessment.parcel?.geometry) return assessment
  const { geometry: _, ...parcelRest } = assessment.parcel
  return { ...assessment, parcel: { ...parcelRest } }
}

export function useAssessmentHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(readHistory)

  const saveAssessment = useCallback((assessment: BuildabilityAssessment) => {
    const id = generateId(assessment.address)

    const entry: HistoryEntry = {
      id,
      address: assessment.address,
      date: new Date().toISOString(),
      verdicts: assessment.assessments.map((a) => ({
        type: a.building_type,
        verdict: a.verdict,
      })),
      zone: assessment.zoning?.zoning_string ?? 'Unknown',
      confidence:
        assessment.assessments.length > 0
          ? assessment.assessments.reduce((s, a) => s + a.composite_confidence, 0) /
            assessment.assessments.length
          : 0,
    }

    // Store the full (stripped) assessment payload
    try {
      localStorage.setItem(
        `${ASSESSMENT_PREFIX}${id}`,
        JSON.stringify(stripGeometry(assessment)),
      )
    } catch {
      // storage full — skip caching the full payload
    }

    setHistory((prev) => {
      // LRU: put the new entry at the front, evict oldest beyond MAX_ENTRIES
      const next = [entry, ...prev.filter((e) => e.id !== id)].slice(0, MAX_ENTRIES)

      // Remove evicted assessment payloads
      const kept = new Set(next.map((e) => e.id))
      prev.forEach((e) => {
        if (!kept.has(e.id)) {
          try {
            localStorage.removeItem(`${ASSESSMENT_PREFIX}${e.id}`)
          } catch {
            // ignore
          }
        }
      })

      writeHistory(next)
      return next
    })
  }, [])

  const loadAssessment = useCallback((id: string): BuildabilityAssessment | null => {
    try {
      const raw = localStorage.getItem(`${ASSESSMENT_PREFIX}${id}`)
      if (!raw) return null
      return JSON.parse(raw) as BuildabilityAssessment
    } catch {
      return null
    }
  }, [])

  const removeEntry = useCallback((id: string) => {
    try {
      localStorage.removeItem(`${ASSESSMENT_PREFIX}${id}`)
    } catch {
      // ignore
    }

    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id)
      writeHistory(next)
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory((prev) => {
      prev.forEach((e) => {
        try {
          localStorage.removeItem(`${ASSESSMENT_PREFIX}${e.id}`)
        } catch {
          // ignore
        }
      })
      writeHistory([])
      return []
    })
  }, [])

  return { history, saveAssessment, loadAssessment, removeEntry, clearHistory }
}
