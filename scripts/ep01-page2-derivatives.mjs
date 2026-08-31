import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'

const FORMAT = {
  JPEG: 'jpeg',
  WEBP: 'webp',
}

const MODULE_PATH = import.meta.url.startsWith('file:')
  ? fileURLToPath(import.meta.url)
  : resolve(process.cwd(), 'scripts/ep01-page2-derivatives.mjs')
const REPOSITORY_ROOT = resolve(dirname(MODULE_PATH), '..')
const TEMPORARY_ROOT = '/tmp/opencode'
const PLAN_PATH = resolve(
  REPOSITORY_ROOT,
  'docs/asset-provenance/pepper-carrot-ep01-page2-derivatives.plan.json',
)
const LOCKFILE_PATH = resolve(REPOSITORY_ROOT, 'package-lock.json')
const FROZEN_PLAN_BYTE_SHA256 =
  'aeff15518c5d8bd301362ce7a997b7b6f8cb26b3571411a08def5a4673bb154d'
const FROZEN_PLAN_CONTRACT_SHA256 =
  'e056b7900d5d8e9dd7db2e80d28e6e5b82fc0a13d1b8e6003aa551b180ff0c35'
const DETERMINISTIC_EVIDENCE_EXCLUSIONS = ['generatedAt']
const FROZEN_SOURCE_METADATA = {
  format: 'jpeg',
  width: 2481,
  height: 3503,
  space: 'srgb',
  channels: 3,
  depth: 'uchar',
  density: 300,
  chromaSubsampling: '4:4:4',
  isProgressive: true,
  hasProfile: false,
  hasAlpha: false,
  orientation: null,
  icc: { present: false, bytes: 0, sha256: null },
  exifPresent: false,
  iptcPresent: false,
  xmpPresent: false,
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function isDescendant(root, candidate) {
  const pathFromRoot = relative(root, candidate)
  return (
    pathFromRoot !== '' &&
    pathFromRoot !== '..' &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  )
}

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export async function assertSafeTemporaryPath(candidatePath) {
  const absoluteCandidate = resolve(candidatePath)
  const [temporaryRoot, repositoryRoot] = await Promise.all([
    realpath(TEMPORARY_ROOT),
    realpath(REPOSITORY_ROOT),
  ])
  const candidateExists = await pathExists(absoluteCandidate)
  const canonicalCandidate = candidateExists
    ? await realpath(absoluteCandidate)
    : resolve(await realpath(dirname(absoluteCandidate)), basename(absoluteCandidate))

  assert(
    !(
      canonicalCandidate === repositoryRoot ||
      isDescendant(repositoryRoot, canonicalCandidate)
    ),
    `Artifact path must not target the repository: ${candidatePath}`,
  )
  assert(
    isDescendant(temporaryRoot, canonicalCandidate),
    `Artifact path must be a canonical descendant of the temporary root and must not escape through traversal or symlink: ${candidatePath}`,
  )
  return canonicalCandidate
}

function planContract(plan) {
  return {
    planSchemaVersion: plan.planSchemaVersion,
    planId: plan.planId,
    procedureRevision: plan.procedureRevision,
    treatmentId: plan.treatmentId,
    source: plan.source,
    coordinateConvention: plan.coordinateConvention,
    crops: plan.crops,
    responsiveWidths: plan.responsiveWidths,
    formatOrder: plan.formatOrder,
    formats: plan.formats,
    pipeline: plan.pipeline,
    tooling: plan.tooling,
    filenameTemplate: plan.filenameTemplate,
    expectedDimensionsMethod: plan.expectedDimensionsMethod,
    plannedOutputs: plan.plannedOutputs,
  }
}

function planContractSha256(plan) {
  return sha256(stableJson(planContract(plan)))
}

export function assertFrozenPlanContract(plan) {
  assert(
    planContractSha256(plan) === FROZEN_PLAN_CONTRACT_SHA256,
    'Current plan does not match the frozen plan contract fingerprint',
  )
}

export function assertCurrentEvidenceIdentity(evidence, currentIdentity) {
  for (const field of [
    'planSha256',
    'planContractSha256',
    'generatorSha256',
  ]) {
    assert(
      evidence[field] === currentIdentity[field],
      `Run evidence ${field} does not match the current execution identity`,
    )
  }
}

export async function writeExclusiveArtifact(path, contents) {
  let createdByInvocation = false
  let handle
  try {
    handle = await open(path, 'wx')
    createdByInvocation = true
    await handle.writeFile(contents)
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => undefined)
      handle = undefined
    }
    if (createdByInvocation) {
      await rm(path, { force: true })
    }
    throw error
  } finally {
    if (handle) {
      await handle.close()
    }
  }
}

function summarizeIcc(icc) {
  if (!Buffer.isBuffer(icc)) {
    return { present: false, bytes: 0, sha256: null }
  }
  return { present: true, bytes: icc.length, sha256: sha256(icc) }
}

