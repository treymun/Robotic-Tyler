import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Chrome keeps voice bridge and adds activity panel',()=>{
 const manifest=JSON.parse(read('browser-extension/manifest.json'));
 assert.match(manifest.version,/^(?:1\.(?:8|9)|2\.(?:[2-9]|[1-9]\d))\./);
 assert(manifest.content_scripts[0].js.includes('audio-bridge.js'));
 assert(manifest.content_scripts[0].js.includes('voice-listener.js'));
 assert(manifest.content_scripts[1].js.includes('activity-watch.js'));
});
test('barge-in threshold is user configurable, not falsely claimed full-duplex',()=>{
 const a=read('browser-extension/automatic.js');
 assert.match(a,/voiceBargeDelay/);
 assert.match(a,/bargeLoudSince>=config\(\)\.voiceBargeDelay/);
 assert.match(a,/value="350"/);
});
test('the removed Game Request Hub leaves no handlers, files or saved keys behind (v2.14)',()=>{
 const b=read('browser-extension/background.js');
 assert.doesNotMatch(b,/library:(?:auto|refresh-link|search-test|request|approve|trusted)|resolveTorBoxTransfer|searchHydraSources|lookupTrustedGame/);
 assert.match(b,/REMOVED_KEYS=\['torboxKey','premiumizeKey'/,'old keys are deleted on update');
 for(const f of ['game-hub.js','hydra-auto.mjs','game-library.mjs','trusted-games.mjs','ui/legacy-gamehub.css'])assert.ok(!fs.existsSync(path.join(root,'browser-extension',f)),f);
 const m=JSON.parse(read('browser-extension/manifest.json'));
 assert.ok(!m.host_permissions.some(h=>/torbox|premiumize|hydralinks|wkeynhk|githubusercontent|api\.github/.test(h)),'no hub hosts');
 assert.ok(!JSON.stringify(m.content_scripts).includes('game-hub'));
 const settings=read('browser-extension/settings.html');
 assert.doesNotMatch(settings,/torboxKey|premiumizeKey|hydraAutoEnabled|libraryCatalog|gameHubSettings/);
 assert.match(settings,/id="approvedFriends"[\s\S]*id="libraryAllowedIds"/,'the approved friends list moved to Squad & friends');
});
test('Electron settings use native preload bridge and voice permissions are disabled',()=>{
 const settings=read('app/companion/settings.js'),main=read('app/main.cjs');
 assert.match(settings,/window\.tylerSettings\.storage\.local/);
 assert.match(main,/setPermissionRequestHandler/);
 assert.doesNotMatch(main,/configureVoicePermissions\(win/);
 assert.match(read('app/steam-preload.cjs'),/__TYLER_DESKTOP_TEXT_ONLY/);
});
