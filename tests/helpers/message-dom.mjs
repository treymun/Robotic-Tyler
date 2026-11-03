// Small DOM fixture with real selector matching for message-reader regression tests.
// This is a representative page fixture, not a capture of a live Steam session.
export class Element {
 constructor(className='',attributes={},text=''){this.nodeType=1;this.attributes={class:className,...attributes};this.children=[];this.parentElement=null;this.text=text;this.isConnected=true;}
 get className(){return this.attributes.class||'';}
 get textContent(){return [this.text,...this.children.map(c=>c.textContent)].filter(Boolean).join(' ');}
 get innerText(){return this.textContent;}
 getClientRects(){return this.isConnected?[{width:1,height:1}]:[];}
 getAttribute(key){return this.attributes[key]??null;}
 setAttribute(key,value){this.attributes[key]=String(value);}
 removeAttribute(key){delete this.attributes[key];}
 append(...nodes){for(const n of nodes){if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(c=>c!==n);n.parentElement=this;this.children.push(n);}return this;}
 contains(node){return node===this||this.children.some(c=>c.contains(node));}
 matches(selector){return selector.split(',').some(s=>{s=s.trim();const tag=/^[a-z]+/i.exec(s);if(tag&&tag[0].toLowerCase()!==(this.tagName||'div'))return false;for(const match of s.matchAll(/\.([\w-]+)|\[([\w-]+)(?:(\*=|=)"([^"]*)")?\]/g)){if(match[1]){if(!this.className.split(/\s+/).includes(match[1]))return false;}else{const value=this.getAttribute(match[2]);if(value===null)return false;if(match[3]==='='&&value!==match[4])return false;if(match[3]==='*='&&!value.includes(match[4]))return false;}}return true;});}
 closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null;}
 querySelectorAll(selector){return this.children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]);}
 dispatchEvent(event){this.onProbe?.({type:event.type,target:this});return true;}
}
export function message(name='Alex',id='123456'){
 const region=new Element('ChatHistory', {role:'log'}),row=new Element('chatMessageGroup');
 const header=new Element('speakerName euWJk8l-IMI-',{},name),avatar=new Element('avatar',id?{'data-miniprofile':id}:{}),body=new Element('msg_Text',{},'!play A song');
 row.append(avatar,new Element('authorLine').append(header),new Element('messageWrapper').append(body));region.append(row);
 return {region,row,header,avatar,body};
}
