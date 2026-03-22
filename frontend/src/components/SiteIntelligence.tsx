import { useMemo, useEffect, useState } from 'react'
import { Box, Typography, Stack, Chip } from '@mui/material'
import {
  Explore, Straighten, Terrain, WbSunny, SquareFoot, Warning,
} from '@mui/icons-material'
import type { BuildabilityAssessment } from '../types/assessment'
import { analyzeLotShape, getOuterRing, perimeterFt, formatDist, getParcelSlope, type LotAnalysis } from '../utils/geometry'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

interface Props {
  assessment: BuildabilityAssessment
}

export default function SiteIntelligence({ assessment }: Props) {
  const coords = useMemo(() => getOuterRing(assessment.parcel?.geometry), [assessment.parcel?.geometry])
  const coordsKey = useMemo(() => coords.length > 0 ? `${coords[0][0]},${coords[0][1]},${coords.length}` : '', [coords])
  const [slopeInfo, setSlopeInfo] = useState<{ slopePct: number; minElev: number; maxElev: number; avgElev: number } | null>(null)

  useEffect(() => {
    if (!MAPBOX_TOKEN || coords.length < 4) return
    getParcelSlope(coords, MAPBOX_TOKEN).then(setSlopeInfo).catch(() => {})
  }, [coordsKey])
  const lotAnalysis = useMemo(() => analyzeLotShape(coords), [coordsKey])
  const perimeter = useMemo(() => coords.length > 2 ? perimeterFt(coords) : 0, [coordsKey])

  if (!lotAnalysis) return null

  const lotArea = assessment.parcel?.lot_area_sqft || 0
  const envArea = assessment.buildable_envelope?.properties?.envelope_area_sqft || 0
  const coveragePct = lotArea > 0 ? Math.round((envArea / lotArea) * 100) : 0

  const flags: string[] = []
  if (lotAnalysis.isNarrowLot) flags.push('Narrow lot — equipment access may be limited')
  if (lotAnalysis.isDeepLot) flags.push('Deep lot — longer utility runs needed')
  if (slopeInfo && slopeInfo.slopePct > 15) flags.push('Hillside slope — may require grading/retaining walls')
  if (lotAnalysis.southExposure === 'poor') flags.push('Limited south exposure for rear ADU')

  return (
    <Box sx={{
      p: 2.5, borderRadius: 2.5, mb: 2.5,
      bgcolor: '#f5f0eb', border: '1px solid', borderColor: 'divider',
    }}>
      <Typography variant="overline" color="text.disabled" sx={{ display: 'block', mb: 1.5, fontSize: '0.65rem', fontWeight: 700 }}>
        Site Intelligence
      </Typography>

      <Stack spacing={1.5}>
        {/* Row 1: Lot Shape & Orientation */}
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <InfoCard
            icon={<SquareFoot sx={{ fontSize: 16, color: '#3d2c24' }} />}
            label="Lot Shape"
            value={lotAnalysis.shapeDescription}
            detail={`${Math.round(lotArea).toLocaleString()} sqft · ${lotAnalysis.facingDirection}-facing`}
          />
          <InfoCard
            icon={<Straighten sx={{ fontSize: 16, color: '#3d2c24' }} />}
            label="Frontage × Depth"
            value={`${formatDist(lotAnalysis.frontageWidthFt)} × ${formatDist(lotAnalysis.lotDepthFt)}`}
            detail={`Perimeter: ${Math.round(perimeter).toLocaleString()}′`}
          />
          <InfoCard
            icon={<Explore sx={{ fontSize: 16, color: '#3d2c24' }} />}
            label="Facing"
            value={lotAnalysis.facingDirection}
            detail={`${Math.round(lotAnalysis.facingBearing)}° bearing`}
          />
        </Stack>

        {/* Row 2: Sun & Terrain */}
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <InfoCard
            icon={<WbSunny sx={{ fontSize: 16, color: sunColor(lotAnalysis.southExposure) }} />}
            label="Rear Sun Exposure"
            value={capitalize(lotAnalysis.southExposure)}
            detail={lotAnalysis.southExposure === 'excellent'
              ? 'Rear ADU gets strong south sun'
              : lotAnalysis.southExposure === 'good'
              ? 'Good natural light for ADU'
              : lotAnalysis.southExposure === 'limited'
              ? 'Partial sun — consider window placement'
              : 'North-facing rear — plan for lighting'}
            chipColor={sunColor(lotAnalysis.southExposure)}
          />
          {slopeInfo && (
            <InfoCard
              icon={<Terrain sx={{ fontSize: 16, color: slopeInfo.slopePct > 15 ? '#dc2626' : '#3d2c24' }} />}
              label="Terrain"
              value={`${slopeInfo.slopePct.toFixed(1)}% slope`}
              detail={`Elevation: ${Math.round(slopeInfo.minElev)}–${Math.round(slopeInfo.maxElev)} ft ASL`}
              chipColor={slopeInfo.slopePct > 15 ? '#dc2626' : undefined}
            />
          )}
          <InfoCard
            icon={<SquareFoot sx={{ fontSize: 16, color: '#22c55e' }} />}
            label="Buildable Coverage"
            value={`${coveragePct}%`}
            detail={`${Math.round(envArea).toLocaleString()} of ${Math.round(lotArea).toLocaleString()} sqft`}
            chipColor="#22c55e"
          />
        </Stack>

        {/* Construction flags */}
        {flags.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
            {flags.map((flag, i) => (
              <Chip
                key={i}
                icon={<Warning sx={{ fontSize: 12 }} />}
                label={flag}
                size="small"
                sx={{
                  height: 22, fontSize: '0.6rem', fontWeight: 600,
                  bgcolor: 'rgba(217,119,6,0.08)', color: '#92400e',
                  border: '1px solid rgba(217,119,6,0.2)',
                  mb: 0.5,
                }}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

function InfoCard({ icon, label, value, detail, chipColor }: {
  icon: React.ReactNode; label: string; value: string; detail?: string; chipColor?: string
}) {
  return (
    <Box sx={{
      flex: '1 1 140px', minWidth: 140, p: 1.5, borderRadius: 2,
      bgcolor: '#fff', border: '1px solid #e5ddd5',
      transition: 'border-color 0.15s', '&:hover': { borderColor: '#3d2c24' },
    }}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
        {icon}
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', fontWeight: 600 }}>{label}</Typography>
      </Stack>
      <Typography variant="body2" fontWeight={700} sx={{ color: chipColor || '#3d2c24', fontSize: '0.85rem' }}>
        {value}
      </Typography>
      {detail && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block', mt: 0.3 }}>
          {detail}
        </Typography>
      )}
    </Box>
  )
}

function sunColor(exposure: LotAnalysis['southExposure']): string {
  return exposure === 'excellent' ? '#f59e0b' :
    exposure === 'good' ? '#d97706' :
    exposure === 'limited' ? '#92400e' : '#6b5d54'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
