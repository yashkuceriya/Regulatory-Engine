import { useState, useEffect, useRef } from 'react'
import {
  Box, Typography, Card, CardContent, Stack, Chip, Tabs, Tab,
  LinearProgress, Collapse, Tooltip, Button, useTheme, alpha,
  Slider, TextField, IconButton,
} from '@mui/material'
import {
  CheckCircle, Warning, Info, ExpandMore,
  Gavel, Straighten, Height, Home, DirectionsCar, Layers, GridView,
  Place, Shield, Architecture, Timer, TrendingUp, VerifiedUser, Security, Map as MapIcon,
  PictureAsPdf, Description, Storage, WarningAmber, Tune,
} from '@mui/icons-material'
import { useReactToPrint } from 'react-to-print'
import PrintableReport from './PrintableReport'
import MapPanel from './MapPanel'
import SetbackDiagram from './SetbackDiagram'
import FeedbackButton from './FeedbackButton'
import RegulatoryReasoning from './RegulatoryReasoning'
import { AreaDonut, ConfidenceBreakdown, ConstraintRadar, PipelineTimeline, OverlayRiskGrid, MethodBreakdown } from './AssessmentCharts'
import CoverFitAnalysis from './CoverFitAnalysis'
import BuildingEnvelopeViz from './BuildingEnvelopeViz'
import SectionNav from './SectionNav'
import GlossaryTerm from './GlossaryTerm'
import { useLamcChunks } from '../hooks/useAssessment'
import type { BuildabilityAssessment, BuildingTypeAssessment, RegulatoryFinding, Evidence } from '../types/assessment'

// Used by subcomponents that don't have access to the theme hook (non-component functions)
const P = '#3d2c24'

const FINDING_ICONS: Record<string, any> = {
  front_setback: <Straighten sx={{ fontSize: 16 }} />,
  interior_side_setback: <Straighten sx={{ fontSize: 16 }} />,
  rear_setback: <Straighten sx={{ fontSize: 16 }} />,
  max_height: <Height sx={{ fontSize: 16 }} />,
  max_stories: <Layers sx={{ fontSize: 16 }} />,
  rfar: <GridView sx={{ fontSize: 16 }} />,
  max_floor_area: <Home sx={{ fontSize: 16 }} />,
  parking: <DirectionsCar sx={{ fontSize: 16 }} />,
  adu_max_height: <Height sx={{ fontSize: 16 }} />,
  adu_size_guarantee: <Home sx={{ fontSize: 16 }} />,
}

interface Props { assessment: BuildabilityAssessment; onBack?: () => void }

