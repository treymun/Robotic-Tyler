# ROBOTIC TYLER theme voices: the local voice worker (v2.35; the fast engine since v2.36; Windows start fix v2.37.1).
#
# The desktop app starts this with its own isolated Python (the "engine" it installed and verified) and
# talks to it only through stdin/stdout, one JSON object per line. There is no network listener and
# nothing here downloads anything: the app checks every file first, and this only reads the model
# folder and the voice references it is told about.
#
# Requests:  {"id": 7, "op": "hello"|"load"|"unload"|"prompt"|"speak"|"cancel"|"quit", ...}
# Replies:   {"id": 7, "ok": true, ...} or {"id": 7, "ok": false, "code": "...", "error": "..."}
# Events:    {"id": 7, "event": "progress", "chunk": 1, "chunks": 3, "step": 40, "steps": 120}
#
# Two engines (v2.36): the standard one (qwen-tts), and the fast one for NVIDIA cards (faster-qwen3-tts:
# the same Qwen3-TTS models with CUDA graphs, made in short streamed chunks). Which one runs is the
# engine the app installed; the app asks for it by name and this never switches by itself.
#
# Voice data that is cached (the reference's speech codes and speaker embedding) is written as
# safetensors, which holds only tensors and text, never code. Nothing is ever loaded with pickle.
#
# v2.41: a character voice's reference is a list of original clips (ref_audio: [paths]), joined here
# 0.3 s apart (as the built-in references were made); its fingerprint is the SHA-256 of every clip in
# order. gain_db sets a voice's level a few dB above or below the usual one.
#
# v2.44: an optional "sharper voice" for a few characters. When a speak request carries "convert", the take is run
# through kNN-VC (Baas, Kamper & Shall 2023) after Qwen3-TTS: its WavLM-Large layer-6 features are each replaced by
# the mean of their k nearest neighbours among the character's own recordings ("match"), then vocoded by the
# prematched HiFi-GAN, at 16 kHz, and resampled back to 24 kHz. The code is vendored (knnvc_wavlm.py,
# knnvc_hifigan.py, MIT); the two checkpoints are the app's verified download and are loaded with
# torch.load(weights_only=True). WavLM loads on first use, on the device the voice model uses, and goes with
# "unload" (the app's idle timer closes the worker). The matching set's features are cached as safetensors, keyed
# by the WavLM checkpoint's SHA-256 and every clip's SHA-256. Cancel stops it between steps, like generation.
# If the conversion itself fails, the normal take is kept and the reply says why (convert_error).
import sys, os, json, threading, queue, time, hashlib, re, gc, traceback, math
# Diagnosing a hang: TYLER_WORKER_TRACE=<seconds> writes every thread's stack to stderr every <seconds>.
if os.environ.get("TYLER_WORKER_TRACE", "").isdigit():
    import faulthandler; faulthandler.dump_traceback_later(int(os.environ["TYLER_WORKER_TRACE"]), repeat=True, file=sys.stderr)
# The app starts Python isolated (-I -S) and names the engine's own package folder here, so no other
# Python install on this PC can leak in.
if "--site" in sys.argv:
    import site; site.addsitedir(sys.argv[sys.argv.index("--site") + 1])
os.environ.setdefault("HF_HUB_OFFLINE", "1"); os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1"); os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

PROTOCOL = 1
# The protocol gets its own copy of stdout; anything a library prints (to Python's stdout or straight
# from C code) goes to stderr instead, so it can never corrupt a reply.
proto = os.fdopen(os.dup(1), "w", buffering=1, encoding="utf-8", newline="\n")
os.dup2(2, 1); sys.stdout = sys.stderr
out_lock = threading.Lock()
def send(obj):
    with out_lock:
        proto.write(json.dumps(obj, ensure_ascii=False) + "\n"); proto.flush()

class Failure(Exception):
    def __init__(self, code, message, info=None): super().__init__(message); self.code = code; self.info = info

