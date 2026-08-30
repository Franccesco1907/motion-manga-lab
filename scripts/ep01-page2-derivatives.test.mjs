import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as generator from './ep01-page2-derivatives.mjs'
import {
  assertSourceIdentity,
  assertOutputInfo,
  buildOutputJobs,
  compareRunEvidence,
} from './ep01-page2-derivatives.mjs'

const plan = JSON.parse(
  await readFile(
    resolve(
      process.cwd(),
      'docs/asset-provenance/pepper-carrot-ep01-page2-derivatives.plan.json',
    ),
    'utf8',
  ),
)

const TEMPORARY_ROOT = '/tmp/opencode'

function syntheticEvidence() {
  return {
    runEvidenceSchemaVersion: '1.0.0',
    status: 'generated_temporary_evidence_not_imported',
    generatedAt: '2026-08-30T20:00:00.000Z',
    planId: 'plan-id',
    planSha256: 'plan-sha',
    planContractSha256: 'contract-sha',
    generatorSha256: 'generator-sha',
    procedureRevision: 'procedure-v1',
    treatmentId: 'treatment-v1',
    generationMode: 'serial',
    operationOrder: ['verify', 'encode'],
    environmentFingerprint: 'environment-sha',
    runtime: {
      nodeVersion: 'v24.0.0',
      platform: 'linux',
      architecture: 'x64',
      sharpPackageVersion: '0.35.4',
      bundledLibvipsVersion: '8.18.6',
      sharpVersions: { sharp: '0.35.4', vips: '8.18.6' },
      lockfileSha256: 'lock-sha',
    },
    source: {
      filename: 'source.jpg',
      bytes: 100,
      sha256: 'source-sha',
      width: 10,
      height: 10,
      format: 'jpeg',
      orientation: null,
      metadata: { space: 'srgb', density: 300 },
    },
    metadataPolicy: { outputProfile: 'srgb', attachIccProfile: true },
    builtInSrgbProfile: { present: true, bytes: 480, sha256: 'icc-sha' },
    expectedOutputCount: 1,
    actualOutputCount: 1,
    exactExpectedFilesOnly: true,
    uniqueFilenames: true,
    uniqueOutputHashes: true,
    cropGeometryVerified: true,
    outputs: [
      {
        order: 1,
        panelId: 'panel-01',
        crop: { left: 1, top: 1, width: 8, height: 8 },
        resize: { requestedWidth: 4, withoutEnlargement: true },
        requestedWidth: 4,
        format: 'webp',
        encoderSettings: { quality: 92, effort: 6 },
        filename: 'panel.webp',
        width: 4,
        height: 4,
        channels: 3,
        colourspace: 'srgb',
        bytes: 123,
        sha256: 'output-sha',
        sharpToFileInfo: { format: 'webp', width: 4, height: 4, channels: 3, size: 123 },
        metadata: {
          format: 'webp',
          width: 4,
          height: 4,
          space: 'srgb',
          channels: 3,
          icc: { present: true, bytes: 480, sha256: 'icc-sha' },
          exifPresent: false,
          iptcPresent: false,
          xmpPresent: false,
        },
        fidelity: {
          comparison: 'synthetic reference',
          sampleCount: 48,
          meanAbsoluteError: 1,
          meanSquaredError: 2,
          peakSignalToNoiseRatioDb: 45,
          maxAbsoluteError: 5,
        },
      },
    ],
    byteFindings: { webpNotSmallerThanJpeg: [], widthInversions: [] },
  }
}