export default function AssessmentFullPage({ assessment, onBack }: Props) {
  const [tab, setTab] = useState(0)
  const [showParcel, setShowParcel] = useState(true)
  const [showEnvelope, setShowEnvelope] = useState(true)
  const [projectType, setProjectType] = useState<'adu_detached' | 'adu_converted' | 'guest_house'>('adu_detached')
  const [targetSqft, setTargetSqft] = useState<number>(0)
  const [targetBeds, setTargetBeds] = useState<number>(1)
  const [inputsOpen, setInputsOpen] = useState(true)
  const printRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({ contentRef: printRef })
  const theme = useTheme()
  const P = theme.palette.primary.main
  const { data: lamcChunks, isLoading: lamcLoading, isError: lamcError } = useLamcChunks()
  const tabs = assessment.assessments.map(a => a.building_type)
  const allFindings = assessment.assessments.flatMap(a => a.findings)
  const reviewCount = allFindings.filter(f => f.method === 'not_evaluated').length
  const hasReviewNeeds = reviewCount > 0 || hasOverlays(assessment)

  const confidences = assessment.assessments.map(a => a.composite_confidence).filter(c => c > 0)
  const overallConf = Math.round(confidences.length ? Math.min(...confidences) * 100 : 0)
  const sfrResult = assessment.assessments.find(a => a.building_type === 'SFR')
  const sfrConfidence = sfrResult?.composite_confidence || 0
  const hasEnvelopeData = !!assessment.buildable_envelope
  // Only truly out-of-scope when we have zero useful data (no envelope AND no findings)
  const hasMeaningfulFindings = (sfrResult?.findings?.length || 0) > 0
  const isOutOfScope = !hasEnvelopeData && !hasMeaningfulFindings

  const lotArea = assessment.parcel?.lot_area_sqft
  const envArea = assessment.buildable_envelope?.properties?.envelope_area_sqft
  const buildable = envArea || 0
  const restricted = lotArea ? lotArea - buildable : 0
  const coveragePct = lotArea && buildable ? Math.round((buildable / lotArea) * 100) : 0

  // ── Executive summary ──
  const summaryText = (() => {
    const zone = assessment.zoning?.zoning_string || 'Unknown'
    const areaStr = lotArea ? `${lotArea.toLocaleString()} sqft` : 'Unknown'
    const aduResult = assessment.assessments.find(a => a.building_type === 'ADU')
    const verdict = aduResult?.verdict ?? sfrResult?.verdict
    const verb = verdict === 'ALLOWED' ? 'supports' : verdict === 'FLAGGED' ? 'may support' : 'does not support'
    const effectiveB = buildable || (lotArea ? lotArea * 0.55 : 0)
    const units = [
      { model: 'S1', minBuildable: 700, minLot: 3500 },
      { model: 'S2', minBuildable: 1000, minLot: 5000 },
      { model: 'Custom Build', minBuildable: 1500, minLot: 7000 },
    ]
    const fitting = units.filter(u => effectiveB >= u.minBuildable && (lotArea || 0) >= u.minLot)
    const best = fitting[fitting.length - 1]
    const unitStr = best ? `a Cover ${best.model}` : 'an ADU'
    const overlayNames: string[] = []
    const f = assessment.overlay_flags
    if (f.hpoz) overlayNames.push('HPOZ')
    if (f.hillside) overlayNames.push('Hillside')
    if (f.fire_zone_1) overlayNames.push('VHFHSZ')
    if (f.coastal) overlayNames.push('Flood')
    if (f.fault_zone) overlayNames.push('Fault')
    if (f.toc_tier) overlayNames.push(`TOC Tier ${f.toc_tier}`)
    const overlayStr = overlayNames.length ? `Overlays: ${overlayNames.join(', ')}.` : 'No overlays detected.'
    if (isOutOfScope) return `This ${areaStr} ${zone} lot is outside residential scope. ${overlayStr} Confidence: ${overallConf}%.`
    return `This ${areaStr} ${zone} lot ${verb} ${unitStr}. ${overlayStr} Confidence: ${overallConf}%.`
  })()

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'background.default' }}>
      {/* ── Breadcrumbs ── */}
      <Box sx={{ px: { xs: 3, md: 5 }, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography onClick={onBack} sx={{ fontSize: 13, color: alpha(P, 0.6), fontWeight: 500, cursor: 'pointer', '&:hover': { color: P, textDecoration: 'underline' } }}>Projects</Typography>
        <Typography sx={{ fontSize: 10, color: alpha(P, 0.25) }}>›</Typography>
        <Typography sx={{ fontSize: 13, color: alpha(P, 0.6), fontWeight: 500 }}>Assessment</Typography>
        <Typography sx={{ fontSize: 10, color: alpha(P, 0.25) }}>›</Typography>
        <Typography sx={{ fontSize: 13, color: P, fontWeight: 600 }}>{assessment.address.split(',')[0]}</Typography>
      </Box>

      {/* ── Executive Summary ── */}
      <Box sx={{ px: { xs: 3, md: 5 } }}>
        <Typography sx={{ fontSize: 14, fontWeight: 500, color: alpha(P, 0.7), lineHeight: 1.6, mb: assessment.pipeline_errors?.length ? 1 : 2 }}>
          {summaryText}
        </Typography>
        {assessment.pipeline_errors?.length > 0 && (
          <Stack spacing={0.3} sx={{ mb: 2 }}>
            {assessment.pipeline_errors.map((e, i) => (
              <Typography key={i} sx={{ fontSize: 11, color: '#92400e', bgcolor: '#fffbeb', px: 1.5, py: 0.4, borderRadius: 1, display: 'inline-block' }}>
                {e.step}: {e.message}
              </Typography>
            ))}
          </Stack>
        )}
      </Box>

      <Box sx={{ display: 'flex', maxWidth: 1440, mx: 'auto' }}>
        <SectionNav />
        <Box sx={{ flex: 1, maxWidth: 1280, px: { xs: 3, md: 5 }, pb: 4 }}>
        {/* ── Hero Header ── */}
        <Box id="section-overview" sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { md: 'flex-end' }, justifyContent: 'space-between', gap: 3, pb: 4, mb: 4, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box>
            <Typography sx={{ fontSize: { xs: 32, md: 40 }, fontWeight: 900, color: P, letterSpacing: '-1px', lineHeight: 1.1, mb: 1.5 }}>
              {assessment.address.split(',')[0]}
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Box sx={{ px: 1.2, py: 0.4, bgcolor: alpha(P, 0.04), border: '1px solid', borderColor: 'divider', borderRadius: 0.5 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: alpha(P, 0.67), letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  <GlossaryTerm term="APN">APN</GlossaryTerm>: {assessment.parcel?.apn || 'N/A'}
                </Typography>
              </Box>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: alpha(P, 0.2) }} />
              <Typography sx={{ fontSize: 13, color: alpha(P, 0.6) }}>Zone: {assessment.zoning?.zoning_string || 'N/A'}</Typography>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: alpha(P, 0.2) }} />
              <Typography sx={{ fontSize: 13, color: alpha(P, 0.6) }}>{assessment.zoning?.category || 'Residential'}</Typography>
            </Stack>
          </Box>
          <Stack direction="row" spacing={1.5} flexShrink={0} alignItems="center">
            <Button
              variant="outlined" size="small" startIcon={<PictureAsPdf sx={{ fontSize: 16 }} />}
              onClick={() => handlePrint()}
              sx={{ fontSize: 12, fontWeight: 600, borderColor: alpha(P, 0.2), color: P, borderRadius: 99, px: 2, '&:hover': { borderColor: P, bgcolor: alpha(P, 0.04) } }}
            >
              Export PDF
            </Button>
            {assessment.assessments.map((item) => (
              <Box key={item.building_type} sx={{
                display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderRadius: 99,
                bgcolor: item.verdict === 'ALLOWED' ? '#ecfdf5' : item.verdict === 'FLAGGED' ? '#fffbeb' : 'background.default',
                border: `1px solid ${item.verdict === 'ALLOWED' ? '#bbf7d0' : item.verdict === 'FLAGGED' ? '#fde68a' : '#e5ddd5'}`,
              }}>
                {item.verdict === 'ALLOWED'
                  ? <CheckCircle sx={{ fontSize: 16, color: '#16a34a' }} />
                  : <Warning sx={{ fontSize: 16, color: '#d97706' }} />}
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: item.verdict === 'ALLOWED' ? '#15803d' : '#92400e' }}>
                  {item.building_type} {item.verdict === 'ALLOWED' ? 'Allowed' : 'Review'}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        {/* ── Project Inputs Bar ── */}
        <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', mb: 3, overflow: 'hidden' }}>
          <Box
            onClick={() => setInputsOpen(o => !o)}
            sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', '&:hover': { bgcolor: alpha(P, 0.02) } }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Tune sx={{ fontSize: 18, color: P }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: P }}>Project Inputs</Typography>
              <Typography sx={{ fontSize: 11, color: alpha(P, 0.4) }}>Adjust inputs to update recommendations below</Typography>
            </Stack>
            <ExpandMore sx={{ fontSize: 20, color: alpha(P, 0.4), transform: inputsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </Box>
          <Collapse in={inputsOpen}>
            <Box sx={{ px: 2.5, pb: 2, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
              {/* Project Type */}
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: alpha(P, 0.5), textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.8 }}>Type</Typography>
                <Stack direction="row" spacing={0.5}>
                  {([['adu_detached', 'Detached ADU'], ['adu_converted', 'Converted ADU'], ['guest_house', 'Guest House']] as const).map(([val, label]) => (
                    <Chip
                      key={val}
                      label={label}
                      size="small"
                      onClick={() => setProjectType(val)}
                      sx={{
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        bgcolor: projectType === val ? P : alpha(P, 0.06),
                        color: projectType === val ? '#fff' : P,
                        '&:hover': { bgcolor: projectType === val ? P : alpha(P, 0.12) },
                      }}
                    />
                  ))}
                </Stack>
              </Box>

              {/* Target Sqft */}
              <Box sx={{ minWidth: 200, flex: 1, maxWidth: 320 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: alpha(P, 0.5), textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.8 }}>Target Sqft</Typography>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Slider
                    value={targetSqft}
                    onChange={(_, v) => setTargetSqft(v as number)}
                    min={0} max={1200} step={50}
                    sx={{ color: P, flex: 1 }}
                    size="small"
                  />
                  <TextField
                    value={targetSqft}
                    onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setTargetSqft(Math.max(0, Math.min(1200, n))) }}
                    size="small"
                    sx={{ width: 72, '& .MuiInputBase-input': { fontSize: 12, fontWeight: 700, color: P, textAlign: 'center', py: 0.5 } }}
                    inputProps={{ min: 0, max: 1200 }}
                  />
                </Stack>
              </Box>

              {/* Bedrooms */}
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: alpha(P, 0.5), textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.8 }}>Bedrooms</Typography>
                <Stack direction="row" spacing={0.5}>
                  {([
                    [0, 'Studio'],
                    [1, '1 BR'],
                    [2, '2 BR'],
                  ] as const).map(([val, label]) => (
                    <Chip
                      key={val}
                      label={label}
                      size="small"
                      onClick={() => setTargetBeds(val)}
                      sx={{
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        bgcolor: targetBeds === val ? P : alpha(P, 0.06),
                        color: targetBeds === val ? '#fff' : P,
                        '&:hover': { bgcolor: targetBeds === val ? P : alpha(P, 0.12) },
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            </Box>
          </Collapse>
        </Card>

        {/* ── Analysis Grid: Map (8col) + Sidebar (4col) ── */}
        <Box id="section-map" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3, mb: 3 }}>
          {/* Map */}
          <Card sx={{ overflow: 'hidden', borderRadius: 3, border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, color: P }}>
                <MapIcon sx={{ fontSize: 20, color: P }} /> Parcel Intelligence Map
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title={`${showParcel ? 'Hide' : 'Show'} parcel · ${showEnvelope ? 'Hide' : 'Show'} envelope`}>
                  <Box
                    onClick={() => { setShowParcel(p => !p); setShowEnvelope(e => !e) }}
                    sx={{ p: 0.8, borderRadius: 2, bgcolor: alpha(P, 0.04), cursor: 'pointer', '&:hover': { bgcolor: alpha(P, 0.1) } }}
                  >
                    <Layers sx={{ fontSize: 18, color: P }} />
                  </Box>
                </Tooltip>
                <Box sx={{ p: 0.8, borderRadius: 2, bgcolor: alpha(P, 0.04), cursor: 'pointer', '&:hover': { bgcolor: alpha(P, 0.1) } }}>
                  <Straighten sx={{ fontSize: 18, color: P }} />
                </Box>
              </Stack>
            </Box>
            <Box sx={{ flex: 1, minHeight: 420, position: 'relative' }}>
              <MapPanel assessment={assessment} showParcel={showParcel} showEnvelope={showEnvelope} />
            </Box>
          </Card>

          {/* Right sidebar: Lot Breakdown + Confidence */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Lot Area Breakdown */}
            <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: P, mb: 3, width: '100%' }}>Lot Area Breakdown</Typography>

              {coveragePct > 0 ? (
                <>
                  {/* Donut */}
                  <Box sx={{ position: 'relative', width: 180, height: 180, mb: 3 }}>
                    <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="90" cy="90" r="72" fill="none" stroke={alpha(P, 0.1)} strokeWidth="18" />
                      <circle cx="90" cy="90" r="72" fill="none" stroke={P} strokeWidth="18"
                        strokeDasharray={`${2 * Math.PI * 72}`}
                        strokeDashoffset={`${2 * Math.PI * 72 * (1 - coveragePct / 100)}`}
                        strokeLinecap="round" />
                    </svg>
                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography sx={{ fontSize: 36, fontWeight: 900, color: P, lineHeight: 1 }}>{coveragePct}%</Typography>
                      <Typography sx={{ fontSize: 10, fontWeight: 700, color: alpha(P, 0.4), textTransform: 'uppercase', letterSpacing: '0.5px' }}>Buildable</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, width: '100%' }}>
                    <Box sx={{ p: 1.5, bgcolor: alpha(P, 0.04), borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <Typography sx={{ fontSize: 10, fontWeight: 800, color: alpha(P, 0.4), textTransform: 'uppercase', mb: 0.3 }}>Buildable</Typography>
                      <Typography sx={{ fontSize: 18, fontWeight: 900, color: P }}>{Math.round(buildable).toLocaleString()} SF</Typography>
                    </Box>
                    <Box sx={{ p: 1.5, bgcolor: 'background.default', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <Typography sx={{ fontSize: 10, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', mb: 0.3 }}>Restricted</Typography>
                      <Typography sx={{ fontSize: 18, fontWeight: 900, color: 'text.primary' }}>{Math.round(restricted).toLocaleString()} SF</Typography>
                    </Box>
                  </Box>
                </>
              ) : (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <Typography sx={{ fontSize: 28, fontWeight: 900, color: P, mb: 0.5 }}>
                    {lotArea ? `${Math.round(lotArea).toLocaleString()} SF` : 'N/A'}
                  </Typography>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', mb: 2 }}>Total Lot Area</Typography>
                  <Box sx={{ p: 1.5, bgcolor: '#fef3c7', borderRadius: 2, border: '1px solid #fde68a' }}>
                    <Typography sx={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                      {isOutOfScope
                        ? `Envelope data unavailable for ${assessment.zoning?.zoning_string || 'this zone'}`
                        : 'Buildable envelope not available for this parcel'}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Card>

            {/* Confidence Score — dark card */}
            <Card sx={{ borderRadius: 3, bgcolor: isOutOfScope ? 'text.secondary' : P, p: 3, color: '#fff', boxShadow: `0 8px 32px ${alpha(P, 0.2)}` }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                  {isOutOfScope ? 'Assessment Status' : 'Confidence Score'}
                </Typography>
                <VerifiedUser sx={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }} />
              </Stack>
              {isOutOfScope ? (
                <>
                  <Typography sx={{ fontSize: 20, fontWeight: 900, lineHeight: 1, mb: 1.5 }}>Limited Data</Typography>
                  <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7 }}>
                    Zone <strong>{assessment.zoning?.zoning_string}</strong> has limited coverage. Check findings below for available analysis.
                  </Typography>
                </>
              ) : (
                <>
                  <Stack direction="row" alignItems="flex-end" spacing={1.5} sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>{overallConf}%</Typography>
                    <Box sx={{ flex: 1, mb: 1 }}>
                      <Box sx={{ height: 10, bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', width: `${overallConf}%`, bgcolor: '#fff', borderRadius: 99 }} />
                      </Box>
                    </Box>
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>
                    {overallConf >= 80 ? 'High' : overallConf >= 60 ? 'Moderate' : 'Low'} confidence based on {assessment.citations?.length || 0} cited sources and deterministic rule engine outputs.
                  </Typography>
                </>
              )}
            </Card>

            {/* Trust Summary */}
            {allFindings.length > 0 && (
              <Box sx={{ p: 2, bgcolor: alpha(P, 0.03), borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: alpha(P, 0.5), textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>Evidence Overview</Typography>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CheckCircle sx={{ fontSize: 14, color: '#16a34a' }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: P }}>
                      {allFindings.filter(f => f.method === 'lookup' || f.method === 'calculation').length} of {allFindings.length} findings from deterministic rules
                    </Typography>
                  </Stack>
                  {reviewCount > 0 && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <WarningAmber sx={{ fontSize: 14, color: '#d97706' }} />
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>
                        {reviewCount} {reviewCount === 1 ? 'finding needs' : 'findings need'} review
                      </Typography>
                    </Stack>
                  )}
                </Stack>
              </Box>
            )}
          </Box>
        </Box>

        {/* ── Overlay Risk Matrix ── */}
        <Card id="section-overlays" sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 3, mb: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mb: 3 }}>
            <Box>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: P }}>Overlay Risk Matrix</Typography>
              <Typography sx={{ fontSize: 13, color: alpha(P, 0.4) }}>Automated screening against environmental and regulatory constraints.</Typography>
            </Box>
            {(() => {
              const unscreened = assessment.overlay_flags.unscreened_overlays
              const hasUnscreened = unscreened && unscreened.length > 0
              return hasOverlays(assessment) ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#fef3c7', px: 2, py: 1, borderRadius: 2, border: '1px solid #fde68a' }}>
                  <Security sx={{ fontSize: 18, color: '#d97706' }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Overlays Detected</Typography>
                </Box>
              ) : hasUnscreened ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f5f0eb', px: 2, py: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Security sx={{ fontSize: 18, color: alpha(P, 0.4) }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: alpha(P, 0.6) }}>Partial Screening</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#ecfdf5', px: 2, py: 1, borderRadius: 2, border: '1px solid #bbf7d0' }}>
                  <Security sx={{ fontSize: 18, color: '#16a34a' }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>All Constraints Clear</Typography>
                </Box>
              )
            })()}
          </Stack>
          {(() => {
            const unscreened = new Set(assessment.overlay_flags.unscreened_overlays || [])
            const overlayKeyMap: Record<string, string> = { fault_zone: 'Seismic', coastal: 'Hydrology', fire_zone_1: 'Fire', toc: 'Biological' }
            const items = [
              { cat: 'Topography', label: 'Hillside', glossary: null, active: assessment.overlay_flags.hillside, screened: true },
              { cat: 'Heritage', label: 'HPOZ', glossary: 'HPOZ', active: assessment.overlay_flags.hpoz, screened: true },
              { cat: 'Seismic', label: 'Liquefaction', glossary: null, active: assessment.overlay_flags.fault_zone, screened: !unscreened.has('fault_zone') },
              { cat: 'Hydrology', label: 'Flood Zone', glossary: null, active: assessment.overlay_flags.coastal, screened: !unscreened.has('coastal') },
              { cat: 'Fire', label: 'VHFHSZ', glossary: 'VHFHSZ', active: assessment.overlay_flags.fire_zone_1, screened: !unscreened.has('fire_zone_1') },
              { cat: 'Biological', label: assessment.overlay_flags.toc_tier ? `TOC Tier ${assessment.overlay_flags.toc_tier}` : 'TOC', glossary: 'TOC', active: assessment.overlay_flags.toc_tier !== null, screened: !unscreened.has('toc') },
            ]
            return (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 1.5 }}>
            {items.map(item => (
              <Box key={item.cat} sx={{
                display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, bgcolor: 'background.default', borderRadius: 2,
                border: '1px solid', borderColor: 'divider', transition: 'all 0.15s',
                '&:hover': { borderColor: alpha(P, 0.2) },
              }}>
                <Typography sx={{ fontSize: 9, fontWeight: 900, color: alpha(P, 0.25), textTransform: 'uppercase', letterSpacing: '1.5px' }}>{item.cat}</Typography>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: item.active ? '#dc2626' : !item.screened ? alpha(P, 0.35) : P }}>
                    {item.glossary ? <GlossaryTerm term={item.glossary}>{item.label}</GlossaryTerm> : item.label}
                  </Typography>
                  {!item.screened ? (
                    <Tooltip title="Not screened — requires external GIS layer">
                      <Info sx={{ fontSize: 18, color: alpha(P, 0.2) }} />
                    </Tooltip>
                  ) : (
                    <CheckCircle sx={{ fontSize: 18, color: item.active ? '#dc2626' : '#22c55e' }} />
                  )}
                </Stack>
              </Box>
            ))}
          </Box>
            )
          })()}
        </Card>

        {/* ── 3D Building Envelope — show whenever we have findings with setback data ── */}
        <Box id="section-envelope">
          {hasEnvelopeData && <BuildingEnvelopeViz assessment={assessment} />}
        </Box>

        {/* ── Cover Fit Analysis ── */}
        <Box id="section-coverfit">
          <CoverFitAnalysis assessment={assessment} projectType={projectType} targetSqft={targetSqft} targetBeds={targetBeds} />
        </Box>

        {/* ── Tabs: Building Types + Code + Citations ── */}
        <Card id="section-findings" sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', mb: 3 }}>
          <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2.5, minHeight: 44 }}
              TabIndicatorProps={{ sx: { bgcolor: P, height: 2.5 } }}>
              {tabs.map(t => (
                <Tab key={t} label={t === 'SFR' ? 'Single Family' : t} sx={{ minHeight: 44, fontSize: 13, fontWeight: 600, color: 'text.disabled', '&.Mui-selected': { color: P } }} />
              ))}
              <Tab label="Code Text" sx={{ minHeight: 44, fontSize: 13, fontWeight: 600, color: 'text.disabled', '&.Mui-selected': { color: P } }} />
              <Tab label="Citations" sx={{ minHeight: 44, fontSize: 13, fontWeight: 600, color: 'text.disabled', '&.Mui-selected': { color: P } }} />
            </Tabs>
          </Box>
          <CardContent sx={{ p: 3 }}>
            {tab === tabs.length ? (
              <RegulatoryReasoning findings={assessment.assessments.flatMap(a => a.findings)} chunks={lamcChunks || {}} loading={lamcLoading} error={lamcError} />
            ) : tab === tabs.length + 1 ? (
              <CitationsView citations={assessment.citations} />
            ) : assessment.assessments[tab] ? (
              <BuildingTypeContent bta={assessment.assessments[tab]} assessment={assessment} />
            ) : null}
          </CardContent>
        </Card>

        {/* ── Pipeline Performance ── */}
        {assessment.pipeline_timing && Object.keys(assessment.pipeline_timing).length > 0 && (
          <Card id="section-pipeline" sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 3, mb: 3 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: P, mb: 2 }}>Pipeline Performance</Typography>
            <PipelineTimeline timing={assessment.pipeline_timing} />
          </Card>
        )}

        {/* ── Summary ── */}
        {(assessment.overall_recommendation || assessment.assessments.some(a => a.summary)) && (
          <Card sx={{ borderRadius: 3, border: '1px solid #bbf7d0', bgcolor: '#f0fdf4', p: 3, mb: 3 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#166534', mb: 2 }}>Assessment Summary</Typography>
            {assessment.assessments.filter(a => a.summary).map(a => (
              <Typography key={a.building_type} sx={{ fontSize: 13, color: '#6b5d54', lineHeight: 1.8, mb: 1 }}>{a.summary}</Typography>
            ))}
            {assessment.overall_recommendation && (
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#166534', mt: 1, p: 2, bgcolor: '#dcfce7', borderRadius: 2, lineHeight: 1.7 }}>
                {assessment.overall_recommendation}
              </Typography>
            )}
          </Card>
        )}

        {/* ── Footer ── */}
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography sx={{ fontSize: 11, color: alpha(P, 0.25), fontWeight: 500 }}>
            Generated on {new Date(assessment.created_at || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} &bull; Data Sources: LA City Planning, LA County GIS, Census TIGER &bull; All measurements are approximate.
          </Typography>
          <Typography sx={{ fontSize: 10, color: 'text.disabled', mt: 0.5 }}>
            Verify with licensed architect and local planning department.
          </Typography>
        </Box>
        </Box>{/* end content column */}
      </Box>{/* end flex wrapper */}

      {/* Hidden printable report */}
      <Box sx={{ display: 'none' }}>
        <PrintableReport ref={printRef} assessment={assessment} />
      </Box>
    </Box>
  )
}

/* ─── Building Type Content ─── */
function BuildingTypeContent({ bta, assessment }: { bta: BuildingTypeAssessment; assessment: BuildabilityAssessment }) {
  const P = '#3d2c24'
  const findings = bta.findings.filter(f => f.finding_type !== 'buildable_envelope' && f.finding_type !== 'encroachment_plane')
  const setbacks = findings.filter(f => f.finding_type.includes('setback') || f.finding_type.includes('yard'))
  const dimensional = findings.filter(f => ['height', 'stories', 'rfar', 'far', 'floor_area', 'coverage'].some(k => f.finding_type.includes(k)))
  const other = findings.filter(f => !setbacks.includes(f) && !dimensional.includes(f))

  return (
    <Box>
      {/* Verdict */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2, mb: 3, p: 2, borderRadius: 2,
        bgcolor: bta.verdict === 'ALLOWED' ? '#f0fdf4' : bta.verdict === 'FLAGGED' ? '#fffbeb' : 'background.default',
        border: `1px solid ${bta.verdict === 'ALLOWED' ? '#bbf7d0' : bta.verdict === 'FLAGGED' ? '#fde68a' : '#e5ddd5'}`,
      }}>
        {bta.verdict === 'ALLOWED' ? <CheckCircle sx={{ fontSize: 20, color: '#16a34a' }} /> : <Warning sx={{ fontSize: 20, color: '#d97706' }} />}
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: bta.verdict === 'ALLOWED' ? '#166534' : '#92400e' }}>
          {bta.verdict === 'ALLOWED' ? 'Highly Buildable' : 'Review Required'}
        </Typography>
        <Box sx={{ flex: 1 }}>
          <LinearProgress variant="determinate" value={bta.composite_confidence * 100} sx={{
            height: 6, borderRadius: 3, bgcolor: 'divider',
            '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: bta.composite_confidence >= 0.8 ? '#16a34a' : '#d97706' },
          }} />
        </Box>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: bta.composite_confidence >= 0.8 ? '#16a34a' : '#d97706' }}>
          {(bta.composite_confidence * 100).toFixed(0)}%
        </Typography>
      </Box>

      {/* AI Summary */}
      {bta.summary && (
        <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 2, borderLeft: `3px solid ${P}` }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: P, textTransform: 'uppercase', letterSpacing: '0.4px', mb: 0.8 }}>AI Analysis</Typography>
          <Typography sx={{ fontSize: 13, color: '#6b5d54', lineHeight: 1.8 }}>{bta.summary}</Typography>
        </Box>
      )}

      {/* Constraints */}
      {(setbacks.length > 0 || dimensional.length > 0) && (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: P, mb: 2 }}>Synthesized Constraints</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mb: 3 }}>
            {[...setbacks, ...dimensional].filter(f => f.value != null && typeof f.value !== 'object').slice(0, 6).map((f, i) => (
              <MetricCard key={i} finding={f} index={i} />
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {setbacks.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', letterSpacing: '0.6px', mb: 1 }}>Setbacks (Min)</Typography>
                <Box sx={{ bgcolor: '#f5f0eb', borderRadius: 2, p: 1.5 }}>
                  {setbacks.map((f, i) => <DetailRow key={i} finding={f} address={assessment.address} />)}
                </Box>
              </Box>
            )}
            {dimensional.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', letterSpacing: '0.6px', mb: 1 }}>Bulk & Intensity</Typography>
                <Box sx={{ bgcolor: '#f5f0eb', borderRadius: 2, p: 1.5 }}>
                  {dimensional.map((f, i) => <DetailRow key={i} finding={f} address={assessment.address} />)}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {setbacks.length > 0 && <SetbackDiagram findings={[...setbacks, ...dimensional]} assessment={assessment} />}

      {/* Charts */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 3, my: 3 }}>
        <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 3, border: `1px solid ${P}10` }}>
          <ConstraintRadar bta={bta} />
          <MethodBreakdown bta={bta} />
        </Box>
        <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 3, border: `1px solid ${P}10` }}>
          <ConfidenceBreakdown bta={bta} />
        </Box>
      </Box>

      {other.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: `${P}60`, textTransform: 'uppercase', letterSpacing: '0.6px', mb: 1 }}>Additional Standards</Typography>
          <Box sx={{ bgcolor: '#f5f0eb', borderRadius: 2, p: 1.5 }}>
            {other.map((f, i) => <DetailRow key={i} finding={f} address={assessment.address} />)}
          </Box>
        </Box>
      )}

      {assessment.edge_cases && assessment.edge_cases.length > 0 && (
        <Box sx={{ mt: 3, p: 2, bgcolor: '#fffbeb', borderRadius: 2, border: '1px solid #fde68a' }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.3px', mb: 0.8 }}>Potential Interpretation Ambiguity</Typography>
          {assessment.edge_cases.map((ec, i) => (
            <Typography key={i} sx={{ fontSize: 12, color: '#78350f', lineHeight: 1.7, mb: 0.3 }}>{ec}</Typography>
          ))}
        </Box>
      )}
    </Box>
  )
}

