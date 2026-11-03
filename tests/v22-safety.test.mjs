import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);const read=p=>readFileSync(new URL(p,root),'utf8');
test('Chrome has emergency stop listener and flag',()=>{assert.match(read('browser-extension/content.js'),/v22:stop/);assert.match(read('browser-extension/background.js'),/v22EmergencyStop/);});
test('backup allowlist excludes provider credentials',()=>{const s=read('browser-extension/v22-settings.js');const allow=s.match(/const allowed=\[([^\]]+)\]/)?.[1]||'';assert.doesNotMatch(allow,/geminiKey|torboxKey|premiumizeKey|openrouterKey/);assert.match(s,/robotic-tyler-safe-profile/);});
test('desktop uses separate local settings storage',()=>{assert.match(read('app/companion/v22-settings.js'),/window.tylerSettings.storage.local/);assert.match(read('app/options-preload.cjs'),/action:'activity'/);});
test('Chrome listener safety remains enabled',()=>{assert.match(read('browser-extension/automatic.js'),/missingAudioSince/);assert.match(read('browser-extension/automatic.js'),/v22Latency/);});
