import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { modules } from '../src/app/modules'

type Status = 'passed' | 'failed' | 'warning' | 'skipped'
type Check = { name: string; status: Status; durationMs: number; log: string; detail?: string }
type Marker = { file: string; line: number; text: string }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const includeBrowser = process.argv.includes('--browser')
const startedAt = new Date().toISOString()
const reportRoot = join(root, 'artifacts', 'diagnostics')
const runDirectory = join(reportRoot, startedAt.replace(/[:.]/g, '-'))
await mkdir(runDirectory, { recursive: true })
const checks: Check[] = []
const markers: Marker[] = []
const inventoryErrors: string[] = []
let complete = false

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const groups = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : Promise.resolve(/\.(ts|tsx|css)$/.test(path) ? [path] : [])
  }))
  return groups.flat()
}
const files = [...await sourceFiles(join(root, 'src')), ...await sourceFiles(join(root, 'server'))]
for (const file of files.filter(file => !/\.(test|spec)\./.test(file))) {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
  lines.forEach((line, index) => {
    if (/\b(TODO|FIXME|HACK)\b/.test(line)) markers.push({ file: relative(root, file), line: index + 1, text: line.trim().slice(0, 200) })
  })
}
const seen = new Set<string>()
for (const module of modules) {
  if (seen.has(module.path)) inventoryErrors.push(`Duplicate route: ${module.path}`)
  seen.add(module.path)
  try { await access(join(root, module.source)) } catch { inventoryErrors.push(`Missing module source: ${module.source}`) }
  if (module.navigation !== 'hidden' && module.decision !== 'keep') inventoryErrors.push(`Deferred module in navigation: ${module.path}`)
}

async function saveReport() {
  const failed = inventoryErrors.length > 0 || checks.some(check => check.status === 'failed')
  const report = {
    schemaVersion: 1, startedAt, updatedAt: new Date().toISOString(), complete,
    status: !complete ? 'running' : failed ? 'failed' : checks.some(check => check.status !== 'passed') ? 'attention' : 'passed',
    scope: 'Local source and disposable loopback tests. No external attack target.',
    releaseReadiness: 'Blocked by the known issues in docs/RELEASE_SCOPE.md and docs/SECURITY_FINDINGS.md.',
    limitations: ['Passing checks are not a security certification.', 'Postgres integration, email delivery and real payment flows are not exercised.', 'Module completion is an explicit product assessment; markers are hints, not proven defects.'],
    sourceFileCount: files.length, modules, inventoryErrors, markers, checks,
  }
  const markdown = [
    '# BeatVault diagnostic report', '', `Started: ${startedAt}`, `Status: ${report.status}`, '',
    `Release readiness: ${report.releaseReadiness}`, '',
    '## Checks', '', '| Check | Result | Duration | Evidence |', '| --- | --- | --- | --- |',
    ...checks.map(check => `| ${check.name} | ${check.status} | ${(check.durationMs / 1000).toFixed(1)}s | ${check.log ? `[log](${check.log.replaceAll('\\', '/')})` : check.detail || '-'} |`), '',
    ...checks.filter(check => check.detail).map(check => `- ${check.name}: ${check.detail}`), '',
    '## Product scope', '', '| Section | State | Decision | Remaining work |', '| --- | --- | --- | --- |',
    ...modules.map(module => `| ${module.label} | ${module.state} | ${module.decision} | ${module.next} |`), '',
    '## Source signals', '', ...inventoryErrors.map(error => `- ERROR: ${error}`),
    ...(markers.length ? markers.map(marker => `- ${marker.file}:${marker.line}: ${marker.text}`) : ['No TODO/FIXME/HACK markers found. This does not establish feature completeness.']), '',
    '## Limits', '', ...report.limitations.map(limit => `- ${limit}`), '',
  ].join('\n')
  await writeFile(join(reportRoot, 'latest.json'), JSON.stringify(report, null, 2) + '\n')
  await writeFile(join(reportRoot, 'latest.md'), markdown)
  await writeFile(join(runDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}

async function command(name: string, executable: string, args: string[], timeoutMs = 300000, dependencyAudit = false) {
  const started = Date.now()
  console.log(`[diagnose] ${name}`)
  const result = await new Promise<{ code: number | null; output: string; timedOut: boolean }>(resolveResult => {
    let output = ''
    let timedOut = false
    const child = spawn(process.execPath, [executable, ...args], { cwd: root, windowsHide: true, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    const collect = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-4 * 1024 * 1024) }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timeout = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => child.kill())
      } else child.kill('SIGKILL')
    }, timeoutMs)
    child.on('error', error => { clearTimeout(timeout); resolveResult({ code: -1, output: error.message, timedOut: false }) })
    child.on('close', code => { clearTimeout(timeout); resolveResult({ code, output, timedOut }) })
  })
  const logPath = join(runDirectory, `${name}.log`)
  await writeFile(logPath, result.output)
  const check: Check = { name, status: result.code === 0 && !result.timedOut ? 'passed' : 'failed', durationMs: Date.now() - started, log: relative(reportRoot, logPath) }
  if (result.timedOut) check.detail = 'Timed out; the check did not complete.'
  if (dependencyAudit && !result.timedOut) {
    try {
      const audit = JSON.parse(result.output)
      if (audit.error || !audit.metadata?.vulnerabilities) throw new Error('Registry audit unavailable')
      const counts = audit.metadata.vulnerabilities
      check.status = counts.high + counts.critical > 0 ? 'failed' : counts.total > 0 ? 'warning' : 'passed'
      check.detail = `${counts.total} advisories: ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate, ${counts.low} low. No automatic dependency changes.`
      await writeFile(join(runDirectory, 'dependency-audit.json'), JSON.stringify(audit, null, 2) + '\n')
    } catch { check.status = 'failed'; check.detail = 'Dependency audit unavailable or invalid; do not interpret as no vulnerabilities.' }
  }
  checks.push(check)
  console.log(`[diagnose] ${name}: ${check.status}${check.detail ? ` (${check.detail})` : ''}`)
  await saveReport()
}

