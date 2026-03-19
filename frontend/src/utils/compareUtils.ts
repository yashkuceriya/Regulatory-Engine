import type { BuildabilityAssessment } from '../types/assessment'

export interface ComparisonRow {
  address: string
  zone: string
  lotArea: number | null
  buildableArea: number | null
  coveragePct: number | null
  sfrVerdict: string | null
  aduVerdict: string | null
  maxHeight: number | null
  maxStories: number | null
  frontSetback: number | null
  sideSetback: number | null
  rearSetback: number | null
  far: number | null
  confidence: number
  overlays: string[]
  aduEligible: boolean | null
}

/**
 * Find a numeric finding value by type across all building-type assessments.
 */
function findNumeric(a: BuildabilityAssessment, findingType: string): number | null {
  for (const bta of a.assessments) {
    for (const f of bta.findings) {
      if (f.finding_type === findingType && typeof f.value === 'number') {
        return f.value
      }
    }
  }
  return null
}

/**
 * Find a string finding value by type across all building-type assessments.
 */
function findString(a: BuildabilityAssessment, findingType: string): string | null {
  for (const bta of a.assessments) {
    for (const f of bta.findings) {
      if (f.finding_type === findingType && f.value != null) {
        return String(f.value)
      }
    }
  }
  return null
}

/**
 * Extract comparison-friendly metrics from a full BuildabilityAssessment.
 */
export function extractMetrics(a: BuildabilityAssessment): ComparisonRow {
  const sfrAssessment = a.assessments.find((b) => b.building_type === 'SFR')
  const aduAssessment = a.assessments.find((b) => b.building_type === 'ADU')

  // Build active overlay names
  const overlays: string[] = []
  const flags = a.overlay_flags
  if (flags.hillside) overlays.push('Hillside')
  if (flags.hpoz) overlays.push('HPOZ')
  if (flags.toc_tier != null) overlays.push(`TOC Tier ${flags.toc_tier}`)
  if (flags.coastal) overlays.push('Coastal')
  if (flags.fire_zone_1) overlays.push('Fire Zone 1')
  if (flags.fault_zone) overlays.push('Fault Zone')
  if (flags.specific_plan) overlays.push(flags.specific_plan)

  // Determine ADU eligibility from verdict
  let aduEligible: boolean | null = null
  if (aduAssessment) {
    aduEligible = aduAssessment.verdict === 'ALLOWED'
  }

  // Average composite confidence across all assessments
  const confidence =
    a.assessments.length > 0
      ? a.assessments.reduce((sum, b) => sum + b.composite_confidence, 0) / a.assessments.length
      : 0

  const buildableArea = a.buildable_envelope?.properties?.envelope_area_sqft ?? null
  const lotArea = a.parcel?.lot_area_sqft ?? null
  const coveragePct = buildableArea != null && lotArea ? Math.round((buildableArea / lotArea) * 100) : null

  return {
    address: a.address,
    zone: a.zoning?.zoning_string ?? 'Unknown',
    lotArea,
    buildableArea,
    coveragePct,
    sfrVerdict: sfrAssessment?.verdict ?? null,
    aduVerdict: aduAssessment?.verdict ?? null,
    maxHeight: findNumeric(a, 'max_height'),
    maxStories: findNumeric(a, 'max_stories'),
    frontSetback: findNumeric(a, 'front_setback'),
    sideSetback: findNumeric(a, 'interior_side_setback'),
    rearSetback: findNumeric(a, 'rear_setback'),
    far: findNumeric(a, 'rfar'),
    confidence,
    overlays,
    aduEligible,
  }
}
