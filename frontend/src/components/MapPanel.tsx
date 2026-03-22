import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { Box, Typography, Chip, Card, CardContent, Stack, IconButton, Tooltip } from '@mui/material'
import { Layers, Straighten, Close, Terrain, Edit, EditOff, RotateLeft, RotateRight, ThreeSixty } from '@mui/icons-material'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { BuildabilityAssessment } from '../types/assessment'
import { distanceFt, ftToM, formatDist, formatDistDual, midpoint as geoMidpoint, analyzeParcel, getOuterRing, getParcelSlope, formatArea, polygonAreaSqft, analyzeLotShape, sqftToSqm } from '../utils/geometry'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

const COVER_UNITS = [
  { model: 'S1', sqft: 580, minBuildable: 700, minLotSqft: 3500 },
  { model: 'S2', sqft: 800, minBuildable: 1000, minLotSqft: 5000 },
  { model: 'Custom Build', sqft: 1200, minBuildable: 1500, minLotSqft: 7000 },
]

interface Props {
  assessment: BuildabilityAssessment
  showParcel?: boolean
  showEnvelope?: boolean
  onBoundaryEdit?: (newAreaSqft: number, newCoords: number[][]) => void
  onAduResize?: (aduSqft: number) => void
}

export default function MapPanel({ assessment, showParcel = true, showEnvelope = true, onBoundaryEdit, onAduResize }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const setbackMarkersRef = useRef<mapboxgl.Marker[]>([])
  const dimMarkersRef = useRef<mapboxgl.Marker[]>([])
  const measureMarkersRef = useRef<mapboxgl.Marker[]>([])
  const measureCountRef = useRef(0)
  const editMarkersRef = useRef<mapboxgl.Marker[]>([])
  const aduMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editArea, setEditArea] = useState<string | null>(null)
  const [editAnalysis, setEditAnalysis] = useState<{
    areaSqft: number; coveragePct: number; envelopeSqft: number;
    frontage: number; depth: number; aduFits: string | null;
  } | null>(null)
  const [showTerrain, setShowTerrain] = useState(false)
  const [slopeInfo, setSlopeInfo] = useState<{ slopePct: number; minElev: number; maxElev: number; avgElev: number } | null>(null)
  const measurePointsRef = useRef<[number, number][]>([])
  // Use refs for geometry to prevent map re-creation on edits
  const parcelGeo = assessment.parcel?.geometry
  const envelopeGeo = assessment.buildable_envelope
  const initialParcelGeoRef = useRef(parcelGeo)
  const initialEnvelopeGeoRef = useRef(envelopeGeo)
  if (!initialParcelGeoRef.current && parcelGeo) initialParcelGeoRef.current = parcelGeo
  if (!initialEnvelopeGeoRef.current && envelopeGeo) initialEnvelopeGeoRef.current = envelopeGeo

  // Fetch elevation/slope data
  useEffect(() => {
    if (!parcelGeo || !MAPBOX_TOKEN) return
    const coords = getOuterRing(parcelGeo)
    if (coords.length < 4) return
    getParcelSlope(coords, MAPBOX_TOKEN).then(setSlopeInfo).catch(() => {})
  }, [parcelGeo])

  const setbacks = useMemo(() => {
    try {
      const findings = assessment.assessments.flatMap(a => a.findings)
      return {
        front: findings.find(f => f.finding_type === 'front_setback')?.value,
        side: findings.find(f => f.finding_type === 'interior_side_setback')?.value,
        rear: findings.find(f => f.finding_type === 'rear_setback')?.value,
      }
    } catch { return { front: undefined, side: undefined, rear: undefined } }
  }, [assessment])

  const aduFootprint = useMemo(() => {
    try {
      const lotArea = assessment.parcel?.lot_area_sqft || 0
      const buildableArea = assessment.buildable_envelope?.properties?.envelope_area_sqft || 0
      const effectiveBuildable = buildableArea || (lotArea * 0.55)
      if (!effectiveBuildable || !lotArea) return null
      const fittingUnits = COVER_UNITS.filter(u => effectiveBuildable >= u.minBuildable && lotArea >= u.minLotSqft)
      if (fittingUnits.length === 0) return null
      const bestUnit = fittingUnits[fittingUnits.length - 1]
      const envGeo = assessment.buildable_envelope?.geometry
      if (!envGeo) return null
      const coords: number[][] = envGeo.type === 'Polygon' ? envGeo.coordinates[0] : envGeo.type === 'MultiPolygon' ? envGeo.coordinates[0][0] : []
      if (!coords || coords.length < 4) return null
      const lngs = coords.map((c: number[]) => c[0]), lats = coords.map((c: number[]) => c[1])
      if (lngs.length === 0) return null
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs), minLat = Math.min(...lats), maxLat = Math.max(...lats)
      const envW = maxLng - minLng, envH = maxLat - minLat
      if (envW === 0 || envH === 0) return null
      const scale = Math.sqrt(bestUnit.sqft / lotArea)
      const aduW = scale * envW, aduH = scale * envH
      const margin = 0.15
      const centerLng = (minLng + maxLng) / 2, rearLat = maxLat - envH * margin
      const cMinLng = Math.max(centerLng - aduW / 2, minLng), cMaxLng = Math.min(centerLng + aduW / 2, maxLng)
      const cMinLat = Math.max(rearLat - aduH, minLat), cMaxLat = Math.min(rearLat, maxLat)
      const polygon: [number, number][] = [[cMinLng, cMinLat], [cMaxLng, cMinLat], [cMaxLng, cMaxLat], [cMinLng, cMaxLat], [cMinLng, cMinLat]]
      return {
        polygon, center: [(cMinLng + cMaxLng) / 2, (cMinLat + cMaxLat) / 2] as [number, number],
        label: `Cover ${bestUnit.model}`,
        geojson: { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [polygon] }, properties: {} },
      }
    } catch { return null }
  }, [assessment])

  const center = useMemo(() => {
    if (!parcelGeo) return { lng: -118.25, lat: 34.05 }
    try {
      const coords = parcelGeo.type === 'Polygon' ? parcelGeo.coordinates[0] : parcelGeo.type === 'MultiPolygon' ? parcelGeo.coordinates[0][0] : []
      if (!coords.length) return { lng: -118.25, lat: 34.05 }
      const lngs = coords.map((c: number[]) => c[0]), lats = coords.map((c: number[]) => c[1])
      return { lng: (Math.min(...lngs) + Math.max(...lngs)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2 }
    } catch { return { lng: -118.25, lat: 34.05 } }
  }, [parcelGeo])

  // Main map setup
  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return
    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [center.lng, center.lat],
      zoom: 18, pitch: 45, bearing: 0,
      dragRotate: true, touchZoomRotate: true, preserveDrawingBuffer: true,
    })
    mapRef.current = map

    // Built-in controls
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right')
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 150, unit: 'imperial' }), 'bottom-left')

    map.on('load', () => {
      // Terrain source for 3D + hillshade
      map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 })
      map.addLayer({ id: 'hillshade-layer', type: 'hillshade', source: 'mapbox-dem', layout: { visibility: 'none' }, paint: { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#473B32' } })

      // Parcel layers
      if (parcelGeo) {
        map.addSource('parcel', { type: 'geojson', data: { type: 'Feature', geometry: parcelGeo, properties: {} } })
        map.addLayer({ id: 'parcel-glow', type: 'line', source: 'parcel', paint: { 'line-color': '#c17855', 'line-width': 6, 'line-opacity': 0.2, 'line-blur': 4 } })
        map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcel', paint: { 'fill-color': '#c17855', 'fill-opacity': 0.18 } })
        map.addLayer({ id: 'parcel-line', type: 'line', source: 'parcel', paint: { 'line-color': '#c17855', 'line-width': 3 } })
      }

      // Envelope layers
      if (envelopeGeo?.geometry) {
        map.addSource('envelope', { type: 'geojson', data: { type: 'Feature', geometry: envelopeGeo.geometry, properties: {} } })
        map.addLayer({ id: 'env-fill', type: 'fill', source: 'envelope', paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.2 } })
        map.addLayer({ id: 'env-line', type: 'line', source: 'envelope', paint: { 'line-color': '#22c55e', 'line-width': 2.5, 'line-dasharray': [3, 2] } })
      }

      // Setback zone
      if (parcelGeo && envelopeGeo?.geometry) {
        try {
          map.addSource('setback-zone', { type: 'geojson', data: { type: 'Feature', geometry: parcelGeo, properties: {} } })
          map.addLayer({ id: 'setback-fill', type: 'fill', source: 'setback-zone', paint: { 'fill-color': 'rgba(217, 119, 6, 0.15)' } }, 'env-fill')
        } catch {}
      }

      // ADU footprint — draggable to reposition, corner handles to resize
      if (aduFootprint && showEnvelope) {
        try {
          map.addSource('adu-footprint', { type: 'geojson', data: aduFootprint.geojson as GeoJSON.Feature })
          map.addLayer({ id: 'adu-fill', type: 'fill', source: 'adu-footprint', paint: { 'fill-color': 'rgba(193, 120, 85, 0.3)' } })
          map.addLayer({ id: 'adu-line', type: 'line', source: 'adu-footprint', paint: { 'line-color': '#c17855', 'line-width': 2, 'line-dasharray': [4, 3] } })

          // Mutable state for ADU rect
          const aduState = {
            minLng: aduFootprint.polygon[0][0],
            minLat: aduFootprint.polygon[0][1],
            maxLng: aduFootprint.polygon[1][0],
            maxLat: aduFootprint.polygon[2][1],
          }

          const updateAduSource = () => {
            const poly: [number, number][] = [
              [aduState.minLng, aduState.minLat],
              [aduState.maxLng, aduState.minLat],
              [aduState.maxLng, aduState.maxLat],
              [aduState.minLng, aduState.maxLat],
              [aduState.minLng, aduState.minLat],
            ]
            const src = map.getSource('adu-footprint') as mapboxgl.GeoJSONSource
            if (src) src.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [poly] }, properties: {} })
          }

          const getAduAreaSqft = () => {
            const w = distanceFt([aduState.minLng, aduState.minLat], [aduState.maxLng, aduState.minLat])
            const h = distanceFt([aduState.minLng, aduState.minLat], [aduState.minLng, aduState.maxLat])
            return Math.round(w * h)
          }

          // Center label — drag to move entire ADU
          const labelEl = document.createElement('div')
          labelEl.style.cursor = 'grab'
          const updateLabel = () => {
            const sqft = getAduAreaSqft()
            labelEl.innerHTML = `<span style="background:rgba(193,120,85,0.92);padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;color:#fff;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2)">${sqft.toLocaleString()} sqft ✥</span>`
          }
          updateLabel()

          const centerLng = () => (aduState.minLng + aduState.maxLng) / 2
          const centerLat = () => (aduState.minLat + aduState.maxLat) / 2

          const aduMarker = new mapboxgl.Marker({ element: labelEl, anchor: 'center', draggable: true })
            .setLngLat([centerLng(), centerLat()])
            .addTo(map)

          const halfW = () => (aduState.maxLng - aduState.minLng) / 2
          const halfH = () => (aduState.maxLat - aduState.minLat) / 2

          aduMarker.on('drag', () => {
            const pos = aduMarker.getLngLat()
            const hw = halfW(), hh = halfH()
            aduState.minLng = pos.lng - hw
            aduState.maxLng = pos.lng + hw
            aduState.minLat = pos.lat - hh
            aduState.maxLat = pos.lat + hh
            updateAduSource()
            cornerMarkers.forEach(cm => cm.update())
          })
          aduMarker.on('dragend', () => { onAduResize?.(getAduAreaSqft()) })

          aduMarkerRef.current = aduMarker

          // Corner resize handles
          const corners = [
            { name: 'sw', getLng: () => aduState.minLng, getLat: () => aduState.minLat },
            { name: 'se', getLng: () => aduState.maxLng, getLat: () => aduState.minLat },
            { name: 'ne', getLng: () => aduState.maxLng, getLat: () => aduState.maxLat },
            { name: 'nw', getLng: () => aduState.minLng, getLat: () => aduState.maxLat },
          ]

          const cornerMarkers = corners.map(corner => {
            const el = document.createElement('div')
            el.style.cssText = 'width:10px;height:10px;background:#c17855;border:2px solid #fff;border-radius:1px;cursor:nwse-resize;box-shadow:0 1px 3px rgba(0,0,0,0.4)'

            const marker = new mapboxgl.Marker({ element: el, anchor: 'center', draggable: true })
              .setLngLat([corner.getLng(), corner.getLat()])
              .addTo(map)

            marker.on('drag', () => {
              const pos = marker.getLngLat()
              if (corner.name.includes('w')) aduState.minLng = pos.lng
              if (corner.name.includes('e')) aduState.maxLng = pos.lng
              if (corner.name.includes('s')) aduState.minLat = pos.lat
              if (corner.name.includes('n')) aduState.maxLat = pos.lat
              updateAduSource()
              updateLabel()
              aduMarker.setLngLat([centerLng(), centerLat()])
              cornerMarkers.forEach(cm => cm.update())
            })
            marker.on('dragend', () => { onAduResize?.(getAduAreaSqft()) })

            return {
              marker,
              update: () => marker.setLngLat([corner.getLng(), corner.getLat()]),
            }
          })

          // Store corner markers for cleanup
          editMarkersRef.current.push(...cornerMarkers.map(cm => cm.marker))
        } catch {}
      }

      // Setback labels
      if (parcelGeo) {
        try {
          const coords: number[][] = parcelGeo.type === 'Polygon' ? parcelGeo.coordinates[0] : parcelGeo.coordinates?.[0]?.[0] || []
          if (coords.length >= 4) {
            const numEdges = coords.length - 1
            const edgeLabels: { coord: [number, number]; label: string }[] = []
            if (setbacks.front != null) edgeLabels.push({ coord: geoMidpoint(coords[0], coords[1]), label: `${setbacks.front}ft front` })
            if (setbacks.rear != null && numEdges >= 3) {
              const ri = Math.floor(numEdges / 2)
              edgeLabels.push({ coord: geoMidpoint(coords[ri], coords[ri + 1]), label: `${setbacks.rear}ft rear` })
            }
            if (setbacks.side != null && numEdges >= 4) {
              edgeLabels.push({ coord: geoMidpoint(coords[1], coords[2]), label: `${setbacks.side}ft side` })
              edgeLabels.push({ coord: geoMidpoint(coords[numEdges - 1], coords[0]), label: `${setbacks.side}ft side` })
            }
            setbackMarkersRef.current.forEach(m => m.remove())
            setbackMarkersRef.current = []
            for (const item of edgeLabels) {
              const el = document.createElement('div')
              el.innerHTML = `<span style="background:rgba(255,255,255,0.9);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;color:#92400e;border:1px solid #fde68a;white-space:nowrap">${item.label}</span>`
              setbackMarkersRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(item.coord).addTo(map))
            }
          }
        } catch {}
      }

      // Edge dimensions & corner angles
      if (parcelGeo) {
        try {
          const coords = getOuterRing(parcelGeo)
          const vertices = analyzeParcel(coords)
          dimMarkersRef.current.forEach(m => m.remove())
          dimMarkersRef.current = []
          for (let i = 0; i < vertices.length; i++) {
            const v = vertices[i]
            const next = vertices[(i + 1) % vertices.length]
            const mid = geoMidpoint(v.coord, next.coord)
            const ft = v.edgeLengthFt
            if (ft < 3) continue
            const m = ftToM(ft)
            const label = ft >= 100 ? `${Math.round(ft)}′ · ${Math.round(m)}m` : `${ft.toFixed(1)}′ · ${m.toFixed(1)}m`
            const el = document.createElement('div')
            el.innerHTML = `<span style="background:rgba(61,44,36,0.88);padding:2px 6px;border-radius:3px;font-size:9px;font-weight:600;color:#fff;white-space:nowrap">${label}</span>`
            dimMarkersRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(mid).addTo(map))
          }
          // Corner angles
          for (const v of vertices) {
            if (v.angleDeg > 160 || v.angleDeg < 10) continue
            const el = document.createElement('div')
            el.innerHTML = `<span style="background:rgba(255,255,255,0.95);padding:2px 5px;border-radius:3px;font-size:9px;font-weight:800;color:#3d2c24;border:1.5px solid rgba(61,44,36,0.3);white-space:nowrap">${Math.round(v.angleDeg)}°</span>`
            dimMarkersRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(v.coord as [number, number]).addTo(map))
          }
        } catch {}
      }

      // Click popup
      if (parcelGeo) {
        map.on('click', 'parcel-fill', (e) => {
          if (measuring || editing) return // don't show popup in measure/edit mode
          const lotArea = assessment.parcel?.lot_area_sqft
          const envArea = envelopeGeo?.properties?.envelope_area_sqft
          new mapboxgl.Popup({ closeButton: true, maxWidth: '240px' })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-family:Inter,sans-serif;font-size:12px;color:#5a4238;line-height:1.6">
                <strong style="font-size:13px">${assessment.parcel?.apn || 'Parcel'}</strong>
                <div style="color:#7a6e65;margin:4px 0">${assessment.zoning?.zoning_string || ''}</div>
                ${lotArea ? `<div>Lot: <strong>${formatArea(lotArea)}</strong></div>` : ''}
                ${envArea ? `<div>Buildable: <strong style="color:#16a34a">${formatArea(envArea)}</strong></div>` : ''}
              </div>
            `)
            .addTo(map)
        })
        map.on('mouseenter', 'parcel-fill', () => { if (!measuring && !editing) map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'parcel-fill', () => { if (!measuring && !editing) map.getCanvas().style.cursor = '' })
      }

      // Fit to parcel
      if (parcelGeo) {
        const coords = parcelGeo.type === 'Polygon' ? parcelGeo.coordinates[0] : parcelGeo.coordinates?.[0]?.[0] || []
        if (coords.length) {
          const bounds = coords.reduce((b: mapboxgl.LngLatBounds, c: number[]) => b.extend(c as [number, number]), new mapboxgl.LngLatBounds(coords[0], coords[0]))
          map.fitBounds(bounds, { padding: { top: 40, bottom: 50, left: 40, right: 40 }, maxZoom: 19, pitch: 45 })
        }
      }
    })

    return () => {
      setbackMarkersRef.current.forEach(m => m.remove()); setbackMarkersRef.current = []
      dimMarkersRef.current.forEach(m => m.remove()); dimMarkersRef.current = []
      measureMarkersRef.current.forEach(m => m.remove()); measureMarkersRef.current = []
      editMarkersRef.current.forEach(m => m.remove()); editMarkersRef.current = []
      aduMarkerRef.current?.remove(); aduMarkerRef.current = null
      map.remove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lng, center.lat])

  // Measurement tool — supports multiple measurements with unique IDs
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!measuring) {
      map.getCanvas().style.cursor = ''
      return
    }
    map.getCanvas().style.cursor = 'crosshair'
    measurePointsRef.current = []

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      e.preventDefault()
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      measurePointsRef.current.push(pt)

      const dotEl = document.createElement('div')
      dotEl.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#dc2626;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);cursor:pointer'
      measureMarkersRef.current.push(new mapboxgl.Marker({ element: dotEl, anchor: 'center' }).setLngLat(pt).addTo(map))

      if (measurePointsRef.current.length === 2) {
        const [a, b] = measurePointsRef.current
        const ft = distanceFt(a, b)
        const m = ftToM(ft)
        const label = ft >= 100
          ? `${Math.round(ft)}′ (${Math.round(m)} m)`
          : `${ft.toFixed(1)}′ (${m.toFixed(1)} m)`

        const lineId = `measure-line-${measureCountRef.current++}`
        map.addSource(lineId, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [a, b] }, properties: {} },
        })
        map.addLayer({
          id: lineId, type: 'line', source: lineId,
          paint: { 'line-color': '#dc2626', 'line-width': 2.5, 'line-dasharray': [4, 2] },
        })

        const mid = geoMidpoint(a, b)
        const labelEl = document.createElement('div')
        labelEl.innerHTML = `<span style="background:#dc2626;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700;color:#fff;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);letter-spacing:0.3px">${label}</span>`
        measureMarkersRef.current.push(new mapboxgl.Marker({ element: labelEl, anchor: 'center' }).setLngLat(mid).addTo(map))

        measurePointsRef.current = []
      }
    }

    map.on('click', onClick)
    return () => { map.off('click', onClick) }
  }, [measuring])

  // Terrain toggle
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try {
      if (showTerrain) {
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
        map.setLayoutProperty('hillshade-layer', 'visibility', 'visible')
      } else {
        map.setTerrain(null as any)
        map.setLayoutProperty('hillshade-layer', 'visibility', 'none')
      }
    } catch {}
  }, [showTerrain])

  // Store original geometry ref so edits don't re-trigger the effect
  const originalParcelGeoRef = useRef(assessment.parcel?.geometry)
  useEffect(() => {
    // Only update ref when NOT editing (reset when new assessment loads)
    if (!editing) originalParcelGeoRef.current = assessment.parcel?.geometry
  }, [assessment.parcel?.geometry, editing])

  // Edit mode: add draggable markers on parcel vertices
  useEffect(() => {
    const map = mapRef.current
    const geo = originalParcelGeoRef.current
    if (!map || !geo) return

    // Clear existing edit markers
    editMarkersRef.current.forEach(m => m.remove())
    editMarkersRef.current = []

    if (!editing) return

    const coords = getOuterRing(geo)
    if (coords.length < 4) return

    // Sample vertices (max 20 for performance)
    const step = Math.max(1, Math.floor(coords.length / 20))
    const sampledIndices: number[] = []
    for (let i = 0; i < coords.length - 1; i += step) sampledIndices.push(i)

    for (const idx of sampledIndices) {
      const coord = coords[idx]
      const el = document.createElement('div')
      el.style.cssText = 'width:12px;height:12px;border-radius:2px;background:#3d2c24;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:grab'

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center', draggable: true })
        .setLngLat(coord as [number, number])
        .addTo(map)

      marker.on('drag', () => {
        const newPos = marker.getLngLat()
        coords[idx] = [newPos.lng, newPos.lat]
        const src = map.getSource('parcel') as mapboxgl.GeoJSONSource
        if (src) {
          src.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} })
        }

        // Live analysis
        const areaSqft = polygonAreaSqft(coords)
        setEditArea(formatArea(areaSqft))

        const front = setbacks.front || 15
        const side = setbacks.side || 5
        const rear = setbacks.rear || 15
        // Estimate envelope: area minus setback strips (rough approximation)
        const lotInfo = analyzeLotShape(coords)
        const frontage = lotInfo?.frontageWidthFt || 50
        const depth = lotInfo?.lotDepthFt || 100
        const envelopeW = Math.max(0, frontage - side * 2)
        const envelopeD = Math.max(0, depth - front - rear)
        const envelopeSqft = envelopeW * envelopeD
        const coveragePct = areaSqft > 0 ? Math.round((envelopeSqft / areaSqft) * 100) : 0

        // ADU fit check
        const units = [
          { model: 'Custom Build', sqft: 1200, minB: 1500, minLot: 7000 },
          { model: 'S2', sqft: 800, minB: 1000, minLot: 5000 },
          { model: 'S1', sqft: 580, minB: 700, minLot: 3500 },
        ]
        const aduFit = units.find(u => envelopeSqft >= u.minB && areaSqft >= u.minLot)

        setEditAnalysis({
          areaSqft, coveragePct, envelopeSqft,
          frontage, depth,
          aduFits: aduFit ? `Cover ${aduFit.model} (${aduFit.sqft} sqft)` : null,
        })
      })

      // Only update the full page when user RELEASES the vertex (not during drag)
      marker.on('dragend', () => {
        const areaSqft = polygonAreaSqft(coords)
        onBoundaryEdit?.(areaSqft, [...coords])
      })

      editMarkersRef.current.push(marker)
    }
  }, [editing])

  // Toggle layer visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    ;['parcel-glow', 'parcel-fill', 'parcel-line'].forEach(id => { try { map.setLayoutProperty(id, 'visibility', showParcel ? 'visible' : 'none') } catch {} })
    ;['env-fill', 'env-line'].forEach(id => { try { map.setLayoutProperty(id, 'visibility', showEnvelope ? 'visible' : 'none') } catch {} })
    ;['adu-fill', 'adu-line'].forEach(id => { try { map.setLayoutProperty(id, 'visibility', showEnvelope ? 'visible' : 'none') } catch {} })
    if (aduMarkerRef.current) aduMarkerRef.current.getElement().style.display = showEnvelope ? '' : 'none'
    try { map.setLayoutProperty('setback-fill', 'visibility', showParcel && showEnvelope ? 'visible' : 'none') } catch {}
    setbackMarkersRef.current.forEach(m => { m.getElement().style.display = showParcel ? '' : 'none' })
    dimMarkersRef.current.forEach(m => { m.getElement().style.display = showParcel ? '' : 'none' })
  }, [showParcel, showEnvelope])

  const clearMeasure = useCallback(() => {
    setMeasuring(false)
    measureMarkersRef.current.forEach(m => m.remove())
    measureMarkersRef.current = []
    measurePointsRef.current = []
    const map = mapRef.current
    if (map) {
      for (let i = 0; i < measureCountRef.current; i++) {
        try { map.removeLayer(`measure-line-${i}`) } catch {}
        try { map.removeSource(`measure-line-${i}`) } catch {}
      }
      measureCountRef.current = 0
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

      {/* Toolbar */}
      <Stack spacing={0.8} sx={{ position: 'absolute', top: 12, left: 56 }}>
        {/* Measure */}
        <Tooltip title={measuring ? 'Clear measurements' : 'Measure distance — click 2 points'} placement="right">
          <IconButton size="small" onClick={() => measuring ? clearMeasure() : setMeasuring(true)}
            sx={{ ...toolBtnSx, bgcolor: measuring ? '#dc2626' : 'rgba(255,255,255,0.92)', color: measuring ? '#fff' : '#3d2c24', '&:hover': { bgcolor: measuring ? '#b91c1c' : 'rgba(255,255,255,1)' } }}>
            {measuring ? <Close sx={{ fontSize: 16 }} /> : <Straighten sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>

        {/* Terrain */}
        <Tooltip title={showTerrain ? 'Hide terrain' : 'Show 3D terrain & contours'} placement="right">
          <IconButton size="small" onClick={() => setShowTerrain(t => !t)}
            sx={{ ...toolBtnSx, bgcolor: showTerrain ? '#3d2c24' : 'rgba(255,255,255,0.92)', color: showTerrain ? '#fff' : '#3d2c24', '&:hover': { bgcolor: showTerrain ? '#5a4238' : 'rgba(255,255,255,1)' } }}>
            <Terrain sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Edit parcel */}
        <Tooltip title={editing ? 'Stop editing' : 'Edit parcel boundary — drag vertices'} placement="right">
          <IconButton size="small" onClick={() => setEditing(e => !e)}
            sx={{ ...toolBtnSx, bgcolor: editing ? '#2563eb' : 'rgba(255,255,255,0.92)', color: editing ? '#fff' : '#3d2c24', '&:hover': { bgcolor: editing ? '#1d4ed8' : 'rgba(255,255,255,1)' } }}>
            {editing ? <EditOff sx={{ fontSize: 16 }} /> : <Edit sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>

        {/* Rotation controls */}
        <Tooltip title="Rotate left" placement="right">
          <IconButton size="small" onClick={() => { const m = mapRef.current; if (m) m.easeTo({ bearing: m.getBearing() - 45, duration: 500 }) }}
            sx={{ ...toolBtnSx, bgcolor: 'rgba(255,255,255,0.92)', color: '#3d2c24', '&:hover': { bgcolor: 'rgba(255,255,255,1)' } }}>
            <RotateLeft sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Rotate right" placement="right">
          <IconButton size="small" onClick={() => { const m = mapRef.current; if (m) m.easeTo({ bearing: m.getBearing() + 45, duration: 500 }) }}
            sx={{ ...toolBtnSx, bgcolor: 'rgba(255,255,255,0.92)', color: '#3d2c24', '&:hover': { bgcolor: 'rgba(255,255,255,1)' } }}>
            <RotateRight sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Top-down view" placement="right">
          <IconButton size="small" onClick={() => { const m = mapRef.current; if (m) m.easeTo({ bearing: 0, pitch: 0, duration: 500 }) }}
            sx={{ ...toolBtnSx, bgcolor: 'rgba(255,255,255,0.92)', color: '#3d2c24', '&:hover': { bgcolor: 'rgba(255,255,255,1)' } }}>
            <ThreeSixty sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="3D perspective view" placement="right">
          <IconButton size="small" onClick={() => { const m = mapRef.current; if (m) m.easeTo({ bearing: 0, pitch: 45, duration: 500 }) }}
            sx={{ ...toolBtnSx, bgcolor: 'rgba(255,255,255,0.92)', color: '#3d2c24', '&:hover': { bgcolor: 'rgba(255,255,255,1)' } }}>
            <Layers sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Tool status badges */}
      {measuring && (
        <Box sx={{ position: 'absolute', top: 56, left: 100, bgcolor: 'rgba(220,38,38,0.92)', color: '#fff', px: 1.5, py: 0.5, borderRadius: 1, fontSize: '0.7rem', fontWeight: 600 }}>
          Click two points to measure · ft & meters
        </Box>
      )}
      {editing && (
        <Box sx={{
          position: 'absolute', top: 12, right: 80, maxWidth: 280,
          bgcolor: 'rgba(37,99,235,0.95)', color: '#fff', px: 2, py: 1.5,
          borderRadius: 2, fontSize: '0.7rem', backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, mb: 0.5 }}>
            Edit Mode — Drag vertices
          </Typography>
          {editAnalysis ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', mt: 1 }}>
              <Box>
                <Typography sx={{ fontSize: 8, opacity: 0.6 }}>LOT AREA</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{Math.round(editAnalysis.areaSqft).toLocaleString()} sf</Typography>
                <Typography sx={{ fontSize: 8, opacity: 0.6 }}>{Math.round(sqftToSqm(editAnalysis.areaSqft))} m²</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 8, opacity: 0.6 }}>BUILDABLE</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#86efac' }}>{Math.round(editAnalysis.envelopeSqft).toLocaleString()} sf</Typography>
                <Typography sx={{ fontSize: 8, opacity: 0.6 }}>{editAnalysis.coveragePct}% coverage</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 8, opacity: 0.6 }}>FRONTAGE</Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{Math.round(editAnalysis.frontage)}′</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 8, opacity: 0.6 }}>DEPTH</Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{Math.round(editAnalysis.depth)}′</Typography>
              </Box>
              <Box sx={{ gridColumn: '1 / -1', mt: 0.5, pt: 0.5, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                <Typography sx={{ fontSize: 8, opacity: 0.6 }}>ADU FIT</Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: editAnalysis.aduFits ? '#86efac' : '#fca5a5' }}>
                  {editAnalysis.aduFits || 'Does not fit — lot too small'}
                </Typography>
              </Box>
            </Box>
          ) : (
            <Typography sx={{ fontSize: 10, opacity: 0.7 }}>Drag a vertex to see live analysis</Typography>
          )}
        </Box>
      )}

      {/* Legend bar */}
      <Box sx={{
        position: 'absolute', bottom: 28, left: 8, right: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(229,221,213,0.6)', borderRadius: 1.5, px: 1.5, py: 0.6,
      }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <LegendItem color="#c17855" label="Parcel" />
          {envelopeGeo && <LegendItem color="#22c55e" label="Buildable" dashed />}
          {parcelGeo && envelopeGeo && <LegendItem color="#d97706" label="Setback" />}
          {aduFootprint && <LegendItem color="#c17855" label="ADU" dashed />}
          <LegendItem color="#3d2c24" label="Dims" />
        </Stack>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {slopeInfo && (
            <Tooltip title={`Elevation: ${Math.round(slopeInfo.minElev)}–${Math.round(slopeInfo.maxElev)} ft ASL`}>
              <Chip label={`${slopeInfo.slopePct.toFixed(1)}% slope`} size="small"
                sx={{ height: 16, fontSize: '0.5rem', fontWeight: 700,
                  bgcolor: slopeInfo.slopePct > 15 ? 'rgba(220,38,38,0.1)' : 'rgba(34,197,94,0.1)',
                  color: slopeInfo.slopePct > 15 ? '#dc2626' : '#16a34a',
                  border: `1px solid ${slopeInfo.slopePct > 15 ? '#fca5a5' : '#86efac'}` }} />
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

const toolBtnSx = {
  border: '1px solid rgba(229,221,213,0.6)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  width: 36, height: 36,
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
            Set VITE_MAPBOX_TOKEN for the interactive parcel preview.
          </Typography>
          <Box sx={{ mt: 2, textAlign: 'left' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>Coords</Typography>
              <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.65rem' }}>{center.lat.toFixed(6)}, {center.lng.toFixed(6)}</Typography>
            </Box>
            {assessment.parcel?.lot_area_sqft && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>Lot</Typography>
                <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.65rem' }}>{Math.round(assessment.parcel.lot_area_sqft).toLocaleString()} sqft</Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
