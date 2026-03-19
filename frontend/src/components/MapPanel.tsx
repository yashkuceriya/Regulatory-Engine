import { useEffect, useRef, useMemo, useCallback } from 'react'
import { Box, Typography, Chip, Card, CardContent, Stack } from '@mui/material'
import { Layers } from '@mui/icons-material'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { BuildabilityAssessment } from '../types/assessment'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

interface Props { assessment: BuildabilityAssessment; showParcel?: boolean; showEnvelope?: boolean }

export default function MapPanel({ assessment, showParcel = true, showEnvelope = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const setbackMarkersRef = useRef<mapboxgl.Marker[]>([])
  const parcelGeo = assessment.parcel?.geometry
  const envelopeGeo = assessment.buildable_envelope

  // Extract setback values from assessment findings
  const setbacks = useMemo(() => {
    try {
      const findings = assessment.assessments.flatMap(a => a.findings)
      const frontSetback = findings.find(f => f.finding_type === 'front_setback')?.value
      const sideSetback = findings.find(f => f.finding_type === 'interior_side_setback')?.value
      const rearSetback = findings.find(f => f.finding_type === 'rear_setback')?.value
      return { front: frontSetback, side: sideSetback, rear: rearSetback }
    } catch {
      return { front: undefined, side: undefined, rear: undefined }
    }
  }, [assessment])

  // Helper: compute midpoint of two coordinate pairs
  const midpoint = useCallback((a: number[], b: number[]): [number, number] => {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  }, [])

  const center = useMemo(() => {
    if (!parcelGeo) return { lng: -118.25, lat: 34.05 }
    try {
      const coords = parcelGeo.type === 'Polygon' ? parcelGeo.coordinates[0]
        : parcelGeo.type === 'MultiPolygon' ? parcelGeo.coordinates[0][0] : []
      if (!coords.length) return { lng: -118.25, lat: 34.05 }
      const lngs = coords.map((c: number[]) => c[0])
      const lats = coords.map((c: number[]) => c[1])
      return { lng: (Math.min(...lngs) + Math.max(...lngs)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2 }
    } catch { return { lng: -118.25, lat: 34.05 } }
  }, [parcelGeo])

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return
    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [center.lng, center.lat],
      zoom: 18, pitch: 45, bearing: 0,
      dragRotate: true,
      touchZoomRotate: true,
      preserveDrawingBuffer: true,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right')

    map.on('load', () => {
      if (parcelGeo) {
        map.addSource('parcel', { type: 'geojson', data: { type: 'Feature', geometry: parcelGeo, properties: {} } })
        map.addLayer({ id: 'parcel-glow', type: 'line', source: 'parcel', paint: { 'line-color': '#c17855', 'line-width': 6, 'line-opacity': 0.2, 'line-blur': 4 } })
        map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcel', paint: { 'fill-color': '#c17855', 'fill-opacity': 0.18 } })
        map.addLayer({ id: 'parcel-line', type: 'line', source: 'parcel', paint: { 'line-color': '#c17855', 'line-width': 3 } })
      }
      if (envelopeGeo?.geometry) {
        map.addSource('envelope', { type: 'geojson', data: { type: 'Feature', geometry: envelopeGeo.geometry, properties: {} } })
        map.addLayer({ id: 'env-fill', type: 'fill', source: 'envelope', paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.2 } })
        map.addLayer({ id: 'env-line', type: 'line', source: 'envelope', paint: { 'line-color': '#22c55e', 'line-width': 2.5, 'line-dasharray': [3, 2] } })
      }

      // Setback zone: amber fill between parcel boundary and buildable envelope
      if (parcelGeo && envelopeGeo?.geometry) {
        try {
          map.addSource('setback-zone', { type: 'geojson', data: { type: 'Feature', geometry: parcelGeo, properties: {} } })
          // Insert the setback fill BELOW the envelope fill so it only shows in the gap
          map.addLayer({
            id: 'setback-fill', type: 'fill', source: 'setback-zone',
            paint: { 'fill-color': 'rgba(217, 119, 6, 0.15)' }
          }, 'env-fill') // place before env-fill so envelope covers the inner area
        } catch { /* geometry may be unsupported */ }
      }

      // Setback distance labels at parcel edge midpoints
      if (parcelGeo) {
        try {
          const coords: number[][] = parcelGeo.type === 'Polygon'
            ? parcelGeo.coordinates[0]
            : parcelGeo.coordinates?.[0]?.[0] || []
          if (coords.length >= 4) {
            // Edges: front = [0,1], right side = [1,2], rear = [2,3], left side = [3,0] (for a quad)
            // For polygons with more vertices, approximate: front=first edge, rear=opposite, sides=in between
            const numEdges = coords.length - 1 // last coord repeats first
            const edgeLabels: { coord: [number, number]; label: string }[] = []

            // Front edge: first segment
            if (setbacks.front != null) {
              const mid = midpoint(coords[0], coords[1])
              edgeLabels.push({ coord: mid, label: `${setbacks.front}ft front` })
            }

            // Rear edge: the segment roughly opposite the front
            if (setbacks.rear != null && numEdges >= 3) {
              const rearIdx = Math.floor(numEdges / 2)
              const mid = midpoint(coords[rearIdx], coords[rearIdx + 1])
              edgeLabels.push({ coord: mid, label: `${setbacks.rear}ft rear` })
            }

            // Side edges: segments between front and rear
            if (setbacks.side != null && numEdges >= 4) {
              // Right side: second segment
              const midRight = midpoint(coords[1], coords[2])
              edgeLabels.push({ coord: midRight, label: `${setbacks.side}ft side` })
              // Left side: last segment before closing
              const midLeft = midpoint(coords[numEdges - 1], coords[0])
              edgeLabels.push({ coord: midLeft, label: `${setbacks.side}ft side` })
            }

            // Remove any previous setback markers
            setbackMarkersRef.current.forEach(m => m.remove())
            setbackMarkersRef.current = []

            for (const item of edgeLabels) {
              const el = document.createElement('div')
              el.className = 'setback-label'
              el.innerHTML = `<span style="background:rgba(255,255,255,0.9);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;color:#92400e;border:1px solid #fde68a;white-space:nowrap">${item.label}</span>`
              const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                .setLngLat(item.coord)
                .addTo(map)
              setbackMarkersRef.current.push(marker)
            }
          }
        } catch { /* unusual parcel shape */ }
      }

      // Click popup on parcel
      if (parcelGeo) {
        map.on('click', 'parcel-fill', () => {
          const lotArea = assessment.parcel?.lot_area_sqft
          const envArea = envelopeGeo?.properties?.envelope_area_sqft
          new mapboxgl.Popup({ closeButton: true, maxWidth: '240px' })
            .setLngLat([center.lng, center.lat])
            .setHTML(`
              <div style="font-family:Inter,sans-serif;font-size:12px;color:#5a4238;line-height:1.6">
                <strong style="font-size:13px">${assessment.parcel?.apn || 'Parcel'}</strong>
                <div style="color:#7a6e65;margin:4px 0">${assessment.zoning?.zoning_string || ''}</div>
                ${lotArea ? `<div>Lot: <strong>${Math.round(lotArea).toLocaleString()} sqft</strong></div>` : ''}
                ${envArea ? `<div>Buildable: <strong style="color:#16a34a">${Math.round(envArea).toLocaleString()} sqft</strong></div>` : ''}
              </div>
            `)
            .addTo(map)
        })
        map.on('mouseenter', 'parcel-fill', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'parcel-fill', () => { map.getCanvas().style.cursor = '' })
      }

      if (parcelGeo) {
        const coords = parcelGeo.type === 'Polygon' ? parcelGeo.coordinates[0] : parcelGeo.coordinates?.[0]?.[0] || []
        if (coords.length) {
          const bounds = coords.reduce(
            (b: mapboxgl.LngLatBounds, c: number[]) => b.extend(c as [number, number]),
            new mapboxgl.LngLatBounds(coords[0], coords[0])
          )
          map.fitBounds(bounds, { padding: { top: 40, bottom: 50, left: 40, right: 40 }, maxZoom: 19, pitch: 45 })
        }
      }
    })
    return () => {
      setbackMarkersRef.current.forEach(m => m.remove())
      setbackMarkersRef.current = []
      map.remove()
    }
  }, [center, parcelGeo, envelopeGeo])

  // Toggle layer visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const parcelLayers = ['parcel-glow', 'parcel-fill', 'parcel-line']
    const envLayers = ['env-fill', 'env-line']
    parcelLayers.forEach(id => { try { map.setLayoutProperty(id, 'visibility', showParcel ? 'visible' : 'none') } catch {} })
    envLayers.forEach(id => { try { map.setLayoutProperty(id, 'visibility', showEnvelope ? 'visible' : 'none') } catch {} })

    // Setback fill visible only when both parcel and envelope are shown
    const showSetback = showParcel && showEnvelope
    try { map.setLayoutProperty('setback-fill', 'visibility', showSetback ? 'visible' : 'none') } catch {}

    // Setback label markers: toggle via display style
    const labelVisible = showParcel
    setbackMarkersRef.current.forEach(m => {
      const el = m.getElement()
      el.style.display = labelVisible ? '' : 'none'
    })
  }, [showParcel, showEnvelope])

  if (!MAPBOX_TOKEN) return <Fallback assessment={assessment} center={center} />

  return (
    <Box sx={{ height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Compact bottom legend bar */}
      <Box sx={{
        position: 'absolute', bottom: 8, left: 8, right: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(229,221,213,0.6)', borderRadius: 1.5,
        px: 1.5, py: 0.6,
      }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <LegendItem color="#c17855" label="Parcel" />
          {envelopeGeo && <LegendItem color="#22c55e" label="Buildable" dashed />}
          {parcelGeo && envelopeGeo && <LegendItem color="#d97706" label="Setback" />}
        </Stack>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {assessment.parcel?.apn && (
            <Typography sx={{ fontSize: '0.55rem', color: '#7a6e65' }}>
              <span style={{ color: '#b0a69d' }}>APN</span> {assessment.parcel.apn}
            </Typography>
          )}
          {assessment.zoning?.zoning_string && (
            <Chip label={assessment.zoning.zoning_string} size="small" sx={{ height: 16, fontSize: '0.5rem', fontWeight: 700, bgcolor: 'rgba(61,44,36,0.08)', color: '#5a4238' }} />
          )}
        </Stack>
      </Box>
    </Box>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>{label}</Typography>
      <Typography variant="caption" fontWeight={600} color={highlight ? 'primary.main' : 'text.primary'} sx={{ fontSize: '0.65rem' }}>{value}</Typography>
    </Box>
  )
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={{ width: 14, height: 3, borderRadius: 1, bgcolor: color, border: dashed ? `1px dashed ${color}` : 'none', opacity: 0.8 }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>{label}</Typography>
    </Stack>
  )
}

function Fallback({ assessment, center }: { assessment: BuildabilityAssessment; center: { lat: number; lng: number } }) {
  return (
    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      <Card sx={{ maxWidth: 360, textAlign: 'center' }}>
        <CardContent>
          <Layers sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography variant="subtitle2" gutterBottom>Map Preview</Typography>
          <Typography variant="caption" color="text.disabled">
            Set `VITE_MAPBOX_TOKEN` for the interactive parcel preview. Envelope geometry is approximate.
          </Typography>
          <Box sx={{ mt: 2, textAlign: 'left' }}>
            <InfoRow label="Coords" value={`${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`} />
            {assessment.parcel?.lot_area_sqft && (
              <InfoRow label="Lot" value={`${Math.round(assessment.parcel.lot_area_sqft).toLocaleString()} sqft`} />
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
