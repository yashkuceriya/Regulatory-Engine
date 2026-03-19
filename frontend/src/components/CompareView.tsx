import { useState, useCallback } from 'react'
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Stack,
  Chip,
  CircularProgress,
  LinearProgress,
} from '@mui/material'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import PlaceIcon from '@mui/icons-material/Place'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'

import { fetchAssessment } from '../hooks/useAssessment'
import type { AssessmentParams } from '../hooks/useAssessment'
import type { BuildabilityAssessment } from '../types/assessment'
import { extractMetrics, type ComparisonRow } from '../utils/compareUtils'

const SLOT_COUNT = 3

// Aligned with theme.ts palette values
const COLORS = {
  primary: '#3d2c24',       // theme.palette.primary.main
  primaryLight: '#5a4238',  // theme.palette.primary.light
  accent: '#14b8a6',
  accentLight: '#2dd4bf',
  green: '#16a34a',
  greenBg: '#dcfce7',
  amber: '#d97706',
  amberBg: '#fef3c7',
  bg: '#f5f0eb',            // theme.palette.background.default
  paper: '#ffffff',          // theme.palette.background.paper
  border: '#e5ddd5',        // theme.palette.divider
  textPrimary: '#5a4238',
  textSecondary: '#7a6e65', // theme.palette.text.secondary
  textMuted: '#b0a69d',     // theme.palette.text.disabled
}

// ---------------------------------------------------------------------------
// Metric row definitions
// ---------------------------------------------------------------------------

interface MetricDef {
  label: string
  key: keyof ComparisonRow
  format: (v: any) => string
  /** Higher is better? Used for green/amber coloring. null = no coloring. */
  higherIsBetter: boolean | null
}

const METRIC_DEFS: MetricDef[] = [
  { label: 'Zone', key: 'zone', format: (v) => v ?? '—', higherIsBetter: null },
  { label: 'Lot Area (sf)', key: 'lotArea', format: (v) => (v != null ? v.toLocaleString() : '—'), higherIsBetter: true },
  { label: 'Buildable Area (sf)', key: 'buildableArea', format: (v) => (v != null ? v.toLocaleString() : '—'), higherIsBetter: true },
  { label: 'Coverage %', key: 'coveragePct', format: (v) => (v != null ? `${v}%` : '—'), higherIsBetter: true },
  { label: 'SFR Verdict', key: 'sfrVerdict', format: (v) => v ?? '—', higherIsBetter: null },
  { label: 'ADU Verdict', key: 'aduVerdict', format: (v) => v ?? '—', higherIsBetter: null },
  { label: 'Max Height (ft)', key: 'maxHeight', format: (v) => (v != null ? `${v}'` : '—'), higherIsBetter: true },
  { label: 'Front Setback (ft)', key: 'frontSetback', format: (v) => (v != null ? `${v}'` : '—'), higherIsBetter: false },
  { label: 'Side Setback (ft)', key: 'sideSetback', format: (v) => (v != null ? `${v}'` : '—'), higherIsBetter: false },
  { label: 'Rear Setback (ft)', key: 'rearSetback', format: (v) => (v != null ? `${v}'` : '—'), higherIsBetter: false },
  { label: 'FAR', key: 'far', format: (v) => (v != null ? v.toFixed(2) : '—'), higherIsBetter: true },
  {
    label: 'ADU Eligible',
    key: 'aduEligible',
    format: (v) => (v === true ? 'Yes' : v === false ? 'No' : '—'),
    higherIsBetter: null,
  },
  {
    label: 'Confidence',
    key: 'confidence',
    format: (v) => (v != null ? `${Math.round(v * 100)}%` : '—'),
    higherIsBetter: true,
  },
  {
    label: 'Overlays',
    key: 'overlays',
    format: (v: string[]) => (v && v.length > 0 ? v.join(', ') : 'None'),
    higherIsBetter: null,
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Given numeric values across slots, return the "best" index. */
function bestIndex(values: (number | null)[], higherIsBetter: boolean): number | null {
  let best: number | null = null
  let bestVal: number | null = null
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null) continue
    if (bestVal == null || (higherIsBetter ? v > bestVal : v < bestVal)) {
      bestVal = v
      best = i
    }
  }
  return best
}

