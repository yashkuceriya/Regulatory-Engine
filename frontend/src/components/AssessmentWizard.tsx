import React, { useState, useRef, useEffect } from 'react'
import {
  Dialog, Box, Typography, Button, TextField, Stack, IconButton, Card,
  Chip, LinearProgress, CircularProgress, Fade,
} from '@mui/material'
import {
  Close, LocationOn, Home, Architecture, ArrowForward, ArrowBack,
  Search, MyLocation, CheckCircle, Apartment, Cottage, AddHome,
} from '@mui/icons-material'
import type { AssessmentParams } from '../hooks/useAssessment'

const P = '#3d2c24'
const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN || ''

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (params: AssessmentParams) => void
  isLoading: boolean
}

const STEPS = [
  { num: 1, label: 'LOCATION', icon: <LocationOn sx={{ fontSize: 16 }} /> },
  { num: 2, label: 'PROJECT', icon: <Home sx={{ fontSize: 16 }} /> },
  { num: 3, label: 'ASSESS', icon: <Architecture sx={{ fontSize: 16 }} /> },
]

const PROJECT_TYPES = [
  { id: 'adu', label: 'ADU / Backyard Home', desc: 'Accessory dwelling unit', icon: <Cottage sx={{ fontSize: 28 }} />, color: '#c17855' },
  { id: 'sfr', label: 'Single Family', desc: 'Primary residence', icon: <Home sx={{ fontSize: 28 }} />, color: P },
  { id: 'addition', label: 'Addition', desc: 'Expand existing structure', icon: <AddHome sx={{ fontSize: 28 }} />, color: '#6366f1' },
  { id: 'multi', label: 'Multi-Family', desc: 'Duplex or more', icon: <Apartment sx={{ fontSize: 28 }} />, color: '#d97706' },
]

