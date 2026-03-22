/**
 * Geometry utilities for parcel measurement, edge lengths, corner angles.
 * All calculations use WGS84 → approximate feet via haversine.
 */

const R_EARTH_FT = 20_902_231 // Earth radius in feet
const DEG2RAD = Math.PI / 180

/** Haversine distance between two [lng, lat] points, returns feet. */
export function distanceFt(a: number[], b: number[]): number {
  const lat1 = a[1] * DEG2RAD, lat2 = b[1] * DEG2RAD
  const dlat = (b[1] - a[1]) * DEG2RAD
  const dlng = (b[0] - a[0]) * DEG2RAD
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) ** 2
  return 2 * R_EARTH_FT * Math.asin(Math.sqrt(h))
}

/** Convert feet to meters. */
export function ftToM(ft: number): number {
  return ft * 0.3048
}

/** Convert sqft to m². */
export function sqftToSqm(sqft: number): number {
  return sqft * 0.092903
}

/** Convert sqft to acres. */
export function sqftToAcres(sqft: number): number {
  return sqft / 43560
}

/** Format area with multiple units: "7,500 sqft · 697 m² · 0.17 ac" */
export function formatArea(sqft: number): string {
  const m2 = sqftToSqm(sqft)
  const ac = sqftToAcres(sqft)
  const parts = [`${Math.round(sqft).toLocaleString()} sqft`]
  parts.push(`${Math.round(m2).toLocaleString()} m²`)
  if (ac >= 0.1) parts.push(`${ac.toFixed(2)} ac`)
  return parts.join(' · ')
}

/** Format distance for display: "52.3 ft (15.9 m)" */
export function formatDist(ft: number): string {
  if (ft >= 100) return `${Math.round(ft)}′`
  return `${ft.toFixed(1)}′`
}

export function formatDistDual(ft: number): string {
  const m = ftToM(ft)
  if (ft >= 100) return `${Math.round(ft)}′ (${Math.round(m)} m)`
  return `${ft.toFixed(1)}′ (${m.toFixed(1)} m)`
}

/** Midpoint of two [lng, lat] coords. */
export function midpoint(a: number[], b: number[]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** Bearing from point A to B in degrees (0=N, 90=E). */
export function bearing(a: number[], b: number[]): number {
  const lat1 = a[1] * DEG2RAD, lat2 = b[1] * DEG2RAD
  const dlng = (b[0] - a[0]) * DEG2RAD
  const x = Math.sin(dlng) * Math.cos(lat2)
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dlng)
  return ((Math.atan2(x, y) / DEG2RAD) + 360) % 360
}

/**
 * Interior angle at vertex B, given edges A→B→C.
 * Returns degrees (0-360).
 */
export function cornerAngle(a: number[], b: number[], c: number[]): number {
  const ba = [a[0] - b[0], a[1] - b[1]]
  const bc = [c[0] - b[0], c[1] - b[1]]
  const dot = ba[0] * bc[0] + ba[1] * bc[1]
  const magBA = Math.sqrt(ba[0] ** 2 + ba[1] ** 2)
  const magBC = Math.sqrt(bc[0] ** 2 + bc[1] ** 2)
  if (magBA === 0 || magBC === 0) return 0
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)))
  return Math.acos(cosAngle) / DEG2RAD
}

/** Extract the outer ring coordinates from a GeoJSON geometry. */
export function getOuterRing(geometry: any): number[][] {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return geometry.coordinates[0] || []
  if (geometry.type === 'MultiPolygon') return geometry.coordinates[0]?.[0] || []
  return []
}

/**
 * For a parcel polygon, compute simplified edges (merging near-collinear edges)
 * and return the significant vertices with their edge lengths and corner angles.
 */
export interface ParcelVertex {
  coord: number[]       // [lng, lat]
  edgeLengthFt: number  // length of edge FROM this vertex to the next
  angleDeg: number      // interior angle at this vertex
}

export function analyzeParcel(coords: number[][]): ParcelVertex[] {
  if (!coords || coords.length < 4) return []
  // Remove closing duplicate
  let pts: number[][]
  try {
    pts = coords[coords.length - 1][0] === coords[0][0] && coords[coords.length - 1][1] === coords[0][1]
      ? coords.slice(0, -1)
      : [...coords]
  } catch {
    return []
  }

  if (pts.length < 3) return []

  // Step 1: Merge near-collinear vertices (angle > 170° means nearly straight)
  let simplified: number[][] = []
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length]
    const curr = pts[i]
    const next = pts[(i + 1) % pts.length]
    const angle = cornerAngle(prev, curr, next)
    if (angle < 170) {
      simplified.push(curr)
    }
  }

  if (simplified.length < 3) simplified = pts

  // Step 2: Merge vertices that are too close together (< 2ft)
  const merged: number[][] = [simplified[0]]
  for (let i = 1; i < simplified.length; i++) {
    if (distanceFt(simplified[i], merged[merged.length - 1]) >= 2) {
      merged.push(simplified[i])
    }
  }
  // Also check last vs first
  if (merged.length > 1 && distanceFt(merged[merged.length - 1], merged[0]) < 2) {
    merged.pop()
  }

  if (merged.length < 3) merged.push(...pts.slice(0, 3 - merged.length))

  return merged.map((p, i) => {
    const next = merged[(i + 1) % merged.length]
    const prev = merged[(i - 1 + merged.length) % merged.length]
    return {
      coord: p,
      edgeLengthFt: distanceFt(p, next),
      angleDeg: cornerAngle(prev, p, next),
    }
  })
}

