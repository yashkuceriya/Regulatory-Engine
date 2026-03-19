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
  const res = await fetch(`${API_BASE}/api/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(
      typeof err.detail === 'string'
        ? err.detail
        : err.detail?.message || 'Assessment failed'
    )
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
      const res = await fetch(`${API_BASE}/api/demo-addresses`)
      if (!res.ok) {
        throw new Error('Failed to load demo addresses')
      }
      return res.json()
    },
  })
}

export function useLamcChunks() {
  return useQuery<Record<string, any>>({
    queryKey: ['lamc-chunks'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/lamc-chunks`)
      if (!res.ok) {
        throw new Error('Failed to load regulatory text')
      }
      return res.json()
    },
    staleTime: Infinity,  // LAMC text doesn't change
  })
}
