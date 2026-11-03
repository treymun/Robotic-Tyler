export class TabLease {
 constructor(storage,alive=async()=>true){this.storage=storage;this.alive=alive;this.queue=Promise.resolve();}
 run(fn){const next=this.queue.then(fn,fn);this.queue=next.catch(()=>{});return next;}
 claim(tab,takeOver=false){return this.run(async()=>{const {activeBotTab}=await this.storage.get('activeBotTab');if(activeBotTab!==undefined&&activeBotTab!==tab&&!takeOver&&await this.alive(activeBotTab))return {owner:false,ownerTab:activeBotTab};await this.storage.set({activeBotTab:tab});return {owner:true,previous:activeBotTab};});}
 check(tab){return this.run(async()=>{const {activeBotTab}=await this.storage.get('activeBotTab');return activeBotTab===undefined||activeBotTab===tab;});}
 release(tab){return this.run(async()=>{const {activeBotTab}=await this.storage.get('activeBotTab');if(activeBotTab===tab)await this.storage.remove('activeBotTab');});}
}