/**
 * Compute area of a polygon from [lng, lat] coordinates using the
 * spherical excess formula. Returns area in sqft.
 */
export function polygonAreaSqft(coords: number[][]): number {
  // Close the ring if needed
  const ring = coords.length > 0 &&
    (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])
    ? [...coords, coords[0]]
    : coords
  if (ring.length < 4) return 0

  // Use surveyor's formula with lat/lng → ft conversion
  // At LA latitude (~34°N): 1° lat ≈ 364,000 ft, 1° lng ≈ cos(34°) × 364,000 ≈ 301,800 ft
  const latCenter = ring.reduce((s, c) => s + c[1], 0) / ring.length
  const ftPerDegLat = 364000
  const ftPerDegLng = 364000 * Math.cos(latCenter * Math.PI / 180)

  let area = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * ftPerDegLng
    const y1 = ring[i][1] * ftPerDegLat
    const x2 = ring[i + 1][0] * ftPerDegLng
    const y2 = ring[i + 1][1] * ftPerDegLat
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area) / 2
}

/** Compute parcel perimeter in feet. */
export function perimeterFt(coords: number[][]): number {
  let total = 0
  for (let i = 0; i < coords.length - 1; i++) {
    total += distanceFt(coords[i], coords[i + 1])
  }
  return total
}

/**
 * Lot shape analysis: frontage, depth, width-to-depth ratio, facing direction.
 */
export interface LotAnalysis {
  frontageWidthFt: number     // width of the front (street-facing) edge
  lotDepthFt: number          // average depth from front to rear
  widthToDepthRatio: number   // frontage / depth
  facingDirection: string     // "North", "South", "East", "West", etc.
  facingBearing: number       // bearing in degrees (0=N)
  southExposure: 'excellent' | 'good' | 'limited' | 'poor' // how much south-facing area
  isNarrowLot: boolean        // frontage < 25ft
  isDeepLot: boolean          // depth > 3x frontage
  shapeDescription: string    // "rectangular", "irregular", "trapezoidal", etc.
}

export function analyzeLotShape(coords: number[][]): LotAnalysis | null {
  const vertices = analyzeParcel(coords)
  if (vertices.length < 3) return null

  // Identify front edge: the edge whose midpoint has the LOWEST latitude
  // (in LA, streets typically run east-west at the south side of lots)
  // If multiple edges tie, pick the shorter one (frontage is usually narrower than depth)
  let frontIdx = 0
  let lowestLat = Infinity
  for (let i = 0; i < vertices.length; i++) {
    const next = vertices[(i + 1) % vertices.length]
    const mid = midpoint(vertices[i].coord, next.coord)
    if (mid[1] < lowestLat) {
      lowestLat = mid[1]
      frontIdx = i
    }
  }

  const frontageWidthFt = vertices[frontIdx].edgeLengthFt

  // Rear edge: the edge roughly opposite (highest latitude midpoint)
  let rearIdx = 0
  let highestLat = -Infinity
  for (let i = 0; i < vertices.length; i++) {
    const next = vertices[(i + 1) % vertices.length]
    const mid = midpoint(vertices[i].coord, next.coord)
    if (mid[1] > highestLat) {
      highestLat = mid[1]
      rearIdx = i
    }
  }

  // Side edges: everything that's not front or rear
  const sideEdges = vertices
    .filter((_, i) => i !== frontIdx && i !== rearIdx)
    .map(v => v.edgeLengthFt)
  const lotDepthFt = sideEdges.length > 0
    ? sideEdges.reduce((a, b) => a + b, 0) / sideEdges.length
    : vertices[rearIdx].edgeLengthFt // fallback

  const widthToDepthRatio = lotDepthFt > 0 ? frontageWidthFt / lotDepthFt : 0

  // Facing direction: bearing from lot center toward front edge midpoint
  const frontMid = midpoint(vertices[frontIdx].coord, vertices[(frontIdx + 1) % vertices.length].coord)
  const rearMid = midpoint(vertices[rearIdx].coord, vertices[(rearIdx + 1) % vertices.length].coord)
  const facingBearing = bearing(rearMid, frontMid)
  const facingDirection = bearingToCardinal(facingBearing)

  // South exposure: how close is the rear (where ADU goes) to facing south?
  // If lot faces north, rear faces south = excellent for ADU
  // If lot faces south, rear faces north = poor for ADU solar
  const rearBearing = (facingBearing + 180) % 360
  const deviationFromSouth = Math.abs(180 - rearBearing)
  const adjustedDev = deviationFromSouth > 180 ? 360 - deviationFromSouth : deviationFromSouth
  const southExposure: LotAnalysis['southExposure'] =
    adjustedDev < 30 ? 'excellent' :
    adjustedDev < 60 ? 'good' :
    adjustedDev < 120 ? 'limited' : 'poor'

  // Shape classification
  const angles = vertices.map(v => v.angleDeg)
  const isRightAngled = angles.every(a => Math.abs(a - 90) < 15)
  const edgeLengths = vertices.map(v => v.edgeLengthFt)
  const maxEdge = Math.max(...edgeLengths)
  const minEdge = Math.min(...edgeLengths)
  const edgeRatio = maxEdge / (minEdge || 1)

  let shapeDescription = 'irregular'
  if (vertices.length === 4) {
    if (isRightAngled) {
      shapeDescription = edgeRatio < 1.3 ? 'rectangular (near-square)' : 'rectangular'
    } else {
      shapeDescription = 'trapezoidal'
    }
  } else if (vertices.length === 5) {
    shapeDescription = 'pentagonal'
  } else if (vertices.length === 3) {
    shapeDescription = 'triangular'
  }

  return {
    frontageWidthFt,
    lotDepthFt,
    widthToDepthRatio,
    facingDirection,
    facingBearing,
    southExposure,
    isNarrowLot: frontageWidthFt < 25,
    isDeepLot: lotDepthFt > frontageWidthFt * 3,
    shapeDescription,
  }
}

