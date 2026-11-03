// ROBOTIC TYLER WebView2 voice test (prototype, v0.1).
//
// Left: Steam web chat in WebView2, created with the installed Evergreen runtime and its default
// browser identity (the user agent is never changed). Right: the test panel (web/panel.html).
// A diagnostics script (web/diagnostics.js) runs in the Steam page and reports what WebRTC does:
// it only reads states and numbers (levels, packet counts), never chat text or audio.
//
// Modes:
//   manual  Stage 1. Nothing of Tyler's is loaded. You join a voice channel yourself.
//   tyler   Stage 2. Tyler's Chrome extension (tyler-extension/, copied from browser-extension/)
//           is installed into this test profile with WebView2's browser-extension support.
//   bridge  Stage 2B, fallback. Only Tyler's in-page audio scripts are injected (the same files the
//           extension runs in the page) plus a small test bar: beep, listen, echo. No AI, no text.
//
// Everything lives in its own data folder, %LOCALAPPDATA%\RoboticTylerWebView2VoiceTest, so the
// production app's settings, keys and Steam sign-in are never touched.
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace RoboticTyler.WebView2VoiceTest;

public sealed class MainForm : Form
{
    const string SteamChat = "https://steamcommunity.com/chat/";
    const string PanelHost = "tyler-voice-test.local";
    static readonly string[] BridgeFiles = { "soundboard-core.js", "soundboard-audio.js", "live-pcm.js", "audio-bridge.js", "wav-codec.js", "noise-filter.js", "voice-listener.js" };

    readonly SplitContainer split = new() { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel2, SplitterWidth = 5 };
    readonly WebView2 steam = new() { Dock = DockStyle.Fill };
    readonly WebView2 panel = new() { Dock = DockStyle.Fill };
    readonly string dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RoboticTylerWebView2VoiceTest");
    readonly string appDir = AppContext.BaseDirectory;
    CoreWebView2Environment? env;
    string mode = "manual";
    string? bridgeScriptId;
    CoreWebView2BrowserExtension? tyler;
    string extensionError = "";
    bool panelReady;
    readonly List<string> pending = new();

    string ExtensionDir => Path.Combine(appDir, "tyler-extension");
    string StateFile => Path.Combine(dataDir, "test-state.json");

    public MainForm()
    {
        Text = "ROBOTIC TYLER · WebView2 voice test (prototype)";
        Width = 1560; Height = 980; MinimumSize = new Size(1100, 700);
        StartPosition = FormStartPosition.CenterScreen;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        split.Panel1.Controls.Add(steam);
        split.Panel2.Controls.Add(panel);
        Controls.Add(split);
        Shown += async (_, _) =>
        {
            split.SplitterDistance = Math.Max(500, ClientSize.Width - 470);
            await StartAsync();
        };
    }

    async Task StartAsync()
    {
        Directory.CreateDirectory(dataDir);
        mode = LoadMode();
        try
        {
            var options = new CoreWebView2EnvironmentOptions { AreBrowserExtensionsEnabled = true };
            env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(dataDir, "Profile"), options);
            await panel.EnsureCoreWebView2Async(env);
        }
        catch (WebView2RuntimeNotFoundException ex)
        {
            StartupFailed(ex, "The Microsoft Edge WebView2 Runtime isn't installed on this PC.",
                "Install the Evergreen runtime (the Evergreen Bootstrapper or Standalone Installer x64) from Microsoft's WebView2 page, then start this test again.");
            return;
        }
        catch (Exception ex)
        {
            StartupFailed(ex, "WebView2 is installed, but Windows couldn't load its files, so the test can't start. This is a problem with the Microsoft Edge WebView2 Runtime on this PC, not with Steam or Tyler.",
                "1. Restart Windows. A WebView2 update may be half-installed; the restart finishes it.\n" +
                "2. Still failing? Settings → Apps → Installed apps → Microsoft Edge WebView2 Runtime → ⋯ → Modify → Repair.\n" +
                "3. No Repair option? Download the Evergreen Standalone Installer (x64) from Microsoft's WebView2 page and run it.\n" +
                "Then start this test again.");
            return;
        }