/* ─── Metric Card ─── */
function MetricCard({ finding, index }: { finding: RegulatoryFinding; index: number }) {
  const label = finding.finding_type.replace(/^adu_/, '').replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const icon = FINDING_ICONS[finding.finding_type] || <Straighten sx={{ fontSize: 16 }} />
  const confPct = Math.round(finding.confidence * 100)
  const confColor = confPct >= 80 ? '#16a34a' : confPct >= 60 ? '#d97706' : '#dc2626'

  return (
    <Box sx={{
      p: 2, borderRadius: 2, bgcolor: '#fff', border: `1px solid ${P}10`, position: 'relative', overflow: 'hidden',
      transition: 'all 0.2s', animation: `slideUp 0.35s ease-out ${index * 0.05}s both`,
      '&:hover': { borderColor: P, boxShadow: `0 4px 12px ${P}10` },
    }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, bgcolor: `${P}10` }}>
        <Box sx={{ height: '100%', width: `${confPct}%`, bgcolor: confColor, transition: 'width 0.8s ease' }} />
      </Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mt: 0.5 }}>
        <Box sx={{ color: '#b0a69d' }}>{icon}</Box>
        <Chip label={`${confPct}%`} size="small" sx={{
          height: 16, fontSize: '0.5rem', fontWeight: 700,
          bgcolor: confPct >= 80 ? '#dcfce7' : confPct >= 60 ? '#fef3c7' : '#fee2e2', color: confColor,
        }} />
      </Stack>
      <Typography sx={{ fontSize: 24, fontWeight: 900, color: P, mt: 0.8, lineHeight: 1 }}>{String(finding.value)}</Typography>
      <Typography sx={{ fontSize: 10, color: '#b0a69d', mt: 0.3 }}>{finding.unit || ''} — {label}</Typography>
    </Box>
  )
}

