export function shuffle(items,random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function choices(text){return String(text).split(',').map(x=>x.trim().slice(0,60)).filter(Boolean).slice(0,24);}
export class Host{
 constructor(random=Math.random){this.random=random;this.poll=null;}
 run(text){const [command,...rest]=text.trim().split(/\s+/);const args=rest.join(' ');switch(command?.toLowerCase()){
 case 'help':return 'Commands: !tyler teams names,separated,by,commas | pick choices,here | roll | poll choices,here | ballot name | 1 | results | ask question | say words | sound beep/airhorn/drumroll. Voice and AI require their optional settings.';
 case 'teams':{const names=choices(args);if(names.length<2)return 'Give at least two names separated by commas.';const a=shuffle(names,this.random);return 'Team A: '+a.filter((_,i)=>i%2===0).join(', ')+'\nTeam B: '+a.filter((_,i)=>i%2===1).join(', ');}
 case 'pick':{const a=choices(args);return a.length>=2?'My pick: '+a[Math.floor(this.random()*a.length)]:'Give at least two choices separated by commas.';}
 case 'roll':return 'Rolled '+(1+Math.floor(this.random()*6))+' / 6';
 case 'poll':{const a=choices(args);if(a.length<2)return 'Give at least two choices separated by commas.';this.poll={choices:a.slice(0,8),ballots:new Map(),until:Date.now()+120000};return '2-minute poll: '+this.poll.choices.map((x,i)=>(i+1)+': '+x).join(' · ')+' — vote with !tyler ballot YourName | number (casual, name-based voting).';}
 case 'ballot':{if(!this.poll)return 'No poll. Start with !tyler poll choice, choice.';if(Date.now()>this.poll.until)return 'Poll closed. Use !tyler results.';const m=/^([^|]{1,60})\s*\|\s*(\d+)$/.exec(args);if(!m||!this.poll.choices[Number(m[2])-1])return 'Use !tyler ballot YourName | option number';this.poll.ballots.set(m[1].trim().toLowerCase(),Number(m[2])-1);return 'Ballot saved for '+m[1].trim()+'.';}
 case 'results':return this.poll?this.poll.choices.map((x,i)=>x+': '+[...this.poll.ballots.values()].filter(v=>v===i).length).join(' · '):'No poll yet.';
 default:return null;
 }}
}
