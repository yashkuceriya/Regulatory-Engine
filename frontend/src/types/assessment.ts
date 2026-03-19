/** Types matching the backend Pydantic models exactly. */

export interface Evidence {
  source_type: string
  source_locator: string
  retrieval_ts?: string
  excerpt_pointer?: string
}

export interface RegulatoryFinding {
  finding_type: string
  value: any
  unit?: string
  rule_id?: string
  method: 'lookup' | 'calculation' | 'llm_synthesis' | 'not_evaluated'
  evidence: Evidence[]
  confidence: number
  confidence_level: 'HIGH' | 'MEDIUM' | 'NOT_EVALUATED' | 'REVIEW_REQUIRED'
  assumptions: string[]
  reason?: string
}

export interface OverlayFlags {
  hillside: boolean
  hpoz: boolean
  toc_tier: number | null
  coastal: boolean
  fire_zone_1: boolean
  fault_zone: boolean
  specific_plan: string | null
  unscreened_overlays?: string[]
}

export interface BuildingTypeAssessment {
  building_type: 'SFR' | 'ADU' | 'GUEST_HOUSE'
  verdict: 'ALLOWED' | 'FLAGGED' | 'NOT_EVALUATED'
  findings: RegulatoryFinding[]
  overlay_warnings: string[]
  summary?: string
  composite_confidence: number
}

export interface ParcelObservation {
  ain?: string
  apn?: string
  situs_full_address?: string
  lot_area_sqft?: number
  geometry?: any
  source_url: string
  retrieval_ts: string
}

export interface ZoningObservation {
  zoning_string: string
  category?: string
  zone_components?: {
    raw: string
    base_zone: string
    height_district?: string
    hillside: boolean
    variation?: string
  }
  source_url: string
}

export interface BuildabilityAssessment {
  address: string
  parcel?: ParcelObservation
  zoning?: ZoningObservation
  jurisdiction?: any
  overlay_flags: OverlayFlags
  assessments: BuildingTypeAssessment[]
  buildable_envelope?: any
  citations: Evidence[]
  pipeline_errors: { step: string; message: string }[]
  overall_recommendation?: string
  edge_cases?: string[]
  pipeline_timing?: Record<string, number>
  created_at: string
}

export interface DemoAddress {
  address: string
  scenario: string
  expected: string
}
