(() => {
 // Automatic-mode pacing. Text replies are unlimited per start (v2.5); spoken
 // replies stop after `limit` because transcription + speech cost far more.
 // Spam can't fan out: one reply is in flight at a time, bursts are merged into
 // a single reply by automatic.js, and a chat flood stretches the text cooldown.
 class AutoPolicy {
  constructor(){this.enabled=false;this.people=null;this.busy=false;this.sent=0;this.voiceSent=0;this.limit=60;this.last=0;this.lastDirect=false;this.speed='balanced';this.flood=false;}
  get cooldown(){if(this.mode==='voice')return 1500;const base=this.speed==='cautious'?5000:this.lastDirect?900:2200;return this.flood?Math.max(base,6000):base;}
  get mode(){return !this.enabled?'off':this.people===null?'unknown':(this.people>0||this.voiceOnly)?'voice':'text';}
  accepts(source,now=Date.now()){return this.enabled&&!this.busy&&(source!=='voice'||this.voiceSent<this.limit)&&now-this.last>=this.cooldown&&((source==='voice'&&this.mode==='voice')||(source==='text'&&this.mode==='text'));}
  begin(source,now=Date.now()){if(!this.accepts(source,now))return false;this.busy=true;this.last=now;return true;}
  finish(success,source='text'){this.busy=false;if(!success)return;this.sent++;if(source==='voice'){this.voiceSent++;if(this.voiceSent>=this.limit)this.enabled=false;}}
 }
 globalThis.TylerAutoPolicy=AutoPolicy;
})();
