import { useState } from 'react'
import { Box, Typography, Stack } from '@mui/material'
import type { BuildabilityAssessment, RegulatoryFinding } from '../types/assessment'
import { analyzeParcel, getOuterRing, formatDist, perimeterFt } from '../utils/geometry'

interface Props {
  findings: RegulatoryFinding[]
  assessment: BuildabilityAssessment
}

export default function SetbackDiagram({ findings, assessment }: Props) {
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)
  const front = findValue(findings, 'front_setback')
  const side = findValue(findings, 'interior_side_setback') || findValue(findings, 'side_setback')
  const rear = findValue(findings, 'rear_setback')

  if (!front && !side && !rear) return null

  const lotArea = assessment.parcel?.lot_area_sqft
  const envArea = assessment.buildable_envelope?.properties?.envelope_area_sqft
  const coverage = envArea && lotArea ? Math.round((envArea / lotArea) * 100) : null
  const maxHeight = findValue(findings, 'max_height')
  const rfar = findValue(findings, 'rfar')

  // Analyze real parcel geometry for dimensions
  const coords = getOuterRing(assessment.parcel?.geometry)
  const vertices = analyzeParcel(coords)
  const perimeter = coords.length > 2 ? perimeterFt(coords) : 0

  const W = 320, H = 380
  const pad = 55
  const lotW = W - pad * 2, lotH = H - pad * 2 - 30
  const scale = lotH / 120
  const fS = (front || 20) * scale
  const rS = (rear || 15) * scale
  const sS = (side || 5) * scale

  const buildX = pad + sS
  const buildY = pad + fS
  const buildW = lotW - sS * 2
  const buildH = lotH - fS - rS

  // Compute real edge lengths for the 4 primary edges (approximate for irregular lots)
  const edgeLengths = vertices.length >= 4
    ? { front: vertices[0]?.edgeLengthFt, right: vertices[1]?.edgeLengthFt, rear: vertices[2]?.edgeLengthFt, left: vertices[3]?.edgeLengthFt }
    : { front: null, right: null, rear: null, left: null }
  const cornerAngles = vertices.length >= 4
    ? [vertices[0]?.angleDeg, vertices[1]?.angleDeg, vertices[2]?.angleDeg, vertices[3]?.angleDeg]
    : []

  // Scale bar: 20ft reference
  const scaleBarFt = 20
  const scaleBarPx = scaleBarFt * scale

  return (
    <Box sx={{
      p: 2.5, borderRadius: 2.5, mb: 2.5, textAlign: 'center',
      bgcolor: '#f5f0eb', border: '1px solid', borderColor: 'divider',
    }}>
      <Typography variant="overline" color="text.disabled" sx={{ display: 'block', mb: 0.5, fontSize: '0.65rem', fontWeight: 700 }}>
        Site Setback Diagram
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, lineHeight: 1.6 }}>
        Hover zones for details. Dimensions from parcel geometry.
      </Typography>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', margin: '0 auto' }}>
        {/* North arrow */}
        <g transform={`translate(${W - 28}, 18)`}>
          <polygon points="0,-10 4,0 0,-4 -4,0" fill="#3d2c24" />
          <polygon points="0,10 -4,0 0,4 4,0" fill="#b0a69d" />
          <text x="0" y="-5" textAnchor="middle" fontSize="5" fontWeight="800" fill="#fff">N</text>
        </g>

        {/* Scale bar */}
        <g transform={`translate(12, ${H - 16})`}>
          <line x1={0} y1={0} x2={scaleBarPx} y2={0} stroke="#3d2c24" strokeWidth={2} />
          <line x1={0} y1={-3} x2={0} y2={3} stroke="#3d2c24" strokeWidth={1.5} />
          <line x1={scaleBarPx} y1={-3} x2={scaleBarPx} y2={3} stroke="#3d2c24" strokeWidth={1.5} />
          <text x={scaleBarPx / 2} y={-5} textAnchor="middle" fill="#5a4238" fontSize={8} fontWeight={600} fontFamily="Inter, sans-serif">
            {scaleBarFt}′
          </text>
        </g>

        {/* Street */}
        <text x={W / 2} y={16} textAnchor="middle" fill="#b0a69d" fontSize={11} fontWeight={600} fontFamily="Inter, sans-serif">
          STREET
        </text>
        <line x1={pad - 15} y1={26} x2={W - pad + 15} y2={26} stroke="#6b5d54" strokeWidth={2.5} strokeDasharray="8,4" />

        {/* Lot boundary */}
        <rect x={pad} y={pad} width={lotW} height={lotH} fill="none" stroke="#3d2c24" strokeWidth={2} rx={2} />

        {/* Front setback */}
        <rect x={pad} y={pad} width={lotW} height={fS}
          fill={hoveredZone === 'front' ? 'rgba(61,44,36,0.12)' : 'rgba(61,44,36,0.04)'}
          stroke={hoveredZone === 'front' ? '#3d2c24' : 'none'} strokeWidth={1} strokeDasharray="4,2"
          style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
          onMouseEnter={() => setHoveredZone('front')} onMouseLeave={() => setHoveredZone(null)}
        />
        {/* Rear setback */}
        <rect x={pad} y={pad + lotH - rS} width={lotW} height={rS}
          fill={hoveredZone === 'rear' ? 'rgba(61,44,36,0.12)' : 'rgba(61,44,36,0.04)'}
          stroke={hoveredZone === 'rear' ? '#3d2c24' : 'none'} strokeWidth={1} strokeDasharray="4,2"
          style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
          onMouseEnter={() => setHoveredZone('rear')} onMouseLeave={() => setHoveredZone(null)}
        />
        {/* Left side setback */}
        <rect x={pad} y={pad + fS} width={sS} height={lotH - fS - rS}
          fill={hoveredZone === 'side' ? 'rgba(61,44,36,0.12)' : 'rgba(61,44,36,0.04)'}
          stroke={hoveredZone === 'side' ? '#3d2c24' : 'none'} strokeWidth={1} strokeDasharray="4,2"
          style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
          onMouseEnter={() => setHoveredZone('side')} onMouseLeave={() => setHoveredZone(null)}
        />
        {/* Right side setback */}
        <rect x={pad + lotW - sS} y={pad + fS} width={sS} height={lotH - fS - rS}
          fill={hoveredZone === 'side' ? 'rgba(61,44,36,0.12)' : 'rgba(61,44,36,0.04)'}
          stroke={hoveredZone === 'side' ? '#3d2c24' : 'none'} strokeWidth={1} strokeDasharray="4,2"
          style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
          onMouseEnter={() => setHoveredZone('side')} onMouseLeave={() => setHoveredZone(null)}
        />

        {/* Buildable envelope */}
        {buildW > 0 && buildH > 0 && (
          <rect x={buildX} y={buildY} width={buildW} height={buildH}
            fill={hoveredZone === 'build' ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.1)'}
            stroke="#22c55e" strokeWidth={2} strokeDasharray="6,3" rx={3}
            style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
            onMouseEnter={() => setHoveredZone('build')} onMouseLeave={() => setHoveredZone(null)}
          />
        )}

        {/* Setback dimension labels */}
        {front && (
          <>
            <line x1={W / 2} y1={pad} x2={W / 2} y2={buildY} stroke="#b0a69d" strokeWidth={0.5} />
            <DimLabel x={W / 2} y={pad + fS / 2} text={`${front}'`} active={hoveredZone === 'front'} />
          </>
        )}
        {rear && (
          <>
            <line x1={W / 2} y1={pad + lotH - rS} x2={W / 2} y2={pad + lotH} stroke="#b0a69d" strokeWidth={0.5} />
            <DimLabel x={W / 2} y={pad + lotH - rS / 2} text={`${rear}'`} active={hoveredZone === 'rear'} />
          </>
        )}
        {side && (
          <>
            <line x1={pad} y1={H / 2 - 15} x2={buildX} y2={H / 2 - 15} stroke="#b0a69d" strokeWidth={0.5} />
            <DimLabel x={pad + sS / 2} y={H / 2 - 15} text={`${side}'`} active={hoveredZone === 'side'} />
            <line x1={pad + lotW - sS} y1={H / 2 - 15} x2={pad + lotW} y2={H / 2 - 15} stroke="#b0a69d" strokeWidth={0.5} />
            <DimLabel x={pad + lotW - sS / 2} y={H / 2 - 15} text={`${side}'`} active={hoveredZone === 'side'} />
          </>
        )}

        {/* Real edge length labels on lot boundary */}
        {edgeLengths.front && (
          <text x={W / 2} y={pad - 6} textAnchor="middle" fill="#3d2c24" fontSize={9} fontWeight={700} fontFamily="Inter, sans-serif">
            {formatDist(edgeLengths.front)}
          </text>
        )}
        {edgeLengths.rear && (
          <text x={W / 2} y={pad + lotH + 14} textAnchor="middle" fill="#3d2c24" fontSize={9} fontWeight={700} fontFamily="Inter, sans-serif">
            {formatDist(edgeLengths.rear)}
          </text>
        )}
        {edgeLengths.right && (
          <text x={pad + lotW + 6} y={pad + lotH / 2} fill="#3d2c24" fontSize={9} fontWeight={700} fontFamily="Inter, sans-serif"
            transform={`rotate(90, ${pad + lotW + 6}, ${pad + lotH / 2})`} textAnchor="middle">
            {formatDist(edgeLengths.right)}
          </text>
        )}
        {edgeLengths.left && (
          <text x={pad - 8} y={pad + lotH / 2} fill="#3d2c24" fontSize={9} fontWeight={700} fontFamily="Inter, sans-serif"
            transform={`rotate(-90, ${pad - 8}, ${pad + lotH / 2})`} textAnchor="middle">
            {formatDist(edgeLengths.left)}
          </text>
        )}

        {/* Corner angles */}
        {cornerAngles.length >= 4 && cornerAngles.map((angle, i) => {
          if (!angle || angle > 160 || angle < 10) return null
          const cx = i === 0 || i === 3 ? pad + 14 : pad + lotW - 14
          const cy = i === 0 || i === 1 ? pad + 14 : pad + lotH - 14
          return (
            <g key={i}>
              <text x={cx} y={cy} textAnchor="middle" fill="#7a6e65" fontSize={7} fontWeight={600} fontFamily="Inter, sans-serif">
                {Math.round(angle)}°
              </text>
            </g>
          )
        })}

        {/* Zone labels */}
        <text x={W / 2} y={pad + fS / 2 - 12} textAnchor="middle" fill="#3d2c24" fontSize={9} fontWeight={700} fontFamily="Inter, sans-serif">FRONT</text>
        <text x={W / 2} y={pad + lotH - rS / 2 - 12} textAnchor="middle" fill="#3d2c24" fontSize={9} fontWeight={700} fontFamily="Inter, sans-serif">REAR</text>

        {buildW > 0 && buildH > 0 && (
          <>
            <text x={W / 2} y={buildY + buildH / 2 - 2} textAnchor="middle" fill="#16a34a" fontSize={12} fontWeight={800} fontFamily="Inter, sans-serif">BUILDABLE</text>
            <text x={W / 2} y={buildY + buildH / 2 + 14} textAnchor="middle" fill="#22c55e" fontSize={9} fontFamily="Inter, sans-serif">ENVELOPE</text>
          </>
        )}
      </svg>

      {/* Stats below */}
      <Stack direction="row" spacing={1.2} justifyContent="center" flexWrap="wrap" sx={{ mt: 1.5 }}>
        {lotArea && <StatPill label="Lot Area" value={`${Math.round(lotArea).toLocaleString()} sqft`} />}
        {envArea && <StatPill label="Buildable" value={`${Math.round(envArea).toLocaleString()} sqft`} color="#16a34a" />}
        {coverage && <StatPill label="Coverage" value={`${coverage}%`} color="#16a34a" />}
        {maxHeight && <StatPill label="Max Height" value={`${maxHeight} ft`} />}
        {rfar && <StatPill label="RFAR" value={`${rfar}`} />}
        {perimeter > 0 && <StatPill label="Perimeter" value={`${Math.round(perimeter).toLocaleString()}′`} />}
      </Stack>
    </Box>
  )
}

