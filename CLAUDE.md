# Notes for Claude sessions working on ROBOTIC TYLER

## Publishing releases (standing permission from the owner, 2026-11-03)
The owner (treymun) said: "going forward you can always publish without asking me".
So when a version is finished, saved to main and its tests pass, publish it without asking:

    gh workflow run ci.yml --repo treymun/Robotic-Tyler --ref main -f publish=true

- Bump the version first (package.json, app/package.json, browser-extension/manifest.json,
  START-HERE.txt): CI never rebuilds a version that is already published.
- The release notes are the top section of CHANGES.md (everything above the first `---`);
  also add docs/patch-notes/PATCH-v<version>.txt.
- Watch the run to the end and check the release page has the Setup, desktop installer,
  Chrome zip and SHA256SUMS. Tell the owner what was published.
- If the owner says not to publish something, that overrides this.

## Working rules
- Commits: author `treymun <treymun@users.noreply.github.com>`. Never use the owner's personal email.
- Before saving: `node tools/build.mjs`, `npm run check`, `npm test`, `npm run test:e2e`.
- The owner may be low on usage: save (commit and push) after each meaningful part.
- Clearly separate mocked tests from real Steam, Windows audio and Gemini Live tests.
