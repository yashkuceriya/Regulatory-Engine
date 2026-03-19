import { useState } from 'react'
import { Box, Typography, Chip, Card, CardContent, Stack, Divider, Collapse } from '@mui/material'
import { Gavel, ExpandMore, ExpandLess, CheckCircle, Warning } from '@mui/icons-material'
import type { RegulatoryFinding } from '../types/assessment'

interface LamcChunk {
  section: string
  title: string
  text: string
  governs: string[]
  source: string
  building_types?: string[]
  highlight_ranges?: { start: number; end: number; label: string }[]
}

interface Props {
  findings: RegulatoryFinding[]
  chunks: Record<string, LamcChunk>
  loading?: boolean
  error?: boolean
}

export default function RegulatoryReasoning({ findings, chunks, loading, error }: Props) {
  if (loading) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.disabled">Loading supporting regulatory text...</Typography>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.disabled">
          Regulatory text could not be loaded right now. The structured findings and citations are still available.
        </Typography>
      </Box>
    )
  }

  if (!chunks || Object.keys(chunks).length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.disabled">
          No supporting regulatory text is available for this report yet.
        </Typography>
      </Box>
    )
  }

  // Match findings to LAMC chunks
  const pairs = matchFindingsToChunks(findings, chunks)

  if (pairs.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.disabled">No regulatory text matches for current findings</Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 2 }}>
        <Gavel sx={{ fontSize: 16, color: 'primary.main' }} />
        <Typography variant="overline" color="primary.main">Regulatory Reasoning & Rule Extraction</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Original municipal code text paired with the structured findings shown in this report.
        This panel helps distinguish direct lookups from items that still require manual review.
      </Typography>

      <Stack spacing={1.5}>
        {pairs.map((pair, i) => (
          <ReasoningCard key={i} chunk={pair.chunk} findings={pair.findings} chunkKey={pair.key} />
        ))}
      </Stack>
    </Box>
  )
}

function ReasoningCard({ chunk, findings, chunkKey }: { chunk: LamcChunk; findings: RegulatoryFinding[]; chunkKey: string }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', '&:hover': { borderColor: 'rgba(61,44,36,0.2)' } }}>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        {/* Header */}
        <Box
          onClick={() => setExpanded(!expanded)}
          sx={{
            px: 2, py: 1.5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: expanded ? 1 : 0, borderColor: 'divider',
          }}
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={chunk.section} size="small" color="primary" variant="outlined" sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }} />
              <Typography variant="subtitle2" sx={{ fontSize: '0.8rem' }}>{chunk.title}</Typography>
            </Stack>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.3, display: 'block' }}>
              {chunk.source}
            </Typography>
          </Box>
          {expanded ? <ExpandLess sx={{ color: 'text.disabled' }} /> : <ExpandMore sx={{ color: 'text.disabled' }} />}
        </Box>

        <Collapse in={expanded}>
          <Box sx={{ display: 'flex' }}>
            {/* Left: Original text */}
            <Box sx={{ flex: 3, p: 2, borderRight: 1, borderColor: 'divider' }}>
              <Typography variant="overline" color="text.disabled" sx={{ fontSize: '0.6rem', mb: 1, display: 'block' }}>
                Original Regulatory Text
              </Typography>
              <HighlightedText text={chunk.text} highlights={chunk.highlight_ranges} />
            </Box>

            {/* Right: Extracted rules */}
            <Box sx={{ flex: 2, p: 2 }}>
              <Typography variant="overline" color="primary.main" sx={{ fontSize: '0.6rem', mb: 1, display: 'block' }}>
                Rule Extraction
              </Typography>
              <Stack spacing={1}>
                {findings.map((f, i) => (
                  <ExtractedRule key={i} finding={f} />
                ))}
              </Stack>
            </Box>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  )
}

