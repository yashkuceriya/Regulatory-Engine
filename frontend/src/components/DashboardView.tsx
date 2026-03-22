import { useState, useEffect } from 'react'
import { Box, Typography, Card, CardContent, Stack, Chip, Divider, Alert } from '@mui/material'
import {
  CheckCircle, Speed, TrendingUp, Warning,
  Gavel, Assessment,
  Layers, ViewInAr, AutoAwesome, Cottage,
  Shield, History,
} from '@mui/icons-material'
import {
  ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts'
import type { BuildabilityAssessment } from '../types/assessment'
import { useAssessmentHistory } from '../hooks/useAssessmentHistory'

const P = '#3d2c24'

interface Props { lastAssessment: BuildabilityAssessment | null }

export default function DashboardView({ lastAssessment }: Props) {
  const { history } = useAssessmentHistory()
  const [jurisdictions, setJurisdictions] = useState<any[]>([])
  const timing = lastAssessment?.pipeline_timing
  const totalMs = timing ? (timing.total || Object.values(timing).reduce((a, b) => a + b, 0)) : null

  const [jurisdictionError, setJurisdictionError] = useState(false)

  // Fetch jurisdictions
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/jurisdictions`)
      .then(r => r.ok ? r.json() : [])
      .then(setJurisdictions)
      .catch(() => setJurisdictionError(true))
  }, [])

  // Compute stats from history
  const totalAssessments = history.length
  const avgConfidence = history.length
    ? Math.round(history.reduce((s, h) => s + h.confidence, 0) / history.length * 100)
    : 0
  // Dedup history by address, filter out garbage entries
  const uniqueHistory = history
    .filter(h => h.address.length < 100) // exclude garbage entries
    .filter((h, i, arr) => arr.findIndex(x => x.address === h.address) === i)
  const allowedCount = uniqueHistory.filter(h => h.verdicts.some(v => v.verdict === 'ALLOWED' || v.verdict === 'FLAGGED')).length
  const flaggedCount = uniqueHistory.filter(h => h.verdicts.every(v => v.verdict === 'NOT_EVALUATED')).length

  // Zone distribution from history
  const zoneDist: Record<string, number> = {}
  uniqueHistory.forEach(h => {
    const z = h.zone?.split('-')[0] || 'Unknown'
    zoneDist[z] = (zoneDist[z] || 0) + 1
  })
  const zoneData = Object.entries(zoneDist).map(([name, value]) => ({ name, value }))
  const zoneColors = ['#3d2c24', '#c17855', '#16a34a', '#6366f1', '#d97706', '#ec4899']

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: '#f5f0eb' }}>
      <Box sx={{ maxWidth: 1100, mx: 'auto', p: { xs: 2, md: 4 } }}>
        {/* ── Header ── */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
          <Box>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: P, letterSpacing: '-0.3px' }}>
              Dashboard
            </Typography>
            <Typography sx={{ fontSize: 13, color: '#7a6e65', mt: 0.5 }}>
              Assessment analytics, coverage status, and pipeline performance.
            </Typography>
          </Box>
          {lastAssessment && (
            <Chip icon={<CheckCircle sx={{ fontSize: '13px !important' }} />}
              label={`Last: ${lastAssessment.address.split(',')[0]}`} size="small" color="success" variant="outlined" sx={{ fontSize: '0.65rem' }} />
          )}
        </Stack>

        {/* ── KPI Row ── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          <KpiCard
            icon={<Assessment sx={{ fontSize: 18 }} />}
            label="Parcels Assessed"
            value={String(uniqueHistory.length)}
            sub={uniqueHistory.length === 0 ? 'Run your first assessment' : `${uniqueHistory.length} unique parcels`}
            accent={P}
          />
          <KpiCard
            icon={<CheckCircle sx={{ fontSize: 18 }} />}
            label="Assessed"
            value={uniqueHistory.length > 0 ? `${Math.round(allowedCount / uniqueHistory.length * 100)}%` : '—'}
            sub={uniqueHistory.length > 0 ? `${allowedCount} with findings, ${flaggedCount} out of scope` : 'No assessments yet'}
            accent="#16a34a"
          />
          <KpiCard
            icon={<TrendingUp sx={{ fontSize: 18 }} />}
            label="Avg Confidence"
            value={avgConfidence > 0 ? `${avgConfidence}%` : '—'}
            sub="Across all assessed parcels"
            accent="#c17855"
          />
          <KpiCard
            icon={<Speed sx={{ fontSize: 18 }} />}
            label="Avg Response"
            value={totalMs != null ? `${(totalMs / 1000).toFixed(1)}s` : uniqueHistory.length > 0 ? '~2s' : '—'}
            sub={totalMs != null ? 'Last pipeline run' : uniqueHistory.length > 0 ? 'Typical response time' : 'Run an assessment'}
            accent="#6366f1"
          />
        </Box>

        {/* ── Coverage + Recent Assessments ── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.5fr' }, gap: 2.5, mb: 3 }}>
          {/* Jurisdiction Coverage */}
          <Card sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: P }}>Coverage</Typography>
                <Chip label={`${jurisdictions.filter(j => j.status === 'active').length} active`} size="small"
                  sx={{ height: 18, fontSize: '0.5rem', fontWeight: 700, bgcolor: '#dcfce7', color: '#166534' }} />
              </Stack>
              {jurisdictionError && (
                <Alert severity="warning" sx={{ mb: 1.5, fontSize: '0.75rem', py: 0.3 }}>
                  Could not load jurisdictions. Check your connection.
                </Alert>
              )}
              <Stack spacing={1}>
                {jurisdictions.map(j => (
                  <Box key={j.id} sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    p: 1.5, borderRadius: 2, bgcolor: j.status === 'active' ? '#f5f0eb' : '#fafafa',
                    border: `1px solid ${j.status === 'active' ? `${P}15` : '#e5ddd5'}`,
                  }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box sx={{
                        width: 8, height: 8, borderRadius: '50%',
                        bgcolor: j.status === 'active' ? '#16a34a' : '#d4c8be',
                      }} />
                      <Box>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: P }}>{j.name}</Typography>
                        {j.supported_zones.length > 0 && (
                          <Typography sx={{ fontSize: 9, color: '#b0a69d' }}>
                            {j.supported_zones.join(', ')}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                    <Chip label={j.status === 'active' ? 'Active' : 'Planned'} size="small"
                      sx={{
                        height: 18, fontSize: '0.5rem', fontWeight: 600,
                        bgcolor: j.status === 'active' ? '#dcfce7' : '#f0ebe5',
                        color: j.status === 'active' ? '#166534' : '#7a6e65',
                      }} />
                  </Box>
                ))}
              </Stack>

              {/* Zone distribution */}
              {zoneData.length > 0 && (
                <Box sx={{ mt: 2.5 }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
                    Zone Distribution
                  </Typography>
                  <Box sx={{ height: 100 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={zoneData} dataKey="value" cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={3} strokeWidth={0}>
                          {zoneData.map((d, i) => <Cell key={d.name} fill={zoneColors[i % zoneColors.length]} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="center">
                    {zoneData.map((d, i) => (
                      <Stack key={d.name} direction="row" spacing={0.3} alignItems="center">
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: zoneColors[i % zoneColors.length] }} />
                        <Typography sx={{ fontSize: 9, color: '#7a6e65' }}>{d.name} ({d.value})</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Recent Assessments */}
          <Card sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: P }}>Recent Assessments</Typography>
                <Chip icon={<History sx={{ fontSize: '12px !important' }} />} label={`${history.length} total`} size="small"
                  sx={{ height: 18, fontSize: '0.5rem', fontWeight: 600, bgcolor: '#f0ebe5', color: '#7a6e65' }} />
              </Stack>
              {uniqueHistory.length > 0 ? (
                <Stack spacing={0.8}>
                  {uniqueHistory.slice(0, 6).map((h, i) => (
                    <Box key={h.id} sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2,
                      bgcolor: '#f5f0eb', border: `1px solid ${P}08`,
                      animation: `slideUp 0.3s ease-out ${i * 0.05}s both`,
                    }}>
                      <Box sx={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        bgcolor: h.verdicts.some(v => v.verdict === 'ALLOWED') ? '#dcfce7' : '#fef3c7',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {h.verdicts.some(v => v.verdict === 'ALLOWED')
                          ? <CheckCircle sx={{ fontSize: 16, color: '#16a34a' }} />
                          : <Warning sx={{ fontSize: 16, color: '#d97706' }} />}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: P, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {h.address.split(',')[0]}
                        </Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography sx={{ fontSize: 9, color: '#b0a69d' }}>
                            {new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Typography>
                          {h.zone && <Chip label={h.zone} size="small" sx={{ height: 14, fontSize: '0.45rem', bgcolor: '#f0ebe5', color: '#7a6e65' }} />}
                        </Stack>
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: h.confidence >= 0.8 ? '#16a34a' : '#d97706' }}>
                        {Math.round(h.confidence * 100)}%
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Cottage sx={{ fontSize: 32, color: '#e5ddd5', mb: 1 }} />
                  <Typography sx={{ fontSize: 12, color: '#b0a69d' }}>No assessments yet</Typography>
                  <Typography sx={{ fontSize: 10, color: '#d4c8be', mt: 0.5 }}>Run your first assessment to populate the dashboard</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* ── Pipeline Performance + Quick Stats ── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' }, gap: 2.5, mb: 3 }}>
          {/* Performance */}
          <Card sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: P }}>Pipeline Performance</Typography>
                <Typography sx={{ fontSize: 10, color: '#b0a69d' }}>Latency (ms)</Typography>
              </Stack>
              {timing && Object.keys(timing).filter(k => k !== 'total').length > 0 ? (
                <Stack spacing={1.2}>
                  {Object.entries(timing).filter(([k]) => k !== 'total').map(([step, ms]) => (
                    <PerfRow key={step} label={STEP_LABELS[step] || step} ms={ms} maxMs={Math.max(...Object.values(timing).filter((_, i) => Object.keys(timing)[i] !== 'total'))} />
                  ))}
                  <Divider sx={{ my: 0.5 }} />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: P }}>Total</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: P }}>{totalMs}ms</Typography>
                  </Stack>
                </Stack>
              ) : (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Speed sx={{ fontSize: 32, color: '#e5ddd5', mb: 1 }} />
                  <Typography sx={{ fontSize: 12, color: '#b0a69d' }}>Run an assessment to see telemetry</Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Capabilities */}
          <Card sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: P, mb: 2 }}>Engine Capabilities</Typography>
              <Stack spacing={1}>
                {[
                  { icon: <Gavel sx={{ fontSize: 14 }} />, label: 'Rule Sources', value: '6 configured', desc: 'CP-7150, LAMC, Gov Code, SB 897, AB 2221, SB 1211' },
                  { icon: <Layers sx={{ fontSize: 14 }} />, label: 'Zone Types', value: 'R1 / R2 + ADU', desc: 'Full setbacks, height, FAR. ADU state law preemption.' },
                  { icon: <Shield sx={{ fontSize: 14 }} />, label: 'Overlay Detection', value: '7 types', desc: 'Hillside, HPOZ, TOC, coastal, fire, fault, specific plan' },
                  { icon: <ViewInAr sx={{ fontSize: 14 }} />, label: 'Geometry', value: 'Envelope + 3D', desc: 'Shapely polygon inset with projected sqft' },
                  { icon: <AutoAwesome sx={{ fontSize: 14 }} />, label: 'AI Enrichment', value: 'Claude', desc: 'Summaries + edge cases. Never overrides rules.' },
                ].map(cap => (
                  <Box key={cap.label} sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, p: 1.2, borderRadius: 2,
                    bgcolor: '#f5f0eb', border: `1px solid ${P}08`,
                  }}>
                    <Box sx={{ color: '#c17855', display: 'flex' }}>{cap.icon}</Box>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography sx={{ fontSize: 11, fontWeight: 600, color: P }}>{cap.label}</Typography>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#c17855' }}>{cap.value}</Typography>
                      </Stack>
                      <Typography sx={{ fontSize: 9, color: '#b0a69d' }}>{cap.desc}</Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Box>

        {/* ── Data Sources ── */}
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 2.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: P, mb: 2 }}>Connected Data Sources</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              {DATA_SOURCES.map(ds => (
                <Box key={ds.name} sx={{
                  p: 1.5, borderRadius: 2, bgcolor: '#fafafa', border: '1px solid #e5ddd5',
                  transition: 'all 0.15s', '&:hover': { borderColor: '#d4c8be', bgcolor: '#fff' },
                }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.3 }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#5a4238' }}>{ds.name}</Typography>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: ds.active ? '#22c55e' : '#d4c8be' }} />
                  </Stack>
                  <Typography sx={{ fontSize: 9, color: '#b0a69d' }}>{ds.url}</Typography>
                  <Chip label={ds.type} size="small" sx={{ height: 14, fontSize: '0.45rem', mt: 0.8, bgcolor: '#f0ebe5', color: '#7a6e65' }} />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

/* ─── KPI Card ─── */
function KpiCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub: string; accent: string
}) {
  return (
    <Card sx={{ borderRadius: 3, overflow: 'hidden', '&:hover': { transform: 'translateY(-1px)' }, transition: 'all 0.15s' }}>
      <Box sx={{ height: 3, bgcolor: accent }} />
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: 11, color: '#b0a69d', fontWeight: 600 }}>{label}</Typography>
          <Box sx={{
            width: 32, height: 32, borderRadius: 1.5, bgcolor: '#f5f0eb', border: '1px solid #e5ddd5',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
          }}>
            {icon}
          </Box>
        </Stack>
        <Typography sx={{ fontSize: 28, fontWeight: 800, color: P, lineHeight: 1, mb: 0.5 }}>{value}</Typography>
        <Typography sx={{ fontSize: 11, color: '#b0a69d' }}>{sub}</Typography>
      </CardContent>
    </Card>
  )
}

/* ─── Performance Row ─── */
function PerfRow({ label, ms, maxMs }: { label: string; ms: number; maxMs: number }) {
  const pct = Math.round((ms / maxMs) * 100)
  return (
    <Stack direction="row" alignItems="center" spacing={1.5}>
      <Typography sx={{ fontSize: 12, color: '#5a4238', fontWeight: 500, minWidth: 110 }}>{label}</Typography>
      <Box sx={{ flex: 1, height: 6, bgcolor: '#f0ebe5', borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{
          height: '100%', width: `${pct}%`, borderRadius: 3,
          bgcolor: ms > 1000 ? '#c17855' : '#d4c8be',
          transition: 'width 0.6s ease',
        }} />
      </Box>
      <Typography sx={{ fontSize: 11, color: '#b0a69d', fontWeight: 600, minWidth: 45, textAlign: 'right' }}>{ms}ms</Typography>
    </Stack>
  )
}

/* ─── Constants ─── */
const STEP_LABELS: Record<string, string> = {
  geocode: 'Geocoding', boundary: 'Boundary Check', parcel: 'Parcel Lookup',
  zoning: 'Zoning Query', rules: 'Rule Engine', overlays: 'Overlay Detection',
  geometry: 'Geometry', adu: 'ADU Engine', assembly: 'Assembly',
}

const DATA_SOURCES = [
  { name: 'LA City Geocoder', url: 'maps.lacity.org', type: 'Geocoding', active: true },
  { name: 'Census TIGER', url: 'geocoding.geo.census.gov', type: 'Fallback', active: true },
  { name: 'LA County Parcel', url: 'public.gis.lacounty.gov', type: 'Parcel Data', active: true },
  { name: 'City Planning Zoning', url: 'services5.arcgis.com', type: 'Zoning', active: true },
  { name: 'City Boundary', url: 'maps.lacity.org', type: 'Jurisdiction', active: true },
  { name: 'CP-7150 / LAMC', url: 'Local rule tables', type: 'Rules', active: true },
  { name: 'CA Statewide Parcels', url: 'services1.arcgis.com', type: 'Parcel Data', active: true },
  { name: 'Mapbox Geocoding', url: 'api.mapbox.com', type: 'Autocomplete', active: true },
]