# ── requests are read on their own thread, so "cancel" works while a voice is being made ──
requests = queue.Queue(); cancelled = set(); current = {"id": None}
# Requests arrive on a private copy of stdin, and the process's own standard input becomes NUL, so no
# program a library starts can read (or wait on) Tyler's request line (v2.37.1).
# On Windows a read must never be left waiting on that pipe: while one thread is blocked in ReadFile on a
# synchronous pipe, every other call on that pipe waits for it, and as numpy loads, the Fortran runtime
# inside its OpenBLAS calls fstat() on standard input. With the reader waiting for Tyler's next request,
# "import numpy" froze until a request came (reproduced on GitHub's Windows runner; on the owner's PC the
# voice check never finished). So on Windows the reader only reads bytes that are already there.
# Requests are UTF-8 JSON whatever the PC's code page (-I ignores PYTHONIOENCODING; paths hold the
# Windows user name, and the text can hold any character).
_requests_fd = os.dup(0)
_nul = os.open(os.devnull, os.O_RDONLY); os.dup2(_nul, 0); os.close(_nul)
def request_lines():
    if os.name != "nt":
        with os.fdopen(_requests_fd, "r", encoding="utf-8", errors="replace") as f:
            yield from f
        return
    import msvcrt, _winapi
    handle, buf = msvcrt.get_osfhandle(_requests_fd), b""
    while True:
        try: waiting = _winapi.PeekNamedPipe(handle, 0)[0]
        except OSError: break  # the app closed the pipe
        if not waiting:
            time.sleep(0.02); continue
        buf += os.read(_requests_fd, waiting)
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            yield line.decode("utf-8", "replace")
    if buf.strip(): yield buf.decode("utf-8", "replace")
def reader():
    for line in request_lines():
        line = line.strip()
        if not line: continue
        try: req = json.loads(line)
        except Exception:
            m = re.search(r'"id"\s*:\s*(\d+)', line); send({"id": int(m.group(1)) if m else None, "ok": False, "code": "bad_request", "error": "Not JSON."}); continue
        if req.get("op") == "cancel":
            cancelled.add(req.get("target")); send({"id": req.get("id"), "ok": True}); continue
        requests.put(req)
    requests.put({"op": "quit", "id": None})
threading.Thread(target=reader, daemon=True).start()

torch = None; np = None; sf = None; model = None; fast = None; model_info = {}; prompts = {}

def imports():
    global torch, np, sf
    if torch is None:
        import torch as t, numpy as n, soundfile as s
        torch, np, sf = t, n, s

def hello(req):
    imports()
    info = {"protocol": PROTOCOL, "python": sys.version.split()[0], "torch": torch.__version__, "cuda": bool(torch.cuda.is_available()), "threads": torch.get_num_threads()}
    if info["cuda"]:
        p = torch.cuda.get_device_properties(0); free, total = torch.cuda.mem_get_info(0)
        info.update(device=p.name, capability=f"{p.major}.{p.minor}", vram_total=total, vram_free=free, bf16=bool(torch.cuda.is_bf16_supported()), cuda_version=torch.version.cuda)
    try:
        import qwen_tts, transformers; info.update(qwen_tts=getattr(qwen_tts, "__version__", "0.1.1"), transformers=transformers.__version__)
    except Exception as e: info["import_error"] = str(e)[:300]
    try:
        from importlib.metadata import version
        info["fast_engine"] = version("faster-qwen3-tts")
    except Exception: info["fast_engine"] = None
    return info

def unload(req=None):
    global model, model_info, fast
    had = model is not None or bool(knn)
    model = None; fast = None; model_info = {}; prompts.clear(); knn_unload(); gc.collect()
    if torch is not None and torch.cuda.is_available(): torch.cuda.empty_cache()
    return {"unloaded": had}