function summarizeMetadata(metadata) {
  return {
    format: metadata.format ?? null,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    space: metadata.space ?? null,
    channels: metadata.channels ?? null,
    depth: metadata.depth ?? null,
    density: metadata.density ?? null,
    chromaSubsampling: metadata.chromaSubsampling ?? null,
    isProgressive: metadata.isProgressive ?? false,
    hasProfile: metadata.hasProfile ?? false,
    hasAlpha: metadata.hasAlpha ?? false,
    orientation: metadata.orientation ?? null,
    icc: summarizeIcc(metadata.icc),
    exifPresent: Buffer.isBuffer(metadata.exif),
    iptcPresent: Buffer.isBuffer(metadata.iptc),
    xmpPresent: Buffer.isBuffer(metadata.xmp),
  }
}

function expectedFilename(panelId, width, extension) {
  const panel = panelId.slice(-2)
  return `pepper-carrot-ep01-e01p02-panel-${panel}-w${String(width).padStart(4, '0')}.${extension}`
}

function assertCropGeometry(plan) {
  const { width: sourceWidth, height: sourceHeight } = plan.source
  const orderedCrops = [...plan.crops].sort((a, b) => a.readOrder - b.readOrder)

  assert(orderedCrops.length === 3, 'Expected exactly three source crops')
  for (const [index, crop] of orderedCrops.entries()) {
    assert(crop.readOrder === index + 1, 'Crop read order is not contiguous')
    assert(
      Number.isInteger(crop.x) &&
        Number.isInteger(crop.y) &&
        Number.isInteger(crop.width) &&
        Number.isInteger(crop.height),
      `Crop ${crop.panelId} contains a non-integral coordinate`,
    )
    assert(
      crop.x >= 0 &&
        crop.y >= 0 &&
        crop.width > 0 &&
        crop.height > 0 &&
        crop.x + crop.width <= sourceWidth &&
        crop.y + crop.height <= sourceHeight,
      `Crop ${crop.panelId} falls outside the frozen source`,
    )
  }

  for (let index = 1; index < orderedCrops.length; index += 1) {
    const previous = orderedCrops[index - 1]
    const current = orderedCrops[index]
    assert(
      previous.y + previous.height <= current.y,
      `Crops ${previous.panelId} and ${current.panelId} overlap`,
    )
  }
}

export function buildOutputJobs(plan) {
  assert(plan.planId === 'pepper-carrot-ep01-page2-derivatives-v1', 'Unexpected plan ID')
  assert(plan.procedureRevision === 'ep01-page2-derivative-procedure-v1', 'Unexpected procedure revision')
  assert(plan.pipeline.generationMode === 'serial', 'Plan does not require serial generation')
  assertCropGeometry(plan)

  const formats = new Map(plan.formats.map((format) => [format.id, format]))
  const crops = [...plan.crops].sort((a, b) => a.readOrder - b.readOrder)
  const expected = []

  for (const crop of crops) {
    for (const requestedWidth of plan.responsiveWidths) {
      assert(requestedWidth <= crop.width, `Width ${requestedWidth} would enlarge ${crop.panelId}`)
      for (const formatId of plan.formatOrder) {
        const format = formats.get(formatId)
        assert(format, `Missing format definition for ${formatId}`)
        expected.push({
          order: expected.length + 1,
          panelId: crop.panelId,
          crop,
          requestedWidth,
          format: format.id,
          extension: format.extension,
          encoderSettings: format.settings,
          filename: expectedFilename(crop.panelId, requestedWidth, format.extension),
        })
      }
    }
  }

  assert(expected.length === 18, `Expected 18 output jobs, found ${expected.length}`)
  assert(plan.plannedOutputs.length === expected.length, 'Planned output count does not match the matrix')

  for (const [index, job] of expected.entries()) {
    const planned = plan.plannedOutputs[index]
    assert(
      planned.order === job.order &&
        planned.panelId === job.panelId &&
        planned.requestedWidth === job.requestedWidth &&
        planned.format === job.format &&
        planned.filename === job.filename,
      `Planned output order does not match the frozen matrix at position ${index + 1}`,
    )
    job.expectedDimensions = planned.expectedDimensions
  }

  assert(new Set(expected.map(({ filename }) => filename)).size === 18, 'Output filenames are not unique')
  return expected
}

export function assertSourceIdentity(expected, observed) {
  assert(observed.filename === expected.filename, 'Source filename mismatch')
  assert(observed.bytes === expected.bytes, 'Source byte count mismatch')
  assert(observed.sha256 === expected.sha256, 'Source SHA-256 mismatch')
  assert(observed.format === FORMAT.JPEG, 'Source format mismatch')
  assert(observed.width === expected.width, 'Source width mismatch')
  assert(observed.height === expected.height, 'Source height mismatch')
  assert(
    observed.orientation === null || observed.orientation === 1,
    `Source orientation mismatch: expected unrotated pixels, observed ${observed.orientation}`,
  )
  assert(
    observed.autoOrientWidth === expected.width && observed.autoOrientHeight === expected.height,
    'Source auto-oriented dimensions mismatch',
  )
}