/* ─── Detail Row ─── */
function DetailRow({ finding, address }: { finding: RegulatoryFinding; address: string }) {
  const [open, setOpen] = useState(false)
  const label = finding.finding_type.replace(/^adu_/, '').replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const hasValue = finding.value != null && typeof finding.value !== 'object'
  const isNE = finding.method === 'not_evaluated'
  const confColor = finding.confidence >= 0.8 ? '#16a34a' : finding.confidence >= 0.6 ? '#d97706' : '#dc2626'

  return (
    <Box sx={{ borderBottom: '1px solid #e5ddd5', '&:last-child': { borderBottom: 'none' } }}>
      <Box onClick={() => setOpen(!open)} sx={{
        display: 'flex', alignItems: 'center', py: 0.8, cursor: 'pointer',
        '&:hover': { bgcolor: '#f0ebe5' }, px: 0.5, borderRadius: 1, transition: 'background-color 0.15s',
      }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, color: isNE ? '#d97706' : '#334155', fontWeight: 500 }}>{label}</Typography>
        </Box>
        {hasValue && (
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: P, mr: 1 }}>
            {String(finding.value)}<span style={{ fontSize: 10, color: '#b0a69d', marginLeft: 2 }}>{finding.unit || ''}</span>
          </Typography>
        )}
        {isNE && <Chip label="Review" size="small" sx={{ height: 18, fontSize: '0.5rem', mr: 1, bgcolor: '#fef3c7', color: '#92400e' }} />}
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: confColor, mr: 1 }} />
        <FeedbackButton address={address} findingType={finding.finding_type} />
        <ExpandMore sx={{ fontSize: 14, color: '#d4c8be', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 1, pb: 1.5, pt: 0.3 }}>
          {/* Confidence bar */}
          <Box sx={{ mb: 1.2 }}>
            <Box sx={{
              height: 3, borderRadius: 2, overflow: 'hidden',
              bgcolor: finding.confidence >= 0.8 ? '#dcfce7' : finding.confidence >= 0.6 ? '#dbeafe' : finding.confidence >= 0.3 ? '#fef3c7' : '#fee2e2',
            }}>
              <Box sx={{
                height: '100%', borderRadius: 2, width: `${Math.max(finding.confidence * 100, 5)}%`,
                bgcolor: finding.confidence >= 0.8 ? '#16a34a' : finding.confidence >= 0.6 ? '#2563eb' : finding.confidence >= 0.3 ? '#d97706' : '#dc2626',
              }} />
            </Box>
            <Typography sx={{
              fontSize: 10, mt: 0.3, fontWeight: 600,
              color: finding.confidence >= 0.8 ? '#16a34a' : finding.confidence >= 0.6 ? '#2563eb' : finding.confidence >= 0.3 ? '#d97706' : '#dc2626',
            }}>
              {finding.confidence >= 0.8 ? 'High confidence \u2014 directly from code text'
                : finding.confidence >= 0.6 ? 'Moderate confidence \u2014 calculated from multiple sources'
                : finding.confidence >= 0.3 ? 'Low confidence \u2014 approximate or default value'
                : 'Not evaluated \u2014 verify independently'}
            </Typography>
          </Box>

          {/* Method badge */}
          <Stack direction="row" spacing={0.8} sx={{ mb: 1 }}>
            <Chip
              label={finding.method === 'lookup' ? 'Deterministic Lookup'
                : finding.method === 'calculation' ? 'Calculated'
                : finding.method === 'llm_synthesis' ? 'AI-Assisted'
                : 'Not Evaluated'}
              size="small"
              sx={{
                height: 20, fontSize: '0.55rem', fontWeight: 700,
                ...(finding.method === 'lookup' ? { bgcolor: '#dcfce7', color: '#166534' }
                  : finding.method === 'calculation' ? { bgcolor: '#dbeafe', color: '#1e40af' }
                  : finding.method === 'llm_synthesis' ? { bgcolor: '#f3e8ff', color: '#6b21a8' }
                  : { bgcolor: '#fef3c7', color: '#92400e' }),
              }}
            />
            <Chip label={`${(finding.confidence * 100).toFixed(0)}% conf`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.5rem', borderColor: confColor, color: confColor }} />
          </Stack>

          {finding.reason && <Typography sx={{ fontSize: 11, color: '#d97706', mb: 0.8 }}>{finding.reason.replace(/:/g, ' \u2014 ').replace(/_/g, ' ')}</Typography>}

          {/* Source trail */}
          {finding.evidence.length > 0 && (
            <Stack spacing={0.5} sx={{ mb: 0.8 }}>
              {finding.evidence.map((e, i) => (
                <Box key={i} sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1, p: 1, bgcolor: '#fff',
                  borderRadius: 1.5, border: '1px solid #e5ddd5',
                }}>
                  {e.source_type === 'lamc_section' ? <Gavel sx={{ fontSize: 14, color: P, mt: 0.2, flexShrink: 0 }} />
                    : e.source_type === 'pdf_table' ? <Description sx={{ fontSize: 14, color: P, mt: 0.2, flexShrink: 0 }} />
                    : e.source_type === 'api' ? <Storage sx={{ fontSize: 14, color: P, mt: 0.2, flexShrink: 0 }} />
                    : <Gavel sx={{ fontSize: 14, color: P, mt: 0.2, flexShrink: 0 }} />}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 11, color: '#334155', fontWeight: 500, wordBreak: 'break-all' }}>{e.source_locator}</Typography>
                    {e.excerpt_pointer && <Typography sx={{ fontSize: 10, color: '#b0a69d', mt: 0.2 }}>{e.excerpt_pointer}</Typography>}
                  </Box>
                </Box>
              ))}
            </Stack>
          )}

          {/* Assumptions warning */}
          {finding.assumptions.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1, mt: 0.5, bgcolor: '#fffbeb', borderRadius: 1.5, border: '1px solid #fde68a' }}>
              <WarningAmber sx={{ fontSize: 14, color: '#d97706', mt: 0.1, flexShrink: 0 }} />
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.3px', mb: 0.2 }}>Assumptions</Typography>
                <Typography sx={{ fontSize: 11, color: '#78350f', lineHeight: 1.6 }}>{finding.assumptions.join('; ')}</Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