function DimLabel({ x, y, text, active }: { x: number; y: number; text: string; active?: boolean }) {
  return (
    <g>
      <rect x={x - 16} y={y - 9} width={32} height={18} rx={4}
        fill={active ? '#f0ebe5' : '#ffffff'} stroke={active ? '#3d2c24' : '#d4c8be'} strokeWidth={active ? 1.5 : 0.5}
        style={{ transition: 'all 0.2s' }}
      />
      <text x={x} y={y + 4} textAnchor="middle" fill="#5a4238" fontSize={11} fontWeight={700} fontFamily="Inter, sans-serif">
        {text}
      </text>
    </g>
  )
}

function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{
      textAlign: 'center', px: 1.5, py: 0.8, borderRadius: 2,
      bgcolor: '#fff', border: '1px solid #e5ddd5',
      transition: 'all 0.15s', '&:hover': { borderColor: '#3d2c24' },
    }}>
      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block' }}>{label}</Typography>
      <Typography variant="caption" fontWeight={700} sx={{ display: 'block', color: color || '#3d2c24' }}>{value}</Typography>
    </Box>
  )
}

function findValue(findings: RegulatoryFinding[], type: string): number | null {
  const f = findings.find(f => f.finding_type === type || f.finding_type.includes(type))
  if (f && typeof f.value === 'number') return f.value
  return null
}