function deterministicEvidence(evidence) {
  const copy = structuredClone(evidence)
  for (const field of DETERMINISTIC_EVIDENCE_EXCLUSIONS) {
    delete copy[field]
  }
  return copy
}

function collectDifferences(first, second, path = '') {
  if (Object.is(first, second)) {
    return []
  }
  if (
    first === null ||
    second === null ||
    typeof first !== 'object' ||
    typeof second !== 'object' ||
    Array.isArray(first) !== Array.isArray(second)
  ) {
    return [{ path, first, second }]
  }

  if (Array.isArray(first)) {
    if (first.length !== second.length) {
      return [{ path: `${path}.length`, first: first.length, second: second.length }]
    }
    return first.flatMap((value, index) =>
      collectDifferences(value, second[index], path ? `${path}.${index}` : String(index)),
    )
  }

  const keys = [...new Set([...Object.keys(first), ...Object.keys(second)])].sort()
  return keys.flatMap((key) =>
    collectDifferences(
      first[key],
      second[key],
      path ? `${path}.${key}` : key,
    ),
  )
}

export function compareRunEvidence(first, second) {
  const differences = collectDifferences(
    deterministicEvidence(first),
    deterministicEvidence(second),
  )
  return {
    identical: differences.length === 0,
    comparisonContract: 'complete run evidence except explicitly excluded bookkeeping fields',
    excludedFields: DETERMINISTIC_EVIDENCE_EXCLUSIONS,
    outputCount: Math.min(first.outputs.length, second.outputs.length),
    differences,
  }
}

function parseArguments(argv) {
  const [command, ...tokens] = argv
  const options = {}
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index]
    const value = tokens[index + 1]
    assert(key?.startsWith('--') && value, `Invalid CLI argument near ${key ?? 'end of input'}`)
    options[key.slice(2)] = value
  }
  return { command, options }
}

async function loadPlan() {
  const bytes = await readFile(PLAN_PATH)
  const plan = JSON.parse(bytes.toString('utf8'))
  assert(
    sha256(bytes) === FROZEN_PLAN_BYTE_SHA256,
    'Current plan bytes do not match the frozen plan byte SHA-256',
  )
  assertFrozenPlanContract(plan)
  const jobs = buildOutputJobs(plan)
  return {
    plan,
    jobs,
    bytes,
    sha256: sha256(bytes),
    contractSha256: planContractSha256(plan),
  }
}

async function inspectSource(sourcePath, expected) {
  const bytes = await readFile(sourcePath)
  const metadata = await sharp(bytes, { failOn: 'error' }).metadata()
  const orientation = metadata.orientation ?? null
  const swapsAxes = orientation !== null && orientation >= 5 && orientation <= 8
  const observed = {
    filename: basename(sourcePath),
    bytes: bytes.length,
    sha256: sha256(bytes),
    format: metadata.format ?? null,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    orientation,
    autoOrientWidth: swapsAxes ? metadata.height : metadata.width,
    autoOrientHeight: swapsAxes ? metadata.width : metadata.height,
  }
  assertSourceIdentity(expected, observed)
  return { bytes, observed, metadata: summarizeMetadata(metadata) }
}

async function builtInSrgbEvidence() {
  const png = await sharp(Buffer.from([0, 0, 0]), {
    raw: { width: 1, height: 1, channels: 3 },
  })
    .withIccProfile('srgb', { attach: true })
    .png()
    .toBuffer()
  const metadata = summarizeMetadata(await sharp(png).metadata())
  assert(metadata.icc.present, 'Sharp built-in sRGB reference profile is missing')
  return metadata.icc
}

function createPipeline(sourceBytes, job) {
  const pipeline = sharp(sourceBytes, { failOn: 'error', sequentialRead: true })
    .extract({
      left: job.crop.x,
      top: job.crop.y,
      width: job.crop.width,
      height: job.crop.height,
    })
    .resize({
      width: job.requestedWidth,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3',
      fastShrinkOnLoad: false,
    })
    .withIccProfile('srgb', { attach: true })

  if (job.format === FORMAT.WEBP) {
    return pipeline.webp(job.encoderSettings)
  }
  if (job.format === FORMAT.JPEG) {
    return pipeline.jpeg(job.encoderSettings)
  }
  throw new Error(`Unsupported output format ${job.format}`)
}

