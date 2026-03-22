/**
 * Cover Fit Analysis — the killer feature.
 *
 * This component translates raw regulatory data into Cover-specific
 * business intelligence:
 *
 * 1. COVER FIT SCORE — How well does this parcel match Cover's ideal project?
 * 2. UNIT RECOMMENDATION — Which Cover model (S1, S2, Custom) fits?
 * 3. PROJECT COST ESTIMATE — Rough ballpark based on buildable area
 * 4. PERMIT TIMELINE — Estimated weeks based on overlay complexity
 * 5. SITE VISIT CHECKLIST — Auto-generated verification items
 *
 * This shows Cover we understand their BUSINESS, not just zoning code.
 */

import { memo } from 'react'
import { Box, Typography, Stack, Chip, LinearProgress, Card, CardContent, Button, useTheme } from '@mui/material'
import {
  CheckCircle, Warning, Schedule, AttachMoney, Home, Cottage,
  Architecture, Checklist, TrendingUp, Speed, Verified, Engineering,
} from '@mui/icons-material'
import GlossaryTerm from './GlossaryTerm'
import type { BuildabilityAssessment } from '../types/assessment'

// Cover's unit specs (buildcover.com, Contrary Research, Dwell — March 2025 pricing)
const COVER_UNITS = [
  {
    model: 'S1',
    sqft: 580,
    beds: 1,
    baths: 1,
    minLotSqft: 3500,
    minBuildable: 700,
    priceRange: '$354K - $369K',
    timeline: '4-6 months',
    desc: 'Pre-engineered 1BR/1BA — move-in ready with HVAC, appliances, and built-in storage',
  },
  {
    model: 'S2',
    sqft: 800,
    beds: 1,
    baths: 1,
    minLotSqft: 5000,
    minBuildable: 1000,
    priceRange: '$487K+',
    timeline: '4-6 months',
    desc: 'Pre-approved by LADBS Standard Plan Program — fastest permit path',
  },
  {
    model: 'Custom Build',
    sqft: 1200,
    beds: 2,
    baths: 2,
    minLotSqft: 7000,
    minBuildable: 1500,
    priceRange: '$500K+',
    timeline: '6-9 months',
    desc: 'Fully custom layout designed for your site — maximum flexibility',
  },
]

interface Props {
  assessment: BuildabilityAssessment
  projectType?: string
  targetSqft?: number
  targetBeds?: number
}

