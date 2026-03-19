import { useState } from 'react'
import { IconButton, Tooltip, TextField, Box, Popover, Button, Stack, Typography } from '@mui/material'
import { ThumbUp, ThumbDown, ThumbUpOutlined, ThumbDownOutlined } from '@mui/icons-material'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Props {
  address: string
  findingType: string
}

export default function FeedbackButton({ address, findingType }: Props) {
  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const postFeedback = async (v: 'up' | 'down', msg?: string) => {
    setSubmitting(true)
    try {
      await fetch(`${API_BASE}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, finding_type: findingType, vote: v, comment: msg || undefined }),
      })
    } catch { /* silent — feedback is best-effort */ }
    setSubmitting(false)
  }

  const handleVote = (v: 'up' | 'down', el?: HTMLElement) => {
    if (v === 'down') {
      setVote(v)
      if (el) setAnchorEl(el)
      return
    }
    setVote(v)
    setAnchorEl(null)
    postFeedback(v)
  }

  const submitDown = () => {
    setAnchorEl(null)
    postFeedback('down', comment)
  }

  return (
    <>
      <Stack direction="row" spacing={0}>
        <Tooltip title="Correct">
          <IconButton size="small" onClick={() => handleVote('up')} sx={{ p: 0.3 }}>
            {vote === 'up' ? <ThumbUp sx={{ fontSize: 13, color: 'success.main' }} /> : <ThumbUpOutlined sx={{ fontSize: 13, color: 'text.disabled' }} />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Incorrect">
          <IconButton size="small" onClick={(e) => handleVote('down', e.currentTarget)} sx={{ p: 0.3 }}>
            {vote === 'down' ? <ThumbDown sx={{ fontSize: 13, color: 'error.main' }} /> : <ThumbDownOutlined sx={{ fontSize: 13, color: 'text.disabled' }} />}
          </IconButton>
        </Tooltip>
      </Stack>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => { setAnchorEl(null); setVote(null); setComment('') }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { bgcolor: '#ffffff', border: '1px solid', borderColor: 'divider', p: 1.5, width: 250 } } }}
      >
        <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>What's wrong?</Typography>
        <TextField
          size="small" multiline rows={2} fullWidth placeholder="Optional comment..."
          value={comment} onChange={e => setComment(e.target.value)}
          sx={{ mb: 1, '& .MuiInputBase-root': { fontSize: '0.75rem' } }}
        />
        <Button size="small" variant="contained" color="error" fullWidth onClick={submitDown} sx={{ fontSize: '0.7rem' }}>
          Submit Feedback
        </Button>
      </Popover>
    </>
  )
}
