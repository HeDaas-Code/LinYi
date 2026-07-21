// Client-side export utilities (WebUI Phase 6 #30).
//
// All exports are generated in the browser — no backend round-trip. We use
// the standard Blob + URL.createObjectURL pattern so this works in any
// modern browser without external dependencies.

/**
 * Trigger a browser download for the given text content.
 *
 * @param filename  Suggested filename (without extension is fine).
 * @param content   Text content to save.
 * @param mime      MIME type (default: text/plain).
 */
export function downloadText(
  filename: string,
  content: string,
  mime: string = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mime })
  triggerDownload(blob, filename)
}

/**
 * Trigger a browser download for an already-constructed Blob.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  triggerDownload(blob, filename)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Convert an SVG element to a PNG download.
 *
 * Renders the SVG onto a canvas at 2x pixel ratio for crisp export.
 */
export function downloadSvgAsPng(
  svg: SVGSVGElement,
  filename: string,
  scale: number = 2,
): void {
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svg)
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  const img = new Image()
  img.onload = () => {
    const w = svg.clientWidth || svg.width.baseVal.value || 800
    const h = svg.clientHeight || svg.height.baseVal.value || 600
    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      URL.revokeObjectURL(url)
      return
    }
    ctx.fillStyle = '#0a0d14' // match --bg-0 so transparent SVGs look right
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, filename)
    }, 'image/png')
  }
  img.onerror = () => {
    URL.revokeObjectURL(url)
  }
  img.src = url
}

/**
 * Format a timestamp as a filename-safe YYYYMMDD-HHMMSS string.
 */
export function timestampSlug(ts: number = Date.now()): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}
