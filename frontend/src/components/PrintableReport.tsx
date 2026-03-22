import { forwardRef, useMemo } from 'react'
import { Box, Typography, Stack, Divider } from '@mui/material'
import type { BuildabilityAssessment } from '../types/assessment'
import { analyzeLotShape, getOuterRing, perimeterFt, sqftToSqm, sqftToAcres } from '../utils/geometry'

const P = '#3d2c24'
const MUTED = '#7a6e65'
const LIGHT = '#b0a69d'
const BG = '#f5f0eb'
const BORDER = '#e5ddd5'

interface Props { assessment: BuildabilityAssessment }

const PrintableReport = forwardRef<HTMLDivElement, Props>(({ assessment }, ref) => {
  const overallConf = Math.round(
    (assessment.assessments.length
      ? Math.min(...assessment.assessments.map(a => a.composite_confidence))
      : 0) * 100
  )
  const lotArea = assessment.parcel?.lot_area_sqft
  const envArea = assessment.buildable_envelope?.properties?.envelope_area_sqft
  const coveragePct = lotArea && envArea ? Math.round((envArea / lotArea) * 100) : 0
  const allFindings = assessment.assessments.flatMap(a => a.findings)
  const deterministicCount = allFindings.filter(f => f.method === 'lookup' || f.method === 'calculation').length
  const reviewCount = allFindings.filter(f => f.method === 'not_evaluated').length
  const zone = assessment.zoning?.zoning_string || 'N/A'
  const isR1R2 = zone.startsWith('R1') || zone.startsWith('R2')
  const overlays = assessment.overlay_flags
  const unscreened = overlays.unscreened_overlays || []

  const activeOverlays: string[] = []
  if (overlays.hillside) activeOverlays.push('Hillside')
  if (overlays.hpoz) activeOverlays.push('HPOZ')
  if (overlays.toc_tier != null) activeOverlays.push(`TOC Tier ${overlays.toc_tier}`)
  if (overlays.coastal) activeOverlays.push('Coastal')
  if (overlays.fire_zone_1) activeOverlays.push('Fire Zone')
  if (overlays.fault_zone) activeOverlays.push('Fault Zone')

  const risks: string[] = []
  if (reviewCount > 0) risks.push(`${reviewCount} finding${reviewCount > 1 ? 's' : ''} not evaluated — require manual verification`)
  if (activeOverlays.length > 0) risks.push(`Active overlays: ${activeOverlays.join(', ')} — may add review requirements`)
  if (unscreened.length > 0) risks.push(`${unscreened.length} overlay${unscreened.length > 1 ? 's' : ''} not screened (${unscreened.join(', ')})`)
  if (!isR1R2) risks.push(`Zone ${zone} outside R1/R2 engine scope — values are approximate`)
  if (overallConf < 60) risks.push(`Low confidence (${overallConf}%) — high uncertainty`)

  const nextSteps = [
    'Verify lot dimensions on site',
    'Confirm rear yard access',
    'Photo existing structures',
    'Locate utility connections',
    ...(activeOverlays.length > 0 ? ['Review overlay requirements with planning'] : []),
    ...(unscreened.length > 0 ? ['Screen for unscreened overlays'] : []),
    'LADBS permit pre-check with drawings',
  ]

  const allOverlayItems = [
    { label: 'Hillside', active: overlays.hillside, screened: true },
    { label: 'HPOZ', active: overlays.hpoz, screened: true },
    { label: 'TOC', active: overlays.toc_tier != null, screened: !unscreened.includes('toc'), detail: overlays.toc_tier != null ? `Tier ${overlays.toc_tier}` : undefined },
    { label: 'Coastal', active: overlays.coastal, screened: !unscreened.includes('coastal') },
    { label: 'Fire Zone', active: overlays.fire_zone_1, screened: !unscreened.includes('fire_zone_1') },
    { label: 'Fault Zone', active: overlays.fault_zone, screened: !unscreened.includes('fault_zone') },
  ]

  return (
    <Box ref={ref} sx={{
      p: '48px', bgcolor: '#fff', color: P, fontFamily: "'Inter', sans-serif",
      maxWidth: 816, // ~8.5" at 96dpi
      '@media print': {
        p: '36px',
        '& *': { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' },
      },
    }}>
      {/* ── Header Bar ── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pb: 2, mb: 3, borderBottom: `3px solid ${P}` }}>
        <Box>
          <Typography sx={{ fontSize: 9, fontWeight: 800, color: LIGHT, textTransform: 'uppercase', letterSpacing: '2px' }}>
            Cover Regulatory Engine
          </Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 900, color: P, lineHeight: 1.2, mt: 0.5 }}>
            Parcel Decision Memo
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: 9, color: LIGHT }}>
            {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: P }}>
            Confidence: {overallConf}%
          </Typography>
        </Box>
      </Box>

      {/* ── Address ── */}
      <Typography sx={{ fontSize: 20, fontWeight: 900, color: P, mb: 0.5 }}>
        {assessment.address}
      </Typography>
      <Typography sx={{ fontSize: 11, color: MUTED, mb: 2 }}>
        APN {assessment.parcel?.apn || 'N/A'} · Zone {zone} · {assessment.zoning?.category || 'Residential'}
      </Typography>

      {/* ── Key Metrics ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, mb: 3 }}>
        <MetricBox label="Lot Area" value={lotArea ? `${Math.round(lotArea).toLocaleString()}` : 'N/A'} unit={lotArea ? `sf · ${Math.round(sqftToSqm(lotArea))} m²` : 'sf'} />
        <MetricBox label="Buildable" value={envArea ? `${Math.round(envArea).toLocaleString()}` : 'N/A'} unit={envArea ? `sf · ${Math.round(sqftToSqm(envArea))} m²` : 'sf'} />
        <MetricBox label="Coverage" value={`${coveragePct}`} unit="%" />
        <MetricBox label="Confidence" value={`${overallConf}`} unit="%" highlight />
        <MetricBox label="Findings" value={`${deterministicCount}/${allFindings.length}`} unit="cited" />
      </Box>

      {/* ── Site Intelligence ── */}
      {(() => {
        const coords = getOuterRing(assessment.parcel?.geometry)
        const lotInfo = analyzeLotShape(coords)
        const perimeter = coords.length > 2 ? perimeterFt(coords) : 0
        if (!lotInfo) return null
        return (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, mb: 3 }}>
            <MetricBox label="Frontage" value={`${Math.round(lotInfo.frontageWidthFt)}`} unit="ft" />
            <MetricBox label="Depth" value={`${Math.round(lotInfo.lotDepthFt)}`} unit="ft" />
            <MetricBox label="Facing" value={lotInfo.facingDirection} />
            <MetricBox label="Shape" value={lotInfo.shapeDescription.split(' ')[0]} />
            <MetricBox label="Perimeter" value={`${Math.round(perimeter)}`} unit="ft" />
          </Box>
        )
      })()}

      {/* ── Verdicts ── */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        {assessment.assessments.map(a => (
          <Box key={a.building_type} sx={{
            flex: 1, p: 1.5, borderRadius: 1, textAlign: 'center',
            bgcolor: a.verdict === 'ALLOWED' ? '#f0fdf4' : '#fffbeb',
            border: `1px solid ${a.verdict === 'ALLOWED' ? '#bbf7d0' : '#fde68a'}`,
          }}>
            <Typography sx={{ fontSize: 9, fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {a.building_type === 'SFR' ? 'Single Family' : a.building_type}
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 900, color: a.verdict === 'ALLOWED' ? '#166534' : '#92400e' }}>
              {a.verdict === 'ALLOWED' ? 'Allowed' : 'Review Required'}
            </Typography>
            <Typography sx={{ fontSize: 9, color: MUTED }}>
              {(a.composite_confidence * 100).toFixed(0)}% confidence
            </Typography>
          </Box>
        ))}
      </Box>

      <Divider sx={{ borderColor: BORDER, mb: 2 }} />

      {/* ── Constraints Table ── */}
      <SectionHead label="Key Constraints" />
      {assessment.assessments.map(bta => {
        const findings = bta.findings.filter(f =>
          !['buildable_envelope', 'encroachment_plane', 'zone_classification'].includes(f.finding_type)
          && f.value != null && typeof f.value !== 'object'
        )
        if (findings.length === 0) return null
        return (
          <Box key={bta.building_type} sx={{ mb: 2, pageBreakInside: 'avoid' }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
              {bta.building_type === 'SFR' ? 'Single Family' : bta.building_type}
            </Typography>
            <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: 1, overflow: 'hidden' }}>
              {/* Table header */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2.5fr', bgcolor: BG, px: 1.5, py: 0.5 }}>
                {['Constraint', 'Value', 'Conf.', 'Source'].map(h => (
                  <Typography key={h} sx={{ fontSize: 8, fontWeight: 800, color: LIGHT, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</Typography>
                ))}
              </Box>
              {/* Table rows */}
              {findings.slice(0, 10).map((f, i) => (
                <Box key={i} sx={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2.5fr', px: 1.5, py: 0.6,
                  borderTop: `1px solid ${BORDER}`, alignItems: 'center',
                }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 500, color: P }}>
                    {f.finding_type.replace(/^adu_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: P }}>
                    {String(f.value)}{f.unit ? ` ${f.unit}` : ''}
                  </Typography>
                  <Typography sx={{ fontSize: 10, fontWeight: 600, color: f.confidence >= 0.8 ? '#16a34a' : f.confidence >= 0.6 ? '#2563eb' : '#d97706' }}>
                    {(f.confidence * 100).toFixed(0)}%
                  </Typography>
                  <Typography sx={{ fontSize: 9, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.evidence[0]?.source_locator || f.method.replace(/_/g, ' ')}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )
      })}

      {/* ── Overlay Screening ── */}
      <SectionHead label="Overlay Screening" />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.8, mb: 2 }}>
        {allOverlayItems.map(o => (
          <Box key={o.label} sx={{
            p: 1, borderRadius: 1, textAlign: 'center',
            bgcolor: !o.screened ? '#fafafa' : o.active ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${!o.screened ? '#e5e5e5' : o.active ? '#fecaca' : '#bbf7d0'}`,
          }}>
            <Typography sx={{ fontSize: 8, fontWeight: 700, color: LIGHT, textTransform: 'uppercase', mb: 0.3 }}>
              {o.label}
            </Typography>
            <Typography sx={{ fontSize: 10, fontWeight: 800, color: !o.screened ? LIGHT : o.active ? '#dc2626' : '#16a34a' }}>
              {!o.screened ? '—' : o.active ? (o.detail || 'Yes') : 'Clear'}
            </Typography>
          </Box>
        ))}
      </Box>

      <Divider sx={{ borderColor: BORDER, mb: 2 }} />

      {/* ── Risks + Next Steps side by side ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mb: 3, pageBreakInside: 'avoid' }}>
        <Box>
          <SectionHead label="Risks" />
          {risks.length > 0 ? (
            <Stack spacing={0.5}>
              {risks.slice(0, 4).map((r, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 0.8, alignItems: 'flex-start' }}>
                  <Typography sx={{ fontSize: 10, color: '#d97706', fontWeight: 800, flexShrink: 0 }}>!</Typography>
                  <Typography sx={{ fontSize: 10, color: '#78350f', lineHeight: 1.5 }}>{r}</Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 10, color: '#166534' }}>No major risks identified.</Typography>
          )}
        </Box>
        <Box>
          <SectionHead label="Next Steps" />
          <Stack spacing={0.3}>
            {nextSteps.slice(0, 6).map((s, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 0.8, alignItems: 'flex-start' }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 0.3, border: `1.5px solid ${BORDER}`, flexShrink: 0, mt: 0.2 }} />
                <Typography sx={{ fontSize: 10, color: P, lineHeight: 1.4 }}>{s}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      {/* ── Sources ── */}
      <SectionHead label="Cited Sources" />
      <Box sx={{ columns: 2, gap: 2, mb: 3 }}>
        {(() => {
          const sources = new Map<string, string>()
          allFindings.forEach(f => f.evidence.forEach(e => {
            if (e.source_locator && !sources.has(e.source_locator)) {
              sources.set(e.source_locator, e.source_type)
            }
          }))
          return Array.from(sources.entries()).slice(0, 12).map(([locator, type], i) => (
            <Typography key={i} sx={{ fontSize: 8.5, color: MUTED, lineHeight: 1.5, breakInside: 'avoid' }}>
              <Box component="span" sx={{ fontWeight: 700, color: P }}>{type}</Box> — {locator}
            </Typography>
          ))
        })()}
      </Box>

      {/* ── Footer ── */}
      <Box sx={{ pt: 2, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ fontSize: 8, color: LIGHT }}>
          Cover Regulatory Engine · LA City Planning, LA County GIS, Census TIGER
        </Typography>
        <Typography sx={{ fontSize: 8, color: LIGHT }}>
          Preliminary analysis — not legal or architectural advice
        </Typography>
      </Box>
    </Box>
  )
})

PrintableReport.displayName = 'PrintableReport'
export default PrintableReport

function SectionHead({ label }: { label: string }) {
  return (
    <Typography sx={{ fontSize: 10, fontWeight: 800, color: P, textTransform: 'uppercase', letterSpacing: '0.8px', mb: 1, mt: 0.5 }}>
      {label}
    </Typography>
  )
}

function MetricBox({ label, value, unit, highlight }: { label: string; value: string; unit?: string; highlight?: boolean }) {
  return (
    <Box sx={{ p: 1.2, bgcolor: highlight ? P : BG, borderRadius: 1, border: highlight ? 'none' : `1px solid ${BORDER}`, textAlign: 'center' }}>
      <Typography sx={{ fontSize: 8, fontWeight: 700, color: highlight ? 'rgba(255,255,255,0.5)' : LIGHT, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</Typography>
      <Typography sx={{ fontSize: 18, fontWeight: 900, color: highlight ? '#fff' : P, lineHeight: 1.2 }}>
        {value}
        {unit && <Typography component="span" sx={{ fontSize: 9, fontWeight: 600, color: highlight ? 'rgba(255,255,255,0.6)' : MUTED, ml: 0.3 }}>{unit}</Typography>}
      </Typography>
    </Box>
  )
}
