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
  if (coords.length < 4) return [] // need at least a triangle + closing point
  // Remove closing duplicate
  const pts = coords[coords.length - 1][0] === coords[0][0] && coords[coords.length - 1][1] === coords[0][1]
    ? coords.slice(0, -1)
    : coords

  if (pts.length < 3) return []

  // Merge near-collinear vertices (angle > 170° means nearly straight)
  const simplified: number[][] = []
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length]
    const curr = pts[i]
    const next = pts[(i + 1) % pts.length]
    const angle = cornerAngle(prev, curr, next)
    if (angle < 170) {
      simplified.push(curr)
    }
  }

  if (simplified.length < 3) return pts.map((p, i) => ({
    coord: p,
    edgeLengthFt: distanceFt(p, pts[(i + 1) % pts.length]),
    angleDeg: cornerAngle(pts[(i - 1 + pts.length) % pts.length], p, pts[(i + 1) % pts.length]),
  }))

  return simplified.map((p, i) => {
    const next = simplified[(i + 1) % simplified.length]
    const prev = simplified[(i - 1 + simplified.length) % simplified.length]
    return {
      coord: p,
      edgeLengthFt: distanceFt(p, next),
      angleDeg: cornerAngle(prev, p, next),
    }
  })
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

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
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
