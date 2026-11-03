// Explicit screen-capture image analysis. Never stores a screenshot or returns the image to chat.
export const MAX_IMAGE_CHARS=480000;
export function scenePrompt(mode='balanced'){
 const spice=mode==='spicy'?'playful gamer trash talk, one concise cheeky line':'light-hearted teasing, one concise gentle line';
 return `You analyze a SINGLE voluntarily shared screenshot of a game. Look for clearly visible Deadlock context (HUD, scoreboard, death/respawn indicator). Do not infer a death or bad performance just because health is low or a character is not visible. Return ONLY a compact JSON object: {"game":"deadlock|other|unclear","event":"death|poor_performance|good_play|none","confidence":0.0,"comment":"..."}. event death requires an explicit visible death/respawn indication. poor_performance requires clear and readable negative score or visible evidence; otherwise none. For death or poor_performance use ${spice}, targeting GAMEPLAY not personal traits or protected characteristics. Never swear at a person or make claims without evidence. For none, comment must be empty. No markdown.`;
}
export function parseScene(raw){
 const cleaned=String(raw||'').replace(/^```(?:json)?\s*|\s*```$/g,'').trim();let x;
 try{x=JSON.parse(cleaned)}catch{throw Error('Vision model returned unstructured data. No commentary sent.');}
 const game=['deadlock','other','unclear'].includes(x.game)?x.game:'unclear';
 const event=['death','poor_performance','good_play','none'].includes(x.event)?x.event:'none';
 const confidence=Math.max(0,Math.min(1,Number(x.confidence)||0));
 const comment=String(x.comment||'').replace(/[\r\n\t]/g,' ').slice(0,200).trim();
 return {game,event,confidence,comment:event==='none'?'':comment};
}
export function eligibleScene(result,lastEvent='',lastAt=0,now=Date.now(),cooldown=120000){return result.game==='deadlock'&&['death','poor_performance','good_play'].includes(result.event)&&result.confidence>=0.85&&!!result.comment&&(result.event!==lastEvent||now-lastAt>=cooldown)&&now-lastAt>=cooldown;}
