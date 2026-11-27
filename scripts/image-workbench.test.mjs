import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dismissImageWorkbench,
  normalizeImageBlob,
  openImageFile,
  openImageFiles,
  openImageViewer,
  resolveImageWorkbench,
  setImageWorkbenchMode,
  useImageWorkbench,
  viewerImageKey,
  viewerImageSource,
} from '../src/components/media/imageWorkbenchState.ts'
import {
  clampViewerOffset,
  MAX_VIEWER_ZOOM,
  pinchViewer,
  resolveViewerSwipe,
  zoomViewerAt,
} from '../src/components/media/viewerGeometry.ts'
import {
  clampCropImageOffset,
  clampCropRect,
  cropCornerAt,
  cropOutputSize,
  cropSourceRect,
  fitCropAspect,
  HANDLE_HIT_RADIUS,
  layoutCropImage,
  resizeCropRect,
  transformCropImage,
} from '../src/components/media/cropGeometry.ts'
import { encodeCanvas } from '../src/components/media/canvasEncode.ts'

const file = () => new File(['image'], 'photo.png', { type: 'image/png' })

test('file workflow keeps one request and returns the original File by identity', async () => {
  const original = file()
  const promise = openImageFile(original, 'preview')
  const first = useImageWorkbench.getState().request
  assert.equal(first.source.kind, 'file')
  assert.equal(first.source.file, original)
  assert.equal(resolveImageWorkbench(original, first.id), true)
  assert.equal(await promise, original)
  assert.equal(useImageWorkbench.getState().request, null)
})

test('batch image workflow reviews each file and omits cancelled images', async () => {
  const first = file()
  const cancelled = new File(['image'], 'cancelled.png', { type: 'image/png' })
  const third = file()
  const promise = openImageFiles([first, cancelled, third])
  assert.equal(useImageWorkbench.getState().request.source.file, first)
  resolveImageWorkbench(first)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(useImageWorkbench.getState().request.source.file, cancelled)
  resolveImageWorkbench(null)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(useImageWorkbench.getState().request.source.file, third)
  resolveImageWorkbench(third)
  assert.deepEqual(await promise, [first, third])
})

test('back closes crop before closing the whole workbench', async () => {
  const promise = openImageFile(file(), 'crop')
  const id = useImageWorkbench.getState().request.id
  setImageWorkbenchMode('preview')
  assert.equal(useImageWorkbench.getState().request.mode, 'preview')
  setImageWorkbenchMode('crop')
  dismissImageWorkbench()
  assert.equal(useImageWorkbench.getState().request.id, id)
  assert.equal(useImageWorkbench.getState().request.mode, 'preview')
  dismissImageWorkbench()
  assert.equal(await promise, null)
})

test('opening a viewer cancels a pending file workflow', async () => {
  const promise = openImageFile(file())
  openImageViewer({ src: 'https://example.com/photo.jpg', name: 'photo.jpg' })
  assert.equal(await promise, null)
  assert.equal(useImageWorkbench.getState().request.source.kind, 'remote')
  resolveImageWorkbench(null)
})

test('a stale async result cannot close the next request', async () => {
  const promise = openImageFile(file())
  const staleId = useImageWorkbench.getState().request.id
  openImageViewer({ id: 'stored', name: 'old.png', mimeType: 'image/png' })
  await promise
  assert.equal(resolveImageWorkbench(file(), staleId), false)
  assert.equal(useImageWorkbench.getState().request.source.kind, 'stored')
  resolveImageWorkbench(null)
})