export function assertOutputInfo(job, info, bytes) {
  assert(info.format === job.format, `${job.filename}: Sharp format mismatch`)
  assert(info.width === job.expectedDimensions.width, `${job.filename}: Sharp width mismatch`)
  assert(info.height === job.expectedDimensions.height, `${job.filename}: Sharp height mismatch`)
  assert(info.channels === 3, `${job.filename}: expected three output channels`)
  assert(info.size === bytes.length, `${job.filename}: Sharp byte count mismatch`)
}

function assertOutputMetadata(filename, metadata, srgbProfile) {
  assert(metadata.hasProfile, `${filename}: output profile is missing`)
  assert(metadata.icc.present, `${filename}: ICC payload is missing`)
  assert(metadata.icc.sha256 === srgbProfile.sha256, `${filename}: ICC profile is not Sharp built-in sRGB`)
  assert(!metadata.exifPresent, `${filename}: unexpected EXIF metadata retained`)
  assert(!metadata.iptcPresent, `${filename}: unexpected IPTC metadata retained`)
  assert(!metadata.xmpPresent, `${filename}: unexpected XMP metadata retained`)
  assert(metadata.orientation === null, `${filename}: unexpected orientation metadata retained`)
}

async function referencePixels(sourceBytes, job) {
  return sharp(sourceBytes, { failOn: 'error', sequentialRead: true })
    .extract({
      left: job.crop.x,
      top: job.crop.y,
      width: job.crop.width,
      height: job.crop.height,
    })
    .resize({
      width: job.requestedWidth,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3',
      fastShrinkOnLoad: false,
    })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
}

async function fidelityMetrics(sourceBytes, outputBytes, job) {
  const reference = await referencePixels(sourceBytes, job)
  const decoded = await sharp(outputBytes, { failOn: 'error' })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  assert(reference.data.length === decoded.data.length, `${job.filename}: decoded pixel count mismatch`)
  assert(reference.info.width === decoded.info.width, `${job.filename}: decoded width mismatch`)
  assert(reference.info.height === decoded.info.height, `${job.filename}: decoded height mismatch`)

  let absoluteError = 0
  let squaredError = 0
  let maxAbsoluteError = 0
  for (let index = 0; index < reference.data.length; index += 1) {
    const difference = Math.abs(reference.data[index] - decoded.data[index])
    absoluteError += difference
    squaredError += difference * difference
    maxAbsoluteError = Math.max(maxAbsoluteError, difference)
  }
  const sampleCount = reference.data.length
  const meanSquaredError = squaredError / sampleCount
  return {
    comparison: 'decoded output against unencoded crop-first Lanczos3 sRGB reference',
    sampleCount,
    meanAbsoluteError: Number((absoluteError / sampleCount).toFixed(6)),
    meanSquaredError: Number(meanSquaredError.toFixed(6)),
    peakSignalToNoiseRatioDb:
      meanSquaredError === 0
        ? null
        : Number((10 * Math.log10((255 * 255) / meanSquaredError)).toFixed(6)),
    maxAbsoluteError,
  }
}

async function assertExactFiles(outputDirectory, jobs) {
  const actual = (await readdir(outputDirectory)).sort()
  const expected = jobs.map(({ filename }) => filename).sort()
  assert(JSON.stringify(actual) === JSON.stringify(expected), 'Staging directory does not contain exactly the 18 expected files')
}

function byteFindings(outputs) {
  const webpNotSmallerThanJpeg = []
  const widthInversions = []
  for (const panelId of new Set(outputs.map(({ panelId }) => panelId))) {
    for (const width of new Set(outputs.map(({ requestedWidth }) => requestedWidth))) {
      const webp = outputs.find((output) => output.panelId === panelId && output.requestedWidth === width && output.format === FORMAT.WEBP)
      const jpeg = outputs.find((output) => output.panelId === panelId && output.requestedWidth === width && output.format === FORMAT.JPEG)
      if (webp && jpeg && webp.bytes >= jpeg.bytes) {
        webpNotSmallerThanJpeg.push({ panelId, width, webpBytes: webp.bytes, jpegBytes: jpeg.bytes })
      }
    }
    for (const format of [FORMAT.WEBP, FORMAT.JPEG]) {
      const sequence = outputs.filter((output) => output.panelId === panelId && output.format === format)
      for (let index = 1; index < sequence.length; index += 1) {
        if (sequence[index].bytes <= sequence[index - 1].bytes) {
          widthInversions.push({
            panelId,
            format,
            previousWidth: sequence[index - 1].requestedWidth,
            previousBytes: sequence[index - 1].bytes,
            width: sequence[index].requestedWidth,
            bytes: sequence[index].bytes,
          })
        }
      }
    }
  }
  return { webpNotSmallerThanJpeg, widthInversions }
}

function assertSha256(value, field) {
  assert(
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    `${field} must be a lowercase SHA-256`,
  )
}