function bearingToCardinal(deg: number): string {
  const dirs = ['North', 'NE', 'East', 'SE', 'South', 'SW', 'West', 'NW']
  const idx = Math.round(deg / 45) % 8
  return dirs[idx]
}

/**
 * Query Mapbox Terrain-RGB for elevation at a given [lng, lat].
 * Returns elevation in feet.
 */
export async function getElevationFt(lng: number, lat: number, token: string): Promise<number> {
  const zoom = 14
  const n = 2 ** zoom
  const tileX = Math.floor(((lng + 180) / 360) * n)
  const tileY = Math.floor((1 - Math.log(Math.tan(lat * DEG2RAD) + 1 / Math.cos(lat * DEG2RAD)) / Math.PI) / 2 * n)
  const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${zoom}/${tileX}/${tileY}.pngraw?access_token=${token}`

  const res = await fetch(url)
  if (!res.ok) return 0
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)

  // Use OffscreenCanvas if available, fallback to regular canvas
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    ctx = canvas.getContext('2d')!
  } else {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    ctx = canvas.getContext('2d')!
  }
  ctx.drawImage(bitmap, 0, 0)

  // Pixel position within the tile
  const px = ((lng + 180) / 360 * n - tileX) * 256
  const py = ((1 - Math.log(Math.tan(lat * DEG2RAD) + 1 / Math.cos(lat * DEG2RAD)) / Math.PI) / 2 * n - tileY) * 256
  const pixel = ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data

  // Mapbox Terrain-RGB formula: height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
  const heightM = -10000 + (pixel[0] * 256 * 256 + pixel[1] * 256 + pixel[2]) * 0.1
  return heightM * 3.28084 // meters to feet
}

/**
 * Compute approximate slope percentage across a parcel.
 * Samples elevation at parcel corners and returns max slope %.
 */
export async function getParcelSlope(
  coords: number[][],
  token: string
): Promise<{ slopePct: number; minElev: number; maxElev: number; avgElev: number }> {
  // Sample up to 6 points (corners + center)
  const pts = coords.length > 6 ? coords.filter((_, i) => i % Math.ceil(coords.length / 6) === 0) : coords.slice(0, -1)
  const lngs = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  const centerPt: number[] = [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
  const samplePts = [...pts, centerPt]

  const elevations = await Promise.all(samplePts.map(p => getElevationFt(p[0], p[1], token)))
  const validElevs = elevations.filter(e => e > -1000)
  if (validElevs.length < 2) return { slopePct: 0, minElev: 0, maxElev: 0, avgElev: 0 }

  const minElev = Math.min(...validElevs)
  const maxElev = Math.max(...validElevs)
  const avgElev = validElevs.reduce((a, b) => a + b, 0) / validElevs.length
  const rise = maxElev - minElev

  // Run = max horizontal distance across parcel
  let maxDist = 0
  for (let i = 0; i < samplePts.length; i++) {
    for (let j = i + 1; j < samplePts.length; j++) {
      const d = distanceFt(samplePts[i], samplePts[j])
      if (d > maxDist) maxDist = d
    }
  }

  const slopePct = maxDist > 0 ? (rise / maxDist) * 100 : 0
  return { slopePct, minElev, maxElev, avgElev }
}
