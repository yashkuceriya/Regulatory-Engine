import { useState, useEffect } from 'react'
import { Box, Typography, Stack, LinearProgress } from '@mui/material'
import {
  LocationOn, Shield, GridOn, Layers, Calculate, Home, ViewInAr, AutoAwesome,
} from '@mui/icons-material'

const PIPELINE_STEPS = [
  { label: 'Geocoding', icon: <LocationOn sx={{ fontSize: 14 }} />, duration: 1200 },
  { label: 'Boundary', icon: <Shield sx={{ fontSize: 14 }} />, duration: 800 },
  { label: 'Parcel', icon: <GridOn sx={{ fontSize: 14 }} />, duration: 1500 },
  { label: 'Zoning', icon: <Layers sx={{ fontSize: 14 }} />, duration: 1200 },
  { label: 'Rules', icon: <Calculate sx={{ fontSize: 14 }} />, duration: 600 },
  { label: 'ADU', icon: <Home sx={{ fontSize: 14 }} />, duration: 500 },
  { label: 'Geometry', icon: <ViewInAr sx={{ fontSize: 14 }} />, duration: 800 },
  { label: 'Synthesis', icon: <AutoAwesome sx={{ fontSize: 14 }} />, duration: 2000 },
]

interface Props {
  query?: string | null
}

export default function PipelineStatus({ query }: Props) {
  const [activeStep, setActiveStep] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setActiveStep(0)
    setProgress(0)
    const totalDuration = PIPELINE_STEPS.reduce((a, b) => a + b.duration, 0)
    let elapsed = 0

    const interval = setInterval(() => {
      elapsed += 100
      let acc = 0
      for (let i = 0; i < PIPELINE_STEPS.length; i++) {
        acc += PIPELINE_STEPS[i].duration
        if (elapsed < acc) {
          setActiveStep(i)
          break
        }
        if (i === PIPELINE_STEPS.length - 1) setActiveStep(i)
      }
      setProgress(Math.min((elapsed / totalDuration) * 100, 95))
    }, 100)

    return () => clearInterval(interval)
  }, [query])

  return (
    <Box sx={{ px: 3, py: 1.2, borderBottom: 1, borderColor: 'divider', bgcolor: '#fff' }}>
      {/* Step indicators */}
      <Stack direction="row" spacing={0} alignItems="center" sx={{ mb: 1 }}>
        {PIPELINE_STEPS.map((step, i) => {
          const isActive = i === activeStep
          const isDone = i < activeStep
          return (
            <Box key={step.label} sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.4,
                borderRadius: 1.5, transition: 'all 0.3s ease',
                bgcolor: isActive ? 'rgba(61,44,36,0.06)' : isDone ? 'rgba(22,163,74,0.06)' : 'transparent',
                border: '1px solid',
                borderColor: isActive ? '#3d2c24' : isDone ? '#bbf7d0' : 'transparent',
              }}>
                <Box sx={{
                  color: isActive ? '#3d2c24' : isDone ? '#16a34a' : '#d4c8be',
                  display: 'flex', alignItems: 'center',
                  animation: isActive ? 'pulse 1.5s infinite' : 'none',
                }}>
                  {step.icon}
                </Box>
                <Typography sx={{
                  fontSize: 10, fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#3d2c24' : isDone ? '#16a34a' : '#b0a69d',
                  whiteSpace: 'nowrap',
                }}>
                  {step.label}
                </Typography>
              </Box>
              {i < PIPELINE_STEPS.length - 1 && (
                <Box sx={{
                  flex: 1, height: 1, mx: 0.3,
                  bgcolor: isDone ? '#bbf7d0' : '#e5ddd5',
                  transition: 'background-color 0.3s ease',
                }} />
              )}
            </Box>
          )
        })}
      </Stack>

      {/* Progress bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            flex: 1, height: 4, borderRadius: 2, bgcolor: '#f0ebe5',
            '& .MuiLinearProgress-bar': {
              borderRadius: 2,
              background: 'linear-gradient(90deg, #3d2c24, #5a4238)',
              transition: 'transform 0.3s ease',
            },
          }}
        />
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#7a6e65', minWidth: 80 }}>
          {query ? `${query.split(',')[0]}...` : 'Analyzing...'}
        </Typography>
      </Box>
    </Box>
  )
}
