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
    if op == "load": loaded["m"] = r["model_dir"]; send({"id": rid, "ok": True, "dtype_used": "fp32", "engine_used": r.get("engine") or "standard", "load_ms": 5}); continue
    if op == "unload": loaded["m"] = None; send({"id": rid, "ok": True}); continue
    if op == "speak":
        text = r.get("text", "")
        if text == "CRASH": os._exit(3)
        if text == "OOM": send({"id": rid, "ok": False, "code": "out_of_memory", "error": "The graphics card ran out of memory while speaking."}); continue
        steps = 30 if text.startswith("SLOW") else 3
        stopped = False
        for i in range(steps):
            if rid in cancelled: stopped = True; break
            send({"id": rid, "event": "progress", "chunk": 1, "chunks": 1, "step": i + 1, "steps": steps}); time.sleep(0.05)
        if stopped: send({"id": rid, "ok": False, "code": "cancelled", "error": "Stopped."}); continue
        tone(r["out"], 0.4)
        if r.get("out_fx"): tone(r["out_fx"], 0.4)
        send({"id": rid, "ok": True, "out": r["out"], "out_fx": r.get("out_fx"), "seconds": 0.4, "ms": 150, "chunks": 1, "retries": 0, "seen": {"ref": os.path.basename(r.get("ref_audio", "")), "text": r.get("ref_text"), "fx": bool(r.get("effects"))}}); continue
    send({"id": rid, "ok": False, "code": "unknown_op", "error": "Unknown request."})