function HighlightedText({ text, highlights }: { text: string; highlights?: { start: number; end: number; label: string }[] }) {
  if (!highlights || highlights.length === 0) {
    return (
      <Typography variant="body2" sx={{ fontSize: '0.75rem', lineHeight: 1.8, color: 'text.secondary', whiteSpace: 'pre-wrap' }}>
        {text}
      </Typography>
    )
  }

  // Sort highlights by start position
  const sorted = [...highlights].sort((a, b) => a.start - b.start)
  const parts: React.ReactNode[] = []
  let lastEnd = 0

  sorted.forEach((h, i) => {
    if (h.start > lastEnd) {
      parts.push(
        <span key={`t${i}`} style={{ color: '#7a6e65' }}>
          {text.slice(lastEnd, h.start)}
        </span>
      )
    }
    parts.push(
      <span key={`h${i}`} style={{
        backgroundColor: 'rgba(61,44,36,0.08)',
        borderBottom: '2px solid #3d2c24',
        padding: '1px 0',
        color: '#5a4238',
      }}>
        {text.slice(h.start, h.end)}
      </span>
    )
    lastEnd = h.end
  })

  if (lastEnd < text.length) {
    parts.push(<span key="rest" style={{ color: '#7a6e65' }}>{text.slice(lastEnd)}</span>)
  }

  return (
    <Typography component="div" variant="body2" sx={{ fontSize: '0.75rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
      {parts}
    </Typography>
  )
}

function ExtractedRule({ finding }: { finding: RegulatoryFinding }) {
  const isNE = finding.method === 'not_evaluated'
  const label = finding.finding_type.replace(/^adu_/, '').replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const hasValue = finding.value != null && typeof finding.value !== 'object'

  return (
    <Box sx={{
      p: 1.5, borderRadius: 1.5, bgcolor: '#f5f0eb',
      border: '1px solid', borderColor: isNE ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.15)',
    }}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
        {isNE ? (
          <Warning sx={{ fontSize: 12, color: 'warning.main' }} />
        ) : (
          <CheckCircle sx={{ fontSize: 12, color: 'success.main' }} />
        )}
        <Typography variant="caption" fontWeight={600} color={isNE ? 'warning.main' : 'text.primary'} sx={{ fontSize: '0.7rem' }}>
          {label}
        </Typography>
      </Stack>
      {hasValue && (
        <Typography variant="body2" fontWeight={700} sx={{ fontSize: '0.9rem' }}>
          {String(finding.value)}{finding.unit && <span style={{ fontWeight: 400, color: '#7a6e65', marginLeft: 3, fontSize: '0.7rem' }}>{finding.unit}</span>}
        </Typography>
      )}
      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
        <Chip label={finding.method.replace('_', ' ')} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.55rem', textTransform: 'uppercase' }} />
        <Chip
          label={`${(finding.confidence * 100).toFixed(0)}%`}
          size="small" variant="outlined"
          sx={{
            height: 16, fontSize: '0.55rem', fontWeight: 700,
            borderColor: finding.confidence >= 0.8 ? 'success.main' : finding.confidence >= 0.6 ? 'warning.main' : 'text.disabled',
            color: finding.confidence >= 0.8 ? 'success.main' : finding.confidence >= 0.6 ? 'warning.main' : 'text.disabled',
          }}
        />
      </Stack>
      {finding.reason && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.7, lineHeight: 1.5 }}>
          {finding.reason.replace(/_/g, ' ')}
        </Typography>
      )}
      {!finding.reason && finding.evidence[0]?.source_locator && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.7, lineHeight: 1.5 }}>
          {finding.evidence[0].source_locator}
        </Typography>
      )}
    </Box>
  )
}

function matchFindingsToChunks(findings: RegulatoryFinding[], chunks: Record<string, LamcChunk>) {
  const results: { key: string; chunk: LamcChunk; findings: RegulatoryFinding[] }[] = []
  const used = new Set<string>()

  // For each chunk, find findings whose type matches the chunk's governs array
  for (const [key, chunk] of Object.entries(chunks)) {
    const matched = findings.filter(f =>
      chunk.governs.some(g => f.finding_type === g || f.finding_type.includes(g))
    )
    if (matched.length > 0) {
      results.push({ key, chunk, findings: matched })
      matched.forEach(f => used.add(f.finding_type))
    }
  }

  // Also try matching via evidence source_locator
  for (const finding of findings) {
    if (used.has(finding.finding_type)) continue
    for (const ev of finding.evidence) {
      const locator = ev.source_locator || ''
      for (const [key, chunk] of Object.entries(chunks)) {
        if (locator.includes(chunk.section.replace('SEC. ', '')) || locator.includes(key)) {
          const existing = results.find(r => r.key === key)
          if (existing) {
            existing.findings.push(finding)
          } else {
            results.push({ key, chunk, findings: [finding] })
          }
          used.add(finding.finding_type)
          break
        }
      }
    }
  }

  return results
}