def load(req):
    global model, model_info, fast
    imports()
    want = {"dir": req["model_dir"], "device": req.get("device", "cpu"), "dtype": req.get("dtype", "auto"), "engine": "fast" if req.get("engine") == "fast" else "standard"}
    if model is not None and all(model_info.get(k) == v for k, v in want.items()): return {**model_info, "already": True}
    unload()
    from qwen_tts import Qwen3TTSModel
    device = want["device"]
    if device == "cuda" and not torch.cuda.is_available(): raise Failure("no_gpu", "The graphics card isn't available to the voice engine.")
    # v2.44: with "Graphics card, or the processor when the card is full", the app asks how much must be free first;
    # too little and nothing is loaded here (the app then loads the same model on the processor and says so).
    need = int(req.get("min_free_vram") or 0)
    if device == "cuda" and need:
        free, total = torch.cuda.mem_get_info(0)
        if free < need: raise Failure("low_vram", "Not enough free graphics memory for the voice model.", {"free": int(free), "total": int(total), "need": need})
    dtype = want["dtype"]
    if dtype == "auto": dtype = "bf16" if device == "cuda" and torch.cuda.is_bf16_supported() else ("fp16" if device == "cuda" else "fp32")
    tdtype = {"bf16": torch.bfloat16, "fp16": torch.float16, "fp32": torch.float32}[dtype]
    if device == "cpu": torch.set_num_threads(max(1, int(req.get("threads") or max(1, (os.cpu_count() or 2) - 1))))
    t0 = time.time(); used = "standard"
    try:
        if want["engine"] == "fast":
            try: from faster_qwen3_tts.model import FasterQwen3TTS
            except Exception as e: raise Failure("no_fast_engine", "This voice engine doesn't include the fast engine (" + type(e).__name__ + "). Install the fast engine in Settings → Theme voices.")
            if device == "cuda":
                fast = FasterQwen3TTS.from_pretrained(want["dir"], device="cuda", dtype=tdtype, attn_implementation="sdpa")
                model = fast.model; used = "fast"
                # Capture the CUDA graphs now, so the first line doesn't wait for it.
                try: fast.warmup()
                except torch.cuda.OutOfMemoryError: raise
                except Exception as e: raise Failure("fast_failed", "The fast engine couldn't start on this graphics card (" + (type(e).__name__ + ": " + str(e))[:200] + "). Choose the standard engine in Settings → Theme voices.")
            else:
                # On the processor the fast engine has no CUDA graphs to speed it up, so it speaks the
                # standard way. Its own streaming code can still be run without them (the repository's
                # tests do, with TYLER_FAST_PARITY=1).
                model = Qwen3TTSModel.from_pretrained(want["dir"], device_map="cpu", dtype=tdtype, attn_implementation="sdpa")
                if os.environ.get("TYLER_FAST_PARITY") == "1":
                    if not torch.cuda.is_available(): torch.cuda.synchronize = lambda *a, **k: None
                    fast = FasterQwen3TTS(model, None, None, device="cpu", dtype=tdtype); fast._warmed_up = True; used = "fast-parity"
        else:
            model = Qwen3TTSModel.from_pretrained(want["dir"], device_map=("cuda:0" if device == "cuda" else "cpu"), dtype=tdtype, attn_implementation="sdpa")
    except Failure: unload(); raise
    except torch.cuda.OutOfMemoryError:
        unload(); raise Failure("out_of_memory", "Not enough free graphics memory to load the voice model.")
    if model.model.tts_model_type != "base": unload(); raise Failure("not_clone_model", "That model can't clone voices (it isn't a Base model).")
    hook_talker()
    model_info = {**want, "dtype_used": dtype, "engine_used": used, "load_ms": int((time.time() - t0) * 1000)}
    if device == "cuda": model_info["vram_used"] = int(torch.cuda.memory_allocated(0))
    return model_info

# Cancel and progress: the talker's generate() gets a stopping check that runs once per audio frame
# (12.5 frames a second of speech), which reports progress and stops at once when cancelled.
class Progress:
    job = None; steps = 0; max = 0; chunk = 0; chunks = 0; last = 0
step = Progress()
def hook_talker():
    from transformers import StoppingCriteria, StoppingCriteriaList
    class Check(StoppingCriteria):
        def __call__(self, input_ids, scores, **kw):
            step.steps += 1; now = time.time()
            if step.job is not None and now - step.last > 0.5:
                step.last = now; send({"id": step.job, "event": "progress", "chunk": step.chunk, "chunks": step.chunks, "step": step.steps, "steps": step.max})
            return torch.full((input_ids.shape[0],), step.job in cancelled, dtype=torch.bool, device=input_ids.device)
    talker = model.model.talker; original = talker.generate
    def generate(*a, **k):
        k["stopping_criteria"] = StoppingCriteriaList([Check()]); return original(*a, **k)
    talker.generate = generate

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()