/* ─── Citations ─── */
function CitationsView({ citations }: { citations: Evidence[] }) {
  if (!citations?.length) return <Typography sx={{ fontSize: 13, color: '#b0a69d', textAlign: 'center', py: 6 }}>No citations available</Typography>
  const grouped: Record<string, Evidence[]> = {}
  citations.forEach(c => { const k = c.source_type || 'other'; (grouped[k] ??= []).push(c) })

  return (
    <Box>
      <Typography sx={{ fontSize: 16, fontWeight: 700, color: P, mb: 2 }}>Citations ({citations.length} sources)</Typography>
      {Object.entries(grouped).map(([type, items]) => (
        <Box key={type} sx={{ mb: 2.5 }}>
          <Chip label={`${type} (${items.length})`} size="small" sx={{ mb: 1, bgcolor: '#f0ebe5', color: P, fontWeight: 600, fontSize: '0.55rem' }} />
          <Stack spacing={0.5}>
            {items.map((c, i) => (
              <Box key={i} sx={{
                display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5, bgcolor: '#f5f0eb', borderRadius: 2,
                border: '1px solid transparent', transition: 'all 0.15s', '&:hover': { borderColor: '#e5ddd5', bgcolor: '#fff' },
              }}>
                <Gavel sx={{ fontSize: 12, color: P, mt: 0.2, flexShrink: 0 }} />
                <Box>
                  <Typography sx={{ fontSize: 12, color: '#334155', fontWeight: 500 }}>{c.source_locator}</Typography>
                  {c.excerpt_pointer && <Typography sx={{ fontSize: 11, color: '#b0a69d' }}>{c.excerpt_pointer}</Typography>}
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      ))}
    </Box>
  )
}

/* ─── Helpers ─── */
function hasOverlays(a: BuildabilityAssessment): boolean {
  const f = a.overlay_flags
  return f.hillside || f.hpoz || f.coastal || f.fire_zone_1 || f.fault_zone || f.toc_tier !== null
}
