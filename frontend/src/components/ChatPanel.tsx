import { useState, useRef, useEffect } from 'react'
import {
  Drawer, Box, Typography, TextField, IconButton, Stack, Chip, Avatar, CircularProgress,
} from '@mui/material'
import { Send, Close, SmartToy, Person, AutoAwesome } from '@mui/icons-material'
import type { BuildabilityAssessment } from '../types/assessment'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  open: boolean
  onClose: () => void
  assessment: BuildabilityAssessment
}

const SUGGESTED_QUESTIONS = [
  "What's the max buildable area on this lot?",
  "Is this parcel eligible for a Cover ADU?",
  "Explain the setback requirements",
  "What overlays affect this property?",
  "How does RFAR limit floor area here?",
  "What's the ADU height limit?",
]

export default function ChatPanel({ open, onClose, assessment }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setMessages([])
    setInput('')
  }, [assessment.address])

  const sendMessage = async (question?: string) => {
    const q = question || input.trim()
    if (!q || streaming) return
    if (q.length > 2000) { setInput(''); return }  // too long
    setInput('')

    const userMsg: ChatMessage = { role: 'user', content: q }
    const requestHistory = [...messages, userMsg].slice(-6)
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
    setStreaming(true)

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          assessment_context: buildContext(assessment),
          history: requestHistory,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Chat request failed')
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      if (!reader) {
        throw new Error('No chat stream returned')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last?.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, content: last.content + parsed.text }
                  }
                  return updated
                })
              }
            } catch { /* skip invalid JSON */ }
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }
        return updated
      })
    }
    setStreaming(false)
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: 420, bgcolor: 'background.paper', borderLeft: 1, borderColor: 'divider' } }}
    >
      {/* Header */}
      <Box sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <AutoAwesome sx={{ fontSize: 18, color: 'primary.main' }} />
          <Box>
            <Typography variant="subtitle2">Regulatory Assistant</Typography>
            <Typography variant="caption" color="text.secondary">Zoning & buildability questions only. Grounded in assessment data.</Typography>
          </Box>
        </Stack>
        <IconButton size="small" onClick={onClose}><Close sx={{ fontSize: 18 }} /></IconButton>
      </Box>

      {/* Messages */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <SmartToy sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Ask follow-up questions about this assessment
            </Typography>
            <Stack spacing={0.5}>
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <Chip
                  key={i} label={q} size="small" variant="outlined"
                  onClick={() => sendMessage(q)}
                  sx={{ fontSize: '0.7rem', cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
                />
              ))}
            </Stack>
          </Box>
        )}

        {messages.map((msg, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
            <Avatar sx={{
              width: 26, height: 26, mt: 0.3,
              bgcolor: msg.role === 'user' ? 'primary.main' : '#f0ebe5',
              fontSize: 12,
            }}>
              {msg.role === 'user' ? <Person sx={{ fontSize: 16 }} /> : <SmartToy sx={{ fontSize: 16 }} />}
            </Avatar>
            <Box sx={{
              flex: 1, p: 1.5, borderRadius: 2,
              bgcolor: msg.role === 'user' ? 'rgba(61,44,36,0.04)' : '#f0ebe5',
              border: '1px solid', borderColor: msg.role === 'user' ? 'rgba(61,44,36,0.12)' : 'divider',
            }}>
              <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {msg.content}
                {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                  <Box component="span" sx={{ display: 'inline-block', width: 6, height: 14, bgcolor: 'primary.main', ml: 0.3, animation: 'pulse 1s infinite' }} />
                )}
              </Typography>
            </Box>
          </Box>
        ))}
        <div ref={bottomRef} />
      </Box>

      {/* Input */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth size="small" placeholder="Ask a question..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
            disabled={streaming}
            sx={{ '& .MuiInputBase-root': { fontSize: '0.8rem', bgcolor: '#f0ebe5' } }}
          />
          <IconButton
            onClick={() => sendMessage()}
            disabled={streaming || !input.trim()}
            sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' }, '&:disabled': { bgcolor: 'action.disabledBackground' } }}
          >
            {streaming ? <CircularProgress size={18} color="inherit" /> : <Send sx={{ fontSize: 18 }} />}
          </IconButton>
        </Stack>
      </Box>
    </Drawer>
  )
}

function buildContext(a: BuildabilityAssessment): Record<string, any> {
  return {
    address: a.address,
    parcel: a.parcel ? { apn: a.parcel.apn, lot_area_sqft: a.parcel.lot_area_sqft } : null,
    zoning: a.zoning ? { zoning_string: a.zoning.zoning_string, category: a.zoning.category } : null,
    overlay_flags: a.overlay_flags,
    citations: a.citations.slice(0, 20),
    assessments: a.assessments.map(bta => ({
      building_type: bta.building_type,
      verdict: bta.verdict,
      findings: bta.findings.map(f => ({
        type: f.finding_type,
        value: typeof f.value === 'object' ? '[geometry]' : f.value,
        unit: f.unit,
        method: f.method,
        confidence: f.confidence,
        confidence_level: f.confidence_level,
        reason: f.reason,
        assumptions: f.assumptions,
        evidence: f.evidence.slice(0, 3),
      })),
    })),
  }
}