function assertFidelityEvidence(output) {
  const fidelity = output.fidelity
  assert(
    fidelity?.comparison ===
      'decoded output against unencoded crop-first Lanczos3 sRGB reference',
    `${output.filename}: fidelity comparison contract mismatch`,
  )
  assert(
    fidelity.sampleCount === output.width * output.height * output.channels,
    `${output.filename}: fidelity sample count mismatch`,
  )
  for (const field of [
    'meanAbsoluteError',
    'meanSquaredError',
    'maxAbsoluteError',
  ]) {
    assert(
      Number.isFinite(fidelity[field]) && fidelity[field] >= 0,
      `${output.filename}: invalid fidelity ${field}`,
    )
  }
  assert(
    fidelity.peakSignalToNoiseRatioDb === null ||
      (Number.isFinite(fidelity.peakSignalToNoiseRatioDb) &&
        fidelity.peakSignalToNoiseRatioDb >= 0),
    `${output.filename}: invalid fidelity peakSignalToNoiseRatioDb`,
  )
}

function assertRunEvidenceContract(evidence, loadedPlan, currentIdentity) {
  assertCurrentEvidenceIdentity(evidence, currentIdentity)
  assert(evidence.planId === loadedPlan.plan.planId, 'Run evidence plan ID mismatch')
  assert(
    evidence.procedureRevision === loadedPlan.plan.procedureRevision,
    'Run evidence procedure revision mismatch',
  )
  assert(
    evidence.treatmentId === loadedPlan.plan.treatmentId,
    'Run evidence treatment ID mismatch',
  )
  assert(
    stableJson(evidence.deterministicEvidenceExclusions) ===
      stableJson(DETERMINISTIC_EVIDENCE_EXCLUSIONS),
    'Run evidence deterministic exclusion contract mismatch',
  )
  assert(
    stableJson(evidence.operationOrder) ===
      stableJson(loadedPlan.plan.pipeline.orderedOperations),
    'Run evidence operation order mismatch',
  )
  assert(
    evidence.generationMode === loadedPlan.plan.pipeline.generationMode,
    'Run evidence generation mode mismatch',
  )
  assert(
    stableJson(evidence.metadataPolicy) ===
      stableJson(loadedPlan.plan.pipeline.metadata),
    'Run evidence metadata policy mismatch',
  )
  assert(
    evidence.environmentFingerprint === sha256(stableJson(evidence.runtime)),
    'Run evidence runtime fingerprint mismatch',
  )
  assert(
    evidence.runtime.lockfileSha256 === currentIdentity.lockfileSha256,
    'Run evidence lockfile SHA-256 mismatch',
  )
  assert(
    evidence.runtime.sharpPackageVersion === evidence.runtime.sharpVersions.sharp &&
      evidence.runtime.bundledLibvipsVersion === evidence.runtime.sharpVersions.vips,
    'Run evidence Sharp runtime versions are inconsistent',
  )

  const expectedSource = loadedPlan.plan.source
  for (const field of [
    'canonicalUrl',
    'filename',
    'bytes',
    'sha256',
    'width',
    'height',
    'artPackageSha256',
    'nestedSourceFilename',
    'nestedSourceSha256',
  ]) {
    assert(
      evidence.source[field] === expectedSource[field],
      `Run evidence source.${field} mismatch`,
    )
  }
  assert(evidence.source.format === 'jpeg', 'Run evidence source format mismatch')
  assert(evidence.source.orientation === null, 'Run evidence source orientation mismatch')
  assert(
    evidence.source.autoOrientWidth === expectedSource.width &&
      evidence.source.autoOrientHeight === expectedSource.height,
    'Run evidence source auto-oriented dimensions mismatch',
  )
  assert(
    stableJson(evidence.source.metadata) === stableJson(FROZEN_SOURCE_METADATA),
    'Run evidence source metadata mismatch',
  )

  assert(
    evidence.expectedOutputCount === 18 && evidence.actualOutputCount === 18,
    'Run evidence output count mismatch',
  )
  for (const field of [
    'exactExpectedFilesOnly',
    'uniqueFilenames',
    'uniqueOutputHashes',
    'cropGeometryVerified',
  ]) {
    assert(evidence[field] === true, `Run evidence ${field} must be true`)
  }
  assert(evidence.outputs.length === loadedPlan.jobs.length, 'Run evidence output matrix length mismatch')
  assert(evidence.builtInSrgbProfile.present === true, 'Run evidence built-in sRGB profile missing')
  assertSha256(evidence.builtInSrgbProfile.sha256, 'builtInSrgbProfile.sha256')

  for (const [index, output] of evidence.outputs.entries()) {
    const job = loadedPlan.jobs[index]
    assert(output.order === job.order, `${output.filename}: output order mismatch`)
    assert(output.panelId === job.panelId, `${output.filename}: panel ID mismatch`)
    assert(output.readOrder === job.crop.readOrder, `${output.filename}: read order mismatch`)
    assert(
      stableJson(output.crop) ===
        stableJson({
          coordinateConvention: loadedPlan.plan.coordinateConvention,
          left: job.crop.x,
          top: job.crop.y,
          width: job.crop.width,
          height: job.crop.height,
          safeInsetPixels: job.crop.safeInsetPixels,
        }),
      `${output.filename}: crop evidence mismatch`,
    )
    assert(
      stableJson(output.resize) ===
        stableJson({
          requestedWidth: job.requestedWidth,
          fit: loadedPlan.plan.pipeline.resize.fit,
          withoutEnlargement: loadedPlan.plan.pipeline.resize.withoutEnlargement,
          kernel: loadedPlan.plan.pipeline.resize.kernel,
          fastShrinkOnLoad: loadedPlan.plan.pipeline.resize.fastShrinkOnLoad,
        }),
      `${output.filename}: resize evidence mismatch`,
    )
    assert(output.requestedWidth === job.requestedWidth, `${output.filename}: requested width mismatch`)
    assert(output.format === job.format, `${output.filename}: format mismatch`)
    assert(
      stableJson(output.encoderSettings) === stableJson(job.encoderSettings),
      `${output.filename}: encoder settings mismatch`,
    )
    assert(output.filename === job.filename, `${output.filename}: filename mismatch`)
    assert(
      output.width === job.expectedDimensions.width &&
        output.height === job.expectedDimensions.height,
      `${output.filename}: dimensions mismatch`,
    )
    assert(output.channels === 3 && output.colourspace === 'srgb', `${output.filename}: colour contract mismatch`)
    assert(Number.isInteger(output.bytes) && output.bytes > 0, `${output.filename}: byte count mismatch`)
    assertSha256(output.sha256, `${output.filename}.sha256`)
    assert(
      stableJson(output.sharpToFileInfo) ===
        stableJson({
          format: output.format,
          width: output.width,
          height: output.height,
          channels: output.channels,
          premultiplied: false,
          hasAlpha: false,
          size: output.bytes,
        }),
      `${output.filename}: Sharp toFile evidence mismatch`,
    )
    const expectedMetadata = {
      format: output.format,
      width: output.width,
      height: output.height,
      space: 'srgb',
      channels: 3,
      depth: 'uchar',
      density: output.format === FORMAT.JPEG ? 72 : null,
      chromaSubsampling: output.format === FORMAT.JPEG ? '4:4:4' : null,
      isProgressive: output.format === FORMAT.JPEG,
      hasProfile: true,
      hasAlpha: false,
      orientation: null,
      icc: evidence.builtInSrgbProfile,
      exifPresent: false,
      iptcPresent: false,
      xmpPresent: false,
    }
    assert(
      stableJson(output.metadata) === stableJson(expectedMetadata),
      `${output.filename}: output metadata evidence mismatch`,
    )
    assertFidelityEvidence(output)
  }

  assert(
    new Set(evidence.outputs.map(({ filename }) => filename)).size === 18,
    'Run evidence filenames are not unique',
  )
  assert(
    new Set(evidence.outputs.map(({ sha256: hash }) => hash)).size === 18,
    'Run evidence hashes are not unique',
  )
  assert(
    stableJson(evidence.byteFindings) === stableJson(byteFindings(evidence.outputs)),
    'Run evidence byte findings mismatch',
  )
}

