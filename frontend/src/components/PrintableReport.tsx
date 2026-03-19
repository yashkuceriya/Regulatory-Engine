import { forwardRef } from 'react'
import { Box, Typography, Stack, Chip, Divider } from '@mui/material'
import { CheckCircle, Warning, Info } from '@mui/icons-material'
import type { BuildabilityAssessment } from '../types/assessment'

const P = '#3d2c24'

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

  // Top risks
  const risks: string[] = []
  if (reviewCount > 0) risks.push(`${reviewCount} finding${reviewCount > 1 ? 's' : ''} not evaluated — require manual verification`)
  if (activeOverlays.length > 0) risks.push(`Active overlays: ${activeOverlays.join(', ')} — may add review requirements`)
  if (unscreened.length > 0) risks.push(`${unscreened.length} overlay type${unscreened.length > 1 ? 's' : ''} not screened (${unscreened.join(', ')}) — check manually`)
  if (!isR1R2) risks.push(`Zone ${zone} is outside R1/R2 engine scope — setback/height values are approximate defaults`)
  if (overallConf < 60) risks.push(`Overall confidence ${overallConf}% is below threshold — high uncertainty in findings`)
  if (!assessment.parcel?.geometry) risks.push('No parcel geometry available — buildable envelope could not be computed')

  // Next steps
  const nextSteps = [
    'Verify lot dimensions and setback distances on site',
    'Confirm rear yard access for construction equipment',
    'Photo existing structures for permit application',
    ...(activeOverlays.length > 0 ? ['Review overlay-specific requirements with planning department'] : []),
    ...(unscreened.length > 0 ? ['Screen for unscreened overlays (coastal, fire, fault) before quoting'] : []),
    'Run LADBS permit pre-check with final design drawings',
  ]

  return (
    <Box ref={ref} sx={{
      p: 5, bgcolor: '#fff', color: P, fontFamily: 'Inter, sans-serif',
      '@media print': { p: 3, fontSize: '10px' },
      maxWidth: 800,
    }}>
      {/* ── Header ── */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3, pb: 2, borderBottom: `2px solid ${P}` }}>
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
            Cover Regulatory Engine
          </Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 900, color: P, mt: 0.5 }}>
            Parcel Decision Memo
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: 10, color: '#b0a69d' }}>
            {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </Typography>
          <Typography sx={{ fontSize: 10, color: '#b0a69d' }}>
            Confidence: {overallConf}%
          </Typography>
        </Box>
      </Stack>

      {/* ── 1. Parcel Facts ── */}
      <SectionLabel num={1} label="Parcel Facts" />
      <Typography sx={{ fontSize: 22, fontWeight: 900, color: P, mb: 1 }}>
        {assessment.address}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 3 }}>
        <MetricBox label="APN" value={assessment.parcel?.apn || 'N/A'} />
        <MetricBox label="Zone" value={zone} />
        <MetricBox label="Lot Area" value={lotArea ? `${Math.round(lotArea).toLocaleString()} sf` : 'N/A'} />
        <MetricBox label="Buildable" value={envArea ? `${Math.round(envArea).toLocaleString()} sf (${coveragePct}%)` : 'N/A'} />
      </Box>

      {/* ── 2. Zoning & ADU Summary ── */}
      <SectionLabel num={2} label="Zoning & ADU Summary" />
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {assessment.assessments.map(a => (
          <Chip key={a.building_type} size="small"
            icon={a.verdict === 'ALLOWED' ? <CheckCircle sx={{ fontSize: '14px !important' }} /> : <Warning sx={{ fontSize: '14px !important' }} />}
            label={`${a.building_type === 'SFR' ? 'Single Family' : a.building_type}: ${a.verdict === 'ALLOWED' ? 'Allowed' : 'Review Required'}`}
            sx={{
              bgcolor: a.verdict === 'ALLOWED' ? '#dcfce7' : '#fef3c7',
              color: a.verdict === 'ALLOWED' ? '#166534' : '#92400e',
              fontWeight: 700, fontSize: 11,
            }} />
        ))}
      </Stack>
      {assessment.assessments.map(bta => {
        const findings = bta.findings.filter(f =>
          f.finding_type !== 'buildable_envelope' && f.finding_type !== 'encroachment_plane' && f.finding_type !== 'zone_classification'
          && f.value != null && typeof f.value !== 'object'
        )
        if (findings.length === 0) return null
        return (
          <Box key={bta.building_type} sx={{ mb: 2, pageBreakInside: 'avoid' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: P, mb: 0.5 }}>
              {bta.building_type === 'SFR' ? 'Single Family' : bta.building_type} — Key Constraints
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              {findings.slice(0, 9).map((f, i) => (
                <Box key={i} sx={{ p: 1, bgcolor: '#f5f0eb', borderRadius: 1, border: '1px solid #e5ddd5' }}>
                  <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase' }}>
                    {f.finding_type.replace(/^adu_/, '').replace(/_/g, ' ')}
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 900, color: P }}>
                    {String(f.value)}{f.unit ? ` ${f.unit}` : ''}
                  </Typography>
                  <Typography sx={{ fontSize: 9, color: f.confidence >= 0.8 ? '#16a34a' : f.confidence >= 0.6 ? '#2563eb' : '#d97706' }}>
                    {(f.confidence * 100).toFixed(0)}% — {f.method === 'lookup' ? 'Code lookup' : f.method === 'calculation' ? 'Calculated' : 'Approximate'}
                  </Typography>
                </Box>
              ))}
            </Box>
            {bta.summary && (
              <Typography sx={{ fontSize: 11, color: '#6b5d54', lineHeight: 1.7, mt: 1, pl: 1.5, borderLeft: `2px solid ${P}30` }}>
                {bta.summary}
              </Typography>
            )}
          </Box>
        )
      })}

      {/* ── 3. Overlay Screening ── */}
      <SectionLabel num={3} label="Overlay Screening" />
      <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        {[
          { label: 'Hillside', active: overlays.hillside, screened: true },
          { label: 'HPOZ', active: overlays.hpoz, screened: true },
          { label: 'TOC', active: overlays.toc_tier != null, screened: !unscreened.includes('toc'), detail: overlays.toc_tier != null ? `Tier ${overlays.toc_tier}` : undefined },
          { label: 'Coastal', active: overlays.coastal, screened: !unscreened.includes('coastal') },
          { label: 'Fire Zone', active: overlays.fire_zone_1, screened: !unscreened.includes('fire_zone_1') },
          { label: 'Fault Zone', active: overlays.fault_zone, screened: !unscreened.includes('fault_zone') },
        ].map(o => (
          <Chip key={o.label} size="small"
            icon={!o.screened ? <Info sx={{ fontSize: '13px !important' }} /> : o.active ? <Warning sx={{ fontSize: '13px !important' }} /> : <CheckCircle sx={{ fontSize: '13px !important' }} />}
            label={o.detail || o.label}
            variant={o.screened ? 'filled' : 'outlined'}
            sx={{
              fontSize: 10, height: 22,
              ...(!o.screened
                ? { borderColor: '#d4c8be', color: '#7a6e65' }
                : o.active
                  ? { bgcolor: '#fef2f2', color: '#991b1b' }
                  : { bgcolor: '#f0fdf4', color: '#166534' }),
            }} />
        ))}
      </Stack>
      {unscreened.length > 0 && (
        <Typography sx={{ fontSize: 10, color: '#92400e', fontStyle: 'italic', mb: 2 }}>
          {unscreened.length} overlay type{unscreened.length > 1 ? 's' : ''} not screened — verify with GIS or site visit.
        </Typography>
      )}

      <Divider sx={{ my: 2 }} />

      {/* ── 4. Top Risks ── */}
      <SectionLabel num={4} label="Top Risks" />
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        {risks.slice(0, 5).map((r, i) => (
          <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
            <Warning sx={{ fontSize: 14, color: '#d97706', mt: 0.2, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 11, color: '#78350f', lineHeight: 1.5 }}>{r}</Typography>
          </Stack>
        ))}
        {risks.length === 0 && (
          <Stack direction="row" spacing={1} alignItems="center">
            <CheckCircle sx={{ fontSize: 14, color: '#16a34a' }} />
            <Typography sx={{ fontSize: 11, color: '#166534' }}>No major risks identified</Typography>
          </Stack>
        )}
      </Stack>

      {/* ── 5. Next Verification Steps ── */}
      <SectionLabel num={5} label="Next Verification Steps" />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.8, mb: 3 }}>
        {nextSteps.map((s, i) => (
          <Stack key={i} direction="row" spacing={0.8} alignItems="flex-start" sx={{ p: 1, bgcolor: '#f5f0eb', borderRadius: 1 }}>
            <Box sx={{ width: 16, height: 16, borderRadius: 0.5, border: `1.5px solid ${P}30`, flexShrink: 0, mt: 0.1 }} />
            <Typography sx={{ fontSize: 10, color: P, lineHeight: 1.4 }}>{s}</Typography>
          </Stack>
        ))}
      </Box>

      {/* ── 6. Confidence Summary ── */}
      <SectionLabel num={6} label="Confidence Summary" />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mb: 3 }}>
        <MetricBox label="Overall Confidence" value={`${overallConf}%`} highlight />
        <MetricBox label="Deterministic Findings" value={`${deterministicCount} of ${allFindings.length}`} />
        <MetricBox label="Needs Review" value={reviewCount > 0 ? `${reviewCount} items` : 'None'} />
      </Box>

      {/* ── 7. Cited Sources ── */}
      <SectionLabel num={7} label="Cited Sources" />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, mb: 3 }}>
        {(() => {
          const sources = new Map<string, string>()
          allFindings.forEach(f => f.evidence.forEach(e => {
            if (e.source_locator && !sources.has(e.source_locator)) {
              sources.set(e.source_locator, e.source_type)
            }
          }))
          return Array.from(sources.entries()).slice(0, 12).map(([locator, type], i) => (
            <Typography key={i} sx={{ fontSize: 9, color: '#7a6e65', lineHeight: 1.4 }}>
              <Box component="span" sx={{ fontWeight: 700, color: P }}>{type}</Box> — {locator}
            </Typography>
          ))
        })()}
      </Box>

      {/* ── Footer ── */}
      <Box sx={{ pt: 2, borderTop: `1px solid #e5ddd5`, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 9, color: '#b0a69d', lineHeight: 1.6 }}>
          Cover Regulatory Engine — Data Sources: LA City Planning, LA County GIS, Census TIGER
          <br />
          All measurements are approximate. Findings subject to architect and agency verification.
          <br />
          This memo is auto-generated and does not constitute legal or architectural advice.
        </Typography>
      </Box>
    </Box>
  )
})

PrintableReport.displayName = 'PrintableReport'
export default PrintableReport

/* ── Helpers ── */

function SectionLabel({ num, label }: { num: number; label: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, mt: 1 }}>
      <Box sx={{
        width: 20, height: 20, borderRadius: '50%', bgcolor: P,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{num}</Typography>
      </Box>
      <Typography sx={{ fontSize: 12, fontWeight: 800, color: P, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </Typography>
    </Stack>
  )
}

function MetricBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Box sx={{ p: 1.5, bgcolor: highlight ? P : '#f5f0eb', borderRadius: 1, border: highlight ? 'none' : '1px solid #e5ddd5' }}>
      <Typography sx={{ fontSize: 9, fontWeight: 700, color: highlight ? 'rgba(255,255,255,0.6)' : '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 900, color: highlight ? '#fff' : P, mt: 0.3 }}>{value}</Typography>
    </Box>
  )
}
