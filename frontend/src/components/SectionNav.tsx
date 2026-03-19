import { useState, useEffect } from 'react'
import { Box, Typography, Stack } from '@mui/material'
import {
  Summarize, Map as MapIcon, Shield, Architecture, Cottage,
  Gavel, Timeline,
} from '@mui/icons-material'

const SECTIONS = [
  { id: 'section-overview', label: 'Overview', icon: <Summarize sx={{ fontSize: 16 }} /> },
  { id: 'section-map', label: 'Map', icon: <MapIcon sx={{ fontSize: 16 }} /> },
  { id: 'section-overlays', label: 'Overlays', icon: <Shield sx={{ fontSize: 16 }} /> },
  { id: 'section-envelope', label: 'Envelope', icon: <Architecture sx={{ fontSize: 16 }} /> },
  { id: 'section-coverfit', label: 'Cover Fit', icon: <Cottage sx={{ fontSize: 16 }} /> },
  { id: 'section-findings', label: 'Findings', icon: <Gavel sx={{ fontSize: 16 }} /> },
  { id: 'section-pipeline', label: 'Pipeline', icon: <Timeline sx={{ fontSize: 16 }} /> },
]

export default function SectionNav() {
  const [active, setActive] = useState(SECTIONS[0].id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          // Pick the one closest to the top
          const top = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          )
          setActive(top.target.id)
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    )

    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Box
      sx={{
        width: 160,
        flexShrink: 0,
        position: 'sticky',
        top: 80,
        alignSelf: 'flex-start',
        display: { xs: 'none', lg: 'block' },
        py: 2,
        pl: 2,
      }}
    >
      <Typography
        sx={{
          fontSize: 9,
          fontWeight: 800,
          color: 'text.disabled',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          mb: 1.5,
          pl: 1.5,
        }}
      >
        Sections
      </Typography>
      <Stack spacing={0.3}>
        {SECTIONS.map(s => {
          const isActive = active === s.id
          return (
            <Box
              key={s.id}
              onClick={() => handleClick(s.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.8,
                borderRadius: 1.5,
                cursor: 'pointer',
                bgcolor: isActive ? 'action.hover' : 'transparent',
                borderLeft: isActive ? '2px solid' : '2px solid transparent',
                borderColor: isActive ? 'primary.main' : 'transparent',
                transition: 'all 0.15s',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ color: isActive ? 'primary.main' : 'text.disabled' }}>{s.icon}</Box>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'primary.main' : 'text.secondary',
                }}
              >
                {s.label}
              </Typography>
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}