def ref_paths(ref):
    paths = ref if isinstance(ref, list) else [ref]
    if not paths or len(paths) > 40 or not all(isinstance(p, str) and p for p in paths): raise Failure("bad_reference", "The voice's reference recordings are missing.")
    for p in paths:
        if not os.path.isfile(p): raise Failure("no_reference", "One of the voice's reference recordings is missing.")
    return paths

def ref_hash(ref):
    paths = ref_paths(ref)
    return sha256(paths[0]) if not isinstance(ref, list) else hashlib.sha256("|".join(sha256(p) for p in paths).encode()).hexdigest()

def read_audio(ref):
    import librosa
    parts = []
    for i, p in enumerate(ref_paths(ref)):
        w, _ = librosa.load(p, sr=24000, mono=True)
        parts += ([np.zeros(int(24000 * 0.3), np.float32)] if i else []) + [w.astype(np.float32)]
    w = np.concatenate(parts)
    if len(w) < 24000 * 0.5: raise Failure("short_reference", "The voice's reference recording is shorter than half a second.")
    return w.astype(np.float32), 24000

def prompt_for(req):
    """The voice's conditioning (its reference's speech codes and speaker embedding), built once and cached."""
    if model is None: raise Failure("not_loaded", "The voice model isn't loaded.")
    ref, text, cache = req["ref_audio"], (req.get("ref_text") or "").strip(), req.get("cache")
    xvec = bool(req.get("xvector_only")) or not text
    rhash = ref_hash(ref)
    key = json.dumps([model_info["dir"], rhash, text, xvec])
    if key in prompts: return prompts[key], True
    from qwen_tts.inference.qwen3_tts_model import VoiceClonePromptItem
    meta = {"format": "tyler-voice-prompt-1", "model": os.path.basename(model_info["dir"].rstrip("/\\")), "ref_sha256": rhash, "ref_text": text, "xvector_only": str(xvec)}
    item = None
    if cache and os.path.exists(cache):
        try:
            from safetensors import safe_open
            with safe_open(cache, framework="pt", device="cpu") as f:
                m = f.metadata() or {}
                if all(m.get(k) == v for k, v in meta.items()):
                    code = f.get_tensor("ref_code") if "ref_code" in f.keys() else None
                    item = VoiceClonePromptItem(ref_code=None if xvec else code.to(model.device), ref_spk_embedding=f.get_tensor("spk").to(model.device), x_vector_only_mode=xvec, icl_mode=not xvec, ref_text=text or None)
        except Exception: item = None
    built = item is None
    if built:
        w, sr = read_audio(ref)
        item = model.create_voice_clone_prompt(ref_audio=(w, sr), ref_text=text or None, x_vector_only_mode=xvec)[0]
        if cache:
            from safetensors.torch import save_file
            tensors = {"spk": item.ref_spk_embedding.detach().float().cpu().contiguous()}
            if item.ref_code is not None: tensors["ref_code"] = item.ref_code.detach().cpu().contiguous()
            os.makedirs(os.path.dirname(cache), exist_ok=True); tmp = cache + ".tmp"
            save_file(tensors, tmp, metadata=meta); os.replace(tmp, cache)
    if len(prompts) > 8: prompts.pop(next(iter(prompts)))
    prompts[key] = item
    return item, not built

def prompt(req):
    _, cached = prompt_for(req); return {"cached": cached}

# Long text is made one sentence group at a time (so Stop works between them and progress is real);
# the text itself is spoken as written.
def chunks(text, limit=220):
    text = re.sub(r"\s+", " ", text).strip()
    parts = re.findall(r"[^.!?…。！？]+(?:[.!?…。！？]+[\"')\]」』]*|$)\s*", text) or [text]
    out, cur = [], ""
    for p in parts:
        while len(p) > limit:
            # Break at a comma, then a space; text with neither (a long URL, CJK) is cut at the limit.
            cut = max(p.rfind(", ", 0, limit), p.rfind("; ", 0, limit), p.rfind("，", 0, limit), p.rfind("、", 0, limit))
            if cut > limit // 3: cut += 1
            else:
                sp = p.rfind(" ", 0, limit); cut = sp if sp > limit // 3 else limit
            if cur: out.append(cur.strip()); cur = ""
            out.append(p[:cut].strip()); p = p[cut:]
        if len(cur) + len(p) > limit and cur: out.append(cur.strip()); cur = ""
        cur += p
    if cur.strip(): out.append(cur.strip())
    return [c for c in out if c]

