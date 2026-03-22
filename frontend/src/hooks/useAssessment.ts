import { useMutation, useQuery } from '@tanstack/react-query'
import type { BuildabilityAssessment, DemoAddress } from '../types/assessment'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface AssessmentParams {
  address: string
  target_sqft?: number
  bedrooms?: number
  bathrooms?: number
}

export async function fetchAssessment(params: AssessmentParams): Promise<BuildabilityAssessment> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  } catch (e) {
    // Network error, CORS block, or backend unreachable
    throw new Error(
      'Cannot reach the assessment server. Check your connection or try again.'
    )
  }

  if (!res.ok) {
    let detail = `Server error (${res.status})`
    try {
      const err = await res.json()
      if (typeof err.detail === 'string') detail = err.detail
      else if (err.detail?.message) detail = err.detail.message
    } catch {}

    if (res.status === 429) detail = 'Too many requests — please wait a moment and try again.'
    if (res.status === 504) detail = 'Assessment timed out — external data sources may be slow. Try again.'

    throw new Error(detail)
  }

  return res.json()
}

export function useAssessment() {
  return useMutation({
    mutationFn: fetchAssessment,
  })
}

export function useDemoAddresses() {
  return useQuery<DemoAddress[]>({
    queryKey: ['demo-addresses'],
    queryFn: async () => {
      let res: Response
      try {
        res = await fetch(`${API_BASE}/api/demo-addresses`)
      } catch {
        throw new Error('Cannot reach server')
      }
      if (!res.ok) throw new Error('Failed to load demo addresses')
      return res.json()
    },
  })
}

export function useLamcChunks() {
  return useQuery<Record<string, any>>({
    queryKey: ['lamc-chunks'],
    queryFn: async () => {
      let res: Response
      try {
        res = await fetch(`${API_BASE}/api/lamc-chunks`)
      } catch {
        throw new Error('Cannot reach server')
      }
      if (!res.ok) throw new Error('Failed to load regulatory text')
      return res.json()
    },
    staleTime: Infinity,
  })
}