async function generateRun(sourcePath, outputDirectory, evidencePath) {
  const loadedPlan = await loadPlan()
  const [lockfile, generatorBytes] = await Promise.all([
    readFile(LOCKFILE_PATH),
    readFile(MODULE_PATH),
  ])
  const source = await inspectSource(sourcePath, loadedPlan.plan.source)
  const srgbProfile = await builtInSrgbEvidence()
  const runtime = {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    sharpPackageVersion: sharp.versions.sharp,
    bundledLibvipsVersion: sharp.versions.vips,
    sharpVersions: sharp.versions,
    lockfileSha256: sha256(lockfile),
  }
  const environmentFingerprint = sha256(stableJson(runtime))

  await mkdir(outputDirectory, { recursive: false })
  try {
    assert((await readdir(outputDirectory)).length === 0, 'Output directory must start empty')
    const outputs = []
    for (const job of loadedPlan.jobs) {
      const temporaryPath = resolve(outputDirectory, `.${job.filename}.pending`)
      const finalPath = resolve(outputDirectory, job.filename)
      const info = await createPipeline(source.bytes, job).toFile(temporaryPath)
      const outputBytes = await readFile(temporaryPath)
      assertOutputInfo(job, info, outputBytes)
      const metadata = summarizeMetadata(await sharp(outputBytes, { failOn: 'error' }).metadata())
      assertOutputMetadata(job.filename, metadata, srgbProfile)
      const fidelity = await fidelityMetrics(source.bytes, outputBytes, job)
      await rename(temporaryPath, finalPath)

      outputs.push({
        order: job.order,
        panelId: job.panelId,
        readOrder: job.crop.readOrder,
        crop: {
          coordinateConvention: loadedPlan.plan.coordinateConvention,
          left: job.crop.x,
          top: job.crop.y,
          width: job.crop.width,
          height: job.crop.height,
          safeInsetPixels: job.crop.safeInsetPixels,
        },
        resize: {
          requestedWidth: job.requestedWidth,
          fit: loadedPlan.plan.pipeline.resize.fit,
          withoutEnlargement: loadedPlan.plan.pipeline.resize.withoutEnlargement,
          kernel: loadedPlan.plan.pipeline.resize.kernel,
          fastShrinkOnLoad: loadedPlan.plan.pipeline.resize.fastShrinkOnLoad,
        },
        requestedWidth: job.requestedWidth,
        format: job.format,
        encoderSettings: job.encoderSettings,
        filename: job.filename,
        width: info.width,
        height: info.height,
        channels: info.channels,
        colourspace: metadata.space,
        bytes: outputBytes.length,
        sha256: sha256(outputBytes),
        sharpToFileInfo: info,
        metadata,
        fidelity,
      })
    }

    await assertExactFiles(outputDirectory, loadedPlan.jobs)
    assert(new Set(outputs.map(({ sha256: hash }) => hash)).size === 18, 'Output SHA-256 values are not unique')

    const evidence = {
      runEvidenceSchemaVersion: '1.0.0',
      status: 'generated_temporary_evidence_not_imported',
      generatedAt: new Date().toISOString(),
      planId: loadedPlan.plan.planId,
      planSha256: loadedPlan.sha256,
      planContractSha256: loadedPlan.contractSha256,
      generatorSha256: sha256(generatorBytes),
      procedureRevision: loadedPlan.plan.procedureRevision,
      treatmentId: loadedPlan.plan.treatmentId,
      generationMode: 'serial',
      operationOrder: loadedPlan.plan.pipeline.orderedOperations,
      deterministicEvidenceExclusions: DETERMINISTIC_EVIDENCE_EXCLUSIONS,
      environmentFingerprint,
      runtime,
      source: {
        canonicalUrl: loadedPlan.plan.source.canonicalUrl,
        filename: source.observed.filename,
        bytes: source.observed.bytes,
        sha256: source.observed.sha256,
        width: source.observed.width,
        height: source.observed.height,
        format: source.observed.format,
        orientation: source.observed.orientation,
        autoOrientWidth: source.observed.autoOrientWidth,
        autoOrientHeight: source.observed.autoOrientHeight,
        metadata: source.metadata,
        artPackageSha256: loadedPlan.plan.source.artPackageSha256,
        nestedSourceFilename: loadedPlan.plan.source.nestedSourceFilename,
        nestedSourceSha256: loadedPlan.plan.source.nestedSourceSha256,
      },
      metadataPolicy: loadedPlan.plan.pipeline.metadata,
      builtInSrgbProfile: srgbProfile,
      expectedOutputCount: 18,
      actualOutputCount: outputs.length,
      exactExpectedFilesOnly: true,
      uniqueFilenames: true,
      uniqueOutputHashes: true,
      cropGeometryVerified: true,
      outputs,
      byteFindings: byteFindings(outputs),
    }
    assertRunEvidenceContract(evidence, loadedPlan, {
      planSha256: loadedPlan.sha256,
      planContractSha256: loadedPlan.contractSha256,
      generatorSha256: sha256(generatorBytes),
      lockfileSha256: sha256(lockfile),
    })
    await writeExclusiveArtifact(
      evidencePath,
      `${JSON.stringify(evidence, null, 2)}\n`,
    )
    return evidence
  } catch (error) {
    await rm(outputDirectory, { recursive: true, force: true })
    throw error
  }
}