export default function AssessmentWizard({ open, onClose, onSubmit, isLoading }: Props) {
  const [step, setStep] = useState(0)
  const [address, setAddress] = useState('')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [targetSqft, setTargetSqft] = useState('')
  const [bedrooms, setBedrooms] = useState('')
  const [pickedFromMap, setPickedFromMap] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  // Reset on open
  useEffect(() => {
    if (open) { setStep(0); setAddress(''); setSelectedType(null); setTargetSqft(''); setBedrooms(''); setPickedFromMap(false) }
  }, [open])

  // Init mini map for step 0 — use a small delay to ensure the container is mounted
  useEffect(() => {
    if (!open || step !== 0 || !MAPBOX_TOKEN) return
    // Clean up previous
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

    let cancelled = false

    const timer = setTimeout(() => {
      if (!mapContainerRef.current || cancelled) return
      import('mapbox-gl').then((mapboxgl) => {
        if (!mapContainerRef.current || cancelled) return
        mapboxgl.default.accessToken = MAPBOX_TOKEN
        const map = new mapboxgl.default.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-118.35, 34.05],
          zoom: 10.5,
          attributionControl: false,
        })
        mapRef.current = map

        let marker: any = null
        map.on('click', async (e: any) => {
          const { lng, lat } = e.lngLat
          if (marker) marker.remove()
          marker = new mapboxgl.default.Marker({ color: P, draggable: true }).setLngLat([lng, lat]).addTo(map)

          // Reverse geocode on drop
          const reverseGeocode = async (lng: number, lt: number) => {
            try {
              const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lt}.json?access_token=${MAPBOX_TOKEN}&types=address&limit=1`)
              const data = await res.json()
              if (data.features?.[0]) {
                setAddress(data.features[0].place_name)
                setPickedFromMap(true)
              }
            } catch { /* ignore */ }
          }

          await reverseGeocode(lng, lat)

          // Allow dragging the pin to a new location
          marker.on('dragend', () => {
            const pos = marker.getLngLat()
            reverseGeocode(pos.lng, pos.lat)
          })
        })
      })
    }, 200) // small delay for DOM mount

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [open, step])

  const canProceed = step === 0 ? address.trim().length >= 5 : step === 1 ? selectedType !== null : true

  const handleNext = () => {
    if (step === 2) {
      // Submit
      const params: AssessmentParams = { address }
      if (targetSqft) params.target_sqft = Number(targetSqft)
      if (bedrooms) params.bedrooms = Number(bedrooms)
      onSubmit(params)
    } else {
      setStep(s => s + 1)
    }
  }

  return (
    <Dialog
      open={open} onClose={isLoading ? undefined : onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: { xs: '95vw', sm: 600, md: 720 }, maxHeight: '85vh', borderRadius: 3, overflow: 'hidden',
          bgcolor: '#fff',
        },
      }}
    >
      {/* Header */}
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${P}10` }}>
        <Typography sx={{ fontSize: 18, fontWeight: 800, color: P, letterSpacing: '-0.3px' }}>
          New Assessment
        </Typography>
        <IconButton onClick={onClose} disabled={isLoading} size="small">
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Stepper */}
      <Box sx={{ px: 3, py: 2, bgcolor: '#f5f0eb', borderBottom: `1px solid ${P}08` }}>
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={0}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s.num}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{
                  width: 32, height: 32, borderRadius: '50%',
                  bgcolor: i <= step ? P : '#e5ddd5',
                  color: i <= step ? '#fff' : '#b0a69d',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s',
                  boxShadow: i === step ? `0 0 0 4px ${P}20` : 'none',
                }}>
                  {i < step ? <CheckCircle sx={{ fontSize: 18 }} /> : s.icon}
                </Box>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.8px',
                  color: i <= step ? P : '#b0a69d',
                }}>
                  {s.label}
                </Typography>
              </Stack>
              {i < STEPS.length - 1 && (
                <Box sx={{ width: 48, height: 2, bgcolor: i < step ? P : '#e5ddd5', mx: 1.5, transition: 'all 0.3s' }} />
              )}
            </React.Fragment>
          ))}
        </Stack>
      </Box>

      {/* Content */}
      <Box sx={{ p: 3, minHeight: 360 }}>
        {/* Step 0: Location */}
        {step === 0 && (
          <Fade in timeout={300}>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: P, mb: 0.5 }}>Select Location</Typography>
              <Typography sx={{ fontSize: 12, color: '#7a6e65', mb: 2.5 }}>
                Click on the map to drop a pin, or type an LA address below.
              </Typography>

              {/* Map */}
              <Box sx={{
                height: 220, borderRadius: 2, overflow: 'hidden', mb: 2,
                border: `1px solid ${P}15`, position: 'relative',
              }}>
                {MAPBOX_TOKEN ? (
                  <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f0ebe5' }}>
                    <Typography sx={{ fontSize: 12, color: '#b0a69d' }}>Set VITE_MAPBOX_TOKEN for map</Typography>
                  </Box>
                )}
                {pickedFromMap && (
                  <Box sx={{
                    position: 'absolute', bottom: 8, left: 8, right: 8,
                    bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
                    borderRadius: 1.5, px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1,
                    border: '1px solid rgba(229,221,213,0.6)',
                  }}>
                    <MyLocation sx={{ fontSize: 14, color: P }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: P, flex: 1 }}>{address}</Typography>
                    <Chip label="Selected" size="small" sx={{ height: 18, fontSize: '0.5rem', bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }} />
                  </Box>
                )}
              </Box>

              {/* Address input */}
              <TextField
                fullWidth size="small" placeholder="Or type an address: e.g. 5432 Coliseum St Los Angeles CA 90016"
                value={address}
                onChange={e => { setAddress(e.target.value); setPickedFromMap(false) }}
                InputProps={{
                  startAdornment: <Search sx={{ fontSize: 16, color: '#b0a69d', mr: 1 }} />,
                  sx: { fontSize: 13, borderRadius: 2, bgcolor: '#f5f0eb' },
                }}
              />
            </Box>
          </Fade>
        )}

        {/* Step 1: Project Type */}
        {step === 1 && (
          <Fade in timeout={300}>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: P, mb: 0.5 }}>What are you building?</Typography>
              <Typography sx={{ fontSize: 12, color: '#7a6e65', mb: 2.5 }}>
                Select the project type to tailor the assessment.
              </Typography>

              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5, mb: 3 }}>
                {PROJECT_TYPES.map(pt => (
                  <Box
                    key={pt.id}
                    onClick={() => setSelectedType(pt.id)}
                    sx={{
                      p: 2.5, borderRadius: 2, cursor: 'pointer',
                      border: `2px solid ${selectedType === pt.id ? pt.color : '#e5ddd5'}`,
                      bgcolor: selectedType === pt.id ? `${pt.color}08` : '#fff',
                      transition: 'all 0.2s',
                      '&:hover': { borderColor: pt.color, bgcolor: `${pt.color}05` },
                    }}
                  >
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{
                        width: 48, height: 48, borderRadius: 2, flexShrink: 0,
                        bgcolor: selectedType === pt.id ? pt.color : '#f0ebe5',
                        color: selectedType === pt.id ? '#fff' : '#7a6e65',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}>
                        {pt.icon}
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: P }}>{pt.label}</Typography>
                        <Typography sx={{ fontSize: 11, color: '#b0a69d' }}>{pt.desc}</Typography>
                      </Box>
                    </Stack>
                  </Box>
                ))}
              </Box>

              {/* Optional params */}
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.8px', mb: 1 }}>
                Optional Details
              </Typography>
              <Stack direction="row" spacing={2}>
                <TextField
                  size="small" placeholder="Target sqft" type="number"
                  value={targetSqft} onChange={e => setTargetSqft(e.target.value)}
                  sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: 13, borderRadius: 2 } }}
                />
                <TextField
                  size="small" placeholder="Bedrooms" type="number"
                  value={bedrooms} onChange={e => setBedrooms(e.target.value)}
                  sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: 13, borderRadius: 2 } }}
                />
              </Stack>
            </Box>
          </Fade>
        )}

        {/* Step 2: Confirm & Run */}
        {step === 2 && (
          <Fade in timeout={300}>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: P, mb: 0.5 }}>Ready to Assess</Typography>
              <Typography sx={{ fontSize: 12, color: '#7a6e65', mb: 3 }}>
                Review your inputs and run the regulatory assessment.
              </Typography>

              <Card variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
                <Box sx={{ p: 2.5 }}>
                  {/* Address */}
                  <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: P, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.3 }}>
                      <LocationOn sx={{ fontSize: 18, color: '#fff' }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Selected Location</Typography>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: P }}>{address}</Typography>
                      {pickedFromMap && <Typography sx={{ fontSize: 10, color: '#c17855' }}>Picked from map</Typography>}
                    </Box>
                  </Stack>

                  {/* Project type */}
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                    <Box sx={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      bgcolor: PROJECT_TYPES.find(p => p.id === selectedType)?.color || '#f0ebe5',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff',
                    }}>
                      {PROJECT_TYPES.find(p => p.id === selectedType)?.icon || <Home sx={{ fontSize: 18 }} />}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Project Type</Typography>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: P }}>
                        {PROJECT_TYPES.find(p => p.id === selectedType)?.label || 'Not selected'}
                      </Typography>
                    </Box>
                  </Stack>

                  {/* Details */}
                  {(targetSqft || bedrooms) && (
                    <Stack direction="row" spacing={2}>
                      {targetSqft && (
                        <Chip label={`${targetSqft} sqft target`} size="small" sx={{ fontSize: 11, fontWeight: 600, bgcolor: '#f0ebe5', color: P }} />
                      )}
                      {bedrooms && (
                        <Chip label={`${bedrooms} bedrooms`} size="small" sx={{ fontSize: 11, fontWeight: 600, bgcolor: '#f0ebe5', color: P }} />
                      )}
                    </Stack>
                  )}
                </Box>
              </Card>

              {/* What you'll get */}
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#b0a69d', textTransform: 'uppercase', letterSpacing: '0.8px', mb: 1 }}>
                Assessment will include
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
                {[
                  'Zoning & setback constraints',
                  'ADU feasibility check',
                  'Buildable envelope geometry',
                  'Overlay risk screening',
                  'Confidence scoring',
                  'Cited LAMC references',
                ].map(item => (
                  <Stack key={item} direction="row" spacing={0.8} alignItems="center">
                    <CheckCircle sx={{ fontSize: 14, color: '#16a34a' }} />
                    <Typography sx={{ fontSize: 11, color: '#6b5d54' }}>{item}</Typography>
                  </Stack>
                ))}
              </Box>

              {isLoading && (
                <Box sx={{ mt: 3 }}>
                  <LinearProgress sx={{
                    height: 4, borderRadius: 2, bgcolor: `${P}15`,
                    '& .MuiLinearProgress-bar': { bgcolor: P },
                  }} />
                  <Typography sx={{ fontSize: 11, color: '#b0a69d', mt: 1, textAlign: 'center' }}>
                    Running 9-step assessment pipeline...
                  </Typography>
                </Box>
              )}
            </Box>
          </Fade>
        )}
      </Box>

      {/* Footer */}
      <Box sx={{ px: 3, py: 2, borderTop: `1px solid ${P}08`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#fafafa' }}>
        <Button
          onClick={() => step > 0 ? setStep(s => s - 1) : onClose()}
          disabled={isLoading}
          startIcon={step > 0 ? <ArrowBack sx={{ fontSize: 16 }} /> : undefined}
          sx={{ fontSize: 12, color: '#7a6e65' }}
        >
          {step > 0 ? 'Back' : 'Cancel'}
        </Button>
        <Button
          variant="contained" onClick={handleNext}
          disabled={!canProceed || isLoading}
          endIcon={step < 2 ? <ArrowForward sx={{ fontSize: 16 }} /> : isLoading ? <CircularProgress size={14} color="inherit" /> : <Architecture sx={{ fontSize: 16 }} />}
          sx={{ fontSize: 12, px: 3, py: 1, borderRadius: 2 }}
        >
          {step < 2 ? 'Continue' : isLoading ? 'Assessing...' : 'Run Assessment'}
        </Button>
      </Box>
    </Dialog>
  )
}
