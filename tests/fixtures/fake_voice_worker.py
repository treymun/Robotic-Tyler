# A stand-in for app/theme-voices/worker/tyler_voice_worker.py that speaks the same protocol without
# any model (MOCKED: it writes a short tone, never real speech). Used by tests/theme-voices.test.mjs.
import sys, json, threading, queue, time, os, struct, math
proto = os.fdopen(os.dup(1), "w", buffering=1, encoding="utf-8"); os.dup2(2, 1); sys.stdout = sys.stderr
print("noise from a library on stdout", flush=True)  # must never reach the protocol
lock = threading.Lock()
def send(o):
    with lock: proto.write(json.dumps(o) + "\n"); proto.flush()
reqs = queue.Queue(); cancelled = set(); loaded = {"m": None}
def reader():
    for line in sys.stdin:
        r = json.loads(line)
        if r.get("op") == "cancel": cancelled.add(r.get("target")); continue
        reqs.put(r)
    reqs.put({"op": "quit"})
threading.Thread(target=reader, daemon=True).start()
def tone(path, seconds):
    sr = 24000; n = int(sr * seconds); data = b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / sr))) for i in range(n))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f: f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16) + b"data" + struct.pack("<I", len(data)) + data)
send({"event": "ready", "protocol": 1, "pid": os.getpid()})
while True:
    r = reqs.get(); rid = r.get("id"); op = r.get("op")
    if op == "quit": send({"id": rid, "ok": True, "event": "bye"}); break
    if op == "hello": send({"id": rid, "ok": True, "torch": "fake", "cuda": False}); continue
    if op == "load" and os.path.exists(os.path.join(r["model_dir"], "SLOW_LOAD")): time.sleep(8)  # a model that takes a while to load
    # v2.44 "Runs on" (MOCKED graphics card): a LOW_VRAM file in the model folder = 1.2 GB free (refused only when the
    # app asks for a minimum, as the real worker does); OOM_LOAD = the card runs out of memory loading the model.
    if op == "load" and r.get("device") == "cuda":
        if os.path.exists(os.path.join(r["model_dir"], "LOW_VRAM")) and r.get("min_free_vram") and 1.2 * 2**30 < r["min_free_vram"]:
            send({"id": rid, "ok": False, "code": "low_vram", "error": "Not enough free graphics memory for the voice model.", "info": {"free": int(1.2 * 2**30), "total": 8 * 2**30, "need": r["min_free_vram"]}}); continue
        if os.path.exists(os.path.join(r["model_dir"], "OOM_LOAD")):
            send({"id": rid, "ok": False, "code": "out_of_memory", "error": "Not enough free graphics memory to load the voice model."}); continue
    if op == "load": loaded["m"] = r["model_dir"]; loaded["device"] = r.get("device"); send({"id": rid, "ok": True, "dtype_used": "fp32", "engine_used": r.get("engine") or "standard", "load_ms": 5}); continue
    if op == "unload": loaded["m"] = None; send({"id": rid, "ok": True}); continue
    if op == "speak":
        text = r.get("text", "")
        if text == "CRASH": os._exit(3)
        if text == "OOM": send({"id": rid, "ok": False, "code": "out_of_memory", "error": "The graphics card ran out of memory while speaking."}); continue
        # v2.44: OOMCUDA runs out of graphics memory only on the card; OOMBOTH runs out wherever it is.
        if text.startswith("OOMCUDA") and loaded.get("device") == "cuda" or text.startswith("OOMBOTH"):
            send({"id": rid, "ok": False, "code": "out_of_memory", "error": "The graphics card ran out of memory while speaking." if loaded.get("device") == "cuda" else "The computer ran out of memory for the voice model."}); continue
        steps = 30 if text.startswith("SLOW") else 3
        stopped = False
        for i in range(steps):
            if rid in cancelled: stopped = True; break
            send({"id": rid, "event": "progress", "chunk": 1, "chunks": 1, "step": i + 1, "steps": steps}); time.sleep(0.05)
        if stopped: send({"id": rid, "ok": False, "code": "cancelled", "error": "Stopped."}); continue
        # v2.44 "sharper voice" (MOCKED: no WavLM, no vocoder): progress in a "convert" phase that Stop ends like
        # generation; "CONVFAIL" makes the conversion fail (the normal take is kept and the reply says why).
        conv = {}; cv = r.get("convert")
        if cv:
            csteps = 40 if "CONVSLOW" in text else 2
            for i in range(csteps):
                if rid in cancelled: stopped = True; break
                send({"id": rid, "event": "progress", "phase": "convert", "chunk": i + 1, "chunks": csteps}); time.sleep(0.05)
            if stopped: send({"id": rid, "ok": False, "code": "cancelled", "error": "Stopped."}); continue
            conv = {"convert_error": "RuntimeError: mocked conversion failure"} if "CONVFAIL" in text else {"converted": True, "convert_ms": 40, "convert_features": {"frames": 10 * len(cv.get("match", [])), "cached": False, "k": cv.get("k")}}
        tone(r["out"], 0.4)
        if r.get("out_fx"): tone(r["out_fx"], 0.4)
        send({"id": rid, "ok": True, "out": r["out"], "out_fx": r.get("out_fx"), "seconds": 0.4, "ms": 150, "chunks": 1, "retries": 0, **conv, "seen": {"convert": {"k": cv.get("k"), "match": len(cv.get("match", [])), "wavlm": os.path.basename(cv.get("wavlm", "")), "vocoder": os.path.basename(cv.get("vocoder", ""))} if cv else None, "ref": [os.path.basename(x) for x in r["ref_audio"]] if isinstance(r.get("ref_audio"), list) else os.path.basename(r.get("ref_audio", "")), "text": r.get("ref_text"), "xvector_only": bool(r.get("xvector_only")), "gain_db": r.get("gain_db", 0), "fx": bool(r.get("effects"))}}); continue
    send({"id": rid, "ok": False, "code": "unknown_op", "error": "Unknown request."})
