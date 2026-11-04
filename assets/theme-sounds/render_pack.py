"""Rebuild the 250 MP3s from recipes.json and preserved source audio.
Requires Python 3, NumPy, SciPy, FFmpeg and FFprobe. No network access is used.
"""
import argparse,concurrent.futures,hashlib,json,math,subprocess,wave,tempfile,shutil
from collections import Counter
from pathlib import Path
import numpy as np
from scipy import signal

ROOT=Path(__file__).resolve().parent
SR=48000
SLOT_MAX=[1.25,3.0,3.0,6.8,4.2,3.6,2.0,1.8,2.8,5.0]
def silence(seconds):return np.zeros((max(1,round(seconds*SR)),2),dtype=np.float64)
def edge(x,attack=.001,release=.012):
 x=x.copy();a=min(round(attack*SR),len(x)//3);r=min(round(release*SR),len(x)//3)
 if a:x[:a]*=np.linspace(0,1,a)[:,None]
 if r:x[-r:]*=np.linspace(1,0,r)[:,None]
 return x
def crop(x,seconds,start=0):
 offset=max(0,round(start*SR));n=max(1,round(seconds*SR));return edge(x[offset:offset+n],release=.025 if len(x)-offset>n else .006)
def trim(x):
 level=np.max(np.abs(x),axis=1);peak=float(level.max(initial=0));where=np.flatnonzero(level>max(1e-5,peak*.008))
 if not len(where):raise ValueError('Source has no audible signal')
 a=max(0,int(where[0])-240);b=min(len(x),int(where[-1])+2400);return x[a:b]
def rate(x,factor):
 n=max(2,round(len(x)/factor));pos=np.linspace(0,len(x)-1,n);old=np.arange(len(x));return np.column_stack([np.interp(pos,old,x[:,c]) for c in range(2)])
def combine(events,length=None):
 size=max((round(t*SR)+len(x) for t,x,g in events),default=1)
 if length is not None:size=max(size,round(length*SR))
 y=np.zeros((size,2))
 for t,x,g in events:
  at=round(t*SR);y[at:at+len(x)]+=x*g
 return y
def unit(x):
 p=float(np.max(np.abs(x),initial=0));return x/max(p,1e-9)
def pulse(x,seconds=.12):
 # Preserve the beginning of the actual game/device effect rather than substituting a stock beep.
 return edge(crop(x,seconds),attack=.0005,release=.018)
def tone(f,dur,kind='sine',end=None,volume=.2):
 t=np.arange(max(2,round(dur*SR)))/SR
 freq=np.full(len(t),float(f)) if end is None else np.geomspace(float(f),float(end),len(t))
 phase=np.cumsum(freq)*2*np.pi/SR
 if kind=='piezo':y=np.sin(phase)+.17*np.sin(3*phase)+.05*np.sin(5*phase)
 elif kind=='softsquare':y=np.tanh(2.0*np.sin(phase))*.75+.1*np.sin(3*phase)
 elif kind=='brass':y=sum(np.sin(k*phase)/k for k in range(1,9))*.6
 else:y=np.sin(phase)
 return edge(np.column_stack([y,y])*volume,attack=.004,release=min(.07,dur*.3))
def roll(x,ti):
 hit=unit(pulse(x,.055+(ti%4)*.012));events=[];n=19+ti%5
 gaps=np.linspace(.125+(ti%3)*.006,.033,n);at=0
 for i,gap in enumerate(gaps):
  h=rate(hit,1+(.025 if i%2 else -.025));h=h.copy()
  h[:,i%2]*=.82;events.append((at,h,.18+.7*(i/max(1,n-1))));at+=float(gap)
 events.append((at,rate(hit,.83),1));return edge(combine(events),release=.07)
def fall(x,ti):
 sample=unit(crop(x,.29));ratios=[1.0,.944,.891,.7937];spacing=.29+(ti%3)*.012
 return edge(combine([(i*spacing,rate(sample,r),.75 if i<3 else 1) for i,r in enumerate(ratios)]),release=.10)
def fanfare(x,ti):
 sample=unit(crop(x,.33));ratios=[1,1.25,1.5,2];spacing=.145+(ti%4)*.011
 return combine([(i*spacing,rate(sample,r),.7+i*.07) for i,r in enumerate(ratios)])
def sparkle(x,ti):
 sample=unit(crop(x,.23));return combine([(0,rate(sample,1.05),.7),(.10+(ti%3)*.008,rate(sample,1.5),1)])
def stabs(x,ti):
 sample=unit(crop(x,.62));return combine([(0,sample,.9),(.22+(ti%3)*.035,rate(sample,.92),.62),(.67,rate(sample,1.04),1)])
def alert(x,ti):
 sample=unit(crop(x,.36));gap=.30+(ti%4)*.025
 return combine([(i*gap,rate(sample,1.14 if i%2 else 1),.8) for i in range(4)])
def rise(x,ti):
 sample=unit(crop(x,.40));return combine([(0,rate(sample,.72),.65),(.10,rate(sample,1),.6),(.20,rate(sample,1.42),.75)])
def zap(x,ti):
 # A source-derived spectral gesture: retain its transient and compose a descending echo tail.
 sample=unit(crop(x,.37));events=[(0,rate(sample,1.35),1)]
 for i,r in enumerate([1.05,.8,.60,.45]):events.append((.085+i*.095,rate(sample,r),.5*.73**i))
 y=combine(events);return edge(y,release=.09)
def count(x,ti):
 hit=unit(pulse(x,.23));step=.70+(ti%4)*.035
 events=[(i*step,hit,.78) for i in range(3)];events.append((3*step,rate(crop(x,.43),1.45),1));return combine(events)
def clickwheel():
 t=np.arange(round(.021*SR))/SR
 y=(np.sin(2*np.pi*3300*t)+.24*np.sin(2*np.pi*6200*t))*np.exp(-t*235)
 return edge(np.column_stack([y,y]),attack=.00008,release=.003)
def ipod(slot):
 click=clickwheel()
 if slot==1:return combine([(0,click,.5),(.04,tone(1800,.11,'piezo'),1)])
 if slot==2:return combine([(i*.135,tone(1020 if i%2 else 1360,.115,'piezo',volume=.17),1) for i in range(8)])
 if slot==3:return roll(click,22)
 if slot==4:return combine([(i*.18,tone(f,.25 if i<3 else .5,'piezo'),1) for i,f in enumerate([880,1100,1320,1760])])
 if slot==5:return combine([(i*.25,tone(f,.31,'piezo',end=f*.97),1) for i,f in enumerate([660,622,587,523])])
 if slot==6:return combine([(i*.21,tone(2500,.07,'piezo'),1) for i in range(5)])
 if slot==7:return combine([(0,click,.4),(.035,tone(1760,.10,'piezo'),1),(.12,tone(2349,.25,'piezo'),1)])
 if slot==8:return combine([(0,click,.35),(.01,tone(480,.38,'piezo',end=1580),1)])
 if slot==9:return combine([(0,click,.3),(.01,tone(2450,.64,'piezo',end=210),1)])
 return combine([(i*.65,tone(1320,.12 if i<3 else .40,'piezo',end=None if i<3 else 1760),1) for i in range(4)])
def payday(slot,x,ti):
 if slot==7:
  rng=np.random.default_rng(2042);events=[]
  for i,f in enumerate([3400,4300,5250]):
   ping=tone(f,.14,'sine',volume=.15);noise=rng.normal(0,.035,len(ping));ping+=np.column_stack([noise,noise])*np.exp(-np.arange(len(ping))/SR*48)[:,None];events.append((i*.06,ping,1))
  events.append((.16,tone(890,.21,'softsquare'),.4));return combine(events)
 if slot==1:return combine([(0,tone(940,.11,'softsquare'),1),(.15,tone(1260,.12,'softsquare'),1),(.02,pulse(x,.09),.12)])
 if slot==3:
  rng=np.random.default_rng(2002);n=round(1.9*SR);t=np.arange(n)/SR
  noise=rng.normal(0,.10,n);filtered=signal.sosfilt(signal.butter(3,[700,5000],btype='bandpass',fs=SR,output='sos'),noise)
  motor=(.35+.65*signal.square(2*np.pi*(23*t+9*t*t)))*filtered
  y=np.column_stack([motor,motor]);y+=tone(145,1.9,'softsquare',end=215,volume=.07)
  y*=np.linspace(.3,1,n)[:,None];return edge(y,attack=.04,release=.15)
 if slot==10:
  beep=combine([(0,tone(780,.10,'softsquare'),1),(.12,tone(1040,.10,'softsquare'),1)])
  return combine([(i*.72,beep,.7) for i in range(3)]+[(2.16,tone(1560,.38,'softsquare'),.8), (2.16,pulse(x,.10),.08)])
 raise ValueError(slot)
def normalize(x):
 x=np.nan_to_num(x,nan=0,posinf=0,neginf=0)
 if x.ndim!=2 or x.shape[1]!=2:raise ValueError('Not stereo PCM')
 level=np.max(np.abs(x),axis=1);peak=float(level.max(initial=0))
 if peak<1e-7:raise ValueError('Silent rendered asset')
 active=level>peak*.03;rms=float(np.sqrt(np.mean(x[active]**2)))
 gain=min(.20/max(rms,1e-9),.77/peak,18)
 x=edge(x*gain,attack=.0005,release=.012)
 # A little real silence gives MP3 decoders clean boundaries and protects tiny transients.
 x=np.concatenate([silence(.018),x,silence(.075)])
 master_peak=float(np.max(np.abs(x)))
 master_rms=float(np.sqrt(np.mean(x*x)))
 return x,{'normalizationGainDb':round(20*math.log10(gain),3),'masterPeakDbFS':round(20*math.log10(master_peak),3),'masterRmsDbFS':round(20*math.log10(master_rms),3)}
def wavwrite(path,x):
 pcm=np.round(np.clip(x,-1,1)*32767).astype('<i2')
 with wave.open(str(path),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
def decode(file):
 r=subprocess.run(['ffmpeg','-v','error','-i',str(file),'-f','f32le','-ac','2','-ar',str(SR),'pipe:1'],capture_output=True,check=True,timeout=30)
 return np.frombuffer(r.stdout,dtype='<f4').astype(np.float64).reshape(-1,2)
def run(root=ROOT,only_themes=None):
 plan=json.loads((root/'recipes.json').read_text());sources={s['id']:s for s in json.loads((root/'SOURCES.json').read_text())['sources']}
 cache={}
 def load(sid):
  s=sources[sid];f=s['originalFile']
  if f not in cache:
   try:cache[f]=trim(decode(root/f))
   except Exception as exc:raise ValueError(sid+' / '+f+': '+str(exc)) from exc
  return cache[f]
 selected=[t for t in plan['themes'] if not only_themes or t['id'] in only_themes]
 if only_themes and not (root/'manifest.json').exists():raise ValueError('Build the full pack before rebuilding a subset')
 previous=json.loads((root/'manifest.json').read_text()) if only_themes else None
 unique_sources={sources[sid]['originalFile']:sid for t in selected for a in t['clips'] for sid in a['sourceIds']}
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(load,unique_sources.values()))
 temp=Path(tempfile.mkdtemp(prefix='robotic-tyler-audio-'))
 reports=[]
 def build(job):
  t,a=job;op=a['operation'];slot=a['slot'];ti=t['index'];x=load(a['sourceIds'][0]) if a['sourceIds'] else None
  if op=='direct':y=crop(x,SLOT_MAX[slot-1])
  elif op=='voice-count':
   events=[];at=0
   for sid in a['sourceIds']:
    word=crop(load(sid),.85);events.append((at,word,1));at+=max(.86,len(word)/SR+.08)
   y=combine(events)
  elif op=='ipod':y=ipod(slot)
  elif op.startswith('payday-'):y=payday(slot,x,ti)
  else:y={'roll':roll,'fall':fall,'fanfare':fanfare,'sparkle':sparkle,'stabs':stabs,'alert':alert,'rise':rise,'zap':zap,'count':count}[op](x,ti)
  y=crop(y,SLOT_MAX[slot-1]);y,stats=normalize(y)
  if len(y)/SR>12:raise ValueError('Clip exceeds app duration limit')
  wav=temp/(t['id']+'-'+str(slot)+'.wav');wavwrite(wav,y)
  out=root/a['file'];out.parent.mkdir(parents=True,exist_ok=True)
  subprocess.run(['ffmpeg','-nostdin','-y','-v','error','-i',str(wav),'-map_metadata','-1','-c:a','libmp3lame','-b:a','160k','-ar','48000','-ac','2','-id3v2_version','3',str(out)],check=True,timeout=30)
  actual=decode(out);peak=float(np.max(np.abs(actual)));truePeak=float(np.max(np.abs(signal.resample_poly(actual,4,1,axis=0))))
  if truePeak>.89125:
   correction=.86/truePeak;y*=correction;wavwrite(wav,y)
   subprocess.run(['ffmpeg','-nostdin','-y','-v','error','-i',str(wav),'-map_metadata','-1','-c:a','libmp3lame','-b:a','160k','-ar','48000','-ac','2',str(out)],check=True,timeout=30)
   actual=decode(out);peak=float(np.max(np.abs(actual)));truePeak=float(np.max(np.abs(signal.resample_poly(actual,4,1,axis=0))))
   stats['mp3HeadroomCorrectionDb']=round(20*math.log10(correction),3)
  b=out.read_bytes();r={**a,'seconds':round(len(actual)/SR,6),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'decodedPcmSha256':hashlib.sha256(np.round(actual*32767).astype('<i2').tobytes()).hexdigest(),'sampleRate':SR,'channels':2,'codec':'mp3','bitrate':160000,'encodedBase64Characters':4*((len(b)+2)//3),'peakDbFS':round(20*math.log10(peak),3),'truePeakDbTP':round(20*math.log10(truePeak),3),**stats}
  wav.unlink();return t['id'],r
 jobs=[(t,a) for t in selected for a in t['clips']]
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  for i,(theme,r) in enumerate(pool.map(build,jobs),1):
   reports.append((theme,r))
   if i%25==0 or i==len(jobs):print(json.dumps({'rendered':i,'total':len(jobs)}),flush=True)
 groups={t['id']:{**t,'clips':[]} for t in plan['themes']}
 if previous:
  for t in previous['themes']:
   if t['id'] not in only_themes:groups[t['id']]['clips']=t['clips']
 for theme,a in reports:groups[theme]['clips'].append(a)
 for t in groups.values():t.pop('index',None)
 all_clips=[a for t in groups.values() for a in t['clips']]
 manifest={'title':'Robotic Tyler — 25-theme soundboard pack','schemaVersion':1,'created':'2026-11-04','policy':plan['policy'],'slotNames':plan['slotNames'],'themes':list(groups.values()),'counts':{'themes':25,'clips':len(all_clips),'byProvenance':dict(Counter(r['provenanceKind'] for r in all_clips))},'verificationScope':'Audio decoding, dimensions, identity and signal levels. Listening and live Steam-call testing must be performed in the target environment.'}
 (root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 shutil.rmtree(temp);print(json.dumps(manifest['counts']),flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT);parser.add_argument('--theme',action='append');args=parser.parse_args();run(args.root.resolve(),set(args.theme) if args.theme else None)