export default memo(function CoverFitAnalysis({ assessment, projectType, targetSqft, targetBeds }: Props) {
  const theme = useTheme()
  const P = theme.palette.primary.main
  const lotArea = assessment.parcel?.lot_area_sqft || 0
  const buildableArea = assessment.buildable_envelope?.properties?.envelope_area_sqft || 0
  const zone = assessment.zoning?.zoning_string || ''
  const flags = assessment.overlay_flags
  const aduAssessment = assessment.assessments.find(a => a.building_type === 'ADU')
  const sfrAssessment = assessment.assessments.find(a => a.building_type === 'SFR')

  // Compute Cover Fit Score (0-100)
  const fitScore = computeFitScore(assessment)
  const fitGrade = fitScore >= 85 ? 'Excellent' : fitScore >= 70 ? 'Good' : fitScore >= 50 ? 'Moderate' : 'Challenging'
  const fitColor = fitScore >= 85 ? '#16a34a' : fitScore >= 70 ? '#0d9488' : fitScore >= 50 ? '#d97706' : '#dc2626'

  // Determine which Cover units fit — use lot area as fallback when no envelope
  const effectiveBuildable = buildableArea || (lotArea * 0.55) // ~55% buildable heuristic when no envelope
  const fittingUnits = COVER_UNITS.filter(u => effectiveBuildable >= u.minBuildable && lotArea >= u.minLotSqft)
  // When user specifies targetSqft, pick the closest unit that ALSO fits the parcel.
  // If no fitting unit matches the target, fall back to the largest fitting unit with a warning.
  const targetUnit = targetSqft && targetSqft > 0 && fittingUnits.length > 0
    ? fittingUnits.reduce((best, u) => Math.abs(u.sqft - targetSqft) < Math.abs(best.sqft - targetSqft) ? u : best)
    : null
  const targetExceedsFit = targetSqft && targetSqft > 0 && fittingUnits.length > 0 && targetUnit
    ? targetSqft > (targetUnit.sqft * 1.5) // target is way bigger than best feasible
    : false
  const bestUnit = targetUnit || fittingUnits[fittingUnits.length - 1] || null // largest that fits
  const usingHeuristic = buildableArea === 0 && lotArea > 0

  // Permit timeline estimate — differentiate LADBS pre-approved fast-track
  const overlayCount = [flags.hillside, flags.hpoz, flags.coastal, flags.fire_zone_1, flags.fault_zone, flags.toc_tier !== null].filter(Boolean).length
  const hasPrePermit = zone.startsWith('R1') || zone.startsWith('R2')
  const isPreApproved = hasPrePermit && overlayCount === 0 && bestUnit && bestUnit.sqft <= 1000 // S1/S2 are LADBS pre-approved
  // Pre-approved S1/S2 plans: 21-30 day LADBS approval per Standard Plan Program
  const permitWeeks = isPreApproved ? '3-4' : overlayCount === 0 ? '8-12' : overlayCount <= 1 ? '12-16' : overlayCount <= 3 ? '16-24' : '24+'
  const permitRisk = isPreApproved ? 'Low' : overlayCount === 0 ? 'Low' : overlayCount <= 2 ? 'Medium' : 'High'

  // SB 543 (2026): Multi-ADU combination eligibility
  const isSingleFamily = zone.startsWith('R1') || zone.startsWith('RS') || zone.startsWith('RE') || zone.startsWith('RA')
  const canMultiADU = isSingleFamily && lotArea >= 5000 && !flags.hillside

  // Neighborhood rental rate estimation (2026 data)
  const getRentalRate = (): { rate: number; tier: string } => {
    // Use address to estimate tier — simplified heuristic
    const addr = (assessment.address || '').toLowerCase()
    if (['santa monica', 'venice', 'culver', 'west la', 'westwood', 'brentwood', 'mar vista'].some(n => addr.includes(n)))
      return { rate: 4.2, tier: 'West LA Premium' }
    if (['hollywood', 'koreatown', 'mid-city', 'miracle mile', 'silverlake', 'echo park', 'los feliz'].some(n => addr.includes(n)))
      return { rate: 3.5, tier: 'Central LA' }
    if (['burbank', 'glendale', 'pasadena', 'sherman oaks', 'encino', 'van nuys', 'valley'].some(n => addr.includes(n)))
      return { rate: 2.8, tier: 'Valley / Northeast' }
    if (['east la', 'boyle', 'lincoln heights', 'el sereno'].some(n => addr.includes(n)))
      return { rate: 2.4, tier: 'East LA' }
    if (['south la', 'watts', 'compton', 'inglewood', 'crenshaw'].some(n => addr.includes(n)))
      return { rate: 2.2, tier: 'South LA' }
    return { rate: 3.0, tier: 'LA Average' } // default
  }
  const rental = getRentalRate()

  // Site visit checklist
  const checklist = generateChecklist(assessment)

  // Recommendation verdict
  const isResidentialZone = zone.startsWith('R1') || zone.startsWith('R2') || zone.startsWith('RD') || zone.startsWith('RS') || zone.startsWith('RE') || zone.startsWith('RA')
  const hasCriticalOverlays = flags.hillside && flags.fire_zone_1 // both together = critical
  const verdict: 'proceed' | 'review' | 'hold' =
    fitScore >= 80 && overlayCount === 0 && isResidentialZone ? 'proceed'
    : fitScore < 50 || !isResidentialZone || hasCriticalOverlays ? 'hold'
    : 'review'

  const verdictConfig = {
    proceed: { label: 'Proceed', bgcolor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', icon: <Verified sx={{ fontSize: 28, color: '#16a34a' }} /> },
    review: { label: 'Proceed with Review', bgcolor: '#fffbeb', borderColor: '#fde68a', color: '#92400e', icon: <Engineering sx={{ fontSize: 28, color: '#d97706' }} /> },
    hold: { label: 'Do Not Quote Yet', bgcolor: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', icon: <Warning sx={{ fontSize: 28, color: '#dc2626' }} /> },
  }[verdict]

  // Fast-track indicator text
  const fastTrackText = isPreApproved
    ? 'Fast-track candidate — S2 pre-approved by LADBS Standard Plan Program (21-30 day permit)'
    : hasPrePermit && overlayCount === 0
    ? 'Standard permitting path'
    : `Custom permitting — ${overlayCount} overlay${overlayCount !== 1 ? 's' : ''} require${overlayCount === 1 ? 's' : ''} additional review`

  // Top checklist items for the recommendation card
  const topChecklist = checklist.slice(0, 4)

  return (
    <Box>
      {/* ── Project Recommendation ── */}
      <Card sx={{ borderRadius: 3, border: `1px solid ${verdictConfig.borderColor}`, mb: 3, overflow: 'hidden' }}>
        <Box sx={{ p: 3, bgcolor: verdictConfig.bgcolor }}>
          {/* Verdict + Feasibility Index */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack direction="row" spacing={1.5} alignItems="center">
              {verdictConfig.icon}
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', letterSpacing: '1px', mb: 0.3 }}>
                  Project Recommendation
                </Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 900, color: verdictConfig.color, lineHeight: 1.2 }}>
                  {verdictConfig.label}
                </Typography>
              </Box>
            </Stack>
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: 9, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Feasibility Index
              </Typography>
              <Typography sx={{ fontSize: 36, fontWeight: 900, color: fitColor, lineHeight: 1 }}>{fitScore}</Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: fitColor }}>{fitGrade}</Typography>
            </Box>
          </Stack>

          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="determinate" value={fitScore} sx={{
              height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.5)',
              '& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: fitColor },
            }} />
          </Box>

          {/* Best-fit concept + Fast-track + Site verification */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2.5 }}>
            {/* Left column: Concept + Fast-track */}
            <Box>
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
                Best-Fit Concept
              </Typography>
              {bestUnit ? (
                <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 2, mb: 1.5 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: P }}>Recommended: {bestUnit.model}</Typography>
                  <Typography sx={{ fontSize: 11, color: '#7a6e65', mt: 0.3 }}>
                    {bestUnit.sqft} sqft — {bestUnit.beds === 0 ? 'Studio' : `${bestUnit.beds}BR`} / {bestUnit.baths}BA
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: targetExceedsFit ? '#d97706' : '#7a6e65', mt: 0.5, fontStyle: 'italic' }}>
                    {targetExceedsFit
                      ? `Requested ${targetSqft} sqft exceeds modeled fit — showing closest feasible unit`
                      : effectiveBuildable >= (bestUnit.minBuildable * 1.3)
                        ? 'Lot size and buildable area comfortably support this unit'
                        : 'Lot size and buildable area support this unit'}
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 2, mb: 1.5 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#d97706' }}>Custom design consultation needed</Typography>
                  <Typography sx={{ fontSize: 10, color: '#7a6e65', mt: 0.3, fontStyle: 'italic' }}>
                    Buildable area does not support standard Cover units
                  </Typography>
                </Box>
              )}

              <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 1 }}>
                <Speed sx={{ fontSize: 14, color: isPreApproved ? '#16a34a' : hasPrePermit && overlayCount === 0 ? '#d97706' : '#7a6e65' }} />
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: isPreApproved ? '#16a34a' : hasPrePermit && overlayCount === 0 ? '#92400e' : '#7a6e65' }}>
                  {fastTrackText}
                </Typography>
              </Stack>
              {projectType === 'adu_converted' && (
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#d97706', mt: 1, p: 1, bgcolor: '#fffbeb', borderRadius: 1, border: '1px solid #fde68a' }}>
                  Converted ADUs reuse existing space — different setback rules may apply
                </Typography>
              )}
            </Box>

            {/* Right column: Site verification needs */}
            <Box>
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
                Cover Would Verify on Site
              </Typography>
              <Stack spacing={0.8}>
                {topChecklist.map((item, i) => (
                  <Stack key={i} direction="row" spacing={0.8} alignItems="flex-start">
                    <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: P, mt: 0.7, flexShrink: 0, opacity: 0.5 }} />
                    <Typography sx={{ fontSize: 11, color: '#3d2c24', lineHeight: 1.4 }}>{item.title}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Box>

          {/* Score breakdown */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1.5, mt: 2.5 }}>
            {[
              { label: 'Zone Eligibility', score: zone.startsWith('R1') || zone.startsWith('R2') ? 100 : 30 },
              { label: 'Lot Size', score: lotArea >= 7000 ? 100 : lotArea >= 5000 ? 80 : lotArea >= 3500 ? 60 : 30 },
              { label: 'Overlay Risk', score: overlayCount === 0 ? 100 : overlayCount <= 1 ? 60 : 20 },
              { label: 'ADU Feasibility', score: aduAssessment?.verdict === 'ALLOWED' ? 100 : aduAssessment?.verdict === 'FLAGGED' ? 50 : 20 },
              { label: 'Build Area', score: buildableArea >= 1500 ? 100 : buildableArea >= 900 ? 80 : buildableArea >= 550 ? 60 : 30 },
            ].map(item => (
              <Box key={item.label} sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontSize: 18, fontWeight: 800, color: item.score >= 80 ? '#16a34a' : item.score >= 50 ? '#d97706' : '#dc2626' }}>
                  {item.score}
                </Typography>
                <Typography sx={{ fontSize: 9, color: '#7a6e65', fontWeight: 600 }}>{item.label}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Card>

      {/* ── Unit Recommendation + Cost + Timeline ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mb: 3 }}>
        {/* Unit Recommendation */}
        <Card sx={{ borderRadius: 3, border: `1px solid ${P}15` }}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 2 }}>
              <Cottage sx={{ fontSize: 16, color: '#c17855' }} />
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Recommended Unit
              </Typography>
            </Stack>
            {bestUnit ? (
              <>
                <Typography sx={{ fontSize: 20, fontWeight: 900, color: P, mb: 0.3 }}>{bestUnit.model}</Typography>
                <Typography sx={{ fontSize: 11, color: '#7a6e65', mb: 1.5, lineHeight: 1.6 }}>{bestUnit.desc}</Typography>
                <Stack spacing={0.5}>
                  <DetailLine label="Size" value={`${bestUnit.sqft} sqft`} />
                  <DetailLine label="Layout" value={`${bestUnit.beds}BR / ${bestUnit.baths}BA`} />
                  <DetailLine label="Min Buildable" value={`${bestUnit.minBuildable} sqft`} check={effectiveBuildable >= bestUnit.minBuildable} />
                </Stack>
                {usingHeuristic && (
                  <Typography sx={{ fontSize: 9, color: '#d97706', mt: 1, fontStyle: 'italic' }}>
                    Based on lot area estimate (~55% buildable). Run on R1/R2 parcel for precise envelope.
                  </Typography>
                )}
                {fittingUnits.length > 1 && (
                  <Typography sx={{ fontSize: 10, color: '#c17855', mt: 1, fontWeight: 600 }}>
                    {fittingUnits.length} Cover models fit this lot
                  </Typography>
                )}
              </>
            ) : (
              <Box sx={{ py: 2, textAlign: 'center' }}>
                <Warning sx={{ fontSize: 24, color: '#d97706', mb: 0.5 }} />
                <Typography sx={{ fontSize: 12, color: '#7a6e65' }}>Buildable area too small for standard units</Typography>
                <Typography sx={{ fontSize: 10, color: '#b0a69d', mt: 0.5 }}>Custom design consultation recommended</Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Cost Estimate */}
        <Card sx={{ borderRadius: 3, border: `1px solid ${P}15` }}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 2 }}>
              <AttachMoney sx={{ fontSize: 16, color: '#16a34a' }} />
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Est. Project Cost
              </Typography>
            </Stack>
            {bestUnit ? (
              <>
                <Typography sx={{ fontSize: 24, fontWeight: 900, color: P, mb: 0.3 }}>{bestUnit.priceRange}</Typography>
                <Typography sx={{ fontSize: 11, color: '#7a6e65', mb: 1.5 }}>For {bestUnit.model} ({bestUnit.sqft} sqft)</Typography>
                <Stack spacing={0.5}>
                  <DetailLine label="Includes" value="Design + Permit + Build" />
                  <DetailLine label="Foundation" value="Included" />
                  <DetailLine label="Timeline" value={bestUnit.timeline} />
                </Stack>
                <Typography sx={{ fontSize: 9, color: '#b0a69d', mt: 1.5, fontStyle: 'italic' }}>
                  Estimates based on public Cover pricing. Actual cost varies.
                </Typography>
              </>
            ) : (
              <Box sx={{ py: 2, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: P }}>Custom Quote</Typography>
                <Typography sx={{ fontSize: 11, color: '#7a6e65' }}>Contact Cover for custom pricing</Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Permit Timeline */}
        <Card sx={{ borderRadius: 3, border: `1px solid ${P}15` }}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 2 }}>
              <Schedule sx={{ fontSize: 16, color: '#6366f1' }} />
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Permit Timeline
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: 24, fontWeight: 900, color: P, mb: 0.3 }}>{permitWeeks} weeks</Typography>
            <Typography sx={{ fontSize: 11, color: '#7a6e65', mb: 1.5 }}>
              {isPreApproved ? 'Potentially eligible for LADBS fast track' : 'Estimated permit processing'}
            </Typography>
            <Stack spacing={0.5}>
              <DetailLine label="Permit Risk" value={permitRisk} check={permitRisk === 'Low'} warn={permitRisk === 'High'} />
              <DetailLine label={<><GlossaryTerm term="LADBS">LADBS</GlossaryTerm> Fast Track</>} value={isPreApproved ? 'S2 pre-approved via Standard Plan Program' : hasPrePermit ? 'Eligible zone' : 'No'} check={isPreApproved} />
              <DetailLine label="Overlays" value={overlayCount === 0 ? 'None detected' : `${overlayCount} active`} check={overlayCount === 0} warn={overlayCount > 0} />
              <DetailLine label="Review Deadline" value={<>15 business days (<GlossaryTerm term="SB 543">SB 543</GlossaryTerm>)</>} check />
              <DetailLine label="State Mandate" value="60-day approval (Gov Code §66314)" check />
            </Stack>
          </CardContent>
        </Card>
      </Box>

      {/* ── ROI Calculator ── */}
      {bestUnit && (
        <Card sx={{ borderRadius: 3, border: `1px solid ${P}15`, mb: 3, overflow: 'hidden' }}>
          <Box sx={{ p: 2.5, bgcolor: '#f5f0eb' }}>
            <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 2 }}>
              <TrendingUp sx={{ fontSize: 16, color: '#16a34a' }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: P }}>Investment Analysis</Typography>
              <Chip label={usingHeuristic ? 'Estimated (lot-based)' : 'Estimated'} size="small" sx={{ height: 18, fontSize: '0.5rem', fontWeight: 600, bgcolor: '#f0ebe5', color: '#7a6e65' }} />
            </Stack>
            {(() => {
              const monthlyRent = Math.round(bestUnit.sqft * rental.rate)
              const annualRent = monthlyRent * 12
              const midCost = bestUnit.sqft <= 600 ? 360000 : bestUnit.sqft <= 900 ? 490000 : 550000
              const roi = Math.round((annualRent / midCost) * 100 * 10) / 10
              const payback = Math.round((midCost / annualRent) * 10) / 10
              const valueAdd = Math.round(midCost * 0.25)
              return (
                <>
                  <Chip label={`${rental.tier} — $${rental.rate.toFixed(2)}/sqft`} size="small"
                    sx={{ mb: 2, height: 20, fontSize: '0.55rem', fontWeight: 700, bgcolor: '#dcfce7', color: '#166534' }} />
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
                    <Box>
                      <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly Rental</Typography>
                      <Typography sx={{ fontSize: 24, fontWeight: 900, color: '#16a34a' }}>${monthlyRent.toLocaleString()}</Typography>
                      <Typography sx={{ fontSize: 10, color: '#7a6e65' }}>{bestUnit.sqft} sqft × ${rental.rate}/sqft</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Annual Income</Typography>
                      <Typography sx={{ fontSize: 24, fontWeight: 900, color: P }}>${annualRent.toLocaleString()}</Typography>
                      <Typography sx={{ fontSize: 10, color: '#7a6e65' }}>Gross rental income</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Simple ROI</Typography>
                      <Typography sx={{ fontSize: 24, fontWeight: 900, color: '#c17855' }}>{roi}%</Typography>
                      <Typography sx={{ fontSize: 10, color: '#7a6e65' }}>{payback} year payback</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Property Value</Typography>
                      <Typography sx={{ fontSize: 24, fontWeight: 900, color: P }}>+${(valueAdd / 1000).toFixed(0)}K</Typography>
                      <Typography sx={{ fontSize: 10, color: '#7a6e65' }}>Estimated increase</Typography>
                    </Box>
                  </Box>

                  {/* Extended projections */}
                  {(() => {
                    const vacancyRate = 0.05 // 5% vacancy
                    const opexRate = 0.10 // 10% maintenance/insurance
                    const netAnnual = Math.round(annualRent * (1 - vacancyRate - opexRate))
                    const yr5 = Math.round(netAnnual * 5)
                    const yr10 = Math.round(netAnnual * 10)
                    const impactFeeExempt = bestUnit.sqft <= 750
                    const estimatedImpactFees = impactFeeExempt ? 0 : Math.round(bestUnit.sqft * 12) // ~$12/sqft
                    const propTaxIncrease = Math.round(midCost * 0.012) // ~1.2% of construction cost added to property tax
                    return (
                      <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(61,44,36,0.08)' }}>
                        <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
                          Projected Returns (Net Operating Income)
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 1.5 }}>
                          <Box>
                            <Typography sx={{ fontSize: 9, color: '#7a6e65' }}>Net Annual</Typography>
                            <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>${netAnnual.toLocaleString()}</Typography>
                            <Typography sx={{ fontSize: 9, color: '#b0a69d' }}>After 5% vacancy, 10% opex</Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: 9, color: '#7a6e65' }}>5-Year Total</Typography>
                            <Typography sx={{ fontSize: 16, fontWeight: 800, color: P }}>${(yr5 / 1000).toFixed(0)}K</Typography>
                            <Typography sx={{ fontSize: 9, color: '#b0a69d' }}>Cumulative net income</Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: 9, color: '#7a6e65' }}>10-Year Total</Typography>
                            <Typography sx={{ fontSize: 16, fontWeight: 800, color: P }}>${(yr10 / 1000).toFixed(0)}K</Typography>
                            <Typography sx={{ fontSize: 9, color: '#b0a69d' }}>Cumulative net income</Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: 9, color: '#7a6e65' }}>Add'l Prop Tax</Typography>
                            <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#92400e' }}>${(propTaxIncrease / 1000).toFixed(1)}K/yr</Typography>
                            <Typography sx={{ fontSize: 9, color: '#b0a69d' }}>Prop 13 supplemental</Typography>
                          </Box>
                        </Box>
                        {impactFeeExempt && (
                          <Chip label="Impact Fee Exempt — ADU ≤ 750 sqft (Gov. Code §66333)" size="small"
                            sx={{ height: 20, fontSize: '0.55rem', fontWeight: 700, bgcolor: '#dcfce7', color: '#166534', mb: 0.5 }} />
                        )}
                        {!impactFeeExempt && estimatedImpactFees > 0 && (
                          <Chip label={`Est. Impact Fees: ~$${estimatedImpactFees.toLocaleString()} (${bestUnit.sqft} sqft > 750 threshold)`} size="small"
                            sx={{ height: 20, fontSize: '0.55rem', fontWeight: 600, bgcolor: '#fef3c7', color: '#92400e', mb: 0.5 }} />
                        )}
                      </Box>
                    )
                  })()}
                </>
              )
            })()}
            <Typography sx={{ fontSize: 9, color: '#b0a69d', mt: 2, fontStyle: 'italic' }}>
              Rental rates from 2026 LA ADU market data by neighborhood. Net projections assume 5% vacancy, 10% operating expenses.
              Property value increase based on industry average of 20-30% of build cost. Prop 13: ADU adds supplemental assessment on new construction value only.
            </Typography>
          </Box>
        </Card>
      )}

      {/* ── SB 543 Multi-ADU Eligibility (2026 Law) ── */}
      {canMultiADU && (
        <Card sx={{ borderRadius: 3, border: '1px solid #bbf7d0', bgcolor: '#f0fdf4', mb: 3 }}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 1.5 }}>
              <Home sx={{ fontSize: 16, color: '#16a34a' }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Multi-<GlossaryTerm term="ADU">ADU</GlossaryTerm> Eligible (<GlossaryTerm term="SB 543">SB 543</GlossaryTerm> — 2026)</Typography>
              <Chip label="New Law" size="small" sx={{ height: 18, fontSize: '0.5rem', fontWeight: 700, bgcolor: '#dcfce7', color: '#166534' }} />
            </Stack>
            <Typography sx={{ fontSize: 12, color: '#3d5a3f', lineHeight: 1.7, mb: 1.5 }}>
              Under SB 543 (effective January 1, 2026), this single-family lot may qualify for <strong>multiple ADU types</strong> on one parcel:
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
              <Box sx={{ p: 1.5, bgcolor: '#dcfce7', borderRadius: 2, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 18, fontWeight: 900, color: '#166534' }}>1</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#166534' }}>Detached ADU</Typography>
                <Typography sx={{ fontSize: 9, color: '#3d5a3f' }}>Up to 1,200 sqft</Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: '#dcfce7', borderRadius: 2, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 18, fontWeight: 900, color: '#166534' }}>1</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#166534' }}>Converted ADU</Typography>
                <Typography sx={{ fontSize: 9, color: '#3d5a3f' }}>From existing space</Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: '#dcfce7', borderRadius: 2, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 18, fontWeight: 900, color: '#166534' }}>1</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#166534' }}><GlossaryTerm term="JADU">JADU</GlossaryTerm></Typography>
                <Typography sx={{ fontSize: 9, color: '#3d5a3f' }}>Up to 500 sqft interior</Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: 10, color: '#7a6e65', mt: 1.5, fontStyle: 'italic' }}>
              SB 543 also mandates 15-business-day completeness review and 60-day appeal determination.
              "Interior livable space" is now the statutory measurement standard.
            </Typography>
            <Typography sx={{ fontSize: 9, color: '#7a6e65', mt: 1, fontStyle: 'italic' }}>
              Eligibility based on lot size and zone — confirm with LADBS.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* ── Site Visit Checklist ── */}
      <Card sx={{ borderRadius: 3, border: `1px solid ${P}15`, mb: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 2 }}>
            <Checklist sx={{ fontSize: 16, color: P }} />
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: P }}>Site Visit Checklist</Typography>
            <Chip label={`${checklist.length} items`} size="small" sx={{ height: 18, fontSize: '0.5rem', fontWeight: 700, bgcolor: '#f0ebe5', color: '#7a6e65' }} />
          </Stack>
          <Typography sx={{ fontSize: 11, color: '#7a6e65', mb: 2 }}>
            Auto-generated verification items based on assessment findings. Print this before the site visit.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {checklist.map((item, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="flex-start" sx={{
                p: 1.5, borderRadius: 2, bgcolor: '#f5f0eb', border: `1px solid ${P}08`,
              }}>
                <Box sx={{
                  width: 18, height: 18, borderRadius: 0.5, border: `1.5px solid ${P}30`, flexShrink: 0, mt: 0.2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} />
                <Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: P }}>{item.title}</Typography>
                  <Typography sx={{ fontSize: 10, color: '#7a6e65' }}>{item.detail}</Typography>
                </Box>
              </Stack>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* ── Next Step CTA ── */}
      <Card sx={{
        borderRadius: 3, overflow: 'hidden', mb: 3,
        background: `linear-gradient(135deg, ${P} 0%, #5a4238 100%)`,
      }}>
        <CardContent sx={{ p: 3, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#fff', mb: 1 }}>
            Ready to build?
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', mb: 2.5, maxWidth: 400, mx: 'auto', lineHeight: 1.6 }}>
            This assessment shows your lot {bestUnit ? `supports a Cover ${bestUnit.model}` : 'may support an ADU'}.
            Get a detailed quote and construction timeline from Cover.
          </Typography>
          <Stack direction="row" spacing={1.5} justifyContent="center">
            <Button
              variant="contained"
              href="https://www.cover.build"
              target="_blank"
              sx={{
                bgcolor: '#fff', color: P, fontWeight: 700, fontSize: 13,
                borderRadius: 99, px: 3, py: 1,
                '&:hover': { bgcolor: '#f0ebe5' },
              }}
            >
              Get a Quote
            </Button>
            <Button
              variant="outlined"
              href="https://www.cover.build"
              target="_blank"
              sx={{
                borderColor: 'rgba(255,255,255,0.3)', color: '#fff', fontWeight: 600, fontSize: 13,
                borderRadius: 99, px: 3, py: 1,
                '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
              }}
            >
              Learn More
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
})

/* ─── Helpers ─── */

function DetailLine({ label, value, check, warn }: { label: React.ReactNode; value: React.ReactNode; check?: boolean; warn?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography sx={{ fontSize: 11, color: '#7a6e65' }}>{label}</Typography>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: warn ? '#d97706' : check ? '#16a34a' : '#3d2c24' }}>{value}</Typography>
        {check && <CheckCircle sx={{ fontSize: 12, color: '#16a34a' }} />}
        {warn && <Warning sx={{ fontSize: 12, color: '#d97706' }} />}
      </Stack>
    </Stack>
  )
}

