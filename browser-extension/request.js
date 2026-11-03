(() => {
 async function request(send,message,{timeout=95000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  if(!['command','voice'].includes(message.type))return send(message);
  const requestId=message.requestId||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);let timer;
  try{return await Promise.race([send({...message,requestId}),new Promise(resolve=>{timer=setTimer(()=>{Promise.resolve(send({type:'abort',requestId})).catch(()=>{});resolve({ok:false,error:'Reply took too long. Pending output cancelled; recovering listening.',retryable:true,retryAfter:15000});},timeout);})]);}finally{clearTimer(timer);}
 }
 globalThis.TylerRequest=request;
})();
