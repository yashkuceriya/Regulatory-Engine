import { Box, Typography, Stack, Chip } from '@mui/material'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import {
  CheckCircle, Warning,
} from '@mui/icons-material'
import type { BuildabilityAssessment, BuildingTypeAssessment, RegulatoryFinding, OverlayFlags } from '../types/assessment'

/* ─── Color palette ─── */
const C = {
  green: '#16a34a', greenLight: '#dcfce7',
  orange: '#3d2c24', orangeLight: '#f0ebe5',
  amber: '#d97706', amberLight: '#fef3c7',
  red: '#dc2626', redLight: '#fee2e2',
  slate: '#7a6e65', slateLight: '#f0ebe5',
  dark: '#3d2c24',
}

/* ─── 1. Area Breakdown Donut ─── */
export function AreaDonut({ assessment }: { assessment: BuildabilityAssessment }) {
  const lotArea = assessment.parcel?.lot_area_sqft
  const envArea = assessment.buildable_envelope?.properties?.envelope_area_sqft
  if (!lotArea) return null

  const buildable = envArea || 0
  const setbackZone = lotArea - buildable

  const data = [
    { name: 'Buildable Envelope', value: Math.round(buildable), color: '#22c55e' },
    { name: 'Setback / Restricted', value: Math.round(setbackZone), color: '#3d2c24' },
  ]
  const coveragePct = buildable ? Math.round((buildable / lotArea) * 100) : 0

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.5 }}>
        Lot Area Breakdown
      </Typography>
      <Box sx={{ position: 'relative', width: 180, height: 180, mx: 'auto' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="value" cx="50%" cy="50%"
              innerRadius={55} outerRadius={80} paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <RTooltip
              formatter={(val: any) => `${Number(val).toLocaleString()} sqft`}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5ddd5' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontSize: 24, fontWeight: 800, color: C.dark, lineHeight: 1 }}>{coveragePct}%</Typography>
          <Typography sx={{ fontSize: 9, color: '#b0a69d', mt: 0.3 }}>buildable</Typography>
        </Box>
      </Box>
      <Stack spacing={0.5} sx={{ mt: 1.5 }}>
        <LegendRow color="#22c55e" label="Buildable" value={`${Math.round(buildable).toLocaleString()} sqft`} />
        <LegendRow color="#3d2c24" label="Restricted" value={`${Math.round(setbackZone).toLocaleString()} sqft`} />
        <LegendRow color="#b0a69d" label="Total Lot" value={`${Math.round(lotArea).toLocaleString()} sqft`} />
      </Stack>
    </Box>
  )
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 11, color: '#b0a69d', minWidth: 60 }}>{label}</Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.dark }}>{value}</Typography>
    </Box>
  )
}


/* ─── 2. Confidence Breakdown ─── */
export function ConfidenceBreakdown({ bta }: { bta: BuildingTypeAssessment }) {
  const findings = bta.findings
    .filter(f => f.finding_type !== 'buildable_envelope' && f.finding_type !== 'encroachment_plane')

  if (!findings.length) return null

  const data = findings.map(f => ({
    name: f.finding_type.replace(/^adu_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    confidence: Math.round(f.confidence * 100),
    fill: f.confidence >= 0.8 ? C.green : f.confidence >= 0.6 ? C.amber : C.red,
    method: f.method,
  }))

  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.5 }}>
        Finding Confidence Breakdown
      </Typography>
      <Box sx={{ height: Math.max(findings.length * 32 + 20, 120), width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 100, right: 30, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd5" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`}
              tick={{ fontSize: 10, fill: '#b0a69d' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={95}
              tick={{ fontSize: 10, fill: '#7a6e65' }} axisLine={false} tickLine={false} />
            <RTooltip
              formatter={(val: any, _: any, entry: any) => [`${val}% (${entry.payload.method})`, 'Confidence']}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5ddd5' }}
            />
            <Bar dataKey="confidence" radius={[0, 4, 4, 0]} barSize={16}>
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 1 }}>
        <ConfLegend color={C.green} label="High (80%+)" />
        <ConfLegend color={C.amber} label="Medium (60-79%)" />
        <ConfLegend color={C.red} label="Low (<60%)" />
      </Stack>
    </Box>
  )
}