function computeFitScore(a: BuildabilityAssessment): number {
  let score = 0
  const lot = a.parcel?.lot_area_sqft || 0
  const zone = a.zoning?.zoning_string || ''
  const flags = a.overlay_flags
  const buildable = a.buildable_envelope?.properties?.envelope_area_sqft || 0
  const adu = a.assessments.find(x => x.building_type === 'ADU')

  // Zone eligibility (25 pts)
  if (zone.startsWith('R1') || zone.startsWith('R2') || zone.startsWith('RD')) score += 25
  else if (zone.startsWith('R')) score += 15

  // Lot size (20 pts)
  if (lot >= 7000) score += 20
  else if (lot >= 5000) score += 16
  else if (lot >= 3500) score += 10
  else score += 5

  // Overlay risk (20 pts)
  const overlays = [flags.hillside, flags.hpoz, flags.coastal, flags.fire_zone_1, flags.fault_zone].filter(Boolean).length
  score += Math.max(0, 20 - overlays * 8)

  // ADU feasibility (20 pts)
  if (adu?.verdict === 'ALLOWED') score += 20
  else if (adu?.verdict === 'FLAGGED') score += 10

  // Buildable area (15 pts)
  if (buildable >= 1500) score += 15
  else if (buildable >= 900) score += 12
  else if (buildable >= 550) score += 8
  else score += 3

  return Math.min(100, Math.max(0, score))
}