test('viewer opens the tapped image inside a deduplicated gallery order', () => {
  const first = { id: 'one', name: 'one.png', mimeType: 'image/png' }
  const second = { id: 'two', name: 'two.png', mimeType: 'image/png' }
  const third = { id: 'three', name: 'three.png', mimeType: 'image/png' }
  openImageViewer(second, [first, second, first, third])
  const request = useImageWorkbench.getState().request
  assert.deepEqual(
    request.gallery.map((image) => viewerImageKey(image)),
    ['id:one', 'id:two', 'id:three']
  )
  assert.equal(request.index, 1)
  assert.equal(request.source.kind, 'stored')
  assert.equal(request.source.id, 'two')
  assert.equal(
    viewerImageSource({ src: 'https://example.com/a.jpg', name: 'a.jpg' }).kind,
    'remote'
  )
  resolveImageWorkbench(null)
})

test('viewer gallery appends a tapped image that is missing from its list', () => {
  const tapped = { src: 'https://example.com/tapped.jpg', name: 'tapped.jpg' }
  openImageViewer(tapped, [{ src: 'https://example.com/other.jpg', name: 'other.jpg' }])
  const request = useImageWorkbench.getState().request
  assert.equal(request.index, 0)
  assert.equal(request.gallery[0], tapped)
  assert.equal(request.gallery.length, 2)
  resolveImageWorkbench(null)
})

test('viewer offsets clamp to the scaled content and reset at fit scale', () => {
  assert.deepEqual(clampViewerOffset({ x: 30, y: -30 }, 1, 200, 100, 300, 300), { x: 0, y: 0 })
  assert.deepEqual(clampViewerOffset({ x: 999, y: 999 }, 2, 200, 100, 300, 300), { x: 50, y: 0 })
  assert.deepEqual(clampViewerOffset({ x: -999, y: 999 }, 3, 200, 100, 200, 100), {
    x: -200,
    y: 100,
  })
})

test('viewer zoom keeps the tapped content point fixed and respects max zoom', () => {
  assert.deepEqual(zoomViewerAt({ x: 10, y: 0 }, { x: 0, y: 0 }, 1, 2), { x: -10, y: 0 })
  assert.deepEqual(zoomViewerAt({ x: 0, y: 0 }, { x: 20, y: 10 }, 2, 1), { x: 10, y: 5 })
  const maxed = zoomViewerAt({ x: 100, y: 0 }, { x: 0, y: 0 }, 1, 10)
  assert.equal(MAX_VIEWER_ZOOM, 4)
  assert.deepEqual(maxed, { x: -300, y: 0 })
})

