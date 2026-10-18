// Dependency-free real-browser journey. Run only against freshly built dist + dist-server.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { CDP, domHelpers } from './cdp.mjs'
import { eventually, privateError, serverOrigin } from './helpers.mjs'
import { backupStore, restoreStore } from '../local-backup/backup.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const chromePath = process.env.CHROME_BIN || '/opt/google/chrome/chrome'
const temporary = await mkdtemp(join(tmpdir(), 'motion-manga-browser-data-'))
const evidence = await mkdtemp(join(tmpdir(), 'motion-manga-browser-evidence-'))
await Promise.all([chmod(temporary, 0o700), chmod(evidence, 0o700)])
const password = randomBytes(32).toString('base64url'), username = 'journey-operator'
let accountRoot = join(temporary, 'accounts')
const children = new Set(), report = { status: 'running', checks: [], screenshots: [], limitations: ['Desktop headless Chrome only; not physical-device, visual-regression, accessibility-audit or load-test proof.'] }
let browser, server, cdp, browserCdp, stage = 'preflight'
const network = [], renderRequests = [], videoRequests = [], heavyRequests = []
let cleanupPromise

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode) return
  const closed = once(child, 'close')
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 7000)
  try { await closed } finally { clearTimeout(timer); children.delete(child) }
}
function child(command, args, options = {}) {
  const process = spawn(command, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], ...options })
  children.add(process)
  // Drain output, but never put child logs or private request data in public output.
  process.stderr.resume()
  process.on('error', () => {})
  return process
}
async function cleanup() {
  cleanupPromise ??= (async () => {
    cdp?.close()
    browserCdp?.close()
    await Promise.allSettled([...children].map(stop))
    await rm(temporary, { recursive: true, force: true })
  })()
  await cleanupPromise
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143))
})
async function check(name, action) {
  stage = name
  const details = await action()
  report.checks.push({ name, passed: true, ...(details ? { details } : {}) })
  console.log(`PASS ${name}`)
}
async function startServer(seed = false) {
  server = child(process.execPath, ['scripts/browser-journey/server.mjs'])
  let output = '', failure
  server.on('error', error => { failure = error })
  server.stdout.on('data', bytes => { output += bytes.toString(); if (output.length > 1024) failure = new Error('Unexpected test-server output.') })
  server.stdin.end(JSON.stringify({ root: accountRoot, ...(seed ? { username, password } : {}) }) + '\n')
  return eventually(() => {
    if (failure) throw failure
    if (server.exitCode !== null) throw new Error('Isolated test server exited before readiness; build frontend and server first.')
    return output.includes('\n') && serverOrigin(JSON.parse(output.split('\n')[0]))
  }, { label: 'isolated server readiness' })
}
async function startBrowser(origin, iteration) {
  const profile = join(temporary, `chrome-${iteration}`)
  await mkdir(profile, { mode: 0o700 })
  browser = child(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'])
  browser.stdout.resume()
  let failure
  browser.on('error', error => { failure = error })
  const port = await eventually(async () => {
    if (failure) throw failure
    if (browser.exitCode !== null) throw new Error('Chrome exited before readiness. A sandbox-capable Chrome installation is required.')
    try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]) }
    catch (error) { if (error.code === 'ENOENT') return false; throw error }
  }, { label: 'sandboxed Chrome readiness' })
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  browserCdp = await CDP.connect(version.webSocketDebuggerUrl)
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  cdp = await CDP.connect(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  cdp.on('Network.requestWillBeSent', ({requestId, request}) => {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      network.push({event:'request',requestId,path:url.pathname,method:request.method})
      if (request.method === 'POST' && url.pathname.endsWith('/render')) renderRequests.push(url.pathname)
      if (/\/artifacts\/[^/]+\/video$/.test(url.pathname)) videoRequests.push(url.pathname)
      if (request.method === 'POST' && /\/(render|assistance|masks)(?:\/|$)/.test(url.pathname)) heavyRequests.push(url.pathname)
      if (network.length > 80) network.shift()
    }
  })
  cdp.on('Network.loadingFailed', ({requestId, canceled, errorText}) => {
    network.push({event:'failure',requestId,canceled,errorText})
    if (network.length > 80) network.shift()
  })
  cdp.on('Network.responseReceived', ({requestId, response}) => {
    const url = new URL(response.url)
    if (url.pathname.startsWith('/api/')) {
      network.push({event:'response',requestId,path:url.pathname,status:response.status})
      if (network.length > 80) network.shift()
    }
  })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: domHelpers })
  await cdp.send('Page.navigate', { url: origin })
  await cdp.wait(`document.readyState === 'complete' && !!window.journey && journey.text('Sign in')`, 'rendered sign-in form')
  await cdp.evaluate(`journey.fill('Username', ${JSON.stringify(username)}); journey.fill('Password', ${JSON.stringify(password)});`)
  await click('Sign in')
  await cdp.wait(`journey.text('No saved pages yet.') || !!document.querySelector('.page-card')`, 'signed-in page library')
}
async function click(label) {
  // Only an actual trusted pointer action grants activation. Reads and polling never do.
  const point = await cdp.evaluate(`(() => {
    const name = ${JSON.stringify(label)};
    const item = [...document.querySelectorAll('button')].find(e => (e.getAttribute('aria-label') || e.textContent).trim() === name);
    if (!item || item.disabled) throw new Error('Button unavailable: ' + name);
    item.scrollIntoView({block:'center'});
    const b = item.getBoundingClientRect(); return {x:b.x + b.width / 2,y:b.y + b.height / 2};
  })()`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 })
}
async function fill(label, value) { await cdp.evaluate(`journey.fill(${JSON.stringify(label)}, ${JSON.stringify(value)})`) }
async function details(label) { await cdp.evaluate(`journey.details(${JSON.stringify(label)})`) }
async function toggleCheckbox(label) {
  const point = await cdp.evaluate(`(() => {
    const item = journey.field(${JSON.stringify(label)});
    if (item.type !== 'checkbox' || item.disabled) throw new Error('Checkbox unavailable');
    item.scrollIntoView({block:'center'});
    const b = item.getBoundingClientRect(); return {x:b.x + b.width / 2,y:b.y + b.height / 2};
  })()`)
  await cdp.send('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',buttons:1,clickCount:1})
  await cdp.send('Input.dispatchMouseEvent', {type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1})
}
async function stepSlider(label, key) {
  await cdp.evaluate(`(() => {
    const name = ${JSON.stringify(label)};
    const item = [...document.querySelectorAll('input[aria-label]')].find(e => e.getAttribute('aria-label') === name) || journey.field(name);
    if (item.type !== 'range' || item.disabled) throw new Error('Slider unavailable');
    item.scrollIntoView({block:'center'}); item.focus();
  })()`)
  await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',key,code:key})
  await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key,code:key})
}
async function upload(path) {
  const { root: document } = await cdp.send('DOM.getDocument')
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: document.nodeId, selector: 'input[type=file]' })
  await cdp.send('DOM.setFileInputFiles', { nodeId, files: [path] })
  await click('Upload page')
}
async function save() {
  await click('Save draft')
  await cdp.wait(`journey.text('Draft saved.') && !journey.text('unsaved changes.')`, 'saved edited draft')
}
async function failNextSave(action) {
  let handled = false, failure
  const dispose = cdp.on('Fetch.requestPaused', event => {
    const method = event.request.method
    void (async () => {
      if (!handled && method === 'PUT' && event.request.url.endsWith('/draft')) {
        handled = true
        await cdp.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 503,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify({ error: { code: 'journey_failure', message: 'Simulated save unavailable.' } })).toString('base64') })
      } else await cdp.send('Fetch.continueRequest', { requestId: event.requestId })
    })().catch(error => { failure = error })
  })
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/draft', requestStage: 'Request' }] })
  try { await action(); if (failure) throw failure; assert.equal(handled, true) }
  finally { dispose(); await cdp.send('Fetch.disable') }
}
async function pauseNextSave(action) {
  let paused, failure
  const dispose = cdp.on('Fetch.requestPaused', event => {
    if (!paused && event.request.method === 'PUT' && event.request.url.endsWith('/draft')) paused = event.requestId
    else void cdp.send('Fetch.continueRequest', {requestId:event.requestId}).catch(error => { failure = error })
  })
  await cdp.send('Fetch.enable', {patterns:[{urlPattern:'*/draft',requestStage:'Request'}]})
  try {
    await action(async () => {
      await eventually(() => { if (failure) throw failure; return paused }, {label:'held preview save request'})
    })
    if (failure) throw failure
  } finally {
    if (paused) await cdp.send('Fetch.continueRequest', {requestId:paused})
    dispose()
    await cdp.send('Fetch.disable')
  }
}
async function snapshot() {
  return cdp.evaluate(`(async () => {
    const get = async path => {
      const response = await fetch(path, {headers:{'X-Motion-Manga-Local':'1'},credentials:'same-origin',cache:'no-store'});
      if (!response.ok) throw new Error('Durable checkpoint request failed: ' + response.status);
      return response;
    };
    const {projects} = await (await get('/api/local-projects')).json();
    if (projects.length !== 1) throw new Error('Expected one synthetic page');
    const base = '/api/local-projects/' + projects[0].id;
    const {draft} = await (await get(base + '/draft')).json();
    const {artifact} = await (await get(base + '/artifacts/latest')).json();
    const digest = async path => {
      const response = await get(path);
      if (!response.ok) throw new Error('Saved media unavailable');
      const bytes = await response.arrayBuffer();
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    };
    return {projectId:projects[0].id, draft, artifact, originalSha256:await digest(base + '/original'), videoSha256:artifact && await digest(base + '/artifacts/' + artifact.id + '/video')};
  })()`)
}
async function decodedPlayback(timeout = 15000) {
  return cdp.wait(`(() => { const v = document.querySelector('video'); return v && !v.hidden && !v.paused && v.currentTime > 0 && v.videoWidth > 0 && {width:v.videoWidth,height:v.videoHeight,duration:v.duration}; })()`, 'actual naturally decoded video playback', timeout)
}
async function downloadDisabled(hint) {
  await cdp.wait(`(() => { const button = [...document.querySelectorAll('button')].find(e => e.textContent === 'Download animation'); return button?.disabled; })()`, 'Download animation is disabled')
  if (hint) assert.ok(await cdp.evaluate(`journey.text(${JSON.stringify(hint)})`), 'The disabled download explains how to get a current After clip.')
}
async function decodeDownloadedVideo(bytes, artifact) {
  // Decode the actual downloaded bytes outside the application and browser player.
  // Use the same already-required system binary as the renderer; no dependency is added.
  const decoder = child('/snap/bin/ffmpeg', ['-hide_banner', '-i', 'pipe:0', '-map', '0:v:0', '-an', '-f', 'framemd5', '-'])
  let output = '', diagnostics = ''
  decoder.stdout.on('data', chunk => { output += chunk })
  decoder.stderr.on('data', chunk => { diagnostics += chunk })
  const timeout = setTimeout(() => decoder.kill('SIGKILL'), 30000)
  try {
    const completion = once(decoder, 'close')
    decoder.stdin.end(bytes)
    const [code] = await completion
    assert.equal(code, 0, 'The downloaded WebM must decode independently with FFmpeg.')
  } finally { clearTimeout(timeout); children.delete(decoder) }
  const durationMatch = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(diagnostics)
  assert.ok(durationMatch, 'The encoded WebM must declare finite metadata, not an unbounded browser loop.')
  const duration = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
  assert.ok(Number.isFinite(duration) && duration > 0 && duration <= 6, 'The downloaded clip is finite and no longer than six seconds.')
  assert.equal(duration, artifact.duration, 'The downloaded encoded duration matches the saved artifact, not three preview plays.')
  const dimensions = /^#dimensions 0:\s+(\d+)x(\d+)$/m.exec(output)
  assert.ok(dimensions, 'Independent decoding exposes actual video dimensions.')
  assert.deepEqual([Number(dimensions[1]), Number(dimensions[2])], [artifact.width, artifact.height])
  const frames = output.split('\n').filter(line => /^0,/.test(line)).map(line => line.split(',').map(value => value.trim()))
  assert.equal(frames.length, Math.round(artifact.duration * artifact.fps), 'Decode every frame of exactly one saved clip.')
  const uniqueFrames = new Set(frames.map(frame => frame.at(-1))).size
  assert.ok(uniqueFrames > 1, 'Independently decoded pixels must actually move; a valid static WebM is insufficient.')
  return { decoder:'system FFmpeg', duration, width:artifact.width, height:artifact.height, frames:frames.length, uniqueFrames }
}
async function downloadAfter(artifact, expectedSha256, beforeSha256, inspectBusy = false) {
  const folder = await mkdtemp(join(evidence, 'synthetic-download-'))
  await chmod(folder, 0o700)
  const started = [], progress = new Map()
  const disposeStart = browserCdp.on('Browser.downloadWillBegin', event => started.push(event))
  const disposeProgress = browserCdp.on('Browser.downloadProgress', event => progress.set(event.guid, event))
  // Automation-only permission for this newly launched synthetic-test browser.
  // This changes no user's browser settings and is not a production policy bypass.
  await browserCdp.send('Browser.setDownloadBehavior', {behavior:'allow', downloadPath:folder, eventsEnabled:true})
  const renders = renderRequests.length, videos = videoRequests.length
  let held, interceptFailure, disposeHeld, busyLayout
  if (inspectBusy) {
    disposeHeld = cdp.on('Fetch.requestPaused', event => {
      if (!held && event.request.method === 'GET' && new URL(event.request.url).pathname === `/api/local-projects/${artifact.projectId}/artifacts/${artifact.id}/video`) held = event.requestId
      else void cdp.send('Fetch.continueRequest', {requestId:event.requestId}).catch(error=>{ interceptFailure=error })
    })
    await cdp.send('Fetch.enable', {patterns:[{urlPattern:'*/artifacts/*/video',requestStage:'Request'}]})
  }
  try {
    await click('Download animation')
    if (inspectBusy) {
      await eventually(()=>{ if (interceptFailure) throw interceptFailure; return held }, {label:'held native download media request'})
      const heavy = heavyRequests.length
      busyLayout = await captureBusy('preparing-download',[390,320],{download:true})
      assert.equal(heavyRequests.length,heavy,'Preparing-download layout checks do not request heavy work.')
      await cdp.send('Fetch.continueRequest',{requestId:held}); held=undefined
      disposeHeld(); disposeHeld=undefined
      await cdp.send('Fetch.disable')
    }
    const download = await eventually(() => started[0], {label:'native browser download begins after trusted pointer click'})
    assert.match(download.suggestedFilename, /^[A-Za-z0-9][A-Za-z0-9._-]*\.webm$/, 'The browser receives a safe WebM filename.')
    assert.ok(!download.suggestedFilename.includes('..'), 'The suggested filename must not contain path traversal.')
    const completed = await eventually(() => {
      const event = progress.get(download.guid)
      if (event?.state === 'canceled') throw new Error('Native browser download was canceled.')
      return event?.state === 'completed' && event
    }, {label:'native browser download completes', timeout:30000})
    assert.equal(started.length, 1, 'One explicit click creates exactly one native download.')
    const names = await readdir(folder)
    assert.deepEqual(names, [download.suggestedFilename], 'The completed native download exists without partial or unexpected files.')
    const path = join(folder, names[0])
    await chmod(path, 0o600)
    const bytes = await readFile(path)
    assert.ok(bytes.length > 0)
    assert.equal(completed.totalBytes, bytes.length)
    assert.equal(completed.receivedBytes, bytes.length)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    assert.equal(sha256, expectedSha256, 'The actual downloaded file must exactly match the current saved After artifact.')
    assert.notEqual(sha256, beforeSha256, 'Download must not silently export the previous Before artifact.')
    assert.deepEqual(videoRequests.slice(videos), [`/api/local-projects/${artifact.projectId}/artifacts/${artifact.id}/video`], 'The download retrieves exactly the current artifact through the existing authenticated endpoint.')
    assert.equal(renderRequests.length, renders, 'Downloading a completed artifact must not create a render job.')
    const decoded = await decodeDownloadedVideo(bytes, artifact)
    return {path,filename:names[0],bytes:bytes.length,sha256,beforeSha256,artifactId:artifact.id,nativeDownloadCompleted:true,trustedPointer:true,renderRequestsAdded:0,...(busyLayout ? {busyLayout} : {}),...decoded}
  } finally {
    disposeStart(); disposeProgress()
    if (held) await cdp.send('Fetch.continueRequest',{requestId:held})
    if (disposeHeld) { disposeHeld(); await cdp.send('Fetch.disable') }
    await browserCdp.send('Browser.setDownloadBehavior', {behavior:'default', eventsEnabled:false})
  }
}
async function staticPlayback() {
  await cdp.wait(`document.querySelector('video')?.hidden && !document.querySelector('.local-playback img')?.hidden`, 'static original after playback')
}
async function playAndStop() {
  await click('Play')
  const metadata = await decodedPlayback()
  const beforeRestart = await cdp.wait(`(() => { const v = document.querySelector('video'); return v.currentTime > .3 && v.currentTime; })()`, 'playhead advancement before Restart')
  await click('Restart')
  await cdp.wait(`(() => { const v = document.querySelector('video'); return !v.paused && v.currentTime < ${beforeRestart}; })()`, 'Restart resets the real video playhead')
  const requests = videoRequests.length
  await click('Static')
  await staticPlayback()
  assert.equal(videoRequests.length, requests, 'Static must not fetch another video.')
  return metadata
}
async function settleLayout() {
  // Settle responsive layout only; never advance or restart video playback.
  await cdp.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
}
async function screenshot(name, width, area) {
  const path = join(evidence, `${name}-${width}-${area}.png`)
  const { data } = await cdp.send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false})
  await writeFile(path, Buffer.from(data, 'base64'), {mode:0o600})
  const result = {path,viewport:width,area}
  report.screenshots.push(result)
  return result
}
async function actionLayout() {
  return cdp.evaluate(`(() => {
    const editor = document.querySelector('.page-editor'), header = editor.querySelector('.page-editor__header');
    const canvas = editor.querySelector('.page-editor__canvas');
    const group = name => editor.querySelector('[role="group"][aria-label="' + name + '"]');
    const box = e => { const b = e.getBoundingClientRect(); return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}; };
    const buttons = e => [...(e?.querySelectorAll('button') || [])].map(button => ({label:button.textContent.trim(),disabled:button.disabled,...box(button)}));
    const save = group('Draft actions'), history = group('Edit history'), preview = group('Preview actions');
    const compare = group('Compare previews'), download = group('Animation download');
    const state = editor.querySelector('[role="status"][aria-label="Draft save status"]');
    const downloadButton = download?.querySelector('button'), description = downloadButton?.getAttribute('aria-describedby');
    return {viewport:innerWidth,viewportHeight:innerHeight,availableWidth:document.documentElement.clientWidth,documentWidth:document.documentElement.scrollWidth,
      saveGlobal:!!save && header.contains(save),saveStatusGlobal:!!state && header.contains(state),saveStatus:state?.textContent,saveStatusBox:state && box(state),
      historyLocal:!!history && canvas.contains(history) && !header.contains(history),previewLocal:!!preview && canvas.contains(preview),
      previewPosition:preview && getComputedStyle(preview).position,
      resultLocal:!!compare && !!download && canvas.contains(compare) && compare.parentElement === download.parentElement,
      primaryActions:[...editor.querySelectorAll('.page-editor__primary')].map(e=>e.textContent.trim()),
      groups:{save:buttons(save),history:buttons(history),preview:buttons(preview),compare:buttons(compare),download:buttons(download)},
      download:downloadButton && {secondary:!downloadButton.classList.contains('page-editor__primary'),disabled:downloadButton.disabled,
        description:description && description.split(/\\s+/).map(id=>document.getElementById(id)?.textContent || '').join(' '),...box(downloadButton)}};
  })()`)
}
function assertActionLayout(metrics) {
  assert.ok(metrics.documentWidth <= metrics.availableWidth, 'Action layout must not overflow the usable viewport, including its scrollbar gutter.')
  assert.ok(metrics.saveGlobal && metrics.saveStatusGlobal, 'Save and truthful draft status belong together in the global editor header.')
  assert.ok(metrics.historyLocal && metrics.previewLocal, 'Undo/Redo and the primary preview action belong to the canvas, not the global header.')
  assert.equal(metrics.primaryActions.length, 1, 'There must be exactly one primary editor action.')
  assert.deepEqual(metrics.groups.save.map(e=>e.label), ['Save draft'])
  assert.deepEqual(metrics.groups.history.map(e=>e.label), ['Undo','Redo'])
  for (const [name, buttons] of Object.entries(metrics.groups)) for (const button of buttons) {
    assert.ok(button.width >= 44 && button.height >= 44, `${name}: ${button.label} must retain a 44 CSS-pixel touch target.`)
    assert.ok(button.left >= 0 && button.right <= metrics.availableWidth, `${name}: ${button.label} must not clip horizontally.`)
  }
  const overlaps = (a,b) => Math.max(a.left,b.left)<Math.min(a.right,b.right) && Math.max(a.top,b.top)<Math.min(a.bottom,b.bottom)
  for (const buttons of Object.values(metrics.groups)) for (let index=0; index<buttons.length; index++) for (const other of buttons.slice(index+1)) assert.ok(!overlaps(buttons[index],other), 'Action buttons must not overlap.')
  assert.ok(!overlaps(metrics.groups.save[0],metrics.saveStatusBox), 'Save status must not overlap its global Save action.')
  if (metrics.download) {
    assert.ok(metrics.resultLocal, 'Download belongs beside Before/After in the result action area.')
    assert.ok(metrics.download.secondary, 'Download remains secondary to the single preview/edit action.')
    if (metrics.download.disabled && metrics.groups.download[0].label === 'Download animation') assert.ok(metrics.download.description?.trim(), 'An unavailable download must have an associated explanation.')
  }
}
async function keyboardFocus(label) {
  // Trusted native Tab input only: no evaluate().click(), focus(), or activation grant.
  for (let count = 0; count < 128; count++) {
    await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
    await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
    if (!await cdp.evaluate(`(() => { const e = document.activeElement; return e?.tagName === 'BUTTON' && (e.getAttribute('aria-label') || e.textContent).trim() === ${JSON.stringify(label)}; })()`)) continue
    await settleLayout()
    const focus = await cdp.evaluate(`(() => {
      const e = document.activeElement, b = e.getBoundingClientRect(), style = getComputedStyle(e);
      // Probe inside the rounded button, not its transparent corner pixels.
      const inset = Math.min(8,b.width/4,b.height/4);
      const points = [[b.left+inset,b.top+inset],[b.right-inset,b.top+inset],[b.left+inset,b.bottom-inset],[b.right-inset,b.bottom-inset],[(b.left+b.right)/2,(b.top+b.bottom)/2]];
      return {label:e.textContent.trim(),focusVisible:e.matches(':focus-visible'),outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth),outlineColor:style.outlineColor,boxShadow:style.boxShadow,
        fullyVisible:b.left>=0 && b.right<=document.documentElement.clientWidth && b.top>=0 && b.bottom<=document.documentElement.clientHeight,
        unobscured:points.every(([x,y])=>{ const hit=document.elementFromPoint(x,y); return hit===e || e.contains(hit); })};
    })()`)
    assert.ok(focus.focusVisible && ((focus.outline !== 'none' && focus.outlineWidth > 0 && focus.outlineColor !== 'rgba(0, 0, 0, 0)') || focus.boxShadow !== 'none'), `${label} must expose a visible keyboard focus indicator.`)
    assert.ok(focus.fullyVisible && focus.unobscured, `${label} keyboard focus must be fully visible and not occluded.`)
    return {...focus,nativeInput:true}
  }
  assert.fail(`Native Tab navigation did not reach ${label}.`)
}
async function capture(name, width, expectDownload = true) {
  await cdp.evaluate(`void (window.journeyLayoutVideo = document.querySelector('video'))`)
  const heavy = heavyRequests.length, videos = videoRequests.length
  await cdp.send('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false})
  await cdp.evaluate(`document.querySelector('.page-editor').scrollIntoView({block:'start'})`)
  await settleLayout()
  const metrics = await actionLayout()
  assertActionLayout(metrics)
  const preview = await cdp.evaluate(`document.querySelector('.page-editor__view--compare') !== null`)
  if (expectDownload && preview) assert.ok(metrics.download, 'A saved preview exposes its result-local download.')
  else assert.equal(metrics.download, undefined, 'Editing must not expose a result download outside Preview.')
  const framing = await cdp.evaluate(`(() => {
    const frame = document.querySelector('.page-editor__canvas');
    const media = [...frame.querySelectorAll('img,video')].find(e=>!e.hidden && e.getBoundingClientRect().width>0);
    const box = e => { const b=e.getBoundingClientRect(); return {width:b.width,height:b.height}; };
    return {canvas:box(frame),media:{...box(media),offsetTop:media.getBoundingClientRect().top-frame.getBoundingClientRect().top}};
  })()`)
  const top = await screenshot(name,width,'top')
  await cdp.evaluate(`document.querySelector('.page-editor__canvas-actions').scrollIntoView({block:'start'})`)
  await settleLayout()
  const visible = await actionLayout()
  for (const button of visible.groups.preview) assert.ok(button.top>=0 && button.bottom<=visible.viewportHeight, 'The primary action must be visible in its action-area screenshot.')
  if (visible.download) assert.ok(visible.download.top>=0 && visible.download.bottom<=visible.viewportHeight, 'Result-local Download must be visible in its action-area screenshot.')
  const actions = await screenshot(name,width,'actions')
  assert.ok(await cdp.evaluate(`window.journeyLayoutVideo === document.querySelector('video')`), 'Responsive capture must not remount the current video.')
  assert.equal(heavyRequests.length,heavy,'Responsive capture must not request heavy work.')
  assert.equal(videoRequests.length,videos,'Responsive capture must not request another video.')
  return {...top,actions,...metrics,...framing}
}
async function captureBusy(name, widths, {cancel=false,download=false} = {}) {
  const captures = []
  for (const width of widths) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false})
    await cdp.evaluate(`document.querySelector('.page-editor__canvas-actions').scrollIntoView({block:'start'})`)
    await settleLayout()
    const metrics = await actionLayout()
    assertActionLayout(metrics)
    if (cancel) {
      assert.ok(metrics.saveStatus.includes('Saving'), 'Held save must honestly report saving, not saved.')
      assert.ok(metrics.groups.preview.some(e=>e.label==='Preparing preview…' && e.disabled))
      assert.ok(metrics.groups.preview.some(e=>e.label==='Cancel preview' && !e.disabled))
      captures.push({metrics,focus:await keyboardFocus('Cancel preview'),screenshot:await screenshot(name,width,'cancel-focus')})
    } else {
      if (download) assert.ok(metrics.groups.download.some(e=>e.label==='Preparing download…' && e.disabled))
      captures.push({metrics,screenshot:await screenshot(name,width,'busy-actions')})
    }
  }
  return captures
}
async function inspectorDock(width) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false})
  await cdp.evaluate(`journey.field('Intensity').scrollIntoView({block:'center'})`)
  await settleLayout()
  const metrics = await actionLayout()
  assertActionLayout(metrics)
  assert.equal(metrics.previewPosition, 'fixed', 'The mobile primary action stays available while editing the inspector.')
  const primary = metrics.groups.preview.find(e=>e.label==='Preview changes')
  assert.ok(primary && primary.top>=0 && primary.bottom<=metrics.viewportHeight, 'Preview changes is visible at inspector scroll position without top-scroll.')
  const inspector = await cdp.evaluate(`(() => { const e=journey.field('Intensity'),b=e.getBoundingClientRect(); const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2); return {visible:b.top>=0 && b.bottom<=innerHeight,unobscured:hit===e || e.contains(hit)}; })()`)
  assert.ok(inspector.visible && inspector.unobscured, 'The dock must not occlude the inspector control.')
  return {metrics,inspector,screenshot:await screenshot('dense-inspector',width,'mobile-dock'),focus:await keyboardFocus('Preview changes')}
}
async function assertNeverAutoplays() {
  const requests = videoRequests.length
  await click('Preview')
  await cdp.wait(`!!document.querySelector('.local-playback img')?.naturalWidth && !!document.querySelector('video')`, 'saved preview opened statically')
  assert.ok(await cdp.evaluate(`document.querySelector('video').hidden && document.querySelector('video').paused && !document.querySelector('video').getAttribute('src')`))
  assert.equal(videoRequests.length, requests, 'Opening a saved preview must not fetch or play video.')
}

