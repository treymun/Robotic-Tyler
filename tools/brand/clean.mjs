// v2.28: checks and tidies one SVG of the owner's branded icon pack (assets/theme-icons) before
// tools/build.mjs embeds it in ui-brand.js: only plain drawing elements and attributes (no scripts,
// links, styles, images or references), numbers where numbers belong, the title and namespace
// prefixes dropped, simple inline styles turned into attributes. Throws on anything else.
const SVG_TAGS=new Set(['svg','g','path','rect','circle','ellipse','polygon','polyline','line','text','tspan']);
const SVG_ATTRS=new Set(['xmlns','viewBox','x','y','x1','y1','x2','y2','width','height','d','cx','cy','r','rx','ry','points','transform','fill','fill-opacity','fill-rule','clip-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-opacity','stroke-dasharray','opacity','font-family','font-size','font-weight','text-anchor','dominant-baseline','letter-spacing','shape-rendering']);
// Three drawings in the pack have one rectangle's attributes shifted by one (rx holds the stroke
// colour, stroke the corner radius); fixed here, the pack itself stays as supplied.
const BRAND_FIXES={'svg/pipboy/pip-boy-device.svg':[['rx="#7bff62" fill="none" stroke="2"','rx="2" fill="none" stroke="#7bff62"']],
 'svg/hev/battery.svg':[['rx="#7f5825" fill="none" stroke="3"','rx="3" fill="none" stroke="#7f5825"']],
 'svg/ipod/battery.svg':[['rx="#717f89" fill="none" stroke="3"','rx="3" fill="none" stroke="#717f89"']]};
const NUMERIC=new Set(['x','y','x1','y1','x2','y2','width','height','cx','cy','r','rx','ry','stroke-width','stroke-miterlimit','opacity','fill-opacity','stroke-opacity','font-size']);
export function cleanBrandSvg(src,file){
 for(const [a,b] of BRAND_FIXES[file]||[])src=src.replace(a,b);
 let s=src.replace(/<\?xml[^>]*>/g,'').replace(/<(ns\d+:)?title\b[^>]*>[\s\S]*?<\/(ns\d+:)?title>/g,'').replace(/\s+xmlns:ns\d+="[^"]*"/g,'').replace(/<(\/?)ns\d+:/g,'<$1').trim();
 const m=s.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/);if(!m)throw Error(file+': not a single <svg>');
 if(!/viewBox="0 0 64 64"/.test(m[1]))throw Error(file+': expected the 64 × 64 artboard');
 // Simple inline styles (Papirus' fill:#…) become the same presentation attributes.
 const body=m[2].replace(/>\s+</g,'><').trim().replace(/\sstyle="([^"]*)"/g,(_,css)=>css.split(';').map(x=>x.trim()).filter(Boolean).map(d=>{const [k,v]=d.split(':').map(x=>x.trim());if(!SVG_ATTRS.has(k)||!/^[#\w.%(), -]+$/.test(v)||/url\(/i.test(v))throw Error(file+': style '+d+' is not allowed');return ' '+k+'="'+v+'"';}).join(''));
 for(const t of body.matchAll(/<\/?([a-zA-Z][\w:-]*)([^>]*?)\/?>/g)){
  if(!SVG_TAGS.has(t[1]))throw Error(file+': <'+t[1]+'> is not allowed');
  for(const a of t[2].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)){if(!SVG_ATTRS.has(a[1]))throw Error(file+': attribute '+a[1]+' is not allowed');if(NUMERIC.has(a[1])&&!/^-?[\d.]+(px|%)?$/.test(a[2]))throw Error(file+': '+a[1]+'="'+a[2]+'" is not a number');if(/url\(|javascript:|expression\(/i.test(a[2]))throw Error(file+': '+a[1]+' must not reference anything');}
 }
 if(/<!|&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(body))throw Error(file+': unexpected markup');
 return body;
}
