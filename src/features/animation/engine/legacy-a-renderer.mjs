/** Bounded source-texture compositing; no learned generation or semantic inference. */
const clamp = (v, low = 0, high = 1) => Math.max(low, Math.min(high, v))
export const smooth = v => { const q = clamp(v); return q * q * (3 - 2 * q) }
const finite = (v, label, low, high) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < low || v > high) throw new Error(`${label} must be finite in [${low}, ${high}]`)
  return v
}
function point(v, label) {
  if (!Array.isArray(v) || v.length !== 2) throw new Error(`${label} must be a normalized pair`)
  return v.map((n, i) => finite(n, `${label}[${i}]`, 0, 1))
}
export function validateProject(project) {
  if (!project || typeof project !== 'object' || typeof project.sourcePath !== 'string' || !project.sourcePath) throw new Error('sourcePath is required')
  if (project.backgroundPath !== undefined && (typeof project.backgroundPath !== 'string' || !project.backgroundPath)) throw new Error('backgroundPath must be a server-owned prepared source-based path')
  const duration = finite(project.duration ?? 6, 'duration', .1, 6), fps = finite(project.fps ?? 24, 'fps', 1, 24)
  if (!Number.isInteger(fps)) throw new Error('fps must be an integer')
  if (!Array.isArray(project.regions) || project.regions.length > 16) throw new Error('regions must be an array of at most 16 entries')
  const ids = new Set(); let moving = 0
  const regions = project.regions.map(region => {
    if (!region || typeof region.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(region.id) || ids.has(region.id)) throw new Error('Region IDs must be unique safe identifiers')
    ids.add(region.id)
    if (typeof region.maskPath !== 'string' || !region.maskPath) throw new Error('maskPath is required')
    if (region.eraseMaskPath !== undefined && typeof region.eraseMaskPath !== 'string') throw new Error('eraseMaskPath must be a path')
    const m = region.motion ?? { type: 'static' }, type = m.type
    if (!['static', 'rotate', 'translate', 'reveal'].includes(type)) throw new Error('Unknown motion type')
    if (type !== 'static') moving++
    const motion = { type, anchor: point(m.anchor ?? [.5, .5], 'anchor'), dx: finite(m.dx ?? 0, 'dx', -1, 1), dy: finite(m.dy ?? 0, 'dy', -1, 1), angle: finite(m.angle ?? 0, 'angle', -45, 45), start: finite(m.start ?? 0, 'start', 0, duration), duration: finite(m.duration ?? 1, 'motion.duration', .04, 6), cycles: finite(m.cycles ?? 1, 'cycles', 1, 12), endState: m.endState ?? 'hold', easing: m.easing ?? 'smooth' }
    if (!Number.isInteger(motion.cycles)) throw new Error('cycles must be an integer')
    if (!['hold', 'reset'].includes(motion.endState)) throw new Error('Unknown endState')
    if (!['linear', 'smooth', 'ease-in'].includes(motion.easing)) throw new Error('Unknown easing')
    if (m.period !== undefined) { finite(m.period, 'period', .12, 6); if (type === 'rotate') motion.period = m.period }
    if (m.pause !== undefined) motion.pause = finite(m.pause, 'pause', 0, 6)
    if (m.wristInfluence !== undefined) motion.wristInfluence = finite(m.wristInfluence, 'wristInfluence', .001, 1)
    if (type !== 'static' && motion.start + (motion.period !== undefined ? (motion.period + (motion.pause ?? 0)) * motion.cycles : motion.duration) > duration + 1e-6) throw new Error('Motion extends past the project duration')
    let patchHint
    if (region.patchHint !== undefined) patchHint = { dx: finite(region.patchHint.dx, 'patchHint.dx', -1, 1), dy: finite(region.patchHint.dy, 'patchHint.dy', -1, 1) }
    return { ...region, motion, ...(patchHint ? { patchHint } : {}) }
  })
  if (moving > 8) throw new Error('At most eight moving regions are allowed')
  for (const key of ['protectMaskPaths', 'foregroundMaskPaths']) if (project[key] !== undefined && (!Array.isArray(project[key]) || project[key].length > 32 || project[key].some(p => typeof p !== 'string' || !p))) throw new Error(`${key} must contain paths`)
  return { ...project, duration, fps, regions, protectMaskPaths: project.protectMaskPaths ?? [], foregroundMaskPaths: project.foregroundMaskPaths ?? [] }
}
export function motionPose(motion, time) {
  const zero = { dx: 0, dy: 0, angle: 0, opacity: 1 }
  if (motion.type === 'static') return zero
  const elapsed = time - motion.start
  if (motion.type === 'reveal') return { ...zero, opacity: smooth(elapsed / motion.duration) }
  let amount = 0
  if (motion.period !== undefined) {
    const span = motion.period + (motion.pause ?? 0), local = elapsed % span
    if (elapsed > 0 && elapsed < span * motion.cycles && local < motion.period) amount = Math.sin(2 * Math.PI * local / motion.period)
  } else {
    const progress = clamp(elapsed / motion.duration)
    amount = motion.easing === 'ease-in' ? progress ** 2 : motion.easing === 'linear' ? progress : smooth(progress)
    if (elapsed >= motion.duration && motion.endState === 'reset') amount = 0
  }
  return { dx: motion.type === 'translate' ? motion.dx * amount : 0, dy: motion.type === 'translate' ? motion.dy * amount : 0, angle: motion.type === 'rotate' ? motion.angle * amount : 0, opacity: 1 }
}
function neighbors(p, width, height) {
  const x = p % width, y = Math.floor(p / width), n = []
  if (x) n.push(p - 1); if (x + 1 < width) n.push(p + 1)
  if (y) n.push(p - width); if (y + 1 < height) n.push(p + width)
  return n
}
export function completeBackground(source, mask, width, height, iterations = 320, donor) {
  const work = donor ? new Float32Array(source.length) : new Float32Array(source), points = [], boundary = [], queue = new Int32Array(mask.length), seen = new Uint8Array(mask.length)
  let tail = 0
  for (let p = 0; p < mask.length; p++) if (mask[p]) {
    const near = neighbors(p, width, height), outside = near.find(q => !mask[q])
    if (outside !== undefined) {
      boundary.push(p); seen[p] = 1; queue[tail++] = p
      for (let c = 0; c < 3; c++) work[p * 3 + c] = donor ? source[p * 3 + c] - donor[p * 3 + c] : source[outside * 3 + c]
    } else points.push([p, near])
  }
  if (!tail && mask.some(Boolean)) throw new Error('Background completion needs a visible source boundary')
  for (let head = 0; head < tail; head++) for (const q of neighbors(queue[head], width, height)) if (mask[q] && !seen[q]) {
    seen[q] = 1; queue[tail++] = q
    for (let c = 0; c < 3; c++) work[q * 3 + c] = work[queue[head] * 3 + c]
  }
  for (let step = 0; step < iterations; step++) for (const [p, near] of points) for (let c = 0; c < 3; c++) {
    let mean = 0; for (const q of near) mean += work[q * 3 + c]
    work[p * 3 + c] += 1.6 * (mean / near.length - work[p * 3 + c])
  }
  const result = Buffer.from(source)
  for (let p = 0; p < mask.length; p++) if (mask[p]) for (let c = 0; c < 3; c++) result[p * 3 + c] = Math.round(clamp((donor?.[p * 3 + c] ?? 0) + work[p * 3 + c], 0, 255))
  return result
}
function bounds(mask, width, height) {
  let left = width, top = height, right = -1, bottom = -1
  for (let p = 0; p < mask.length; p++) if (mask[p]) { const x = p % width, y = Math.floor(p / width); left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
  return [left, top, right + 1, bottom + 1]
}
function checkPixels(source, width, height, regions) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || Math.max(width, height) > 1280 || source.length !== width * height * 3) throw new Error('Expected RGB pixels with maximum edge 1280 and minimum edge 2')
  for (const region of regions) {
    if (region.mask.length !== width * height || region.eraseMask && region.eraseMask.length !== width * height) throw new Error('Mask dimensions must match source')
    if (!region.mask.some(Boolean)) throw new Error('Region mask is empty')
    if (region.motion.type !== 'static' && region.mask.filter(Boolean).length > width * height * .65) throw new Error('Moving support cannot exceed 65% of source area')
  }
}
export function preparePixels({ source, width, height, regions, protectMasks = [], foregroundMasks = [], background: preparedBackground }) {
  checkPixels(source, width, height, regions)
  if (preparedBackground && preparedBackground.length !== source.length) throw new Error('Prepared background dimensions must match source RGB')
  const protect = new Uint8Array(width * height), support = new Uint8Array(width * height), movingSource = new Uint8Array(width * height)
  for (const mask of [...protectMasks, ...foregroundMasks]) { if (mask.length !== protect.length) throw new Error('Protection dimensions must match'); for (let p = 0; p < protect.length; p++) if (mask[p]) protect[p] = 255 }
  for (const region of regions) if (region.motion.type !== 'static') for (let p = 0; p < movingSource.length; p++) if ((region.eraseMask ?? region.mask)[p]) movingSource[p] = 255
  const prepared = regions.map(region => {
    const eraseMask = Uint8Array.from(region.eraseMask ?? region.mask, (v, p) => protect[p] ? 0 : v), b = bounds(region.mask, width, height), m = region.motion
    if (m.type !== 'static' && eraseMask.filter(Boolean).length > width * height * .65) throw new Error('Erase support cannot exceed 65% of source area')
    let background = source
    if (m.type !== 'static' && preparedBackground) background = preparedBackground
    else if (m.type !== 'static') {
      let donor
      if (region.patchHint) {
        donor = Buffer.from(source)
        const dx = Math.round(region.patchHint.dx * width), dy = Math.round(region.patchHint.dy * height)
        for (let p = 0; p < eraseMask.length; p++) if (eraseMask[p]) {
          const x = p % width + dx, y = Math.floor(p / width) + dy
          if (x < 0 || x >= width || y < 0 || y >= height) throw new Error('Same-source patch donor leaves image bounds')
          const q = y * width + x
          if (protect[q]) throw new Error('Same-source patch includes protected text or foreground')
          if (movingSource[q]) throw new Error('Same-source patch includes a moving source region')
          for (let c = 0; c < 3; c++) donor[p * 3 + c] = source[q * 3 + c]
        }
      }
      background = completeBackground(source, eraseMask, width, height, 320, donor)
    }
    let padding = 2
    if (m.type === 'rotate') { const ax = m.anchor[0] * width, ay = m.anchor[1] * height; padding += Math.ceil(Math.max(...[[b[0], b[1]], [b[0], b[3]], [b[2], b[1]], [b[2], b[3]]].map(([x, y]) => Math.hypot(x - ax, y - ay))) * Math.abs(m.angle) * Math.PI / 180) }
    const dx = m.type === 'translate' ? Math.abs(m.dx * width) : 0, dy = m.type === 'translate' ? Math.abs(m.dy * height) : 0
    const sweep = [Math.max(0, Math.floor(b[0] - padding - dx)), Math.max(0, Math.floor(b[1] - padding - dy)), Math.min(width, Math.ceil(b[2] + padding + dx)), Math.min(height, Math.ceil(b[3] + padding + dy))]
    if (m.type !== 'static') { for (let y = sweep[1]; y < sweep[3]; y++) for (let x = sweep[0]; x < sweep[2]; x++) support[y * width + x] = 255; for (let p = 0; p < support.length; p++) if (eraseMask[p]) support[p] = 255 }
    return { ...region, eraseMask, background, sweep }
  })
  return { source, width, height, regions: prepared, protect, support }
}
function forward(x, y, pose, motion, width, height) {
  const ax = motion.anchor[0] * width, ay = motion.anchor[1] * height
  const weight = motion.wristInfluence ? smooth((ay - y) / (motion.wristInfluence * height)) : 1
  const a = pose.angle * Math.PI / 180 * weight, dx = x - ax, dy = y - ay
  return [ax + Math.cos(a) * dx - Math.sin(a) * dy, ay + Math.sin(a) * dx + Math.cos(a) * dy]
}
function sampleActor(out, source, mask, width, height, inverse, sweep) {
  for (let y = sweep[1]; y < sweep[3]; y++) for (let x = sweep[0]; x < sweep[2]; x++) {
    const [sx, sy] = inverse(x, y), xx = Math.floor(sx), yy = Math.floor(sy), fx = sx - xx, fy = sy - yy, p = y * width + x
    let alpha = 0; const colors = [0, 0, 0]
    for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
      const px = xx + bx, py = yy + by
      if (px < 0 || py < 0 || px >= width || py >= height) continue
      const q = py * width + px, a = (bx ? fx : 1 - fx) * (by ? fy : 1 - fy) * mask[q] / 255
      alpha += a; for (let c = 0; c < 3; c++) colors[c] += source[q * 3 + c] * a
    }
    if (alpha) for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.round(colors[c] + out[p * 3 + c] * (1 - alpha))
  }
}
export function renderFrame(ctx, time, options = {}) {
  if (!Number.isFinite(time) || time < 0) throw new Error('time must be finite and nonnegative')
  const { source, width, height } = ctx, out = Buffer.from(source)
  if (options.static) return out
  const active = ctx.regions.map(region => ({ region, pose: motionPose(region.motion, time) })).filter(({ pose }) => pose.opacity < 1 || Math.abs(pose.angle) > 1e-7 || Math.abs(pose.dx) + Math.abs(pose.dy) > 1e-7)
  for (const { region, pose } of active) for (let p = 0; p < region.eraseMask.length; p++) if (region.eraseMask[p]) {
    const alpha = region.motion.type === 'reveal' ? (1 - pose.opacity) * region.eraseMask[p] / 255 : region.eraseMask[p] / 255
    for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.round(out[p * 3 + c] * (1 - alpha) + region.background[p * 3 + c] * alpha)
  }
  for (const { region, pose } of active) {
    if (region.motion.type === 'reveal') continue
    const inverse = region.motion.type === 'translate' ? (x, y) => [x - pose.dx * width, y - pose.dy * height] : (x, y) => {
      if (!region.motion.wristInfluence) { const ax = region.motion.anchor[0] * width, ay = region.motion.anchor[1] * height, a = -pose.angle * Math.PI / 180; return [ax + Math.cos(a) * (x - ax) - Math.sin(a) * (y - ay), ay + Math.sin(a) * (x - ax) + Math.cos(a) * (y - ay)] }
      let sx = x, sy = y
      for (let i = 0; i < 7; i++) { const [tx, ty] = forward(sx, sy, pose, region.motion, width, height); sx += x - tx; sy += y - ty }
      return [sx, sy]
    }
    sampleActor(out, source, region.mask, width, height, inverse, region.sweep)
  }
  // Text/foreground is restored exactly, and no change can escape declared geometric support.
  for (let p = 0; p < ctx.protect.length; p++) if (ctx.protect[p] || !ctx.support[p]) for (let c = 0; c < 3; c++) out[p * 3 + c] = source[p * 3 + c]
  return out
}