function ConfLegend({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={{ width: 10, height: 10, borderRadius: 1, bgcolor: color }} />
      <Typography sx={{ fontSize: 10, color: '#b0a69d' }}>{label}</Typography>
    </Stack>
  )
}


/* ─── 3. Constraint Radar ─── */
export function ConstraintRadar({ bta }: { bta: BuildingTypeAssessment }) {
  const findings = bta.findings.filter(f =>
    f.value != null && typeof f.value === 'number' && f.finding_type !== 'buildable_envelope'
  )
  if (findings.length < 3) return null

  // Normalize values to 0-100 scale for radar display
  const maxVals: Record<string, number> = {
    front_setback: 30, interior_side_setback: 15, rear_setback: 25,
    max_height: 60, max_stories: 4, rfar: 1, far: 5,
    parking: 4, max_floor_area: 10000,
    adu_max_height: 25, adu_setback: 10, adu_size_guarantee: 1200,
  }

  const data = findings.slice(0, 8).map(f => {
    const maxVal = maxVals[f.finding_type] || (f.value as number) * 1.5
    const normalized = Math.min(Math.round(((f.value as number) / maxVal) * 100), 100)
    return {
      metric: f.finding_type.replace(/^adu_/, '').replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/Rfar/, 'RFAR').replace(/Far/, 'FAR'),
      value: normalized,
      actual: `${f.value}${f.unit ? ' ' + f.unit : ''}`,
      confidence: Math.round(f.confidence * 100),
    }
  })

  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
        Constraint Profile
      </Typography>
      <Box sx={{ height: 280, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="#e5ddd5" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: '#7a6e65' }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="value" stroke="#3d2c24" fill="#3d2c24" fillOpacity={0.15} strokeWidth={2} dot={{ r: 3, fill: '#3d2c24' }} />
            <RTooltip
              formatter={(_: any, __: any, entry: any) => [entry.payload.actual, 'Value']}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5ddd5' }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  )
}


