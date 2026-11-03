// The registry key electron-builder's NSIS installer uses for an app: a UUID v5 of the
// app id in electron-builder's own namespace (same as builder-util-runtime UUID.v5 with
// UUID.parse(namespace)). The setup looks for an installed app under
// Software\Microsoft\Windows\CurrentVersion\Uninstall\<this> and Software\<this>.
import crypto from 'node:crypto';
export const ELECTRON_BUILDER_NS='50e065bc-3134-11e6-9bab-38c9862bdaf3';
export function nsisGuid(appId,ns=ELECTRON_BUILDER_NS){
 const h=crypto.createHash('sha1').update(Buffer.concat([Buffer.from(ns.replace(/-/g,''),'hex'),Buffer.from(appId,'utf8')])).digest().subarray(0,16);
 h[6]=(h[6]&0x0f)|0x50;h[8]=(h[8]&0x3f)|0x80;
 const x=h.toString('hex');return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;
}
