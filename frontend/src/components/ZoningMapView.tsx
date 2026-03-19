import { useEffect, useRef, useState } from 'react'
import { Box, Typography, Card, CardContent, Stack, Chip, TextField, InputAdornment, IconButton, Button } from '@mui/material'
import { Search, Layers, MyLocation, Satellite, DarkMode, Map } from '@mui/icons-material'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

const MAP_STYLES = [
  { label: 'Satellite', icon: <Satellite sx={{ fontSize: 14 }} />, url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { label: 'Dark', icon: <DarkMode sx={{ fontSize: 14 }} />, url: 'mapbox://styles/mapbox/dark-v11' },
  { label: 'Streets', icon: <Map sx={{ fontSize: 14 }} />, url: 'mapbox://styles/mapbox/streets-v12' },
]

interface Props {
  onSelectAddress: (address: string) => void
}

export default function ZoningMapView({ onSelectAddress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [pickerMessage, setPickerMessage] = useState<string | null>(null)
  const [activeStyle, setActiveStyle] = useState(1) // dark default

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return
    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES[activeStyle].url,
      center: [-118.35, 34.05],
      zoom: 11,
      pitch: 30,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right')
    map.addControl(new mapboxgl.ScaleControl(), 'bottom-left')

    map.on('load', () => {
      map.addSource('la-center', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [-118.2437, 34.0522] }, properties: { name: 'Los Angeles City Hall' } },
      })

      map.addLayer({
        id: 'building-extrusion',
        type: 'fill-extrusion',
        source: 'composite',
        'source-layer': 'building',
        paint: {
          'fill-extrusion-color': '#1a2235',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-opacity': 0.4,
        },
      })
    })

    map.on('click', async (e) => {
      const { lng, lat } = e.lngLat
      setCoords({ lat, lng })
      setPickerMessage(null)

      const existing = document.querySelectorAll('.mapboxgl-marker')
      existing.forEach(m => m.remove())
      const marker = new mapboxgl.Marker({ color: '#3d2c24', draggable: true }).setLngLat([lng, lat]).addTo(map)

      const reverseGeocode = async (lngVal: number, latVal: number) => {
        setCoords({ lat: latVal, lng: lngVal })
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lngVal},${latVal}.json?access_token=${MAPBOX_TOKEN}&types=address&limit=1`
          )
          if (!res.ok) throw new Error('Reverse geocoding failed')
          const data = await res.json()
          if (data.features?.[0]) {
            setSearchInput(data.features[0].place_name)
          } else {
            setPickerMessage('No street address found. Try dragging the pin or type manually.')
          }
        } catch {
          setPickerMessage('Reverse geocoding unavailable. You can still type an address.')
        }
      }

      // Reverse geocode on drag end
      marker.on('dragend', () => {
        const pos = marker.getLngLat()
        reverseGeocode(pos.lng, pos.lat)
      })

      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=address&limit=1`
        )
        if (!res.ok) throw new Error('Reverse geocoding failed')
        const data = await res.json()
        if (data.features?.[0]) {
          const addr = data.features[0].place_name
          setSearchInput(addr)
        } else {
          setPickerMessage('No street address found. Try dragging the pin or type manually.')
        }
      } catch {
        setPickerMessage('Reverse geocoding unavailable. You can still type an address.')
      }
    })

    map.getCanvas().style.cursor = 'crosshair'
    return () => { map.remove() }
  }, [])

  const handleStyleChange = (idx: number) => {
    setActiveStyle(idx)
    mapRef.current?.setStyle(MAP_STYLES[idx].url)
  }

  const handleSearch = () => {
    if (searchInput.trim().length >= 5) onSelectAddress(searchInput.trim())
  }

  if (!MAPBOX_TOKEN) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <Card sx={{ maxWidth: 400, textAlign: 'center' }}>
          <CardContent>
            <Layers sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="subtitle1" gutterBottom>Location Picker</Typography>
            <Typography variant="body2" color="text.secondary">Set `VITE_MAPBOX_TOKEN` to enable the interactive location picker.</Typography>
          </CardContent>
        </Card>
      </Box>
    )
  }

  return (
    <Box sx={{ flex: 1, position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Search overlay */}
      <Card sx={{
        position: 'absolute', top: 16, left: 16, right: { xs: 16, md: 312 }, maxWidth: 480,
        bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(229,221,213,0.8)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', borderRadius: 3,
      }}>
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              fullWidth size="small" placeholder="Click map or enter LA address..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
                sx: { fontSize: '0.8rem', bgcolor: 'rgba(255,255,255,0.03)' },
              }}
            />
            <IconButton onClick={handleSearch} sx={{
              bgcolor: 'primary.main', color: 'white',
              '&:hover': { bgcolor: 'primary.dark' },
              boxShadow: '0 2px 8px rgba(249,115,22,0.3)',
            }}>
              <MyLocation sx={{ fontSize: 18 }} />
            </IconButton>
          </Stack>
        </CardContent>
      </Card>

      {/* Info panel */}
      <Card sx={{
        position: 'absolute', top: 16, right: 16, width: 280, display: { xs: 'none', md: 'block' },
        bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(229,221,213,0.8)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', borderRadius: 3,
      }}>
        <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1.5 }}>
            <Layers sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography variant="subtitle2">Location Picker</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6, display: 'block', mb: 2 }}>
            Click to pick a location, reverse geocode it, then run a buildability assessment.
          </Typography>

          {coords && (
            <Box sx={{ mb: 1.5, p: 1.5, bgcolor: '#f5f0eb', borderRadius: 2, border: '1px solid #e5ddd5' }}>
              <Typography variant="overline" color="text.disabled" sx={{ fontSize: '0.6rem' }}>Selected Location</Typography>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </Typography>
            </Box>
          )}

          {pickerMessage && (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1.5, lineHeight: 1.6, p: 1, bgcolor: '#fffbeb', borderRadius: 1.5 }}>
              {pickerMessage}
            </Typography>
          )}

          <Typography variant="overline" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block', mb: 0.5 }}>Map Style</Typography>
          <Stack direction="row" spacing={0.5} sx={{ mb: 2 }}>
            {MAP_STYLES.map((s, i) => (
              <Chip
                key={s.label}
                icon={s.icon}
                label={s.label} size="small" variant={i === activeStyle ? 'filled' : 'outlined'}
                onClick={() => handleStyleChange(i)}
                sx={{
                  fontSize: '0.6rem', height: 26,
                  bgcolor: i === activeStyle ? 'rgba(249,115,22,0.1)' : 'transparent',
                  borderColor: i === activeStyle ? '#3d2c24' : '#e5ddd5',
                  color: i === activeStyle ? '#5a4238' : '#7a6e65',
                  '&:hover': { borderColor: '#3d2c24' },
                }}
              />
            ))}
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="overline" color="text.disabled" sx={{ fontSize: '0.6rem' }}>Best For</Typography>
            {['Picking a candidate address from the map', 'Quick parcel context before running a report', 'Comparing nearby parcels in the current LA scope'].map(z => (
              <Stack key={z} direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main', opacity: 0.7 }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>{z}</Typography>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card sx={{
        position: 'absolute', bottom: 32, left: 16,
        bgcolor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(229,221,213,0.8)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', borderRadius: 2,
      }}>
        <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
            LA location picker \u2014 click to suggest an address, then analyze
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
