using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using NAudio.CoreAudioApi;
using NAudio.Wave;

// ROBOTIC TYLER's Windows audio helper. No Steam injection or code modification: it only uses
// ordinary Windows sound endpoints.
//
//   devices                      list output devices (id is base64 of the endpoint id)
//   play <file> <device>         play an audio file to an output device, then exit
//   record <wav> <secs> <device> record what an output device plays (loopback) to a WAV file
//   capture <device>             stream what an output device plays as 16 kHz mono 16-bit PCM on
//                                stdout until stdin closes (continuous listening, v2.15)
//   stream <device>              play 24 kHz mono 16-bit PCM from stdin as it arrives (v2.15).
//                                stdin frames: 1 byte type, 4 bytes little-endian length, payload.
//                                Type 1 = audio, 2 = flush (drop everything queued now), 3 = end.
//                                stdout lines: PLAYING / IDLE when Tyler starts and stops talking.
//   unprotect                    DPAPI-decrypt base64 from stdin for the current Windows user
//                                (to import keys saved by the old Voice Studio app, v2.15)
//
// Exit codes: 0 ok, 2 bad arguments or other error, 3 the device stopped or was disconnected.
class Program {
 static string Id(string b64) => System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(b64));
 static MMDevice Find(MMDeviceEnumerator e, string? id, bool required) {
  if (string.IsNullOrWhiteSpace(id)) {
   if (required) throw new ArgumentException("Choose an audio device first.");
   return e.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
  }
  return e.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active).FirstOrDefault(x => x.ID == id)
   ?? throw new DeviceGone("The selected audio device is disconnected.");
 }
 class DeviceGone : Exception { public DeviceGone(string m) : base(m) {} }

 static int Main(string[] a) {
  try {
   using var e = new MMDeviceEnumerator();
   var cmd = a.ElementAtOrDefault(0) ?? "";
   if (cmd == "devices") {
    foreach (var d in e.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
     Console.WriteLine("output\t" + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(d.ID)) + "\t" + d.FriendlyName.Replace('\t', ' '));
    Console.WriteLine("NOTICE\tThe Steam microphone should be CABLE Output; the bot audio output should be CABLE Input.");
    return 0;
   }
   if (cmd == "play") {
    if (a.Length < 3) throw new ArgumentException("play <audio-file> <base64-device-id>");
    var target = Find(e, a[2] == "" ? null : Id(a[2]), false);
    if (!File.Exists(a[1]) || new FileInfo(a[1]).Length > 24_000_000) throw new ArgumentException("Missing or oversized audio file.");
    using var audio = new AudioFileReader(a[1]);
    using var output = new WasapiOut(target, AudioClientShareMode.Shared, true, 100);
    Exception? failure = null;
    output.PlaybackStopped += (_, ev) => { failure ??= ev.Exception; };
    output.Init(audio); output.Play();
    // The whole clip plays (long replies are no longer cut at 60 s); the caller kills this process to stop early.
    var deadline = DateTime.UtcNow + audio.TotalTime + TimeSpan.FromSeconds(5);
    while (output.PlaybackState == PlaybackState.Playing && DateTime.UtcNow < deadline) Thread.Sleep(50);
    output.Stop();
    if (failure != null) { Console.Error.WriteLine("The output device stopped: " + failure.Message); return 3; }
    Console.WriteLine("OK"); return 0;
   }
   if (cmd == "record") {
    if (a.Length < 4) throw new ArgumentException("record <wave-file> <seconds> <base64-device-id>");
    int seconds = int.Parse(a[2]); if (seconds < 1 || seconds > 12) throw new ArgumentException("Recording duration must be 1–12 seconds.");
    var dev = Find(e, Id(a[3]), true);
    using var capture = new WasapiLoopbackCapture(dev);
    using var writer = new WaveFileWriter(a[1], capture.WaveFormat);
    capture.DataAvailable += (_, args) => writer.Write(args.Buffer, 0, args.BytesRecorded);
    capture.StartRecording(); Thread.Sleep(seconds * 1000); capture.StopRecording(); writer.Flush(); Console.WriteLine("OK"); return 0;
   }
   if (cmd == "capture") return Capture(Find(e, Id(a.ElementAtOrDefault(1) ?? ""), true));
   if (cmd == "stream") return Stream(Find(e, Id(a.ElementAtOrDefault(1) ?? ""), true));
   if (cmd == "unprotect") {
    var input = Convert.FromBase64String(Console.In.ReadToEnd().Trim());
    Console.Write(Convert.ToBase64String(ProtectedData.Unprotect(input, null, DataProtectionScope.CurrentUser)));
    return 0;
   }
   throw new ArgumentException("Use: devices, play, record, capture, stream or unprotect");
  } catch (DeviceGone ex) { Console.Error.WriteLine(ex.Message); return 3; }
  catch (Exception ex) { Console.Error.WriteLine(ex.Message); return 2; }
 }

 // Loopback of one output device → 16 kHz mono 16-bit PCM on stdout. Only that device is heard:
 // never a microphone, and never a different device if this one goes away (the helper exits 3).
 static int Capture(MMDevice dev) {
  using var capture = new WasapiLoopbackCapture(dev);
  var format = capture.WaveFormat;
  var stdout = Console.OpenStandardOutput();
  var down = new Downsampler(format.SampleRate, 16000);
  var gate = new object(); var outBuf = new List<short>(4096);
  Exception? failure = null; var done = new ManualResetEventSlim(false);
  capture.DataAvailable += (_, args) => {
   lock (gate) {
    outBuf.Clear();
    int channels = format.Channels, bytes = format.BitsPerSample / 8, frame = bytes * channels;
    for (int i = 0; i + frame <= args.BytesRecorded; i += frame) {
     float sum = 0;
     for (int c = 0; c < channels; c++) sum += Sample(args.Buffer, i + c * bytes, format);
     down.Push(sum / channels, outBuf);
    }
    if (outBuf.Count == 0) return;
    var data = new byte[outBuf.Count * 2];
    Buffer.BlockCopy(outBuf.ToArray(), 0, data, 0, data.Length);
    try { stdout.Write(data, 0, data.Length); stdout.Flush(); } catch { done.Set(); }
   }
  };
  capture.RecordingStopped += (_, ev) => { failure ??= ev.Exception; done.Set(); };
  capture.StartRecording();
  // The app stops listening by closing stdin.
  new Thread(() => { try { Console.OpenStandardInput().CopyTo(System.IO.Stream.Null); } catch { } done.Set(); }) { IsBackground = true }.Start();
  done.Wait();
  try { capture.StopRecording(); } catch { }
  if (failure != null) { Console.Error.WriteLine("The listening device stopped: " + failure.Message); return 3; }
  return 0;
 }
 static float Sample(byte[] b, int at, WaveFormat f) {
  // The shared-mode mix format WASAPI loopback hands out is 32-bit float (plain or extensible).
  if (f.Encoding == WaveFormatEncoding.IeeeFloat || (f.Encoding == WaveFormatEncoding.Extensible && f.BitsPerSample == 32)) return BitConverter.ToSingle(b, at);
  return f.BitsPerSample switch {
   16 => BitConverter.ToInt16(b, at) / 32768f,
   24 => ((b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) << 8 >> 8) / 8388608f,
   32 => BitConverter.ToInt32(b, at) / 2147483648f,
   _ => 0f,
  };
 }

 // 24 kHz PCM from stdin → one output device, as it arrives. ReadFully keeps the device running
 // through gaps, so a reply starts the moment its first chunk lands; a flush empties the queue at once.
 static int Stream(MMDevice dev) {
  var buffer = new BufferedWaveProvider(new WaveFormat(24000, 16, 1)) { BufferDuration = TimeSpan.FromSeconds(30), DiscardOnBufferOverflow = true, ReadFully = true };
  using var output = new WasapiOut(dev, AudioClientShareMode.Shared, true, 60);
  Exception? failure = null; bool ended = false;
  output.PlaybackStopped += (_, ev) => { failure ??= ev.Exception; };
  output.Init(buffer); output.Play();
  var status = new Thread(() => {
   bool playing = false;
   while (!ended) {
    if (failure != null) { Console.Error.WriteLine("The output device stopped: " + failure.Message); Console.Out.Flush(); Environment.Exit(3); }
    bool now = buffer.BufferedDuration > TimeSpan.Zero;
    if (now != playing) { playing = now; Console.WriteLine(now ? "PLAYING" : "IDLE"); Console.Out.Flush(); }
    Thread.Sleep(30);
   }
  }) { IsBackground = true };
  status.Start();
  var stdin = Console.OpenStandardInput(); var header = new byte[5];
  while (ReadExactly(stdin, header, 5)) {
   int length = BitConverter.ToInt32(header, 1);
   if (length < 0 || length > 2_000_000) throw new ArgumentException("Bad audio frame.");
   var payload = new byte[length];
   if (!ReadExactly(stdin, payload, length)) break;
   if (header[0] == 1) buffer.AddSamples(payload, 0, length - length % 2);
   else if (header[0] == 2) buffer.ClearBuffer();
   else if (header[0] == 3) break;
  }
  // Let what's queued finish (at most 30 s), then stop.
  var until = DateTime.UtcNow.AddSeconds(30);
  while (buffer.BufferedDuration > TimeSpan.Zero && failure == null && DateTime.UtcNow < until) Thread.Sleep(30);
  ended = true; output.Stop();
  if (failure != null) { Console.Error.WriteLine("The output device stopped: " + failure.Message); return 3; }
  return 0;
 }
 static bool ReadExactly(System.IO.Stream s, byte[] buf, int count) {
  int got = 0; while (got < count) { int n = s.Read(buf, got, count - got); if (n <= 0) return false; got += n; }
  return true;
 }
}

// Averages input samples into 16 kHz output (a box filter, which also removes most aliasing).
class Downsampler {
 readonly double ratio; double next; double sum; int count; long index;
 public Downsampler(int from, int to) { ratio = Math.Max(1.0, (double)from / to); next = ratio; }
 public void Push(float s, List<short> output) {
  sum += s; count++; index++;
  if (index >= next) {
   var v = Math.Clamp(sum / count, -1.0, 1.0);
   output.Add((short)(v < 0 ? v * 32768 : v * 32767));
   sum = 0; count = 0; next += ratio;
  }
 }
}