test('viewer pinch tracks a moving midpoint around the start anchor', () => {
  const result = pinchViewer({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 0 }, 1, 2)
  assert.deepEqual(result, { scale: 2, offset: { x: 20, y: 0 } })
  const reduced = pinchViewer({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, 2, 0.1)
  assert.deepEqual(reduced, { scale: 1, offset: { x: 5, y: 0 } })
})

test('viewer swipe resolves distance, velocity and gallery edges', () => {
  assert.equal(resolveViewerSwipe(10, 0, 1, 3, 300), 1)
  assert.equal(resolveViewerSwipe(-80, 0, 1, 3, 300), 2)
  assert.equal(resolveViewerSwipe(80, 0, 1, 3, 300), 0)
  assert.equal(resolveViewerSwipe(-40, 0.8, 0, 3, 300), 1)
  assert.equal(resolveViewerSwipe(80, 0.1, 0, 3, 300), 0)
  assert.equal(resolveViewerSwipe(-800, 0, 0, 3, 300), 1)
  assert.equal(resolveViewerSwipe(-800, 0, 2, 3, 300), 2)
  assert.equal(resolveViewerSwipe(-800, 0, 0, 1, 300), 0)
})

test('legacy blobs use image MIME metadata without changing image bytes', async () => {
  const legacy = new Blob(['bytes'], { type: 'application/octet-stream' })
  const normalized = normalizeImageBlob(legacy, 'image/webp')
  assert.equal(normalized.type, 'image/webp')
  assert.equal(await normalized.text(), 'bytes')
  const png = new Blob(['bytes'], { type: 'image/png' })
  assert.equal(normalizeImageBlob(png, 'image/jpeg'), png)
})

test('crop layout contains the image and swaps dimensions after rotation', () => {
  const normal = layoutCropImage(224, 124, 200, 100, 0)
  assert.deepEqual(normal.imageRect, { x: 12, y: 12, w: 200, h: 100 })
  const rotated = layoutCropImage(124, 224, 200, 100, 90)
  assert.deepEqual(rotated.imageRect, { x: 12, y: 12, w: 100, h: 200 })
  assert.equal(rotated.sourceWidth, 100)
  assert.equal(rotated.sourceHeight, 200)
})

test('crop rectangles stay inside the image, including tiny images', () => {
  const imageRect = { x: 10, y: 20, w: 200, h: 100 }
  assert.deepEqual(clampCropRect({ x: -50, y: -50, w: 500, h: 500 }, imageRect), imageRect)
  const tiny = { x: 0, y: 0, w: 20, h: 10 }
  assert.deepEqual(clampCropRect({ x: 5, y: 5, w: 48, h: 48 }, tiny), tiny)
  assert.deepEqual(
    clampCropRect({ x: Number.NaN, y: 20, w: Number.POSITIVE_INFINITY, h: 50 }, imageRect),
    {
      x: 10,
      y: 20,
      w: 48,
      h: 50,
    }
  )
})

test('crop layout handles empty areas and invalid dimensions without NaN', () => {
  assert.deepEqual(layoutCropImage(0, 0, 200, 100, 0).imageRect, { x: 0, y: 0, w: 0, h: 0 })
  const invalid = layoutCropImage(200, 100, 0, 100, 90)
  assert.equal(invalid.sourceWidth, 100)
  assert.equal(invalid.sourceHeight, 0)
  assert.equal(invalid.imageRect.w, 0)
  assert.equal(invalid.imageRect.h, 0)
})

test('aspect presets fit the largest centered rectangle', () => {
  const imageRect = { x: 0, y: 0, w: 200, h: 100 }
  assert.deepEqual(fitCropAspect(imageRect, 1), { x: 50, y: 0, w: 100, h: 100 })
  const wide = fitCropAspect(imageRect, 16 / 9)
  assert.ok(Math.abs(wide.w - 1600 / 9) < 1e-9)
  assert.equal(wide.h, 100)
  assert.deepEqual(fitCropAspect(imageRect, Number.NaN), imageRect)
})

test('corner resizing keeps the opposite corner fixed and honors the minimum', () => {
  const imageRect = { x: 0, y: 0, w: 200, h: 100 }
  const origin = { x: 50, y: 25, w: 100, h: 50 }
  assert.deepEqual(resizeCropRect(origin, 0, { x: 145, y: 72 }, imageRect), {
    x: 102,
    y: 27,
    w: 48,
    h: 48,
  })
  assert.deepEqual(resizeCropRect(origin, 2, { x: 190, y: 90 }, imageRect), {
    x: 50,
    y: 25,
    w: 140,
    h: 65,
  })
})

test('corner resizing does not flip across its anchor and can lock aspect', () => {
  const imageRect = { x: 0, y: 0, w: 200, h: 100 }
  const origin = { x: 50, y: 25, w: 100, h: 50 }
  assert.deepEqual(resizeCropRect(origin, 0, { x: 190, y: 100 }, imageRect), {
    x: 102,
    y: 27,
    w: 48,
    h: 48,
  })
  assert.deepEqual(resizeCropRect(origin, 2, { x: 180, y: 95 }, imageRect, 1), {
    x: 50,
    y: 25,
    w: 75,
    h: 75,
  })
  const tiny = { x: 0, y: 0, w: 20, h: 10 }
  assert.deepEqual(resizeCropRect(tiny, 2, { x: 20, y: 10 }, tiny, 1), {
    x: 0,
    y: 0,
    w: 10,
    h: 10,
  })
})

test('expanded corner hit zones choose the nearest handle', () => {
  const rect = { x: 20, y: 20, w: 40, h: 40 }
  assert.equal(HANDLE_HIT_RADIUS, 44)
  assert.equal(cropCornerAt({ x: 38, y: 38 }, rect), 0)
  assert.equal(cropCornerAt({ x: 42, y: 38 }, rect), 1)
  assert.equal(cropCornerAt({ x: 100, y: 100 }, rect), null)
})

test('crop zoom and pan stay synchronized and keep the selection covered', () => {
  const base = { x: 10, y: 20, w: 200, h: 100 }
  const transformed = transformCropImage(base, 2, { x: 5, y: 7 })
  assert.deepEqual(transformed, { x: -85, y: -23, w: 400, h: 200 })
  const crop = { x: 50, y: 40, w: 100, h: 50 }
  assert.deepEqual(clampCropImageOffset(transformed, crop, { x: 999, y: -999 }), { x: 135, y: -87 })
  const source = cropSourceRect(transformed, crop, 200, 100, 0)
  assert.deepEqual(source, {
    sourceWidth: 200,
    sourceHeight: 100,
    sx: 67.5,
    sy: 31.5,
    sw: 50,
    sh: 25,
  })
})

test('source crop coordinates account for rotation and cap output dimensions', () => {
  const source = cropSourceRect(
    { x: 0, y: 0, w: 200, h: 100 },
    { x: 50, y: 25, w: 100, h: 50 },
    200,
    100,
    90
  )
  assert.deepEqual(source, {
    sourceWidth: 100,
    sourceHeight: 200,
    sx: 25,
    sy: 12.5,
    sw: 50,
    sh: 25,
  })
  assert.deepEqual(cropOutputSize(8000, 4000), { width: 4096, height: 2048 })
})

test('source crop coordinates clamp to bounds for every quarter turn', () => {
  const imageRect = { x: 10, y: 20, w: 200, h: 100 }
  const selected = { x: -100, y: -100, w: 500, h: 500 }
  assert.deepEqual(cropSourceRect(imageRect, selected, 200, 100, 0), {
    sourceWidth: 200,
    sourceHeight: 100,
    sx: 0,
    sy: 0,
    sw: 200,
    sh: 100,
  })
  assert.deepEqual(cropSourceRect(imageRect, selected, 200, 100, 180), {
    sourceWidth: 200,
    sourceHeight: 100,
    sx: 0,
    sy: 0,
    sw: 200,
    sh: 100,
  })
  const rotated = { x: 10, y: 20, w: 100, h: 200 }
  assert.deepEqual(cropSourceRect(rotated, selected, 200, 100, 90), {
    sourceWidth: 100,
    sourceHeight: 200,
    sx: 0,
    sy: 0,
    sw: 100,
    sh: 200,
  })
  assert.deepEqual(cropSourceRect(rotated, selected, 200, 100, 270), {
    sourceWidth: 100,
    sourceHeight: 200,
    sx: 0,
    sy: 0,
    sw: 100,
    sh: 200,
  })
  assert.deepEqual(cropOutputSize(Number.NaN, Number.POSITIVE_INFINITY), { width: 1, height: 1 })
})

test('canvas encoding accepts a normal toBlob callback', async () => {
  const expected = new Blob(['jpeg'], { type: 'image/jpeg' })
  const canvas = { toBlob: (callback) => callback(expected) }
  assert.equal(await encodeCanvas(canvas, 0.92, 100), expected)
})

test('canvas encoding falls back when Android WebView never calls toBlob', async () => {
  const canvas = {
    toBlob: () => {},
    toDataURL: () => 'data:image/jpeg;base64,anBlZw==',
  }
  const blob = await encodeCanvas(canvas, 0.92, 20)
  assert.equal(blob.type, 'image/jpeg')
  assert.equal(await blob.text(), 'jpeg')
})

test('canvas encoding rejects an empty output instead of hanging', async () => {
  const canvas = { toBlob: (callback) => callback(null) }
  await assert.rejects(encodeCanvas(canvas, 0.92, 100), /Empty crop output/)
})
