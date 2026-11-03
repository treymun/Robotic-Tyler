'use strict';
(async()=>{
 const $=id=>document.getElementById(id);let kind='window',chosen=null,all=[];
 try{all=await window.tylerPicker.sources();}catch{all=[];}
 if(!all.some(s=>s.kind==='window'))kind='screen';
 function render(){
  for(const b of document.querySelectorAll('nav button'))b.setAttribute('aria-selected',String(b.dataset.kind===kind));
  const list=all.filter(s=>s.kind===kind);$('empty').hidden=list.length>0;
  $('grid').replaceChildren(...list.map(s=>{
   const b=document.createElement('button');b.type='button';b.className='card';b.setAttribute('role','option');b.setAttribute('aria-selected',String(s.id===chosen));
   const img=s.thumbnail?Object.assign(document.createElement('img'),{src:s.thumbnail,alt:''}):Object.assign(document.createElement('div'),{className:'ph'});
   const name=document.createElement('span');name.textContent=s.name||(s.kind==='screen'?'Screen':'Window');
   b.append(img,name);b.addEventListener('click',()=>{chosen=s.id;$('share').disabled=false;render();});b.addEventListener('dblclick',()=>void window.tylerPicker.choose(s.id));
   return b;
  }));
 }
 for(const b of document.querySelectorAll('nav button'))b.addEventListener('click',()=>{kind=b.dataset.kind;render();});
 $('share').addEventListener('click',()=>{if(chosen)void window.tylerPicker.choose(chosen);});
 $('cancel').addEventListener('click',()=>void window.tylerPicker.cancel());
 document.addEventListener('keydown',e=>{if(e.key==='Escape')void window.tylerPicker.cancel();});
 render();
})();