try {
  await check('preflight', async () => {
    assert.ok(typeof WebSocket === 'function', 'Node with built-in WebSocket is required.')
    await Promise.all(['dist/index.html', 'dist-server/scripts/self-hosted/server.js'].map(file => access(join(root, file))))
    await access(chromePath)
  })
  const image = join(temporary, 'synthetic-page.png'), invalid = join(temporary, 'invalid.png')
  const width = 192, height = 416, pixels = Buffer.alloc(width * height * 3, 245)
  for (let y = 70; y < 170; y++) for (let x = 55; x < 135; x++) {
    const index = (y * width + x) * 3
    pixels[index] = 40; pixels[index + 1] = 90; pixels[index + 2] = 180
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(image)
  await writeFile(invalid, 'This is not an image.', { mode: 0o600 })
  let origin, firstArtifact, currentArtifact, firstVideoSha256, currentVideoSha256, previousVideoSha256
  await check('isolated account login', async () => { origin = await startServer(true); await startBrowser(origin, 1) })
  await check('rejected upload retains retry selection', async () => {
    await upload(invalid)
    await cdp.wait(`journey.alert('Your selected file is kept.')`, 'upload rejection')
    assert.equal(await cdp.evaluate(`document.querySelector('input[type=file]').files[0]?.name`), 'invalid.png')
    assert.equal(await cdp.evaluate(`document.querySelectorAll('.page-card').length`), 0)
  })
  await check('UI upload and editable original without heavy requests', async () => {
    const requests = heavyRequests.length
    await upload(image)
    await cdp.wait(`journey.text('Add a part') && !journey.text('Loading editable draft')`, 'uploaded page editor')
    await click('Add part')
    await cdp.wait(`!!document.querySelector('.selection-surface img')?.naturalWidth && !!document.querySelector('.selection-surface svg')`, 'decoded selection image and committed selection surface')
    await details('Part inspector')
    await details('Edit selection')
    await fill('Part label', 'Synthetic actor')
    const box = await cdp.evaluate(`(() => { const e = document.querySelector('.selection-surface img'); e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height}; })()`)
    const from = { x: box.x + box.width * .25, y: box.y + box.height * .25 }, to = { x: box.x + box.width * .75, y: box.y + box.height * .75 }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', buttons: 1, clickCount: 1 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...to, button: 'left', buttons: 1 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, button: 'left', buttons: 0, clickCount: 1 })
    await details('Advanced')
    const selectionWidth = Number(await cdp.evaluate(`journey.field('Selection width').value`))
    assert.ok(Math.abs(selectionWidth - .5) < .02, `Real pointer selection must change the draft; got width ${selectionWidth}, image ${JSON.stringify(box)}.`)
    await fill('Scene duration', '1.2')
    await fill('Frames per second', '10')
    await click('Rotate / sway')
    assert.equal(await cdp.evaluate(`journey.field('Movement').value`), 'rotate')
    await fill('Intensity', '60')
    assert.equal(await cdp.evaluate(`journey.field('Intensity').value`), '60')
    await click('Undo')
    assert.equal(await cdp.evaluate(`journey.field('Intensity').value`), '50', 'Undo restores the prior movement settings.')
    assert.equal(heavyRequests.length, requests, 'Selection, presets, sliders and Undo must not render or invoke a model.')
  })
  await check('failed save preserves edits and explicit retry', async () => {
    await failNextSave(async () => {
      await click('Save draft')
      await cdp.wait(`journey.alert('Simulated save unavailable.')`, 'save failure alert')
      assert.equal(await cdp.evaluate(`journey.field('Part label').value`), 'Synthetic actor')
      assert.ok(await cdp.evaluate(`journey.text('unsaved changes.') && [...document.querySelectorAll('button')].some(e => e.textContent === 'Save draft' && !e.disabled)`))
    })
    await save()
  })
  await check('one-click preview naturally plays matching rendered output', async () => {
    const renders = renderRequests.length, videos = videoRequests.length
    await click('Preview changes')
    const metadata = await decodedPlayback(60000)
    await cdp.wait(`journey.text('Ready. Compare Before and After, or continue editing.')`, 'matching preview ready')
    assert.equal(renderRequests.length, renders + 1, 'One click requests exactly one render.')
    const played = videoRequests.slice(videos)
    const rendered = await snapshot()
    firstArtifact = rendered.artifact
    firstVideoSha256 = rendered.videoSha256
    assert.deepEqual(played, [`/api/local-projects/${firstArtifact.projectId}/artifacts/${firstArtifact.id}/video`])
    assert.ok(await cdp.evaluate(`document.querySelector('video').muted && document.querySelector('video').playsInline`))
    await cdp.wait(`document.querySelector('video')?.hidden && document.querySelector('video')?.ended`, 'one natural preview play returns to Static', 10000)
    await click('Before')
    await cdp.wait(`journey.text('Before · original (no previous preview)') && !document.querySelector('video')`, 'first preview has explicitly labelled original fallback')
    await click('After')
    await decodedPlayback()
    await click('Static')
    await staticPlayback()
    return { ...metadata, artifactId:firstArtifact.id, naturalAutoplay:true, autoplayBypass:false }
  })
  await check('edit and comparison retain same framing at desktop and narrow widths', async () => {
    await click('Continue editing')
    await details('Part inspector')
    const requests = heavyRequests.length
    await fill('Intensity', '40')
    assert.equal(heavyRequests.length, requests, 'A changed slider does not request heavy work.')
    // Keep exact raw settings visible only when needed; the normal edit capture stays focused.
    await cdp.evaluate(`(() => { const advanced = [...document.querySelectorAll('summary')].find(e=>e.textContent==='Advanced'); if(advanced?.parentElement.open) advanced.click(); })()`)
    const editDesktop = await capture('edit', 1440), editNarrow = await capture('edit', 390)
    assert.equal(heavyRequests.length, requests)
    const videos = videoRequests.length, renders = renderRequests.length
    await click('Preview changes')
    const metadata = await decodedPlayback(60000)
    const played = videoRequests.slice(videos)
    const rendered = await snapshot()
    currentArtifact = rendered.artifact
    currentVideoSha256 = rendered.videoSha256
    assert.notEqual(currentArtifact.id, firstArtifact.id)
    assert.equal(renderRequests.length, renders + 1)
    assert.deepEqual(played, [`/api/local-projects/${currentArtifact.projectId}/artifacts/${currentArtifact.id}/video`])
    const comparisons = []
    for (const width of [1440, 390]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false})
      let videos = videoRequests.length
      await click('Before')
      await decodedPlayback()
      assert.deepEqual(videoRequests.slice(videos), [`/api/local-projects/${firstArtifact.projectId}/artifacts/${firstArtifact.id}/video`])
      const before = await capture('before', width)
      videos = videoRequests.length
      await click('After')
      await decodedPlayback()
      assert.deepEqual(videoRequests.slice(videos), [`/api/local-projects/${currentArtifact.projectId}/artifacts/${currentArtifact.id}/video`])
      const after = await capture('after', width)
      assert.deepEqual(before.media, after.media, 'Before and After must use identical media framing.')
      assert.deepEqual(before.canvas, after.canvas, 'Comparison toggles must not resize the canvas.')
      comparisons.push({width,before,after})
    }
    assert.equal(renderRequests.length, renders + 1, 'Before/After chooses saved outputs without rendering again.')
    await cdp.send('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false})
    await click('Static')
    await staticPlayback()
    return { edit:[editDesktop,editNarrow], comparisons, beforeArtifactId:firstArtifact.id, afterArtifactId:currentArtifact.id, ...metadata }
  })
  await check('finite three-play preview naturally returns static', async () => {
    await cdp.evaluate(`window.journeyEnded = 0; document.addEventListener('ended', e => { if(e.target instanceof HTMLVideoElement) window.journeyEnded++; }, true)`)
    await click('Loop preview (3 plays)')
    await cdp.wait(`window.journeyEnded === 3 && document.querySelector('video')?.hidden && !document.querySelector('.local-playback img')?.hidden`, 'three natural ended events and static return', 20000)
    assert.equal(await cdp.evaluate(`document.querySelector('video').loop`), false)
    return { naturalEndedEvents: await cdp.evaluate('window.journeyEnded') }
  })
  await check('reduced motion is static and does not fetch video', async () => {
    // Remount playback so an existing decoded URL cannot hide an accidental new fetch.
    await click('Edit')
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    let videoRequests = 0
    const dispose = cdp.on('Network.requestWillBeSent', event => { if (/\/artifacts\/[^/]+\/video$/.test(event.request.url)) videoRequests++ })
    try {
      await click('Preview')
      await cdp.wait(`journey.text('Reduced motion is enabled. Reading stays static.')`, 'reduced motion static mode')
      assert.ok(await cdp.evaluate(`(() => { const controls = [...document.querySelectorAll('.local-playback button')].filter(e => ['Play','Restart','Loop preview (3 plays)'].includes(e.textContent)); return controls.length === 3 && controls.every(e => e.disabled) && !document.querySelector('video') && !document.querySelector('.local-playback img').hidden; })()`))
      assert.equal(videoRequests, 0)
    } finally { dispose() }
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await cdp.wait(`!!document.querySelector('video') && ![...document.querySelectorAll('.local-playback button')].find(e => e.textContent === 'Play').disabled`, 'motion preference recovery')
  })
  await check('reduced motion permits explicit native download without playback', async () => {
    await cdp.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]})
    try {
      await cdp.wait(`journey.text('Reduced motion is enabled. Reading stays static.')`, 'static reduced-motion mode before explicit download')
      const download = await downloadAfter(currentArtifact, currentVideoSha256, firstVideoSha256)
      assert.ok(await cdp.evaluate(`!document.querySelector('video') && !document.querySelector('.local-playback img').hidden`), 'Explicit download does not start in-app playback under reduced motion.')
      return {...download,reducedMotion:true,staticPlayback:true}
    } finally {
      await cdp.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
      await cdp.wait(`!!document.querySelector('video')`, 'ordinary playback controls restored after explicit download')
    }
  })
  await check('native repeat movement retains speed and intensity intent in saved rendered output', async () => {
    await click('Continue editing')
    await details('Part inspector')
    await cdp.send('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false})
    await cdp.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
    const controlLayout = await cdp.evaluate(`(() => {
      const speed = document.querySelector('input[aria-label="Speed"]');
      const repeat = journey.field('Repeat movement');
      repeat.scrollIntoView({block:'center'});
      const box = element => { const b = element.getBoundingClientRect(); return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}; };
      return {speed:box(speed),repeat:box(repeat)};
    })()`)
    assert.ok(controlLayout.speed.width > 0 && controlLayout.repeat.width > 0, 'Speed and Repeat movement controls must be visible.')
    assert.ok(controlLayout.speed.right <= controlLayout.repeat.left, 'Repeat movement must sit beside Speed at desktop width, not below it.')
    assert.ok(Math.max(controlLayout.speed.top, controlLayout.repeat.top) < Math.min(controlLayout.speed.bottom, controlLayout.repeat.bottom), 'Speed and Repeat movement must overlap vertically in the same desktop row.')
    await details('Advanced')
    const controls = () => cdp.evaluate(`({
      repeat:journey.field('Repeat movement').checked,
      speed:document.querySelector('input[aria-label="Speed"]').value,
      intensity:journey.field('Intensity').value,
      cycles:journey.field('Finite repetitions').value,
      period:journey.field('Gesture period (optional)').value,
      duration:journey.field('Movement duration').value
    })`)
    const heavy = heavyRequests.length
    assert.equal((await controls()).repeat, false, 'Existing single-movement drafts remain opt-out.')
    assert.equal((await controls()).cycles, '1')
    await fill('Scene duration', '6')
    await toggleCheckbox('Repeat movement')
    const medium = await controls()
    assert.deepEqual(medium, {repeat:true,speed:'2',intensity:'40',cycles:'5',period:'1.2',duration:'1.2'})
    await stepSlider('Speed', 'ArrowRight')
    const fast = await controls()
    assert.deepEqual(fast, {...medium,speed:'3',cycles:'10',period:'0.6',duration:'0.6'})
    await stepSlider('Speed', 'ArrowLeft')
    await stepSlider('Speed', 'ArrowLeft')
    const slow = await controls()
    assert.deepEqual(slow, {...medium,speed:'1',cycles:'3',period:'2',duration:'2'})
    await stepSlider('Speed', 'ArrowRight')
    await stepSlider('Intensity', 'ArrowRight')
    const adjusted = await controls()
    assert.deepEqual(adjusted, {...medium,intensity:'41'}, 'Native slider updates preserve repeat intent and speed timing.')
    await toggleCheckbox('Repeat movement')
    assert.deepEqual(await controls(), {...adjusted,repeat:false,cycles:'1'}, 'Opting out restores one movement at the selected speed.')
    await toggleCheckbox('Repeat movement')
    assert.deepEqual(await controls(), adjusted)
    assert.equal(heavyRequests.length, heavy, 'Repeat and native slider adjustments do not render or invoke models.')
    await save()
    const saved = await snapshot()
    assert.equal(saved.draft.duration, '6')
    const motion = saved.draft.regions[0].motion
    assert.equal(motion.repeat, true, 'The explicit repeat flag, not only derived cycle count, must be durable.')
    assert.equal(motion.cycles, '5')
    assert.equal(motion.period, '1.2')
    assert.equal(motion.duration, '1.2')
    const renders = renderRequests.length, videos = videoRequests.length
    await click('Preview changes')
    const metadata = await decodedPlayback(60000)
    const played = videoRequests.slice(videos)
    const rendered = await snapshot()
    previousVideoSha256 = currentVideoSha256
    currentArtifact = rendered.artifact
    currentVideoSha256 = rendered.videoSha256
    assert.equal(renderRequests.length, renders + 1)
    assert.deepEqual(rendered.draft.regions[0].motion, motion, 'Preview preparation preserves the saved repeat settings.')
    assert.equal(currentArtifact.draftRevision, rendered.draft.revision, 'The rendered clip matches the revision saved by Preview changes.')
    assert.equal(currentArtifact.duration, 6)
    assert.ok(metadata.duration > 0 && metadata.duration <= 6.1, 'The real decoded output remains a finite six-second clip.')
    assert.deepEqual(played, [`/api/local-projects/${currentArtifact.projectId}/artifacts/${currentArtifact.id}/video`])
    await cdp.wait(`document.querySelector('video')?.hidden && document.querySelector('video')?.ended`, 'one repeat-enabled clip naturally returns to static', 15000)
    await staticPlayback()
    return {nativeInput:true,controlLayout,medium,fast,slow,adjusted,repeatPersisted:true,artifactId:currentArtifact.id,...metadata}
  })
  await check('native download exports the current finite moving After WebM, never Before', async () => {
    await click('Before')
    await downloadDisabled('Switch to After to download the current animation.')
    await click('After')
    await decodedPlayback()
    await click('Static')
    await staticPlayback()
    return downloadAfter(currentArtifact, currentVideoSha256, previousVideoSha256, true)
  })
  await check('cancel pending preview keeps edits and never starts rendering', async () => {
    await click('Continue editing')
    await details('Part inspector')
    await fill('Intensity', '45')
    await cdp.wait(`!document.querySelector('.page-editor__download')`, 'result download is absent while editing')
    await click('Preview')
    await downloadDisabled('Preview changes before downloading the current animation.')
    await click('Edit')
    const renders = renderRequests.length, videos = videoRequests.length
    let pendingLayout
    await pauseNextSave(async ready => {
      await click('Preview changes')
      await ready()
      const heavy = heavyRequests.length
      pendingLayout = await captureBusy('pending-save', [390,320], {cancel:true})
      assert.equal(heavyRequests.length, heavy, 'Responsive pending-save checks must not request heavy work.')
      await click('Cancel preview')
      await cdp.wait(`![...document.querySelectorAll('button')].some(e=>e.textContent === 'Cancel preview') && [...document.querySelectorAll('button')].some(e=>e.textContent === 'Preview changes')`, 'cancel removes the pending preview controls while saving settles')
      assert.equal(await cdp.evaluate(`journey.field('Intensity').value`), '45')
    })
    await cdp.wait(`journey.text('Draft saved.')`, 'released cancelled preview save settles')
    assert.equal(renderRequests.length, renders, 'Cancelling a pending save must prevent a later render.')
    assert.equal(videoRequests.length, videos, 'Cancelled intent must never start playback.')
    await click('Preview')
    return {pendingLayout,renderRequestsAdded:0,nativeInput:true}
  })
  await check('invalid render keeps last valid playable output', async () => {
    await click('Edit')
    await details('Part inspector'); await details('Advanced')
    await fill('Rotation angle', '-')
    await click('Preview changes')
    await cdp.wait(`journey.alert('Your draft and last valid preview are kept.')`, 'invalid render correction guidance')
    assert.equal((await snapshot()).artifact.id, currentArtifact.id)
    await click('Preview')
    await playAndStop()
    await click('Edit')
    await fill('Rotation angle', '6')
    await save()
  })
  let before
  await check('durable draft artifact and unchanged original checkpoint', async () => {
    before = await snapshot()
    assert.equal(before.draft.regions[0].label, 'Synthetic actor')
    assert.equal(before.draft.regions[0].motion.type, 'rotate')
    assert.equal(before.draft.regions[0].motion.repeat, true)
    assert.ok(before.artifact?.id)
    assert.equal(before.originalSha256, createHash('sha256').update(await readFile(image)).digest('hex'), 'The imported original bytes remain unchanged.')
  })
  await check('close browser and server then reopen durable draft and artifact', async () => {
    cdp.close(); cdp = undefined
    browserCdp.close(); browserCdp = undefined
    await stop(browser); browser = undefined
    await stop(server); server = undefined
    origin = await startServer()
    await startBrowser(origin, 2)
    await click('Open synthetic-page.png')
    await cdp.wait(`journey.text('Synthetic actor') && !journey.text('Loading editable draft')`, 'reopened saved editor')
    assert.deepEqual(await snapshot(), before, 'Saved draft and last valid artifact must survive server and browser restart.')
    assert.ok(await cdp.evaluate(`journey.field('Repeat movement').checked`), 'Repeat remains enabled after a complete browser and server restart.')
    await assertNeverAutoplays()
    const metadata = await playAndStop()
    return { draftRevision: before.draft.revision, artifactRestored: true, ...metadata }
  })
  await check('stopped-store backup restore preserves original draft and playable artifact', async () => {
    cdp.close(); cdp = undefined
    browserCdp.close(); browserCdp = undefined
    await stop(browser); browser = undefined
    await stop(server); server = undefined
    const backup = join(temporary, 'backup'), restored = join(temporary, 'accounts-restored')
    await backupStore({ source: accountRoot, destination: backup, serverStopped: true })
    await restoreStore({ source: backup, destination: restored, serverStopped: true })
    accountRoot = restored
    origin = await startServer()
    await startBrowser(origin, 3)
    await click('Open synthetic-page.png')
    await cdp.wait(`journey.text('Synthetic actor') && !journey.text('Loading editable draft')`, 'restored saved editor')
    assert.deepEqual(await snapshot(), before, 'Restored account must retain exact original/video hashes and complete draft/artifact metadata.')
    await assertNeverAutoplays()
    const metadata = await playAndStop()
    return { exactOriginalHash: true, exactVideoHash: true, draftAndArtifactRestored: true, ...metadata }
  })
  await check('dense full-size portrait workspace at desktop and narrow widths', async () => {
    // A separate full-size synthetic page exercises intrinsic image fit; cheap fixtures cannot.
    const portrait = join(temporary, 'synthetic-portrait.png'), portraitWidth = 1170, portraitHeight = 2532
    const portraitPixels = Buffer.alloc(portraitWidth * portraitHeight * 3, 245)
    for (let part = 0; part < 14; part++) for (let y = 100 + Math.floor(part / 2) * 330; y < 280 + Math.floor(part / 2) * 330; y++) for (let x = 100 + part % 2 * 600; x < 280 + part % 2 * 600; x++) {
      const index = (y * portraitWidth + x) * 3
      portraitPixels[index] = 40; portraitPixels[index + 1] = 90; portraitPixels[index + 2] = 180
    }
    await sharp(portraitPixels, {raw:{width:portraitWidth,height:portraitHeight,channels:3}}).png().toFile(portrait)
    await click('Back to pages')
    await upload(portrait)
    await cdp.wait(`journey.text('Add a part') && !journey.text('Loading editable draft')`, 'full-size synthetic portrait editor')
    const heavy = heavyRequests.length
    for (let index = 1; index <= 14; index++) {
      await click('Add part')
      await details('Part inspector')
      await details('Edit selection')
      await fill('Part label', `Synthetic part ${index}`)
    }
    await cdp.evaluate(`journey.fill('Selected part', journey.field('Selected part').options[0].value)`)
    await cdp.wait(`!!document.querySelector('.selection-surface img')?.naturalWidth`, 'decoded full-size working image')
    await details('Advanced')
    await fill('Scene duration', '1.2')
    await fill('Frames per second', '10')
    await fill('Selection X', '0.08'); await fill('Selection Y', '0.04')
    await fill('Selection width', '0.2'); await fill('Selection height', '0.1')
    await click('Rotate / sway')
    await cdp.evaluate(`(() => { const advanced = [...document.querySelectorAll('summary')].find(e=>e.textContent==='Advanced'); if(advanced?.parentElement.open) advanced.click(); })()`)
    const edits = [], inspector = []
    // Restore the same draft after exercising both history actions with trusted input.
    await click('Undo'); await click('Redo')
    for (const width of [1440,390,320]) {
      const edit = await capture('dense-edit',width,false)
      edit.focus = []
      for (const label of ['Save draft','Undo','Preview changes']) edit.focus.push(await keyboardFocus(label))
      edit.focusScreenshot = await screenshot('dense-edit',width,'keyboard-focus')
      edits.push(edit)
      if (width<1440) inspector.push(await inspectorDock(width))
    }
    assert.equal(heavyRequests.length, heavy, 'Dense selection editing does not render or request a model.')
    const renders = renderRequests.length
    await click('Preview changes')
    const metadata = await decodedPlayback(60000)
    assert.equal(renderRequests.length, renders + 1)
    const comparisons = []
    for (const width of [1440, 390, 320]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false})
      await click('Before')
      await cdp.wait(`journey.text('Before · original (no previous preview)') && !document.querySelector('video')`, 'dense original baseline')
      await downloadDisabled('Switch to After to download the current animation.')
      const original = await capture('dense-before', width)
      await click('After')
      await decodedPlayback()
      const after = await capture('dense-after', width)
      after.focus = []
      for (const label of ['Continue editing','Before','After','Download animation']) after.focus.push(await keyboardFocus(label))
      after.focusScreenshot = await screenshot('dense-after',width,'keyboard-focus')
      assert.deepEqual(original.media, after.media, 'Original fallback and saved preview retain identical framing.')
      assert.deepEqual(original.canvas, after.canvas, 'Before/After retain the same full-size portrait canvas.')
      await click('Static')
      comparisons.push({width,before:original,after})
    }
    assert.equal(renderRequests.length, renders + 1, 'Dense comparisons reuse the one successful render.')
    assert.equal(heavyRequests.length, heavy + 1, 'Dense layout, focus and comparison checks add no work beyond the explicit render.')
    return {parts:14,movingParts:1,fixture:{width:portraitWidth,height:portraitHeight,synthetic:true},edit:edits,inspector,comparisons,cssWidths:[1440,390,320],keyboardInput:'native Tab',zoomProof:false,...metadata}
  })
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.failure = { stage, message: privateError(error, [password, username]), network }
  if (cdp) {
    try {
      const {data} = await cdp.send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false})
      const path = join(evidence, 'failure.png')
      await writeFile(path, Buffer.from(data, 'base64'), {mode:0o600})
      report.failure.screenshot = path
    } catch { /* A screenshot failure must not replace the original failure. */ }
    try {
      const state = await cdp.evaluate(`({text:document.body.innerText, alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)})`)
      report.failure.browser = { text: privateError(new Error(state.text), [password, username]), alerts: state.alerts.map(text => privateError(new Error(text), [password, username])) }
    } catch { /* Diagnostics must never replace the original failure. */ }
  }
  console.error(`FAIL ${stage}: ${report.failure.message}`)
  process.exitCode = 1
} finally {
  await cleanup()
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(`Private browser evidence: ${join(evidence, 'report.json')}`)
}