await saveReport()
await command('types', join(root, 'node_modules/typescript/bin/tsc'), ['-b', '--pretty', 'false'])
await command('lint', join(root, 'node_modules/eslint/bin/eslint.js'), ['.'])
await command('unit', join(root, 'node_modules/vitest/vitest.mjs'), ['run', '--exclude', 'server/security-probes.test.ts', '--pool', 'forks', '--maxWorkers', process.platform === 'win32' ? '1' : '2', '--reporter=default', '--reporter=json', `--outputFile.json=${join(runDirectory, 'unit.json')}`])
await command('security', join(root, 'node_modules/vitest/vitest.mjs'), ['run', 'server/security-probes.test.ts', '--reporter=default', '--reporter=json', `--outputFile.json=${join(runDirectory, 'security.json')}`])
await command('build', join(root, 'node_modules/vite/bin/vite.js'), ['build'])
if (process.env.npm_execpath) await command('dependencies', process.env.npm_execpath, ['audit', '--json', '--audit-level=high'], 90000, true)
else checks.push({ name: 'dependencies', status: 'failed', durationMs: 0, log: '', detail: 'Run through npm run diagnose so the npm CLI can be resolved.' })
if (includeBrowser) await command('browser', join(root, 'node_modules/@playwright/test/cli.js'), ['test'], 900000)
else checks.push({ name: 'browser', status: 'skipped', durationMs: 0, log: '', detail: 'Use npm run diagnose:full for all routes at desktop, tablet and mobile sizes.' })
complete = true
await saveReport()
console.log(`[diagnose] Report: ${join(reportRoot, 'latest.md')}`)
process.exitCode = inventoryErrors.length || checks.some(check => check.status === 'failed') ? 1 : 0
