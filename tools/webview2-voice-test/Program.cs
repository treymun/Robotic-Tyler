using System.Runtime.InteropServices;

namespace RoboticTyler.WebView2VoiceTest;

static class Program
{
    // SEM_FAILCRITICALERRORS | SEM_NOOPENFILEERRORBOX: if a WebView2 runtime file can't be loaded,
    // the call fails and the test explains what to do, instead of Windows showing a "bad image"
    // box that freezes the window.
    [DllImport("kernel32.dll")]
    static extern uint SetErrorMode(uint mode);

    [STAThread]
    static void Main()
    {
        SetErrorMode(0x0001 | 0x8000);
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }
}
