import { useState, useEffect } from 'react'
import { Box, Typography, Stack, CircularProgress } from '@mui/material'
import { CheckCircle } from '@mui/icons-material'

const PIPELINE_STEPS = [
  { label: 'Geocoding' },
  { label: 'Boundary Check' },
  { label: 'Parcel Lookup' },
  { label: 'Zoning Query' },
  { label: 'Rule Engine' },
  { label: 'Overlay Detection' },
  { label: 'Geometry' },
  { label: 'ADU Engine' },
  { label: 'Assembly' },
]

const STEP_INTERVAL_MS = 1500

interface Props {
  query?: string | null
  isComplete?: boolean
  pipelineTiming?: Record<string, number>
}

export default function PipelineStatus({ query, isComplete, pipelineTiming }: Props) {
  const [activeStep, setActiveStep] = useState(0)
  const [stepStartTimes, setStepStartTimes] = useState<number[]>([])
  const [stepDurations, setStepDurations] = useState<(number | null)[]>(
    () => PIPELINE_STEPS.map(() => null)
  )

  // Reset and simulate step progression
  useEffect(() => {
    setActiveStep(0)
    setStepDurations(PIPELINE_STEPS.map(() => null))
    const startTime = Date.now()
    setStepStartTimes([startTime])

    const interval = setInterval(() => {
      setActiveStep((prev) => {
        const next = prev + 1
        if (next >= PIPELINE_STEPS.length) {
          clearInterval(interval)
          return prev
        }
        const now = Date.now()
        // Record duration for the step that just completed
        setStepDurations((durations) => {
          const updated = [...durations]
          updated[prev] = now - startTime - prev * STEP_INTERVAL_MS
          return updated
        })
        setStepStartTimes((times) => [...times, now])
        return next
      })
    }, STEP_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [query])

  // When assessment completes, mark all steps done
  useEffect(() => {
    if (isComplete) {
      setActiveStep(PIPELINE_STEPS.length)
      if (pipelineTiming) {
        // Map backend timing to step durations if available
        const timingKeys = Object.keys(pipelineTiming)
        setStepDurations(
          PIPELINE_STEPS.map((step, i) => {
            const key = timingKeys[i]
            return key && pipelineTiming[key] != null
              ? Math.round(pipelineTiming[key])
              : stepDurations[i] ?? null
          })
        )
      } else {
        setStepDurations((prev) => prev.map((d) => d ?? null))
      }
    }
  }, [isComplete, pipelineTiming])

  return (
    <Box
      sx={{
        px: 3,
        py: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: '#fff',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        sx={{
          width: '100%',
          minHeight: 60,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {PIPELINE_STEPS.map((step, i) => {
          const isDone = i < activeStep
          const isActive = i === activeStep && !isComplete
          const isPending = i > activeStep

          return (
            <Box
              key={step.label}
              sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}
            >
              {/* Step node */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.3,
                  minWidth: 64,
                  flexShrink: 0,
                }}
              >
                {/* Icon circle */}
                {isDone ? (
                  <CheckCircle
                    sx={{
                      fontSize: 20,
                      color: '#16a34a',
                      transition: 'all 0.3s ease',
                    }}
                  />
                ) : isActive ? (
                  <Box
                    sx={{
                      animation: 'pulse 1.5s ease-in-out infinite',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CircularProgress
                      size={18}
                      thickness={5}
                      sx={{ color: '#3d2c24' }}
                    />
                  </Box>
                ) : (
                  <Box
                    sx={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      bgcolor: '#e5ddd5',
                      border: '2px solid #d4c8be',
                      transition: 'all 0.3s ease',
                    }}
                  />
                )}

                {/* Label */}
                <Typography
                  sx={{
                    fontSize: 9,
                    fontWeight: isActive ? 700 : isDone ? 600 : 500,
                    color: isActive ? '#3d2c24' : isDone ? '#16a34a' : '#b0a69d',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    transition: 'color 0.3s ease',
                  }}
                >
                  {step.label}
                </Typography>

                {/* Duration */}
                <Typography
                  sx={{
                    fontSize: 8,
                    color: '#b0a69d',
                    fontWeight: 500,
                    minHeight: 10,
                    textAlign: 'center',
                  }}
                >
                  {isDone && stepDurations[i] != null
                    ? `${stepDurations[i]}ms`
                    : ''}
                </Typography>
              </Box>

              {/* Connector line */}
              {i < PIPELINE_STEPS.length - 1 && (
                <Box
                  sx={{
                    flex: 1,
                    height: 2,
                    mx: 0.5,
                    mt: -1.5,
                    borderRadius: 1,
                    bgcolor: isDone ? '#bbf7d0' : '#e5ddd5',
                    transition: 'background-color 0.4s ease',
                    minWidth: 8,
                  }}
                />
              )}
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}
