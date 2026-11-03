using System;
using System.IO;
using System.Linq;
using System.Threading;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

// No Steam injection or code modification. Uses ordinary Windows sound endpoints.
class Program {
 static MMDevice Find(MMDeviceEnumerator e, DataFlow flow, string? id) {
  if (string.IsNullOrWhiteSpace(id)) return e.GetDefaultAudioEndpoint(flow, Role.Multimedia);
  return e.EnumerateAudioEndPoints(flow, DeviceState.Active).FirstOrDefault(x=>x.ID==id)
   ?? throw new ArgumentException("The selected audio device is disconnected.");
 }
 static int Main(string[] a) {
  try {
   using var e=new MMDeviceEnumerator();
   var cmd=a.ElementAtOrDefault(0)??"";
   if(cmd=="devices"){
    foreach(var d in e.EnumerateAudioEndPoints(DataFlow.Render,DeviceState.Active))
     Console.WriteLine("output\t"+Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(d.ID))+"\t"+d.FriendlyName.Replace('\t',' '));
    Console.WriteLine("NOTICE\tThe Steam microphone should be CABLE Output; the bot audio output should be CABLE Input.");
    return 0;
   }
   if(cmd=="play"){
    if(a.Length<3) throw new ArgumentException("play <audio-file> <base64-device-id>");
    var target=Find(e,DataFlow.Render,System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(a[2])));
    if(!File.Exists(a[1])||new FileInfo(a[1]).Length>12_000_000)throw new ArgumentException("Missing or oversized audio file.");
    using var audio=new AudioFileReader(a[1]);
    using var output=new WasapiOut(target,AudioClientShareMode.Shared,true,100);
    output.Init(audio);output.Play();
    var deadline=DateTime.UtcNow.AddSeconds(60);
    while(output.PlaybackState==PlaybackState.Playing && DateTime.UtcNow<deadline)Thread.Sleep(75);
    output.Stop();Console.WriteLine("OK");return 0;
   }
   if(cmd=="record"){
    if(a.Length<4)throw new ArgumentException("record <wave-file> <seconds> <base64-device-id>");
    int seconds=int.Parse(a[2]);if(seconds<1||seconds>12)throw new ArgumentException("Recording duration must be 1–12 seconds.");
    var dev=Find(e,DataFlow.Render,System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(a[3])));
    using var capture=new WasapiLoopbackCapture(dev);
    using var writer=new WaveFileWriter(a[1],capture.WaveFormat);
    capture.DataAvailable+=(_,args)=>writer.Write(args.Buffer,0,args.BytesRecorded);
    capture.StartRecording();Thread.Sleep(seconds*1000);capture.StopRecording();writer.Flush();Console.WriteLine("OK");return 0;
   }
   throw new ArgumentException("Use: devices, play, or record");
  }catch(Exception ex){Console.Error.WriteLine(ex.Message);return 2;}
 }
}