        panel.CoreWebView2.SetVirtualHostNameToFolderMapping(PanelHost, Path.Combine(appDir, "web"), CoreWebView2HostResourceAccessKind.Deny);
        panel.CoreWebView2.Settings.IsStatusBarEnabled = false;
        panel.CoreWebView2.WebMessageReceived += OnPanelMessage;
        panel.CoreWebView2.Navigate($"https://{PanelHost}/panel.html");

        await steam.EnsureCoreWebView2Async(env);
        var core = steam.CoreWebView2;
        core.PermissionRequested += OnPermission;
        core.WebMessageReceived += OnSteamMessage;
        core.NewWindowRequested += OnNewWindow;
        core.NavigationStarting += (_, e) => ToPanel(new JsonObject { ["type"] = "nav", ["phase"] = "start", ["url"] = Short(e.Uri) });
        core.NavigationCompleted += (_, e) => ToPanel(new JsonObject { ["type"] = "nav", ["phase"] = "done", ["ok"] = e.IsSuccess, ["status"] = e.WebErrorStatus.ToString(), ["url"] = Short(core.Source) });
        core.ProcessFailed += (_, e) => ToPanel(new JsonObject { ["type"] = "process-failed", ["kind"] = e.ProcessFailedKind.ToString(), ["reason"] = e.Reason.ToString() });
        core.DocumentTitleChanged += (_, _) => { };
        await core.AddScriptToExecuteOnDocumentCreatedAsync(ReadWeb("diagnostics.js"));
        await ApplyModeAsync(mode, reload: false);
        core.Navigate(SteamChat);
    }

    // ── Startup problems ─────────────────────────────────────────────────
    // Program.cs turns off Windows' own "bad image" pop-up, so a broken runtime ends up here
    // instead of freezing the window. The details go to a text file on the desktop to send.
    void StartupFailed(Exception ex, string what, string fix)
    {
        string file = "";
        try
        {
            var folder = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) folder = dataDir;
            file = Path.Combine(folder, $"RoboticTyler-WebView2-startup-{DateTime.Now:yyyyMMdd-HHmmss}.txt");
            File.WriteAllText(file, RuntimeReport(ex), new UTF8Encoding(false));
        }
        catch { file = ""; }
        var settings = new TaskDialogButton("Open Installed apps");
        var download = new TaskDialogButton("Open the WebView2 download page");
        var page = new TaskDialogPage
        {
            Caption = Text,
            Heading = "WebView2 didn't start",
            Text = what + "\n\n" + fix + (file != "" ? "\n\nDetails were saved to " + file + " (send it to me if the fix doesn't help)." : ""),
            Icon = TaskDialogIcon.Error,
            Buttons = { settings, download, TaskDialogButton.Close },
            Expander = new TaskDialogExpander($"{ex.GetType().Name} 0x{ex.HResult:X8}: {ex.Message}"),
        };
        var answer = TaskDialog.ShowDialog(this, page);
        if (answer == settings) OpenExternal("ms-settings:appsfeatures");
        else if (answer == download) OpenExternal("https://developer.microsoft.com/microsoft-edge/webview2/");
        Close();
    }

    // Which runtime WebView2 picked and the state of each installed runtime version.
    static string RuntimeReport(Exception? ex)
    {
        var sb = new StringBuilder();
        sb.AppendLine("ROBOTIC TYLER · WebView2 voice test 0.1.1 · startup problem");
        sb.AppendLine("Time: " + DateTime.Now.ToString("u"));
        sb.AppendLine("Windows: " + RuntimeInformation.OSDescription + " · " + RuntimeInformation.OSArchitecture + " · process " + RuntimeInformation.ProcessArchitecture);
        try { sb.AppendLine("Runtime WebView2 chose: " + CoreWebView2Environment.GetAvailableBrowserVersionString()); }
        catch (Exception e) { sb.AppendLine("Runtime lookup failed: " + e.Message); }
        if (ex != null) sb.AppendLine($"Error: {ex.GetType().Name} 0x{ex.HResult:X8}: {ex.Message}");
        var roots = new[] { Environment.SpecialFolder.ProgramFilesX86, Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.LocalApplicationData }
            .Select(Environment.GetFolderPath).Where(r => !string.IsNullOrEmpty(r)).Distinct();
        foreach (var root in roots)
        {
            var app = Path.Combine(root, "Microsoft", "EdgeWebView", "Application");
            if (!Directory.Exists(app)) continue;
            sb.AppendLine("Runtime folder: " + app);
            try
            {
                foreach (var dir in Directory.GetDirectories(app).OrderBy(d => d))
                {
                    var dll = Path.Combine(dir, "EBWebView", "x64", "EmbeddedBrowserWebView.dll");
                    string info;
                    try
                    {
                        if (!File.Exists(dll)) info = "EBWebView\\x64\\EmbeddedBrowserWebView.dll is missing";
                        else
                        {
                            var fi = new FileInfo(dll);
                            string ver;
                            try { ver = FileVersionInfo.GetVersionInfo(dll).FileVersion ?? "?"; } catch (Exception e) { ver = "unreadable (" + e.Message + ")"; }
                            info = $"EmbeddedBrowserWebView.dll {fi.Length:N0} bytes, version {ver}, attributes {fi.Attributes}, modified {fi.LastWriteTime:u}";
                        }
                    }
                    catch (Exception e) { info = "couldn't read: " + e.Message; }
                    sb.AppendLine("  " + Path.GetFileName(dir) + ": " + info);
                }
            }
            catch (Exception e) { sb.AppendLine("  couldn't list: " + e.Message); }
        }
        return sb.ToString();
    }

    // ── Modes ────────────────────────────────────────────────────────────
    async Task ApplyModeAsync(string next, bool reload)
    {
        if (steam.CoreWebView2 == null) return;
        mode = next is "tyler" or "bridge" ? next : "manual";
        extensionError = "";
        var profile = steam.CoreWebView2.Profile;
        try
        {
            var installed = await profile.GetBrowserExtensionsAsync();
            tyler = installed.FirstOrDefault(x => x.Name == "ROBOTIC TYLER");
            if (mode == "tyler")
            {
                if (tyler == null)
                {
                    if (!File.Exists(Path.Combine(ExtensionDir, "manifest.json")))
                        extensionError = "tyler-extension\\manifest.json is missing next to the test app.";
                    else
                        tyler = await profile.AddBrowserExtensionAsync(ExtensionDir);
                }
                else if (!tyler.IsEnabled) await tyler.EnableAsync(true);
            }
            else if (tyler != null && tyler.IsEnabled) await tyler.EnableAsync(false);
        }
        catch (Exception ex)
        {
            extensionError = $"{ex.GetType().Name} 0x{ex.HResult:X8}: {ex.Message}";
        }

        if (mode == "bridge" && bridgeScriptId == null)
        {
            try { bridgeScriptId = await steam.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript()); }
            catch (Exception ex) { extensionError = "Bridge scripts couldn't be loaded: " + ex.Message; }
        }
        else if (mode != "bridge" && bridgeScriptId != null)
        {
            steam.CoreWebView2.RemoveScriptToExecuteOnDocumentCreated(bridgeScriptId);
            bridgeScriptId = null;
        }
        SaveMode();
        SendState();
        if (reload) steam.CoreWebView2.Reload();
    }

    // Stage 2B: Tyler's own in-page audio files, in the order the extension runs them, then the test bar.
    string BridgeScript()
    {
        var sb = new StringBuilder();
        sb.AppendLine("(function(){if(window!==window.top||location.hostname!=='steamcommunity.com'||!location.pathname.startsWith('/chat'))return;");
        foreach (var f in BridgeFiles)
        {
            var path = Path.Combine(ExtensionDir, f);
            if (!File.Exists(path)) throw new FileNotFoundException("tyler-extension\\" + f + " is missing.");
            sb.AppendLine("// ── " + f).AppendLine(File.ReadAllText(path)).AppendLine(";");
        }
        sb.AppendLine(ReadWeb("bridge-only.js"));
        sb.AppendLine("})();");
        return sb.ToString();
    }

    // ── Steam page ───────────────────────────────────────────────────────
    void OnPermission(object? sender, CoreWebView2PermissionRequestedEventArgs e)
    {
        var kind = e.PermissionKind;
        var info = new JsonObject { ["type"] = "permission", ["kind"] = kind.ToString(), ["origin"] = Origin(e.Uri), ["userInitiated"] = e.IsUserInitiated, ["mode"] = mode };
        if (kind != CoreWebView2PermissionKind.Microphone && kind != CoreWebView2PermissionKind.Camera)
        {
            info["state"] = "default";
            ToPanel(info);
            return;
        }
        var deferral = e.GetDeferral();
        BeginInvoke(() =>
        {
            var what = kind == CoreWebView2PermissionKind.Microphone ? "microphone" : "camera";
            var note = mode == "manual" ? "Allow it to test a normal voice call."
                : "Tyler's synthetic microphone should make this unnecessary, so this request means the physical " + what + " is being asked for. Choose No for the Stage 2 test.";
            var answer = MessageBox.Show(this, $"{Origin(e.Uri)} wants to use your {what}.\n\n{note}\n\nAllow?", "Permission request · WebView2 voice test",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            e.State = answer == DialogResult.Yes ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
            info["state"] = answer == DialogResult.Yes ? "allowed" : "denied";
            deferral.Complete();
            ToPanel(info);
        });
    }

    void OnSteamMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // Only the diagnostics script on Steam's own pages may report.
        if (!Uri.TryCreate(e.Source, UriKind.Absolute, out var src) || src.Scheme != "https" || src.Host != "steamcommunity.com") return;
        string json;
        try { json = e.WebMessageAsJson; } catch { return; }
        if (json.Length > 20000) return;
        ToPanelRaw("{\"type\":\"page\",\"msg\":" + json + "}");
    }

    async void OnNewWindow(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        var uri = e.Uri ?? "";
        if (uri.StartsWith("chrome-extension://", StringComparison.OrdinalIgnoreCase) || IsSteam(uri))
        {
            var deferral = e.GetDeferral();
            var popup = new PopupForm(uri.StartsWith("chrome-extension://") ? "ROBOTIC TYLER settings (test profile)" : "Steam");
            popup.Show(this);
            await popup.Web.EnsureCoreWebView2Async(env);
            e.NewWindow = popup.Web.CoreWebView2;
            e.Handled = true;
            deferral.Complete();
            return;
        }
        e.Handled = true;
        if (uri.StartsWith("https://") || uri.StartsWith("http://")) OpenExternal(uri);
    }

    // ── Panel ────────────────────────────────────────────────────────────
    async void OnPanelMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith($"https://{PanelHost}/")) return;
        JsonNode? m;
        try { m = JsonNode.Parse(e.WebMessageAsJson); } catch { return; }
        var action = m?["action"]?.GetValue<string>() ?? "";
        switch (action)
        {
            case "ready":
                panelReady = true;
                SendState();
                foreach (var p in pending) panel.CoreWebView2.PostWebMessageAsJson(p);
                pending.Clear();
                break;
            case "mode":
                await ApplyModeAsync(m?["mode"]?.GetValue<string>() ?? "manual", reload: true);
                break;
            case "reload":
                steam.CoreWebView2?.Navigate(SteamChat);
                break;
            case "devtools":
                steam.CoreWebView2?.OpenDevToolsWindow();
                break;
            case "tyler-settings":
                OpenTylerSettings();
                break;
            case "open-data":
                OpenExternal(dataDir);
                break;
            case "save-report":
                SaveReport(m?["text"]?.GetValue<string>() ?? "");
                break;
            case "copy":
                try { Clipboard.SetText(m?["text"]?.GetValue<string>() ?? ""); ToPanel(new JsonObject { ["type"] = "copied" }); } catch { }
                break;
        }
    }

    void OpenTylerSettings()
    {
        if (tyler == null) { ToPanel(new JsonObject { ["type"] = "notice", ["text"] = "Tyler isn't installed in the test profile. Switch to Stage 2 first." }); return; }
        var popup = new PopupForm("ROBOTIC TYLER settings (test profile)");
        popup.Show(this);
        popup.Navigate(env!, $"chrome-extension://{tyler.Id}/settings.html");
    }

    void SaveReport(string text)
    {
        try
        {
            var folder = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) folder = dataDir;
            var file = Path.Combine(folder, $"RoboticTyler-WebView2-voice-test-{DateTime.Now:yyyyMMdd-HHmmss}.txt");
            File.WriteAllText(file, text, new UTF8Encoding(false));
            try { Clipboard.SetText(text); } catch { }
            ToPanel(new JsonObject { ["type"] = "saved", ["path"] = file });
        }
        catch (Exception ex) { ToPanel(new JsonObject { ["type"] = "notice", ["text"] = "Couldn't save the report: " + ex.Message }); }
    }

    void SendState()
    {
        if (env == null) return;
        string ua = "";
        try { ua = steam.CoreWebView2?.Settings.UserAgent ?? ""; } catch { }
        var asm = typeof(CoreWebView2Environment).Assembly;
        var sdk = asm.GetCustomAttribute<System.Reflection.AssemblyFileVersionAttribute>()?.Version ?? asm.GetName().Version?.ToString() ?? "";
        ToPanel(new JsonObject
        {
            ["type"] = "host",
            ["app"] = "0.1.1",
            ["runtime"] = env.BrowserVersionString,
            ["sdk"] = sdk,
            ["os"] = RuntimeInformation.OSDescription,
            ["arch"] = RuntimeInformation.OSArchitecture.ToString(),
            ["userAgent"] = ua,
            ["profile"] = dataDir,
            ["mode"] = mode,
            ["extension"] = new JsonObject
            {
                ["bundled"] = File.Exists(Path.Combine(ExtensionDir, "manifest.json")),
                ["installed"] = tyler != null,
                ["enabled"] = tyler?.IsEnabled ?? false,
                ["id"] = tyler?.Id ?? "",
                ["version"] = BundledVersion(),
                ["error"] = extensionError,
            },
            ["bridgeInjected"] = bridgeScriptId != null,
        });
    }

    void ToPanel(JsonObject o) => ToPanelRaw(o.ToJsonString());
    void ToPanelRaw(string json)
    {
        if (panel.CoreWebView2 == null || !panelReady) { if (pending.Count < 500) pending.Add(json); return; }
        try { panel.CoreWebView2.PostWebMessageAsJson(json); } catch { }
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    string ReadWeb(string name) => File.ReadAllText(Path.Combine(appDir, "web", name));
    string BundledVersion()
    {
        try { return JsonNode.Parse(File.ReadAllText(Path.Combine(ExtensionDir, "manifest.json")))?["version"]?.GetValue<string>() ?? ""; }
        catch { return ""; }
    }
    string LoadMode()
    {
        try { return JsonNode.Parse(File.ReadAllText(StateFile))?["mode"]?.GetValue<string>() ?? "manual"; }
        catch { return "manual"; }
    }
    void SaveMode()
    {
        try { File.WriteAllText(StateFile, new JsonObject { ["mode"] = mode }.ToJsonString()); } catch { }
    }
    static bool IsSteam(string uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var u) && u.Scheme == "https" &&
        (u.Host == "steamcommunity.com" || u.Host.EndsWith(".steamcommunity.com") || u.Host == "store.steampowered.com" || u.Host == "help.steampowered.com" || u.Host == "login.steampowered.com");
    static string Origin(string uri) => Uri.TryCreate(uri, UriKind.Absolute, out var u) ? u.GetLeftPart(UriPartial.Authority) : uri;
    static string Short(string uri) => Uri.TryCreate(uri, UriKind.Absolute, out var u) ? u.GetLeftPart(UriPartial.Path) : "";
    static void OpenExternal(string target)
    {
        try { Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); } catch { }
    }
}