def trim(w, sr, pad=0.06):
    if not len(w): return w
    frame = int(sr * 0.02); n = len(w) // frame
    if n < 2: return w
    e = np.sqrt(np.mean(w[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    loud = np.where(20 * np.log10(e) > 20 * np.log10(e.max()) - 40)[0]
    if not len(loud): return w
    a = max(0, loud[0] * frame - int(pad * sr)); b = min(len(w), (loud[-1] + 1) * frame + int(pad * sr))
    return w[a:b]

def expected_seconds(text): return max(0.6, len(text) / 14.5)

def speak(req):
    if model is None: raise Failure("not_loaded", "The voice model isn't loaded.")
    job = req["id"]; text = str(req.get("text") or "").strip()
    if not text: raise Failure("empty", "There's nothing to say.")
    item, _ = prompt_for(req)
    language = req.get("language") or "English"; seed = int(req.get("seed") or 1)
    pieces = chunks(text); sr_out = 24000; audio = []; t0 = time.time(); retries = 0; converted = {}
    step.job, step.chunks = job, len(pieces)
    try:
        for i, piece in enumerate(pieces):
            step.chunk = i + 1
            exp = expected_seconds(piece); step.max = int(min(1600, math.ceil((exp * 2.3 + 1.5) * 12.5)))
            best = None
            for attempt in range(2):
                if job in cancelled: raise Failure("cancelled", "Stopped.")
                torch.manual_seed(seed + i * 101 + attempt * 7919); step.steps = 0
                try:
                    if fast is not None: wavs, sr_out = fast_take(piece, item, language, step.max, job)
                    else: wavs, sr_out = model.generate_voice_clone(text=piece, language=language, voice_clone_prompt=[item], max_new_tokens=step.max)
                except torch.cuda.OutOfMemoryError:
                    raise Failure("out_of_memory", "The graphics card ran out of memory while speaking.")
                except Failure: raise
                except Exception as e:
                    if fast is None or "out of memory" in str(e).lower(): raise
                    raise Failure("fast_failed", "The fast engine couldn't speak on this PC (" + (type(e).__name__ + ": " + str(e))[:200] + "). Choose the standard engine in Settings → Theme voices.")
                if job in cancelled: raise Failure("cancelled", "Stopped.")
                w = trim(np.asarray(wavs[0], dtype=np.float32), sr_out); dur = len(w) / sr_out
                # A take far longer or shorter than the text needs is usually a stumble: try once more.
                score = abs(math.log(max(dur, 0.05) / exp))
                if best is None or score < best[0]: best = (score, w)
                if 0.4 * exp <= dur <= 2.2 * exp: break
                retries += 1
            audio.append(best[1])
        # v2.44: the "sharper voice". Stopping ends it like generation; any other failure keeps the normal take.
        if req.get("convert"):
            try: audio, converted = convert_pieces(audio, sr_out, req["convert"], job)
            except Failure as f:
                if f.code == "cancelled": raise
                converted = {"convert_error": str(f)[:300]}
            except (MemoryError, Exception) as e:
                if isinstance(e, MemoryError) or "out of memory" in str(e).lower(): knn_unload()
                converted = {"convert_error": (type(e).__name__ + ": " + str(e))[:300]}
    finally:
        step.job = None; cancelled.discard(job)
    gap = np.zeros(int(sr_out * 0.14), np.float32); joined = []
    for k, w in enumerate(audio): joined += ([gap] if k else []) + [w]
    w = np.concatenate(joined) if joined else np.zeros(1, np.float32)
    gain = max(-12.0, min(6.0, float(req.get("gain_db") or 0)))
    dry = level(w, target=-19.0 + gain); out = req["out"]; os.makedirs(os.path.dirname(out), exist_ok=True)
    write(out, dry, sr_out)
    result = {"out": out, "seconds": round(len(dry) / sr_out, 2), "ms": int((time.time() - t0) * 1000), "chunks": len(pieces), "retries": retries, **converted}
    fx = req.get("effects")
    if fx and req.get("out_fx"):
        write(req["out_fx"], level(effects(dry, sr_out, fx), target=-19.0 + gain), sr_out); result["out_fx"] = req["out_fx"]
    return result

def fast_take(piece, item, language, max_tokens, job):
    """One take with the fast engine: made in streamed chunks of 12 frames (about a second of speech),
    so progress is real and Stop works within the take."""
    parity = model_info.get("engine_used") == "fast-parity"; parts = []; sr = 24000
    gen = fast.generate_voice_clone_streaming(text=piece, language=language, voice_clone_prompt=[item], ref_text=item.ref_text or "",
                                              max_new_tokens=max_tokens, chunk_size=12, xvec_only=bool(item.x_vector_only_mode), parity_mode=parity)
    try:
        for audio, sr, _timing in gen:
            parts.append(np.asarray(audio, dtype=np.float32).reshape(-1)); step.steps += 12; now = time.time()
            if now - step.last > 0.5:
                step.last = now; send({"id": job, "event": "progress", "chunk": step.chunk, "chunks": step.chunks, "step": step.steps, "steps": step.max})
            if job in cancelled: raise Failure("cancelled", "Stopped.")
    finally: gen.close()
    return [np.concatenate(parts) if parts else np.zeros(1, np.float32)], sr

# ── v2.44: kNN-VC voice conversion (the optional "sharper voice") ────────────────────────────────────────
knn = {}; match_cache = {}
# The HiFi-GAN generator's shape (kNN-VC's hifigan/config_v1_wavlm.json; only what the generator reads).
HIFI = {"resblock": "1", "upsample_rates": [10, 8, 2, 2], "upsample_kernel_sizes": [20, 16, 4, 4], "upsample_initial_channel": 512,
        "resblock_kernel_sizes": [3, 7, 11], "resblock_dilation_sizes": [[1, 3, 5], [1, 3, 5], [1, 3, 5]], "hubert_dim": 1024, "hifi_dim": 512, "sampling_rate": 16000}
KNN_SR = 16000

def vendored(name):
    """One of the app's own vendored modules, loaded from this folder by its exact path (never from anywhere else)."""
    import importlib.util
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), name + ".py")
    if not os.path.isfile(path): raise Failure("no_conversion_code", "This voice engine's worker doesn't include voice conversion (" + name + ".py).")
    sys.dont_write_bytecode = True  # no __pycache__ beside the app's own files
    spec = importlib.util.spec_from_file_location(name, path); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod

def knn_unload():
    knn.clear(); match_cache.clear()
    if torch is not None and torch.cuda.is_available(): torch.cuda.empty_cache()

def knn_load(cv):
    device = model_info.get("device") or "cpu"
    key = (cv["wavlm"], cv["vocoder"], device)
    if knn.get("key") == key: return
    knn_unload()
    for f in (cv["wavlm"], cv["vocoder"]):
        if not os.path.isfile(f): raise Failure("no_conversion", "A voice conversion file is missing.")
    W = vendored("knnvc_wavlm"); H = vendored("knnvc_hifigan"); t0 = time.time()
    # Memory-mapped and assigned in place (not copied): about 1.2 GB less memory than a plain load (measured).
    ck = torch.load(cv["wavlm"], map_location="cpu", weights_only=True, mmap=True)
    wavlm = W.WavLM(W.WavLMConfig(ck["cfg"])); wavlm.load_state_dict(ck["model"], assign=True); del ck; gc.collect()
    wavlm = wavlm.eval().to(device)
    gen = H.Generator(H.AttrDict(HIFI)); gen.load_state_dict(torch.load(cv["vocoder"], map_location="cpu", weights_only=True)["generator"])
    gen.eval(); gen.remove_weight_norm(); gen = gen.to(device)
    knn.update(key=key, wavlm=wavlm, vocoder=gen, device=device, load_ms=int((time.time() - t0) * 1000))

def knn_features(x):
    """WavLM-Large layer-6 features of a 16 kHz waveform (a 1 x samples tensor)."""
    with torch.inference_mode():
        return knn["wavlm"].extract_features(x.to(knn["device"]), output_layer=6, ret_layer_results=False)[0].squeeze(0)

def load16(path):
    import torchaudio.functional as AF
    w, sr = sf.read(path, dtype="float32", always_2d=True); x = torch.from_numpy(np.ascontiguousarray(w.mean(axis=1)))[None]
    return AF.resample(x, sr, KNN_SR) if sr != KNN_SR else x

def matching_set(cv, job):
    """The features of the character's own recordings, as kNN-VC's get_matching_set makes them (each clip trimmed by VAD at
    both ends, trigger level 7). Built once, then cached in memory and as safetensors (tensors only)."""
    paths = cv.get("match")
    if not isinstance(paths, list) or not paths or len(paths) > 80 or not all(isinstance(p, str) and os.path.isfile(p) for p in paths):
        raise Failure("no_matching", "One of the recordings the sharper voice matches against is missing.")
    h = hashlib.sha256(("|".join([cv.get("wavlm_sha256", ""), str(cv.get("layer", 6)), str(cv.get("vad", 7))] + [sha256(p) for p in paths])).encode()).hexdigest()
    if h in match_cache: return match_cache[h], True
    meta = {"format": "tyler-knnvc-matching-1", "key": h, "clips": str(len(paths))}; cache = cv.get("cache")
    if cache and os.path.exists(cache):
        try:
            from safetensors import safe_open
            with safe_open(cache, framework="pt", device="cpu") as f:
                if (f.metadata() or {}) == meta: feats = f.get_tensor("feats"); match_cache.clear(); match_cache[h] = feats.to(knn["device"]); return match_cache[h], True
        except Exception: pass
    import torchaudio.transforms as T
    vad = T.Vad(sample_rate=KNN_SR, trigger_level=float(cv.get("vad", 7))); parts = []
    for p in paths:
        if job in cancelled: raise Failure("cancelled", "Stopped.")
        x = load16(p); front = vad(x)
        y = torch.flip(vad(torch.flip(front, (-1,))), (-1,)) if front.shape[-1] >= 0.3 * KNN_SR else front
        parts.append(knn_features(y if y.shape[-1] >= 0.3 * KNN_SR else x).float().cpu())
    feats = torch.cat(parts)
    if cache:
        from safetensors.torch import save_file
        os.makedirs(os.path.dirname(cache), exist_ok=True); tmp = cache + ".tmp"; save_file({"feats": feats.contiguous()}, tmp, metadata=meta); os.replace(tmp, cache)
    match_cache.clear(); match_cache[h] = feats.to(knn["device"])
    return match_cache[h], False

def convert_pieces(audio, sr, cv, job):
    """Each piece of the take through kNN-VC: features, the mean of the k nearest (cosine) matching frames, the vocoder."""
    import torchaudio.functional as AF
    t0 = time.time(); send({"id": job, "event": "progress", "phase": "convert", "chunk": 0, "chunks": len(audio)})
    knn_load(cv)
    if job in cancelled: raise Failure("cancelled", "Stopped.")
    pool, cached = matching_set(cv, job); k = max(1, min(16, int(cv.get("k") or 4)))
    norms = torch.norm(pool, p=2, dim=-1); out = []
    for i, w in enumerate(audio):
        if job in cancelled: raise Failure("cancelled", "Stopped.")
        send({"id": job, "event": "progress", "phase": "convert", "chunk": i + 1, "chunks": len(audio)})
        if len(w) < int(0.1 * sr): out.append(w); continue
        q = knn_features(AF.resample(torch.from_numpy(np.ascontiguousarray(w))[None], sr, KNN_SR))
        with torch.inference_mode():
            # kNN-VC's fast_cosine_dist (matcher.py), then the mean of the k nearest matching frames
            qn = torch.norm(q, p=2, dim=-1); dot = (-torch.cdist(q[None], pool[None], p=2)[0] ** 2 + qn[:, None] ** 2 + norms[None] ** 2) / 2
            dists = 1 - dot / (qn[:, None] * norms[None]); best = dists.topk(k=min(k, pool.shape[0]), largest=False, dim=-1)
            y = knn["vocoder"](pool[best.indices].mean(dim=1)[None]).squeeze().float().cpu()
        if job in cancelled: raise Failure("cancelled", "Stopped.")
        out.append(AF.resample(y[None], KNN_SR, sr)[0].numpy().astype(np.float32))
    return out, {"converted": True, "convert_ms": int((time.time() - t0) * 1000), "convert_load_ms": knn.get("load_ms"), "convert_features": {"frames": int(pool.shape[0]), "cached": cached, "k": k}}

def level(w, target=-19.0, ceiling=-1.0):
    """Same loudness for every voice (about −19 dBFS RMS), peaks kept under −1 dBFS."""
    if not len(w) or not np.any(w): return w
    rms = np.sqrt(np.mean(w ** 2)); g = 10 ** (target / 20) / max(rms, 1e-6)
    w = w * g; peak = np.abs(w).max(); lim = 10 ** (ceiling / 20)
    if peak > lim: w = np.tanh(w / lim * 0.9) / np.tanh(0.9) * lim if peak > lim * 1.6 else w * (lim / peak)
    return w.astype(np.float32)

def effects(w, sr, fx):
    """Light processing after the voice is made, only for voices whose recordings have it (radio, mask…)."""
    from scipy.signal import butter, sosfilt
    y = w.copy()
    if fx.get("highpass"): y = sosfilt(butter(4, float(fx["highpass"]), "highpass", fs=sr, output="sos"), y)
    if fx.get("lowpass"): y = sosfilt(butter(4, min(float(fx["lowpass"]), sr / 2 - 100), "lowpass", fs=sr, output="sos"), y)
    if fx.get("drive"): d = 1 + 6 * float(fx["drive"]); y = np.tanh(y * d) / np.tanh(d)
    if fx.get("crush"):
        bits = max(4, int(fx["crush"])); q = 2 ** (bits - 1); y = np.round(y * q) / q
    if fx.get("ring"):
        t = np.arange(len(y)) / sr; y = y * (1 - float(fx.get("ring_mix", .35))) + y * np.sin(2 * np.pi * float(fx["ring"]) * t) * float(fx.get("ring_mix", .35))
    if fx.get("room"):
        ir_len = int(sr * float(fx["room"])); decay = np.exp(-np.linspace(0, 6, ir_len)); rng = np.random.default_rng(3)
        ir = rng.standard_normal(ir_len) * decay * 0.12; ir[0] = 1.0
        from scipy.signal import fftconvolve
        y = fftconvolve(y, ir)[: len(y) + ir_len // 2]
    return y.astype(np.float32)

def write(path, w, sr):
    tmp = path + ".tmp.wav"; sf.write(tmp, np.clip(w, -1, 1), sr, subtype="PCM_16"); os.replace(tmp, path)

OPS = {"hello": hello, "load": load, "unload": unload, "prompt": prompt, "speak": speak}
send({"event": "ready", "protocol": PROTOCOL, "pid": os.getpid()})
while True:
    req = requests.get(); rid = req.get("id"); op = req.get("op")
    if op == "quit": unload(); send({"id": rid, "ok": True, "event": "bye"}); break
    fn = OPS.get(op)
    if fn is None: send({"id": rid, "ok": False, "code": "unknown_op", "error": "Unknown request."}); continue
    current["id"] = rid
    try: send({"id": rid, "ok": True, **(fn(req) or {})})
    except Failure as f: send({"id": rid, "ok": False, "code": f.code, "error": str(f), **({"info": f.info} if f.info else {})})
    except MemoryError: unload(); send({"id": rid, "ok": False, "code": "out_of_memory", "error": "The computer ran out of memory for the voice model."})
    except Exception as e:
        code = "out_of_memory" if "out of memory" in str(e).lower() else "error"
        if code == "out_of_memory": unload()
        send({"id": rid, "ok": False, "code": code, "error": (type(e).__name__ + ": " + str(e))[:400], "trace": traceback.format_exc()[-1500:]})
    finally: current["id"] = None