function worstIndex(values: (number | null)[], higherIsBetter: boolean): number | null {
  return bestIndex(values, !higherIsBetter)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VerdictChip({ verdict }: { verdict: string | null }) {
  if (!verdict) return <Typography variant="body2">—</Typography>
  const isAllowed = verdict === 'ALLOWED'
  const isFlagged = verdict === 'FLAGGED'
  return (
    <Chip
      size="small"
      icon={isAllowed ? <CheckCircleIcon /> : isFlagged ? <WarningIcon /> : undefined}
      label={verdict}
      sx={{
        fontWeight: 600,
        fontSize: '0.7rem',
        bgcolor: isAllowed ? COLORS.greenBg : isFlagged ? COLORS.amberBg : '#f0ebe5',
        color: isAllowed ? COLORS.green : isFlagged ? COLORS.amber : COLORS.textSecondary,
        '& .MuiChip-icon': {
          color: 'inherit',
          fontSize: '0.85rem',
        },
      }}
    />
  )
}

function EmptyState() {
  return (
    <Card sx={{ mt: 4, border: `2px dashed ${COLORS.border}`, bgcolor: COLORS.bg }}>
      <CardContent sx={{ py: 6, textAlign: 'center' }}>
        <CompareArrowsIcon sx={{ fontSize: 56, color: COLORS.textMuted, mb: 2 }} />
        <Typography variant="h6" sx={{ color: COLORS.textSecondary, mb: 1 }}>
          No comparisons yet
        </Typography>
        <Typography variant="body2" sx={{ color: COLORS.textMuted, maxWidth: 400, mx: 'auto' }}>
          Enter at least two Los Angeles addresses above and click "Compare All" to see regulatory
          constraints side by side.
        </Typography>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CompareView() {
  const [addresses, setAddresses] = useState<string[]>(Array(SLOT_COUNT).fill(''))
  const [results, setResults] = useState<(ComparisonRow | null)[]>(Array(SLOT_COUNT).fill(null))
  const [loading, setLoading] = useState<boolean[]>(Array(SLOT_COUNT).fill(false))
  const [errors, setErrors] = useState<(string | null)[]>(Array(SLOT_COUNT).fill(null))

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const updateAddress = useCallback((idx: number, value: string) => {
    setAddresses((prev) => {
      const next = [...prev]
      next[idx] = value
      return next
    })
  }, [])

  const compareAll = useCallback(async () => {
    const indices = addresses
      .map((a, i) => (a.trim() ? i : -1))
      .filter((i) => i >= 0)

    if (indices.length < 2) return

    // Set loading for all active slots
    setLoading((prev) => {
      const next = [...prev]
      indices.forEach((i) => (next[i] = true))
      return next
    })
    setErrors((prev) => {
      const next = [...prev]
      indices.forEach((i) => (next[i] = null))
      return next
    })

    const promises = indices.map((i) => {
      const params: AssessmentParams = { address: addresses[i].trim() }
      return fetchAssessment(params)
    })

    const settled = await Promise.allSettled(promises)

    const nextResults = [...results]
    const nextErrors = [...errors]
    const nextLoading = [...loading]

    settled.forEach((outcome, j) => {
      const i = indices[j]
      nextLoading[i] = false
      if (outcome.status === 'fulfilled') {
        nextResults[i] = extractMetrics(outcome.value)
        nextErrors[i] = null
      } else {
        nextResults[i] = null
        nextErrors[i] = outcome.reason?.message ?? 'Assessment failed'
      }
    })

    setResults(nextResults)
    setErrors(nextErrors)
    setLoading(nextLoading)
  }, [addresses, results, errors, loading])

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const filledResults = results.filter(Boolean) as ComparisonRow[]
  const hasComparisons = filledResults.length >= 2
  const anyLoading = loading.some(Boolean)
  const filledAddressCount = addresses.filter((a) => a.trim()).length

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <CompareArrowsIcon sx={{ fontSize: 28, color: COLORS.accent }} />
        <Typography variant="h5" sx={{ fontWeight: 700, color: COLORS.primary }}>
          Parcel Comparison
        </Typography>
      </Stack>
      <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 3 }}>
        Compare regulatory constraints across multiple parcels
      </Typography>

      {/* Input row */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
            {Array.from({ length: SLOT_COUNT }).map((_, i) => (
              <Box key={i} sx={{ flex: 1, width: '100%' }}>
                <TextField
                  fullWidth
                  size="small"
                  label={`Address ${i + 1}`}
                  placeholder="e.g. 123 Main St, Los Angeles, CA"
                  value={addresses[i]}
                  onChange={(e) => updateAddress(i, e.target.value)}
                  disabled={loading[i]}
                  error={!!errors[i]}
                  helperText={errors[i] ?? undefined}
                  InputProps={{
                    startAdornment: (
                      <PlaceIcon sx={{ mr: 0.5, fontSize: 18, color: COLORS.textMuted }} />
                    ),
                    endAdornment: loading[i] ? (
                      <CircularProgress size={18} sx={{ color: COLORS.accent }} />
                    ) : undefined,
                  }}
                />
                {loading[i] && (
                  <LinearProgress
                    sx={{
                      mt: 0.5,
                      borderRadius: 1,
                      height: 3,
                      '& .MuiLinearProgress-bar': { bgcolor: COLORS.accent },
                      bgcolor: COLORS.border,
                    }}
                  />
                )}
              </Box>
            ))}
            <Button
              variant="contained"
              startIcon={<CompareArrowsIcon />}
              onClick={compareAll}
              disabled={anyLoading || filledAddressCount < 2}
              sx={{
                minWidth: 150,
                height: 40,
                bgcolor: COLORS.primary,
                '&:hover': { bgcolor: COLORS.primaryLight },
              }}
            >
              Compare All
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Comparison table or empty state */}
      {!hasComparisons && !anyLoading ? (
        <EmptyState />
      ) : (
        <Card>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            {/* Column headers */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: `120px repeat(${SLOT_COUNT}, 1fr)`, md: `200px repeat(${SLOT_COUNT}, 1fr)` },
                bgcolor: COLORS.primary,
                color: '#fff',
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
              }}
            >
              <Box sx={{ p: 1.5, borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                  Metric
                </Typography>
              </Box>
              {Array.from({ length: SLOT_COUNT }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    p: 1.5,
                    borderRight:
                      i < SLOT_COUNT - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                  }}
                >
                  {results[i] ? (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <PlaceIcon sx={{ fontSize: 16 }} />
                      <Typography
                        variant="subtitle2"
                        sx={{ color: '#fff', fontSize: '0.78rem' }}
                        noWrap
                      >
                        {results[i]!.address}
                      </Typography>
                    </Stack>
                  ) : loading[i] ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={14} sx={{ color: COLORS.accentLight }} />
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        Loading...
                      </Typography>
                    </Stack>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.35)' }}>
                      —
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>

            {/* Metric rows */}
            {METRIC_DEFS.map((def, rowIdx) => {
              // Collect raw values for coloring
              const rawValues = results.map((r) => (r ? r[def.key] : null))

              // Determine best/worst for numeric rows
              let bestIdx: number | null = null
              let worstIdx: number | null = null
              if (def.higherIsBetter != null) {
                const numericVals = rawValues.map((v) =>
                  typeof v === 'number' ? v : null
                ) as (number | null)[]
                bestIdx = bestIndex(numericVals, def.higherIsBetter)
                worstIdx = worstIndex(numericVals, def.higherIsBetter)
                // Don't highlight if all same
                if (bestIdx === worstIdx) {
                  bestIdx = null
                  worstIdx = null
                }
              }

              const isVerdictRow = def.key === 'sfrVerdict' || def.key === 'aduVerdict'

              return (
                <Box
                  key={def.key}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: `120px repeat(${SLOT_COUNT}, 1fr)`, md: `200px repeat(${SLOT_COUNT}, 1fr)` },
                    borderBottom: rowIdx < METRIC_DEFS.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                    '&:hover': { bgcolor: '#f0ebe5' },
                    transition: 'background-color 0.15s',
                  }}
                >
                  {/* Row label */}
                  <Box
                    sx={{
                      p: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      borderRight: `1px solid ${COLORS.border}`,
                      bgcolor: '#fafbfc',
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: COLORS.textPrimary, fontSize: '0.8rem' }}
                    >
                      {def.label}
                    </Typography>
                  </Box>

                  {/* Value cells */}
                  {Array.from({ length: SLOT_COUNT }).map((_, colIdx) => {
                    const row = results[colIdx]
                    const val = row ? row[def.key] : null
                    const isBest = bestIdx === colIdx
                    const isWorst = worstIdx === colIdx

                    let cellBg = 'transparent'
                    if (isBest) cellBg = COLORS.greenBg
                    else if (isWorst) cellBg = COLORS.amberBg

                    // Verdict rows get special rendering
                    if (isVerdictRow && row) {
                      const verdictBg =
                        val === 'ALLOWED'
                          ? COLORS.greenBg
                          : val === 'FLAGGED'
                            ? COLORS.amberBg
                            : 'transparent'
                      return (
                        <Box
                          key={colIdx}
                          sx={{
                            p: 1.5,
                            display: 'flex',
                            alignItems: 'center',
                            borderRight:
                              colIdx < SLOT_COUNT - 1 ? `1px solid ${COLORS.border}` : 'none',
                            bgcolor: verdictBg,
                          }}
                        >
                          <VerdictChip verdict={val as string | null} />
                        </Box>
                      )
                    }

                    return (
                      <Box
                        key={colIdx}
                        sx={{
                          p: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          borderRight:
                            colIdx < SLOT_COUNT - 1 ? `1px solid ${COLORS.border}` : 'none',
                          bgcolor: cellBg,
                          transition: 'background-color 0.15s',
                        }}
                      >
                        {row ? (
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: isBest || isWorst ? 700 : 400,
                              color: isBest
                                ? COLORS.green
                                : isWorst
                                  ? COLORS.amber
                                  : COLORS.textPrimary,
                              fontSize: '0.8rem',
                            }}
                          >
                            {def.format(val)}
                          </Typography>
                        ) : (
                          <Typography variant="body2" sx={{ color: COLORS.textMuted }}>
                            —
                          </Typography>
                        )}
                      </Box>
                    )
                  })}
                </Box>
              )
            })}
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
