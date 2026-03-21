import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { Box, Typography, Chip, Card, CardContent, Stack, IconButton, Tooltip } from '@mui/material'
import { Layers, Straighten, Close } from '@mui/icons-material'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { BuildabilityAssessment } from '../types/assessment'
import { distanceFt, formatDist, formatDistDual, midpoint as geoMidpoint, analyzeParcel, getOuterRing, cornerAngle, getParcelSlope } from '../utils/geometry'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Cover's unit specs for ADU placement sizing
const COVER_UNITS = [
  { model: 'S1', sqft: 580, minBuildable: 700, minLotSqft: 3500 },
  { model: 'S2', sqft: 800, minBuildable: 1000, minLotSqft: 5000 },
  { model: 'Custom Build', sqft: 1200, minBuildable: 1500, minLotSqft: 7000 },
]

interface Props { assessment: BuildabilityAssessment; showParcel?: boolean; showEnvelope?: boolean }

export default function MapPanel({ assessment, showParcel = true, showEnvelope = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const setbackMarkersRef = useRef<mapboxgl.Marker[]>([])
  const dimMarkersRef = useRef<mapboxgl.Marker[]>([])
  const measureMarkersRef = useRef<mapboxgl.Marker[]>([])
  const aduMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [slopeInfo, setSlopeInfo] = useState<{ slopePct: number; minElev: number; maxElev: number; avgElev: number } | null>(null)
  const measurePointsRef = useRef<[number, number][]>([])
  const parcelGeo = assessment.parcel?.geometry
  const envelopeGeo = assessment.buildable_envelope

  // Fetch elevation/slope data
  useEffect(() => {
    if (!parcelGeo || !MAPBOX_TOKEN) return
    const coords = getOuterRing(parcelGeo)
    if (coords.length < 4) return
    getParcelSlope(coords, MAPBOX_TOKEN).then(setSlopeInfo).catch(() => {})
  }, [parcelGeo])

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

  // Determine best-fitting Cover unit and compute ADU footprint rectangle
  const aduFootprint = useMemo(() => {
    try {
      const lotArea = assessment.parcel?.lot_area_sqft || 0
      const buildableArea = assessment.buildable_envelope?.properties?.envelope_area_sqft || 0
      const effectiveBuildable = buildableArea || (lotArea * 0.55)
      if (!effectiveBuildable || !lotArea) return null

      // Pick the largest fitting unit
      const fittingUnits = COVER_UNITS.filter(
        u => effectiveBuildable >= u.minBuildable && lotArea >= u.minLotSqft
      )
      if (fittingUnits.length === 0) return null
      const bestUnit = fittingUnits[fittingUnits.length - 1]

      // Need envelope geometry to place the rectangle
      const envGeo = assessment.buildable_envelope?.geometry
      if (!envGeo) return null

      const coords: number[][] = envGeo.type === 'Polygon'
        ? envGeo.coordinates[0]
        : envGeo.type === 'MultiPolygon'
          ? envGeo.coordinates[0][0]
          : []
      if (coords.length < 4) return null

      // Compute envelope bounding box
      const lngs = coords.map((c: number[]) => c[0])
      const lats = coords.map((c: number[]) => c[1])
      const minLng = Math.min(...lngs)
      const maxLng = Math.max(...lngs)
      const minLat = Math.min(...lats)
      const maxLat = Math.max(...lats)

      const envW = maxLng - minLng
      const envH = maxLat - minLat
      if (envW === 0 || envH === 0) return null

      // Size ADU proportionally: sqrt(unitSqft / lotSqft) * dimension
      const scale = Math.sqrt(bestUnit.sqft / lotArea)
      const aduW = scale * envW
      const aduH = scale * envH

      // Place in rear portion of envelope (away from street = higher lat values
      // for typical LA parcels where front/street is at lower lat, but we use
      // the "rear" = top of bbox as a safe heuristic)
      // Position: centered horizontally, pushed toward the rear (maxLat) with a small margin
      const margin = 0.15 // 15% inset from rear edge
      const centerLng = (minLng + maxLng) / 2
      const rearLat = maxLat - envH * margin

      const aduMinLng = centerLng - aduW / 2
      const aduMaxLng = centerLng + aduW / 2
      const aduMaxLat = rearLat
      const aduMinLat = rearLat - aduH

      // Clamp within envelope bounds
      const clampedMinLng = Math.max(aduMinLng, minLng)
      const clampedMaxLng = Math.min(aduMaxLng, maxLng)
      const clampedMinLat = Math.max(aduMinLat, minLat)
      const clampedMaxLat = Math.min(aduMaxLat, maxLat)

      const polygon: [number, number][] = [
        [clampedMinLng, clampedMinLat],
        [clampedMaxLng, clampedMinLat],
        [clampedMaxLng, clampedMaxLat],
        [clampedMinLng, clampedMaxLat],
        [clampedMinLng, clampedMinLat], // close ring
      ]

      const aduCenter: [number, number] = [
        (clampedMinLng + clampedMaxLng) / 2,
        (clampedMinLat + clampedMaxLat) / 2,
      ]

      return {
        polygon,
        center: aduCenter,
        label: `Cover ${bestUnit.model}`,
        geojson: {
          type: 'Feature' as const,
          geometry: { type: 'Polygon' as const, coordinates: [polygon] },
          properties: {},
        },
      }
    } catch {
      return null
    }
  }, [assessment])

  const midpoint = geoMidpoint

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

      // ADU footprint rectangle
      if (aduFootprint && showEnvelope) {
        try {
          map.addSource('adu-footprint', { type: 'geojson', data: aduFootprint.geojson as GeoJSON.Feature })
          map.addLayer({
            id: 'adu-fill', type: 'fill', source: 'adu-footprint',
            paint: { 'fill-color': 'rgba(193, 120, 85, 0.3)' },
          })
          map.addLayer({
            id: 'adu-line', type: 'line', source: 'adu-footprint',
            paint: { 'line-color': '#c17855', 'line-width': 2, 'line-dasharray': [4, 3] },
          })

          // HTML marker label centered on the ADU rectangle
          const labelEl = document.createElement('div')
          labelEl.innerHTML = `<span style="background:rgba(193,120,85,0.92);padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;color:#fff;white-space:nowrap;letter-spacing:0.3px">${aduFootprint.label}</span>`
          const aduMarker = new mapboxgl.Marker({ element: labelEl, anchor: 'center' })
            .setLngLat(aduFootprint.center)
            .addTo(map)
          aduMarkerRef.current = aduMarker
        } catch { /* ADU layer add failed */ }
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

      // Parcel edge dimensions & corner angles
      if (parcelGeo) {
        try {
          const coords = getOuterRing(parcelGeo)
          const vertices = analyzeParcel(coords)
          dimMarkersRef.current.forEach(m => m.remove())
          dimMarkersRef.current = []

          // Edge length labels
          for (const v of vertices) {
            const nextIdx = (vertices.indexOf(v) + 1) % vertices.length
            const next = vertices[nextIdx]
            const mid = geoMidpoint(v.coord, next.coord)
            const ft = v.edgeLengthFt
            if (ft < 3) continue // skip tiny edges

            const el = document.createElement('div')
            el.innerHTML = `<span style="background:rgba(61,44,36,0.85);padding:1px 5px;border-radius:3px;font-size:9px;font-weight:600;color:#fff;white-space:nowrap">${formatDist(ft)}</span>`
            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
              .setLngLat(mid)
              .addTo(map)
            dimMarkersRef.current.push(marker)
          }

          // Corner angle labels (only for significant corners < 160°)
          for (const v of vertices) {
            if (v.angleDeg > 160 || v.angleDeg < 10) continue
            const el = document.createElement('div')
            el.innerHTML = `<span style="background:rgba(255,255,255,0.92);padding:1px 4px;border-radius:3px;font-size:8px;font-weight:700;color:#5a4238;border:1px solid rgba(61,44,36,0.2);white-space:nowrap">${Math.round(v.angleDeg)}°</span>`
            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
              .setLngLat(v.coord as [number, number])
              .addTo(map)
            dimMarkersRef.current.push(marker)
          }
        } catch { /* geometry analysis failed */ }
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
      dimMarkersRef.current.forEach(m => m.remove())
      dimMarkersRef.current = []
      measureMarkersRef.current.forEach(m => m.remove())
      measureMarkersRef.current = []
      aduMarkerRef.current?.remove()
      aduMarkerRef.current = null
      map.remove()
    }
  }, [center, parcelGeo, envelopeGeo, aduFootprint])

  // Measurement tool
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!measuring) {
      map.getCanvas().style.cursor = ''
      return
    }
    map.getCanvas().style.cursor = 'crosshair'
    measurePointsRef.current = []
    measureMarkersRef.current.forEach(m => m.remove())
    measureMarkersRef.current = []
    // Remove previous measure line
    try { map.removeLayer('measure-line') } catch {}
    try { map.removeSource('measure-line') } catch {}

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      measurePointsRef.current.push(pt)

      // Drop a dot marker
      const dotEl = document.createElement('div')
      dotEl.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#dc2626;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)'
      const dotMarker = new mapboxgl.Marker({ element: dotEl, anchor: 'center' }).setLngLat(pt).addTo(map)
      measureMarkersRef.current.push(dotMarker)

      if (measurePointsRef.current.length === 2) {
        const [a, b] = measurePointsRef.current
        const ft = distanceFt(a, b)
        const label = formatDistDual(ft)

        // Draw line
        map.addSource('measure-line', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [a, b] }, properties: {} },
        })
        map.addLayer({
          id: 'measure-line', type: 'line', source: 'measure-line',
          paint: { 'line-color': '#dc2626', 'line-width': 2, 'line-dasharray': [4, 2] },
        })

        // Label at midpoint
        const mid = geoMidpoint(a, b)
        const labelEl = document.createElement('div')
        labelEl.innerHTML = `<span style="background:#dc2626;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;color:#fff;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${label}</span>`
        const labelMarker = new mapboxgl.Marker({ element: labelEl, anchor: 'center' }).setLngLat(mid).addTo(map)
        measureMarkersRef.current.push(labelMarker)

        // Reset for next measurement
        measurePointsRef.current = []
      }
    }

    map.on('click', onClick)
    return () => { map.off('click', onClick) }
  }, [measuring])

  // Toggle layer visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const parcelLayers = ['parcel-glow', 'parcel-fill', 'parcel-line']
    const envLayers = ['env-fill', 'env-line']
    const aduLayers = ['adu-fill', 'adu-line']
    parcelLayers.forEach(id => { try { map.setLayoutProperty(id, 'visibility', showParcel ? 'visible' : 'none') } catch {} })
    envLayers.forEach(id => { try { map.setLayoutProperty(id, 'visibility', showEnvelope ? 'visible' : 'none') } catch {} })
    aduLayers.forEach(id => { try { map.setLayoutProperty(id, 'visibility', showEnvelope ? 'visible' : 'none') } catch {} })

    // ADU label marker: toggle via display style
    if (aduMarkerRef.current) {
      aduMarkerRef.current.getElement().style.display = showEnvelope ? '' : 'none'
    }

    // Setback fill visible only when both parcel and envelope are shown
    const showSetback = showParcel && showEnvelope
    try { map.setLayoutProperty('setback-fill', 'visibility', showSetback ? 'visible' : 'none') } catch {}

    // Setback label markers: toggle via display style
    const labelVisible = showParcel
    setbackMarkersRef.current.forEach(m => {
      const el = m.getElement()
      el.style.display = labelVisible ? '' : 'none'
    })
    // Dimension labels: visible with parcel
    dimMarkersRef.current.forEach(m => {
      m.getElement().style.display = showParcel ? '' : 'none'
    })
  }, [showParcel, showEnvelope])

  const clearMeasure = useCallback(() => {
    setMeasuring(false)
    measureMarkersRef.current.forEach(m => m.remove())
    measureMarkersRef.current = []
    measurePointsRef.current = []
    const map = mapRef.current
    if (map) {
      try { map.removeLayer('measure-line') } catch {}
      try { map.removeSource('measure-line') } catch {}
    }
  }, [])

  if (!MAPBOX_TOKEN) return <Fallback assessment={assessment} center={center} />

  return (
    <Box sx={{ height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* North arrow */}
      <Box sx={{
        position: 'absolute', top: 12, left: 12,
        width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: 'rgba(255,255,255,0.92)', borderRadius: '50%', border: '1px solid rgba(229,221,213,0.6)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
      }}>
        <svg width="20" height="20" viewBox="0 0 20 20">
          <polygon points="10,1 13,9 10,7 7,9" fill="#3d2c24" />
          <polygon points="10,19 7,11 10,13 13,11" fill="#b0a69d" />
          <text x="10" y="7" textAnchor="middle" fontSize="5" fontWeight="800" fill="#fff">N</text>
        </svg>
      </Box>

      {/* Measure tool button */}
      <Box sx={{ position: 'absolute', top: 12, left: 56 }}>
        <Tooltip title={measuring ? 'Stop measuring' : 'Measure distance'}>
          <IconButton
            size="small"
            onClick={() => measuring ? clearMeasure() : setMeasuring(true)}
            sx={{
              bgcolor: measuring ? '#dc2626' : 'rgba(255,255,255,0.92)',
              color: measuring ? '#fff' : '#3d2c24',
              border: '1px solid rgba(229,221,213,0.6)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              '&:hover': { bgcolor: measuring ? '#b91c1c' : 'rgba(255,255,255,1)' },
              width: 36, height: 36,
            }}
          >
            {measuring ? <Close sx={{ fontSize: 16 }} /> : <Straighten sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {measuring && (
        <Box sx={{
          position: 'absolute', top: 56, left: 12,
          bgcolor: 'rgba(220,38,38,0.9)', color: '#fff', px: 1.5, py: 0.5,
          borderRadius: 1, fontSize: '0.7rem', fontWeight: 600,
        }}>
          Click two points to measure
        </Box>
      )}

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
          {aduFootprint && <LegendItem color="#c17855" label="ADU Placement" dashed />}
          <LegendItem color="#3d2c24" label="Dimensions" />
        </Stack>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {slopeInfo && (
            <Tooltip title={`Elevation: ${Math.round(slopeInfo.minElev)}–${Math.round(slopeInfo.maxElev)} ft ASL`}>
              <Chip
                label={`${slopeInfo.slopePct.toFixed(1)}% slope`}
                size="small"
                sx={{
                  height: 16, fontSize: '0.5rem', fontWeight: 700,
                  bgcolor: slopeInfo.slopePct > 15 ? 'rgba(220,38,38,0.1)' : 'rgba(34,197,94,0.1)',
                  color: slopeInfo.slopePct > 15 ? '#dc2626' : '#16a34a',
                  border: `1px solid ${slopeInfo.slopePct > 15 ? '#fca5a5' : '#86efac'}`,
                }}
              />
            </Tooltip>
          )}
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