function actualManifest(plan, first, second, reproduction) {
  return {
    manifestSchemaVersion: '1.0.0',
    status: 'generated_evidence_reproducible_not_imported',
    planId: first.planId,
    planSha256: first.planSha256,
    planContractSha256: first.planContractSha256,
    generatorSha256: first.generatorSha256,
    procedureRevision: first.procedureRevision,
    treatmentId: first.treatmentId,
    generationTimestamps: [first.generatedAt, second.generatedAt],
    source: first.source,
    runtime: first.runtime,
    generation: {
      mode: first.generationMode,
      operationOrder: first.operationOrder,
      metadataPolicy: first.metadataPolicy,
      builtInSrgbProfile: first.builtInSrgbProfile,
      expectedOutputCount: 18,
      actualOutputCount: first.outputs.length,
      exactExpectedFilesOnly: first.exactExpectedFilesOnly,
      uniqueFilenames: first.uniqueFilenames,
      uniqueOutputHashes: first.uniqueOutputHashes,
      cropGeometryVerified: first.cropGeometryVerified,
    },
    encoderDefinitions: plan.formats,
    outputs: first.outputs,
    reproducibility: {
      status: 'passed_same_recorded_environment',
      firstRunEnvironmentFingerprint: first.environmentFingerprint,
      secondRunEnvironmentFingerprint: second.environmentFingerprint,
      ...reproduction,
    },
    byteAndPerformanceReview: {
      localByteFindings: first.byteFindings,
      targetDeviceDecodeAndRenderStatus: 'pending_physical_device_review',
    },
    rights: {
      work: 'Pepper & Carrot — Episode 1: The Potion of Flight',
      artAndScenario: 'David Revoy',
      spanishTranslation: 'Juanjo Faico',
      contributions: ['Andrej Ficko', 'Hồ Nhựt Châu'],
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      officialSpanishSourcePage: 'https://www.peppercarrot.com/es/webcomic-sources/ep01_Potion-of-Flight__files.html',
      repositoryProvenance: 'pepper-carrot-ep01-inspection.md',
      modifications: [
        'Cropped three panels from the verified compiled Spanish page using the frozen two-pixel safe insets.',
        'Resized each crop down to 640 and 1280 pixels wide and retained the 2275-pixel native crop width.',
        'Converted output pixels to the Sharp built-in sRGB profile and attached the profile.',
        'Encoded responsive WebP and JPEG derivatives using the frozen lossy encoder settings.',
      ],
      notPerformed: [
        'No artwork cleanup, segmentation, or layer extraction was performed.',
        'No translation text or font was re-rendered.',
        'No animation was baked into the derivative files.',
      ],
      noEndorsementImplied: true,
      finalAttributionApprovalStatus: 'pending',
    },
    review: {
      automatedMetadataAndPixelChecks: 'passed',
      agentVisualFidelityStatus: 'pending',
      humanVisualFidelityApproval: { status: 'pending', reviewer: null, reviewedAt: null },
      spanishAccessibilityDescriptionReview: {
        status: 'pending_human_authoring_and_review',
        reviewer: null,
        reviewedAt: null,
      },
      physicalDeviceReview: { status: 'pending', reviewer: null, reviewedAt: null },
      repositoryImportStatus: 'not_authorized',
      finalStudyContentStatus: 'open',
    },
  }
}

