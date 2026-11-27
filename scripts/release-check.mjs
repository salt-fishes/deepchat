import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedTag = process.argv[2]?.trim()
const errors = []

const fail = (message) => errors.push(message)

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const gradle = await readFile(path.join(root, 'android/app/build.gradle'), 'utf8')

const version = typeof packageJson.version === 'string' ? packageJson.version.trim() : ''
const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
if (!versionMatch) {
  fail(`package.json version must be a stable SemVer value, received: ${version || '(missing)'}`)
}

const versionCodeMatch = /\bversionCode\s+(\d+)\b/.exec(gradle)
const versionNameMatch = /\bversionName\s+["']([^"']+)["']/.exec(gradle)
if (!versionCodeMatch) {
  fail('android/app/build.gradle is missing a numeric versionCode')
}
if (!versionNameMatch) {
  fail('android/app/build.gradle is missing versionName')
}

if (versionMatch && versionNameMatch) {
  const androidVersionName = `${versionMatch[1]}.${versionMatch[2]}`
  if (versionNameMatch[1] !== androidVersionName) {
    fail(
      `Android versionName ${versionNameMatch[1]} does not match package.json ${version}; expected ${androidVersionName}`
    )
  }
}

if (versionCodeMatch) {
  const versionCode = Number(versionCodeMatch[1])
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
    fail(`Android versionCode must be a positive safe integer, received: ${versionCodeMatch[1]}`)
  }
}

if (expectedTag) {
  const tagMatch = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(expectedTag)
  if (!tagMatch) {
    fail(`Release tag must use vMAJOR.MINOR or vMAJOR.MINOR.PATCH, received: ${expectedTag}`)
  } else if (versionMatch) {
    const expectedParts = [Number(tagMatch[1]), Number(tagMatch[2]), Number(tagMatch[3] ?? 0)]
    const versionParts = versionMatch.slice(1).map(Number)
    if (expectedParts.some((part, index) => part !== versionParts[index])) {
      fail(`Release tag ${expectedTag} does not match package.json version ${version}`)
    }
  }
}

if (errors.length > 0) {
  console.error('Release version check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
} else {
  console.log(
    `Release versions are consistent: v${version}, Android ${versionNameMatch?.[1] ?? '(unknown)'} (${versionCodeMatch?.[1] ?? '(unknown)'})`
  )
}
