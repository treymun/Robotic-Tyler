// Silero v5 interface follows @ricky0123/vad-web (ISC); see THIRD-PARTY.txt.
export class SpeechDetector {
 constructor(ort,session){this.ort=ort;this.session=session;}
 static async create(ort,model){
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  const session=await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  return new SpeechDetector(ort,session);
 }
 async classify(audio){
  if(!(audio instanceof Float32Array)||audio.length<4000||audio.length>192000||audio.some(v=>!Number.isFinite(v)))throw Error('Invalid speech sample');
  const ort=this.ort;let state=new ort.Tensor('float32',new Float32Array(256),[2,1,128]);
  const sr=new ort.Tensor('int64',BigInt64Array.from([16000n]),[]);
  let tail=new Float32Array(64),speechFrames=0,run=0,longest=0,peak=0;
  try{
   for(let at=0;at<audio.length;at+=512){
    const frame=new Float32Array(512);frame.set(audio.subarray(at,at+512));
    const inputData=new Float32Array(576);inputData.set(tail);inputData.set(frame,64);tail=frame.slice(-64);
    const input=new ort.Tensor('float32',inputData,[1,576]);let out;
    try{out=await this.session.run({input,state,sr});}finally{input.dispose();}
    state.dispose();state=out.stateN;
    const probability=Number(out.output.data[0]);out.output.dispose();
    if(!Number.isFinite(probability))throw Error('Invalid speech model output');
    peak=Math.max(peak,probability);
    if(probability>=.5){speechFrames++;run++;longest=Math.max(longest,run);}else run=0;
    // v2.33: the answer can't change once it's settled, so stop there (it scanned every frame of a
    // 12 s clip, about 180 ms, after the person had already stopped talking).
    if(speechFrames>=3&&longest>=2&&peak>=.65)return {speech:true,speechMs:speechFrames*32,peak,early:true};
   }
   return {speech:speechFrames>=3&&longest>=2&&peak>=.65,speechMs:speechFrames*32,peak};
  }finally{state?.dispose();sr.dispose();}
 }
}
