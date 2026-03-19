import { useState } from 'react'
import { Box, Typography, Tooltip, Chip, Stack } from '@mui/material'
import type { BuildabilityAssessment, RegulatoryFinding } from '../types/assessment'

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

  const W = 300, H = 340
  const pad = 50
  const lotW = W - pad * 2, lotH = H - pad * 2
  const scale = lotH / 120
  const fS = (front || 20) * scale
  const rS = (rear || 15) * scale
  const sS = (side || 5) * scale

  const buildX = pad + sS
  const buildY = pad + fS
  const buildW = lotW - sS * 2
  const buildH = lotH - fS - rS

  return (
    <Box sx={{
      p: 2.5, borderRadius: 2.5, mb: 2.5, textAlign: 'center',
      bgcolor: '#f5f0eb', border: '1px solid', borderColor: 'divider',
    }}>
      <Typography variant="overline" color="text.disabled" sx={{ display: 'block', mb: 0.5, fontSize: '0.65rem', fontWeight: 700 }}>
        Conceptual Setback Diagram
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, lineHeight: 1.6 }}>
        Hover over zones for details. Not to scale.
      </Typography>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', margin: '0 auto' }}>
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

        {/* Dimension labels */}
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
            <line x1={pad} y1={H / 2} x2={buildX} y2={H / 2} stroke="#b0a69d" strokeWidth={0.5} />
            <DimLabel x={pad + sS / 2} y={H / 2} text={`${side}'`} active={hoveredZone === 'side'} />
            <line x1={pad + lotW - sS} y1={H / 2} x2={pad + lotW} y2={H / 2} stroke="#b0a69d" strokeWidth={0.5} />
            <DimLabel x={pad + lotW - sS / 2} y={H / 2} text={`${side}'`} active={hoveredZone === 'side'} />
          </>
        )}

        {/* Zone labels */}
        <text x={W / 2} y={pad + fS / 2 - 12} textAnchor="middle" fill="#3d2c24" fontSize={9} fontWeight={700} fontFamily="Inter, sans-serif">FRONT</text>
        <text x={W / 2} y={pad + lotH - rS / 2 - 12} textAnchor="middle" fill="#3d2c24" fontSize={9} fontWeight={700} fontFamily="Inter, sans-serif">REAR</text>

        {buildW > 0 && buildH > 0 && (
          <>
            <text x={W / 2} y={buildY + buildH / 2 - 2} textAnchor="middle" fill="#16a34a" fontSize={12} fontWeight={800} fontFamily="Inter, sans-serif">BUILDABLE</text>
            <text x={W / 2} y={buildY + buildH / 2 + 14} textAnchor="middle" fill="#22c55e" fontSize={9} fontFamily="Inter, sans-serif">ENVELOPE</text>
          </>
        )}

        {/* Lot label */}
        <text x={pad + lotW + 8} y={pad + lotH / 2} fill="#3d2c24" fontSize={9} fontFamily="Inter, sans-serif" transform={`rotate(90, ${pad + lotW + 8}, ${pad + lotH / 2})`} textAnchor="middle" fontWeight={600}>LOT</text>
      </svg>

      {/* Stats below */}
      <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 1.5 }}>
        {lotArea && <StatPill label="Lot Area" value={`${Math.round(lotArea).toLocaleString()} sqft`} />}
        {envArea && <StatPill label="Buildable" value={`${Math.round(envArea).toLocaleString()} sqft`} color="#16a34a" />}
        {coverage && <StatPill label="Coverage" value={`${coverage}%`} color="#16a34a" />}
        {maxHeight && <StatPill label="Max Height" value={`${maxHeight} ft`} />}
        {rfar && <StatPill label="RFAR" value={`${rfar}`} />}
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
      <text x={x} y={y + 4} textAnchor="middle" fill={active ? '#5a4238' : '#5a4238'} fontSize={11} fontWeight={700} fontFamily="Inter, sans-serif">
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