describe('Episode 1 page 2 derivative plan', () => {
  it('builds the exact 18-file panel, width, and format order', () => {
    const jobs = buildOutputJobs(plan)

    expect(jobs).toHaveLength(18)
    expect(jobs.map(({ filename }) => filename)).toEqual(
      plan.plannedOutputs.map(({ filename }) => filename),
    )
    expect(jobs[0]).toMatchObject({
      order: 1,
      panelId: 'e01p02-panel-01',
      requestedWidth: 640,
      format: 'webp',
    })
    expect(jobs.at(-1)).toMatchObject({
      order: 18,
      panelId: 'e01p02-panel-03',
      requestedWidth: 2275,
      format: 'jpeg',
    })
    expect(new Set(jobs.map(({ filename }) => filename)).size).toBe(18)
  })

  it('rejects a planned output that is out of deterministic order', () => {
    const invalidPlan = structuredClone(plan)
    ;[invalidPlan.plannedOutputs[0], invalidPlan.plannedOutputs[1]] = [
      invalidPlan.plannedOutputs[1],
      invalidPlan.plannedOutputs[0],
    ]

    expect(() => buildOutputJobs(invalidPlan)).toThrow(
      /planned output order does not match/i,
    )
  })

  it('fails closed for a source identity or orientation mismatch', () => {
    const observed = {
      filename: plan.source.filename,
      bytes: plan.source.bytes,
      sha256: plan.source.sha256,
      format: 'jpeg',
      width: plan.source.width,
      height: plan.source.height,
      orientation: null,
      autoOrientWidth: plan.source.width,
      autoOrientHeight: plan.source.height,
    }

    expect(() => assertSourceIdentity(plan.source, observed)).not.toThrow()
    expect(() =>
      assertSourceIdentity(plan.source, { ...observed, orientation: 6 }),
    ).toThrow(/orientation/i)
    expect(() =>
      assertSourceIdentity(plan.source, { ...observed, bytes: observed.bytes - 1 }),
    ).toThrow(/byte count/i)
  })

  it('proves matching runs and reports the first differing field', () => {
    const first = {
      planSha256: 'plan-hash',
      source: { sha256: 'source-hash' },
      environmentFingerprint: 'runtime-hash',
      outputs: [
        {
          order: 1,
          filename: 'panel.webp',
          width: 640,
          height: 298,
          bytes: 123,
          sha256: 'output-hash',
        },
      ],
    }
    const second = structuredClone(first)

    expect(compareRunEvidence(first, second)).toEqual({
      identical: true,
      comparisonContract:
        'complete run evidence except explicitly excluded bookkeeping fields',
      excludedFields: ['generatedAt'],
      outputCount: 1,
      differences: [],
    })

    second.outputs[0].sha256 = 'different-hash'

    expect(compareRunEvidence(first, second)).toMatchObject({
      identical: false,
      differences: [
        {
          path: 'outputs.0.sha256',
          first: 'output-hash',
          second: 'different-hash',
        },
      ],
    })
  })

  it('accepts Sharp toFile info without a colourspace field', () => {
    const job = buildOutputJobs(plan)[0]
    const info = {
      format: 'webp',
      width: 640,
      height: 298,
      channels: 3,
      size: 123,
    }

    expect(() => assertOutputInfo(job, info, Buffer.alloc(123))).not.toThrow()
  })

  it('rejects repository, traversal, and symlink-escaped artifact paths', async () => {
    const temporaryDirectory = await mkdtemp(
      join(TEMPORARY_ROOT, 'motion-manga-path-safety-'),
    )
    const safeParent = join(temporaryDirectory, 'safe')
    const escapedLink = join(temporaryDirectory, 'escaped-link')
    await mkdir(safeParent)
    await symlink(process.cwd(), escapedLink)

    try {
      await expect(
        generator.assertSafeTemporaryPath(
          resolve(process.cwd(), 'docs/unsafe-evidence.json'),
        ),
      ).rejects.toThrow(/repository|temporary root/i)
      await expect(
        generator.assertSafeTemporaryPath(
          resolve(TEMPORARY_ROOT, '..', 'escaped-evidence.json'),
        ),
      ).rejects.toThrow(/temporary root/i)
      await expect(
        generator.assertSafeTemporaryPath(join(escapedLink, 'evidence.json')),
      ).rejects.toThrow(/symlink|temporary root|repository/i)
      await expect(
        generator.assertSafeTemporaryPath(join(safeParent, 'evidence.json')),
      ).resolves.toMatch(TEMPORARY_ROOT)
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })

  it('rejects every material mutation of the frozen plan contract', () => {
    expect(() => generator.assertFrozenPlanContract(plan)).not.toThrow()

    const mutations = [
      (value) => {
        value.source.sha256 = 'changed-source'
      },
      (value) => {
        value.pipeline.orderedOperations.reverse()
      },
      (value) => {
        value.pipeline.stagingDirectoryPolicy = 'repository_allowed'
      },
      (value) => {
        value.responsiveWidths[0] = 641
      },
      (value) => {
        value.crops[0].x += 1
      },
      (value) => {
        value.formatOrder.reverse()
      },
      (value) => {
        value.pipeline.metadata.outputProfile = 'display-p3'
      },
      (value) => {
        value.formats[0].settings.quality = 80
      },
    ]

    for (const mutate of mutations) {
      const changedPlan = structuredClone(plan)
      mutate(changedPlan)
      expect(() => generator.assertFrozenPlanContract(changedPlan)).toThrow(
        /frozen plan contract/i,
      )
    }
  })

  it('binds run evidence to the current plan and generator bytes', () => {
    const evidence = syntheticEvidence()
    const currentIdentity = {
      planSha256: evidence.planSha256,
      planContractSha256: evidence.planContractSha256,
      generatorSha256: evidence.generatorSha256,
    }

    expect(() =>
      generator.assertCurrentEvidenceIdentity(evidence, currentIdentity),
    ).not.toThrow()

    for (const field of [
      'planSha256',
      'planContractSha256',
      'generatorSha256',
    ]) {
      expect(() =>
        generator.assertCurrentEvidenceIdentity(
          { ...evidence, [field]: `changed-${field}` },
          currentIdentity,
        ),
      ).toThrow(new RegExp(field, 'i'))
    }
  })

  it('compares the complete deterministic evidence contract', () => {
    const first = syntheticEvidence()
    const deterministicMutations = [
      ['source.metadata.density', (value) => (value.source.metadata.density = 72)],
      [
        'runtime.sharpVersions.vips',
        (value) => (value.runtime.sharpVersions.vips = 'changed'),
      ],
      [
        'outputs.0.encoderSettings.quality',
        (value) => (value.outputs[0].encoderSettings.quality = 80),
      ],
      [
        'outputs.0.metadata.icc.sha256',
        (value) => (value.outputs[0].metadata.icc.sha256 = 'changed'),
      ],
      [
        'outputs.0.fidelity.meanAbsoluteError',
        (value) => (value.outputs[0].fidelity.meanAbsoluteError = 9),
      ],
    ]

    const bookkeepingOnly = structuredClone(first)
    bookkeepingOnly.generatedAt = '2026-08-30T21:00:00.000Z'
    expect(compareRunEvidence(first, bookkeepingOnly)).toMatchObject({
      identical: true,
      excludedFields: ['generatedAt'],
      differences: [],
    })

    for (const [expectedPath, mutate] of deterministicMutations) {
      const changed = structuredClone(first)
      mutate(changed)
      expect(compareRunEvidence(first, changed)).toMatchObject({
        identical: false,
        differences: [{ path: expectedPath }],
      })
    }
  })

  it('preserves pre-existing evidence after an exclusive-write collision', async () => {
    const temporaryDirectory = await mkdtemp(
      join(TEMPORARY_ROOT, 'motion-manga-evidence-collision-'),
    )
    const evidencePath = join(temporaryDirectory, 'run.evidence.json')
    await writeFile(evidencePath, 'pre-existing evidence')

    try {
      await expect(
        generator.writeExclusiveArtifact(evidencePath, 'replacement'),
      ).rejects.toMatchObject({ code: 'EEXIST' })
      await expect(readFile(evidencePath, 'utf8')).resolves.toBe(
        'pre-existing evidence',
      )
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })
})
