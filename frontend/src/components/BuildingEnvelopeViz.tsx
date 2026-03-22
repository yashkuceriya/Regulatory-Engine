/**
 * Building Envelope 3D Visualization
 *
 * An isometric SVG visualization showing:
 * - The lot boundary (wireframe)
 * - The buildable envelope (filled)
 * - Height limit plane
 * - Setback zones
 * - ADU placement suggestion
 *
 * This is the "wow factor" — architects and developers
 * immediately understand spatial constraints when they see
 * a 3D envelope, not just numbers in a table.
 */

import { useState, memo } from 'react'
import { Box, Typography, Stack, Chip, Tooltip, useTheme } from '@mui/material'
import type { BuildabilityAssessment, RegulatoryFinding } from '../types/assessment'

interface Props {
  assessment: BuildabilityAssessment
}

export default memo(function BuildingEnvelopeViz({ assessment }: Props) {
  const theme = useTheme()
  const P = theme.palette.primary.main
  const [hovered, setHovered] = useState<string | null>(null)

  const findings = assessment.assessments.flatMap(a => a.findings)
  const front = findVal(findings, 'front_setback') || 20
  const side = findVal(findings, 'interior_side_setback') || 5
  const rear = findVal(findings, 'rear_setback') || 15
  const maxHeight = findVal(findings, 'max_height') || 33
  const maxStories = findVal(findings, 'max_stories') || 2
  const encroachmentPlane = findings.find(f => f.finding_type === 'encroachment_plane')
  const epStartHeight = encroachmentPlane?.value?.start_height_ft || null
  const epAngle = encroachmentPlane?.value?.angle_degrees || null
  const lotArea = assessment.parcel?.lot_area_sqft || 7500
  const envArea = assessment.buildable_envelope?.properties?.envelope_area_sqft || 0
  const coveragePct = envArea && lotArea ? Math.round((envArea / lotArea) * 100) : 0

  // Isometric projection helpers
  const W = 480, H = 380
  const cx = W / 2, cy = 160 // center of lot
  const lotW = 160, lotD = 100 // lot width and depth in iso
  const heightScale = 2.2 // px per ft of height
  const maxH = maxHeight * heightScale

  // Setback ratios
  const fRatio = front / (front + rear + 60) // approx front setback proportion
  const sRatio = side / (side * 2 + 40) // approx side setback proportion
  const rRatio = rear / (front + rear + 60)

  // Iso transform: (x, y) in plan → (screenX, screenY)
  const iso = (x: number, y: number, z: number = 0) => ({
    x: cx + (x - y) * 0.8,
    y: cy + (x + y) * 0.45 - z,
  })

  // Lot corners (plan coordinates)
  const lot = [
    iso(- lotW / 2, -lotD / 2),        // front-left
    iso(lotW / 2, -lotD / 2),           // front-right
    iso(lotW / 2, lotD / 2),            // rear-right
    iso(-lotW / 2, lotD / 2),           // rear-left
  ]

  // Buildable envelope (inset by setbacks)
  const envW = lotW * (1 - sRatio * 2)
  const envD = lotD * (1 - fRatio - rRatio)
  const envOffX = 0
  const envOffY = lotD * (fRatio - rRatio) / 2 // shift based on front/rear asymmetry

  const env = [
    iso(-envW / 2 + envOffX, -envD / 2 + envOffY),
    iso(envW / 2 + envOffX, -envD / 2 + envOffY),
    iso(envW / 2 + envOffX, envD / 2 + envOffY),
    iso(-envW / 2 + envOffX, envD / 2 + envOffY),
  ]

  // Height envelope (3D box)
  const envTop = [
    iso(-envW / 2 + envOffX, -envD / 2 + envOffY, maxH),
    iso(envW / 2 + envOffX, -envD / 2 + envOffY, maxH),
    iso(envW / 2 + envOffX, envD / 2 + envOffY, maxH),
    iso(-envW / 2 + envOffX, envD / 2 + envOffY, maxH),
  ]

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z'

  // ADU suggestion (small box in rear)
  const aduW = envW * 0.35
  const aduD = envD * 0.3
  const aduH = 16 * heightScale
  const aduOffY = envD / 2 + envOffY - aduD / 2 - 5
  const adu = [
    iso(-aduW / 2, aduOffY - aduD / 2),
    iso(aduW / 2, aduOffY - aduD / 2),
    iso(aduW / 2, aduOffY + aduD / 2),
    iso(-aduW / 2, aduOffY + aduD / 2),
  ]
  const aduTop = [
    iso(-aduW / 2, aduOffY - aduD / 2, aduH),
    iso(aduW / 2, aduOffY - aduD / 2, aduH),
    iso(aduW / 2, aduOffY + aduD / 2, aduH),
    iso(-aduW / 2, aduOffY + aduD / 2, aduH),
  ]

  return (
    <Box sx={{
      p: 3, borderRadius: 3, border: `1px solid ${P}15`, bgcolor: '#fff', mb: 3,
    }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: P }}>3D Building Envelope</Typography>
          <Typography sx={{ fontSize: 11, color: '#7a6e65' }}>Isometric view of buildable volume with setback constraints</Typography>
        </Box>
        <Stack direction="row" spacing={0.8}>
          <Chip label={`${maxHeight}ft max`} size="small" sx={{ height: 20, fontSize: '0.55rem', fontWeight: 700, bgcolor: '#f0ebe5', color: P }} />
          <Chip label={`${maxStories} stories`} size="small" sx={{ height: 20, fontSize: '0.55rem', fontWeight: 700, bgcolor: '#f0ebe5', color: P }} />
          <Chip label={`${coveragePct}% coverage`} size="small" sx={{ height: 20, fontSize: '0.55rem', fontWeight: 700, bgcolor: '#dcfce7', color: '#166534' }} />
        </Stack>
      </Stack>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', margin: '0 auto' }}>
        {/* Ground plane / lot boundary */}
        <path d={toPath(lot)} fill={`${P}06`} stroke={P} strokeWidth={1.5} strokeDasharray="6,3" />

        {/* Street label */}
        <text x={lot[0].x + (lot[1].x - lot[0].x) / 2} y={lot[0].y - 8} textAnchor="middle"
          fill="#b0a69d" fontSize={10} fontWeight={700} fontFamily="Inter, sans-serif">
          STREET
        </text>

        {/* Setback zones (front) */}
        <path d={`M${lot[0].x},${lot[0].y} L${lot[1].x},${lot[1].y} L${env[1].x},${env[1].y} L${env[0].x},${env[0].y} Z`}
          fill={hovered === 'front' ? `${P}15` : `${P}08`}
          stroke={hovered === 'front' ? P : 'none'} strokeWidth={0.5}
          style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
          onMouseEnter={() => setHovered('front')} onMouseLeave={() => setHovered(null)} />

        {/* Buildable envelope ground */}
        <path d={toPath(env)} fill="rgba(34,197,94,0.12)" stroke="#22c55e" strokeWidth={1.5} />

        {/* 3D envelope walls */}
        {/* Front wall */}
        <path d={`M${env[0].x},${env[0].y} L${env[1].x},${env[1].y} L${envTop[1].x},${envTop[1].y} L${envTop[0].x},${envTop[0].y} Z`}
          fill="rgba(34,197,94,0.08)" stroke="#22c55e" strokeWidth={0.8} />
        {/* Right wall */}
        <path d={`M${env[1].x},${env[1].y} L${env[2].x},${env[2].y} L${envTop[2].x},${envTop[2].y} L${envTop[1].x},${envTop[1].y} Z`}
          fill="rgba(34,197,94,0.05)" stroke="#22c55e" strokeWidth={0.8} />
        {/* Top face */}
        <path d={toPath(envTop)} fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth={1} strokeDasharray="4,2" />

        {/* Encroachment plane (LAMC §12.08 C.5(a)) — angled plane starting at start_height, cutting inward at angle */}
        {epStartHeight && epAngle && epAngle > 0 && epAngle < 90 && (() => {
          const startH = epStartHeight * heightScale
          // The plane starts at the side edges at start_height and slopes inward at epAngle degrees
          // At the top of the envelope, the plane has cut in by: (maxHeight - startHeight) / tan(angle)
          const riseAboveStart = maxHeight - epStartHeight
          const cutInFt = riseAboveStart / Math.tan((epAngle * Math.PI) / 180)
          const cutInRatio = Math.min(cutInFt / (side * 2 + 40), 0.4) // cap visual at 40%
          const cutInPx = envW * cutInRatio

          // Left side encroachment: plane from side edge at startH going inward to cutInPx at maxH
          const epLeft = [
            iso(-envW / 2 + envOffX, -envD / 2 + envOffY, startH),
            iso(-envW / 2 + envOffX, envD / 2 + envOffY, startH),
            iso(-envW / 2 + envOffX + cutInPx, envD / 2 + envOffY, maxH),
            iso(-envW / 2 + envOffX + cutInPx, -envD / 2 + envOffY, maxH),
          ]
          // Right side encroachment
          const epRight = [
            iso(envW / 2 + envOffX, -envD / 2 + envOffY, startH),
            iso(envW / 2 + envOffX, envD / 2 + envOffY, startH),
            iso(envW / 2 + envOffX - cutInPx, envD / 2 + envOffY, maxH),
            iso(envW / 2 + envOffX - cutInPx, -envD / 2 + envOffY, maxH),
          ]
          return (
            <>
              <path d={toPath(epLeft)} fill="rgba(251,191,36,0.12)" stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="3,2" />
              <path d={toPath(epRight)} fill="rgba(251,191,36,0.12)" stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="3,2" />
              {/* Label */}
              <text x={epLeft[0].x - 6} y={(epLeft[0].y + epLeft[3].y) / 2}
                textAnchor="end" fill="#d97706" fontSize={8} fontWeight={600} fontFamily="Inter, sans-serif"
                transform={`rotate(-20, ${epLeft[0].x - 6}, ${(epLeft[0].y + epLeft[3].y) / 2})`}>
                {epAngle}° plane
              </text>
            </>
          )
        })()}

        {/* Height dimension line */}
        <line x1={env[1].x + 15} y1={env[1].y} x2={envTop[1].x + 15} y2={envTop[1].y}
          stroke={P} strokeWidth={1} />
        <line x1={env[1].x + 10} y1={env[1].y} x2={env[1].x + 20} y2={env[1].y}
          stroke={P} strokeWidth={0.8} />
        <line x1={envTop[1].x + 10} y1={envTop[1].y} x2={envTop[1].x + 20} y2={envTop[1].y}
          stroke={P} strokeWidth={0.8} />
        <text x={env[1].x + 28} y={(env[1].y + envTop[1].y) / 2 + 4}
          fill={P} fontSize={10} fontWeight={700} fontFamily="Inter, sans-serif">
          {maxHeight}ft
        </text>

        {/* ADU suggestion box */}
        <path d={toPath(adu)} fill="rgba(193,120,85,0.15)" stroke="#c17855" strokeWidth={1.5} />
        {/* ADU walls */}
        <path d={`M${adu[0].x},${adu[0].y} L${adu[1].x},${adu[1].y} L${aduTop[1].x},${aduTop[1].y} L${aduTop[0].x},${aduTop[0].y} Z`}
          fill="rgba(193,120,85,0.08)" stroke="#c17855" strokeWidth={0.6} />
        <path d={`M${adu[1].x},${adu[1].y} L${adu[2].x},${adu[2].y} L${aduTop[2].x},${aduTop[2].y} L${aduTop[1].x},${aduTop[1].y} Z`}
          fill="rgba(193,120,85,0.05)" stroke="#c17855" strokeWidth={0.6} />
        <path d={toPath(aduTop)} fill="rgba(193,120,85,0.12)" stroke="#c17855" strokeWidth={0.8} />
        {/* ADU label */}
        <text x={(aduTop[0].x + aduTop[2].x) / 2} y={(aduTop[0].y + aduTop[2].y) / 2 + 3}
          textAnchor="middle" fill="#c17855" fontSize={9} fontWeight={700} fontFamily="Inter, sans-serif">
          ADU
        </text>

        {/* Setback dimensions */}
        <text x={(lot[0].x + env[0].x) / 2} y={(lot[0].y + env[0].y) / 2 + 4}
          textAnchor="middle" fill={P} fontSize={9} fontWeight={600} fontFamily="Inter, sans-serif">
          {front}ft
        </text>
        <text x={(lot[2].x + env[2].x) / 2} y={(lot[2].y + env[2].y) / 2 + 4}
          textAnchor="middle" fill={P} fontSize={9} fontWeight={600} fontFamily="Inter, sans-serif">
          {rear}ft
        </text>
        <text x={lot[0].x - 8} y={(lot[0].y + lot[3].y) / 2}
          textAnchor="middle" fill={P} fontSize={9} fontWeight={600} fontFamily="Inter, sans-serif"
          transform={`rotate(-30, ${lot[0].x - 8}, ${(lot[0].y + lot[3].y) / 2})`}>
          {side}ft
        </text>

        {/* Legend */}
        <g transform={`translate(12, ${H - 50})`}>
          <rect x={0} y={0} width={10} height={10} fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth={1} />
          <text x={16} y={9} fill="#7a6e65" fontSize={9} fontFamily="Inter, sans-serif">SFR Envelope</text>

          <rect x={0} y={16} width={10} height={10} fill="rgba(193,120,85,0.15)" stroke="#c17855" strokeWidth={1} />
          <text x={16} y={25} fill="#7a6e65" fontSize={9} fontFamily="Inter, sans-serif">ADU Placement</text>

          <rect x={110} y={0} width={10} height={10} fill={`${P}08`} stroke={P} strokeWidth={0.5} strokeDasharray="3,2" />
          <text x={126} y={9} fill="#7a6e65" fontSize={9} fontFamily="Inter, sans-serif">Setback Zone</text>

          <line x1={110} y1={20} x2={120} y2={20} stroke={P} strokeWidth={1.5} strokeDasharray="6,3" />
          <text x={126} y={25} fill="#7a6e65" fontSize={9} fontFamily="Inter, sans-serif">Lot Boundary</text>

          {epStartHeight && (
            <>
              <rect x={220} y={0} width={10} height={10} fill="rgba(251,191,36,0.12)" stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="3,2" />
              <text x={236} y={9} fill="#7a6e65" fontSize={9} fontFamily="Inter, sans-serif">Encroachment Plane</text>
            </>
          )}
        </g>
      </svg>
    </Box>
  )
})

function findVal(findings: RegulatoryFinding[], type: string): number | null {
  const f = findings.find(f => f.finding_type === type || f.finding_type.includes(type))
  return f && typeof f.value === 'number' ? f.value : null
}