async function compareRuns(firstPath, secondPath, manifestPath) {
  const [loadedPlan, generatorBytes, lockfile, first, second] = await Promise.all([
    loadPlan(),
    readFile(MODULE_PATH),
    readFile(LOCKFILE_PATH),
    readFile(firstPath, 'utf8').then(JSON.parse),
    readFile(secondPath, 'utf8').then(JSON.parse),
  ])
  const currentIdentity = {
    planSha256: loadedPlan.sha256,
    planContractSha256: loadedPlan.contractSha256,
    generatorSha256: sha256(generatorBytes),
    lockfileSha256: sha256(lockfile),
  }
  assertRunEvidenceContract(first, loadedPlan, currentIdentity)
  assertRunEvidenceContract(second, loadedPlan, currentIdentity)
  const reproduction = compareRunEvidence(first, second)
  assert(reproduction.identical, `Reproduction mismatch: ${JSON.stringify(reproduction.differences)}`)
  assert(first.outputs.length === 18 && second.outputs.length === 18, 'Both runs must contain exactly 18 outputs')
  const manifest = actualManifest(loadedPlan.plan, first, second, reproduction)
  await writeExclusiveArtifact(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return manifest
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2))
  if (command === 'generate') {
    assert(options.source && options['output-dir'] && options.evidence, 'generate requires --source, --output-dir, and --evidence')
    const [sourcePath, outputDirectory, evidencePath] = await Promise.all([
      assertSafeTemporaryPath(options.source),
      assertSafeTemporaryPath(options['output-dir']),
      assertSafeTemporaryPath(options.evidence),
    ])
    const evidence = await generateRun(
      sourcePath,
      outputDirectory,
      evidencePath,
    )
    process.stdout.write(`${JSON.stringify({ status: evidence.status, outputs: evidence.actualOutputCount })}\n`)
    return
  }
  if (command === 'compare') {
    assert(options.first && options.second && options.manifest, 'compare requires --first, --second, and --manifest')
    const [firstPath, secondPath, manifestPath] = await Promise.all([
      assertSafeTemporaryPath(options.first),
      assertSafeTemporaryPath(options.second),
      assertSafeTemporaryPath(options.manifest),
    ])
    const manifest = await compareRuns(
      firstPath,
      secondPath,
      manifestPath,
    )
    process.stdout.write(`${JSON.stringify({ status: manifest.status, outputs: manifest.outputs.length })}\n`)
    return
  }
  throw new Error('Expected command: generate or compare')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}