function generateChecklist(a: BuildabilityAssessment): { title: string; detail: string }[] {
  const items: { title: string; detail: string }[] = []

  // Always needed
  items.push({ title: 'Verify lot dimensions', detail: `Confirm ${a.parcel?.lot_area_sqft ? Math.round(a.parcel.lot_area_sqft).toLocaleString() + ' sqft' : 'lot area'} matches on-site measurement` })
  items.push({ title: 'Check rear yard access', detail: 'Confirm truck/equipment access path to rear for ADU placement' })
  items.push({ title: 'Photo existing structures', detail: 'Document primary dwelling, garage, any sheds for permit application' })
  items.push({ title: 'Locate utility connections', detail: 'Find sewer lateral, water main, electrical panel locations' })

  // Zone-specific
  const zone = a.zoning?.zoning_string || ''
  if (zone.includes('R1')) {
    items.push({ title: 'Verify single-family use', detail: 'Confirm property is currently used as single-family residence' })
  }

  // Overlay-specific
  if (a.overlay_flags.hillside) {
    items.push({ title: 'Assess slope grade', detail: 'Hillside flag detected — measure actual grade for foundation design' })
  }
  if (a.overlay_flags.fire_zone_1) {
    items.push({ title: 'Note fire clearance', detail: 'Fire zone — check brush clearance and access for fire department' })
  }
  if (a.overlay_flags.hpoz) {
    items.push({ title: 'Review HPOZ guidelines', detail: 'Historic preservation — check design compatibility requirements' })
  }

  // Setback verification
  const setbackFindings = a.assessments.flatMap(x => x.findings).filter(f => f.finding_type.includes('setback'))
  if (setbackFindings.length > 0) {
    items.push({ title: 'Measure actual setbacks', detail: `Verify front/side/rear distances match computed values` })
  }

  // Trees / obstructions
  items.push({ title: 'Document trees & obstructions', detail: 'Note any protected trees, easements, or utility poles in buildable zone' })

  return items
}
