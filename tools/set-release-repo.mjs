#!/usr/bin/env node
// Points the desktop builds' auto-update feed at a GitHub repository.
// Usage: node tools/set-release-repo.mjs <owner>/<repo>
// CI runs this with $GITHUB_REPOSITORY before building, so release builds always
// update from the repository they were built in. Until it is set, the apps
// detect the placeholder and leave automatic updates off.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [owner,repo]=String(process.argv[2]||'').split('/');
if(!owner||!repo||!/^[A-Za-z0-9-]{1,39}$/.test(owner)||!/^[A-Za-z0-9._-]{1,100}$/.test(repo)){
 console.error('Usage: node tools/set-release-repo.mjs <owner>/<repo>');process.exit(1);
}
// The desktop app updates from control.yml (the channel name the Control Center used, so its
// installs upgrade in place into the desktop app).
const targets=[['electron-builder.desktop.json',d=>d,'control']];
for(const [file,pick,channel] of targets){
 const full=path.join(root,file),data=JSON.parse(fs.readFileSync(full,'utf8')),config=pick(data);
 config.publish=[{provider:'github',owner,repo,releaseType:'release',channel}];
 fs.writeFileSync(full,JSON.stringify(data,null,2)+'\n');
}
console.log('Auto-update feed set to github.com/'+owner+'/'+repo);
