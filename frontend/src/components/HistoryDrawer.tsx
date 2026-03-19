import React, { useState } from 'react'
import {
  Drawer,
  Box,
  Typography,
  Stack,
  Chip,
  IconButton,
  Button,
  Divider,
  List,
  ListItemButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material'
import HistoryIcon from '@mui/icons-material/History'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import PlaceIcon from '@mui/icons-material/Place'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import type { HistoryEntry } from '../hooks/useAssessmentHistory'

interface Props {
  open: boolean
  onClose: () => void
  history: HistoryEntry[]
  onSelect: (id: string) => void
  onClear: () => void
}

const DRAWER_WIDTH = 360
const PRIMARY = '#3d2c24'

/** Human-friendly relative time (e.g. "2 hours ago"). */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function verdictColor(verdict: string): 'success' | 'warning' | 'default' {
  if (verdict === 'ALLOWED') return 'success'
  if (verdict === 'FLAGGED') return 'warning'
  return 'default'
}

const HistoryDrawer: React.FC<Props> = ({ open, onClose, history, onSelect, onClear }) => {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: DRAWER_WIDTH,
          bgcolor: PRIMARY,
          color: '#e0e8ef',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <HistoryIcon sx={{ color: '#90caf9' }} />
          <Typography variant="h6" fontWeight={700} fontSize={18}>
            Assessment History
          </Typography>
        </Stack>
        <IconButton onClick={onClose} size="small" sx={{ color: '#90caf9' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* List */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {history.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 10,
              px: 3,
              opacity: 0.5,
            }}
          >
            <HistoryIcon sx={{ fontSize: 56, mb: 2, color: 'rgba(255,255,255,0.3)' }} />
            <Typography variant="body1" textAlign="center">
              No assessments yet. Run an address lookup to see results here.
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {history.map((entry, idx) => (
              <React.Fragment key={entry.id}>
                {idx > 0 && (
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />
                )}
                <ListItemButton
                  onClick={() => onSelect(entry.id)}
                  sx={{
                    px: 2,
                    py: 1.5,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                  }}
                >
                  <Box sx={{ width: '100%' }}>
                    {/* Address */}
                    <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                      <PlaceIcon
                        sx={{ fontSize: 18, mt: '2px', color: '#90caf9', flexShrink: 0 }}
                      />
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.address}
                      </Typography>
                    </Stack>

                    {/* Date + confidence */}
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{ mt: 0.5, ml: 2.75 }}
                    >
                      <AccessTimeIcon sx={{ fontSize: 14, opacity: 0.6 }} />
                      <Typography variant="caption" sx={{ opacity: 0.6 }}>
                        {relativeTime(entry.date)}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.6 }}>
                        {Math.round(entry.confidence * 100)}% confidence
                      </Typography>
                    </Stack>

                    {/* Chips */}
                    <Stack
                      direction="row"
                      spacing={0.5}
                      flexWrap="wrap"
                      sx={{ mt: 0.75, ml: 2.75, gap: 0.5 }}
                    >
                      <Chip
                        label={entry.zone}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: 11,
                          bgcolor: 'rgba(144,202,249,0.15)',
                          color: '#90caf9',
                        }}
                      />
                      {entry.verdicts.map((v) => (
                        <Chip
                          key={v.type}
                          label={`${v.type} ${v.verdict}`}
                          size="small"
                          color={verdictColor(v.verdict)}
                          sx={{ height: 22, fontSize: 11 }}
                        />
                      ))}
                    </Stack>
                  </Box>
                </ListItemButton>
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>

      {/* Footer */}
      {history.length > 0 && (
        <Box
          sx={{
            p: 2,
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Button
            fullWidth
            variant="outlined"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmOpen(true)}
            sx={{
              color: '#ef9a9a',
              borderColor: 'rgba(239,154,154,0.3)',
              textTransform: 'none',
              '&:hover': {
                borderColor: '#ef9a9a',
                bgcolor: 'rgba(239,154,154,0.08)',
              },
            }}
          >
            Clear All
          </Button>
        </Box>
      )}
    </Drawer>

    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
      <DialogTitle>Clear assessment history?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This will permanently remove all {history.length} saved assessment{history.length !== 1 ? 's' : ''} from your history. This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
        <Button
          onClick={() => { onClear(); setConfirmOpen(false) }}
          color="error"
          variant="contained"
        >
          Clear All
        </Button>
      </DialogActions>
    </Dialog>
    </>
  )
}

export default HistoryDrawer
