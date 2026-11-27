# Release guide

This guide defines the release process for deepchat. A release is complete only when the version, signed Android artifact, web artifact, checksums, Git tag and GitHub Release all agree.

## Version rules

- Use Semantic Versioning: `MAJOR.MINOR.PATCH`.
- `package.json` stores the full version, for example `1.18.0`.
- Android `versionName` stores `MAJOR.MINOR`, for example `1.18`.
- Android `versionCode` is a positive integer that must increase for every Android release.
- The Git tag and GitHub Release use `vMAJOR.MINOR`, matching the repository convention, for example `v1.18`. The package and changelog keep the full `MAJOR.MINOR.PATCH` version.

Run the consistency check before building:

```sh
pnpm release:check v1.18
```

## 1. Prepare the release

1. Review the complete diff and preserve unrelated work.
2. Update `CHANGELOG.md` with the new version, date and user-facing changes.
3. Update `package.json`, `android/app/build.gradle` and any displayed release notes.
4. Confirm the package ID remains `com.deepchat.app` and the signing certificate has not changed.
5. Keep `android/signing.properties`, keystores, APKs and generated `release/` files out of Git.

## 2. Verify the source

```sh
pnpm install --frozen-lockfile
pnpm release:check v1.18
pnpm type
pnpm lint
pnpm test
```

Do not continue if any command fails.

## 3. Build the signed Android release

Use JDK 21 and Android SDK 37. Set `ANDROID_HOME` and `JAVA_HOME` in the shell before running:

```sh
pnpm apk:release
```

The script performs the web build, Capacitor sync and signed Release build. The APK is written to:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Verify the signature and certificate:

```sh
"$ANDROID_HOME/build-tools/37.0.0/apksigner.bat" verify --verbose --print-certs android/app/build/outputs/apk/release/app-release.apk
```

On Windows PowerShell, use `apksigner.bat`; on macOS/Linux use `apksigner`.

Install over the previous release and run a smoke test:

```sh
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Check at minimum: launch, API-key screen, conversation list, thinking expand/collapse, composer focus, share target and app version.

## 4. Package public artifacts

```sh
pnpm release:package
```

This recreates the ignored `release/` directory and writes:

| File                          | Purpose                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `deepchat-release-signed.apk` | Android update asset; the in-app updater expects this exact name. |
| `deepchat-web-vX.Y.Z.zip`     | Static web build for self-hosting.                                |
| `SHA256SUMS.txt`              | SHA-256 checksums for the APK and web ZIP.                        |
| `RELEASE_NOTES.md`            | Release notes extracted from the current changelog section.       |
| `release-manifest.json`       | Version, Android version code, sizes and hashes.                  |

Open the APK and web ZIP once to confirm they are not empty or corrupted.

## 5. Commit and tag

Use one release commit that contains the source, documentation, version bump and changelog. Do not include local signing files or generated artifacts.

```sh
git add .
git commit -m "Release v1.18: summarize the release"
git tag -a v1.18 -m "deepchat v1.18"
git push origin main
git push origin v1.18
```

Review `git status` before committing. If the repository uses protected branches, open a release pull request and merge it before pushing the tag.

## 6. Create the GitHub Release

Upload the standardized artifacts and generated notes:

```sh
gh release create v1.18 \
  release/deepchat-release-signed.apk \
  release/deepchat-web-v1.18.0.zip \
  release/SHA256SUMS.txt \
  release/release-manifest.json \
  --verify-tag \
  --title "deepchat v1.18" \
  --notes-file release/RELEASE_NOTES.md
```

After publication:

1. Run `gh release view v1.18` and confirm every asset is uploaded.
2. Confirm `releases/latest` points to the new stable release.
3. Check the in-app update screen from the previous installed version.
4. Confirm the GitHub Pages workflow completes after `main` is pushed.
5. Record the release URL and any follow-up issues.

## Local-only releases

Omit the commit, tag, push and `gh release create` steps when preparing a local test release. The version checks, signed build and packaged artifacts remain the same.

## Rollback and hotfix policy

- Do not delete, move or rewrite published tags.
- Do not replace assets on an existing GitHub Release after users may have downloaded them.
- If a release is defective, ship the smallest fix as the next patch version, for example `v1.18.1`.
- Keep the previous release available until the replacement has passed smoke testing.

## Release checklist

- [ ] Changelog updated.
- [ ] `package.json`, Android version and tag agree.
- [ ] Android `versionCode` increased.
- [ ] Type, lint and test checks pass.
- [ ] Signed APK certificate verified.
- [ ] APK installed over the previous version and smoke-tested.
- [ ] Web ZIP contains `index.html` and `LICENSE`.
- [ ] SHA-256 checksums generated.
- [ ] No keys, keystores, APKs or local properties committed.
- [ ] Release commit, annotated tag and GitHub Release published.
- [ ] In-app updater and Pages deployment verified.
