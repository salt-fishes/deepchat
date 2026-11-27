import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(root, 'release')
const apkSource = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk')
const distDir = path.join(root, 'dist')
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const gradle = await readFile(path.join(root, 'android/app/build.gradle'), 'utf8')

const version = String(packageJson.version ?? '').trim()
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Cannot package an unstable or missing version: ${version || '(missing)'}`)
}
const tag = `v${version.split('.').slice(0, 2).join('.')}`

const versionCode = Number(/\bversionCode\s+(\d+)\b/.exec(gradle)?.[1])
if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
  throw new Error('Cannot package a missing or invalid Android versionCode')
}

for (const required of [apkSource, path.join(distDir, 'index.html')]) {
  const info = await stat(required).catch(() => null)
  if (!info?.isFile() || info.size === 0) {
    throw new Error(`Required release input is missing or empty: ${required}`)
  }
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

const apkName = 'deepchat-release-signed.apk'
const webName = `deepchat-web-v${version}.zip`
const apkPath = path.join(outputDir, apkName)
const webPath = path.join(outputDir, webName)

await copyFile(apkSource, apkPath)

const webFiles = {}
const collect = async (directory, prefix = '') => {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const source = path.join(directory, entry.name)
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      await collect(source, relative)
    } else if (entry.isFile()) {
      webFiles[relative] = new Uint8Array(await readFile(source))
    }
  }
}
await collect(distDir)
await writeFile(webPath, zipSync(webFiles, { level: 6 }))

const sha256 = async (filePath) =>
  createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex')

const artifacts = []
for (const name of [apkName, webName]) {
  const filePath = path.join(outputDir, name)
  const info = await stat(filePath)
  artifacts.push({ name, size: info.size, sha256: await sha256(filePath) })
}

const checksums = `${artifacts.map((item) => `${item.sha256}  ${item.name}`).join('\n')}\n`
await writeFile(path.join(outputDir, 'SHA256SUMS.txt'), checksums)

const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8')
const heading = `## [${version}]`
const sectionStart = changelog.indexOf(heading)
if (sectionStart < 0) {
  throw new Error(`CHANGELOG.md has no release section for ${version}`)
}
const nextSection = changelog.indexOf('\n## [', sectionStart + heading.length)
const reference = changelog.indexOf(`\n[${version}]:`, sectionStart + heading.length)
const sectionEnd = [nextSection, reference].filter((value) => value >= 0)
const notesEnd = sectionEnd.length > 0 ? Math.min(...sectionEnd) : changelog.length
const notes = changelog
  .slice(sectionStart + heading.length, notesEnd)
  .trim()
  .replace(/^-\s*\d{4}-\d{2}-\d{2}\s*\n/, '')
await writeFile(path.join(outputDir, 'RELEASE_NOTES.md'), `# deepchat ${tag}\n\n${notes}\n`)

const manifest = {
  version,
  tag,
  androidVersionCode: versionCode,
  generatedAt: new Date().toISOString(),
  artifacts,
}
await writeFile(
  path.join(outputDir, 'release-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
)

console.log(`Release artifacts written to ${outputDir}`)
for (const artifact of artifacts) {
  console.log(`- ${artifact.name} (${artifact.size} bytes)`)
}
console.log('- SHA256SUMS.txt')
console.log('- RELEASE_NOTES.md')
console.log('- release-manifest.json')