/* ─── 4. Pipeline Timeline ─── */
export function PipelineTimeline({ timing }: { timing?: Record<string, number> }) {
  if (!timing || !Object.keys(timing).length) return null

  const stepLabels: Record<string, string> = {
    geocode: 'Geocoding', boundary: 'Boundary Check', parcel: 'Parcel Lookup',
    zoning: 'Zoning Query', rules: 'Rule Engine', geometry: 'Geometry', adu: 'ADU Engine',
    llm: 'LLM Enrichment', assembly: 'Assembly',
  }

  const entries = Object.entries(timing).filter(([key]) => key !== 'total')
  const totalMs = timing.total ?? entries.reduce((s, [, v]) => s + v, 0)
  const steps = entries.map(([key, ms]) => ({
    step: stepLabels[key] || key,
    ms,
    pct: Math.round((ms / totalMs) * 100),
  }))

  const colors = ['#3d2c24', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#f43f5e']

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1.5 }}>
        <Chip label={`${(totalMs / 1000).toFixed(1)}s total`} size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, bgcolor: C.slateLight, color: C.slate }} />
      </Stack>

      {/* Stacked bar */}
      <Box sx={{ display: 'flex', height: 28, borderRadius: 2, overflow: 'hidden', mb: 2 }}>
        {steps.map((s, i) => (
          <Box key={s.step} sx={{
            width: `${Math.max(s.pct, 3)}%`, bgcolor: colors[i % colors.length],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s', cursor: 'pointer',
            '&:hover': { opacity: 0.8, transform: 'scaleY(1.15)' },
          }}>
            {s.pct > 8 && <Typography sx={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>{s.ms}ms</Typography>}
          </Box>
        ))}
      </Box>

      {/* Legend grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 0.8 }}>
        {steps.map((s, i) => (
          <Stack key={s.step} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: 1, bgcolor: colors[i % colors.length], flexShrink: 0 }} />
            <Typography sx={{ fontSize: 10, color: C.slate }}>{s.step}</Typography>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: C.dark, ml: 'auto' }}>{s.ms}ms</Typography>
          </Stack>
        ))}
      </Box>
    </Box>
  )
}


/* ─── 5. Overlay Risk Shield ─── */
export function OverlayRiskGrid({ flags }: { flags: OverlayFlags }) {
  const items = [
    { key: 'hillside', label: 'Hillside', category: 'TOPOGRAPHY', active: flags.hillside },
    { key: 'hpoz', label: 'HPOZ', category: 'HERITAGE', active: flags.hpoz },
    { key: 'coastal', label: 'Coastal Zone', category: 'SEISMIC', active: flags.coastal },
    { key: 'fault_zone', label: 'Fault Zone', category: 'HYDROLOGY', active: flags.fault_zone },
    { key: 'fire_zone_1', label: 'Fire Zone 1', category: 'FIRE', active: flags.fire_zone_1 },
    { key: 'toc_tier', label: `TOC${flags.toc_tier ? ` Tier ${flags.toc_tier}` : ''}`, category: 'BIOLOGICAL', active: flags.toc_tier !== null },
    { key: 'specific_plan', label: flags.specific_plan || 'Specific Plan', category: 'PLANNING', active: !!flags.specific_plan },
  ]

  const activeCount = items.filter(i => i.active).length

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.dark }}>Overlay Risk Matrix</Typography>
          <Typography sx={{ fontSize: 11, color: '#b0a69d' }}>Automated screening against environmental and regulatory constraints.</Typography>
        </Box>
        <Chip
          icon={<CheckCircle sx={{ fontSize: '12px !important', color: activeCount === 0 ? C.green : C.amber }} />}
          label={activeCount === 0 ? 'All Constraints Clear' : `${activeCount} Active`}
          size="small"
          sx={{
            height: 22, fontSize: '0.6rem', fontWeight: 600,
            bgcolor: activeCount === 0 ? C.greenLight : C.amberLight,
            color: activeCount === 0 ? C.green : C.amber,
          }}
        />
      </Stack>
      <Box sx={{
        display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 0,
        border: '1px solid #e5ddd5', borderRadius: 2, overflow: 'hidden',
      }}>
        {items.map((item, i) => (
          <Box key={item.key} sx={{
            p: 1.5, textAlign: 'center',
            borderRight: i < items.length - 1 ? '1px solid #e5ddd5' : 'none',
            bgcolor: item.active ? '#fef2f2' : '#fafafa',
            transition: 'all 0.2s',
          }}>
            <Typography sx={{ fontSize: 8, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.6px', mb: 0.8 }}>
              {item.category}
            </Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: item.active ? C.dark : '#7a6e65', mb: 0.5 }}>
              {item.label}
            </Typography>
            <Box sx={{
              width: 18, height: 18, borderRadius: '50%', mx: 'auto',
              bgcolor: item.active ? '#fecaca' : '#dcfce7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {item.active
                ? <Warning sx={{ fontSize: 10, color: C.red }} />
                : <CheckCircle sx={{ fontSize: 10, color: C.green }} />
              }
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}


/* ─── 6. Findings Method Breakdown (mini pie) ─── */
export function MethodBreakdown({ bta }: { bta: BuildingTypeAssessment }) {
  const methods: Record<string, number> = {}
  bta.findings.forEach(f => {
    const m = f.method === 'not_evaluated' ? 'Not Evaluated' : f.method === 'lookup' ? 'Rule Lookup' : f.method === 'calculation' ? 'Calculated' : 'LLM Synthesis'
    methods[m] = (methods[m] || 0) + 1
  })

  const colors: Record<string, string> = {
    'Rule Lookup': '#22c55e', 'Calculated': '#3b82f6', 'LLM Synthesis': '#8b5cf6', 'Not Evaluated': '#d97706',
  }

  const data = Object.entries(methods).map(([name, value]) => ({ name, value, color: colors[name] || '#b0a69d' }))
  if (data.length < 2) return null

  return (
    <Box>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1, textAlign: 'center' }}>
        Finding Methods
      </Typography>
      <Box sx={{ height: 120, width: 120, mx: 'auto' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={3} strokeWidth={0}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <RTooltip contentStyle={{ fontSize: 10, borderRadius: 8, border: '1px solid #e5ddd5' }} />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      <Stack spacing={0.3} sx={{ mt: 1 }}>
        {data.map(d => (
          <Stack key={d.name} direction="row" spacing={0.5} alignItems="center" justifyContent="center">
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: d.color }} />
            <Typography sx={{ fontSize: 9, color: '#b0a69d' }}>{d.name} ({d.value})</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}
