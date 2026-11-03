using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace RoboticTyler.WebView2VoiceTest;

// A window for Steam pop-ups and for Tyler's settings page (chrome-extension://…/settings.html)
// in the same test profile.
public sealed class PopupForm : Form
{
    public WebView2 Web { get; } = new() { Dock = DockStyle.Fill };

    public PopupForm(string title)
    {
        Text = title + " · WebView2 voice test";
        Width = 1180; Height = 860;
        StartPosition = FormStartPosition.CenterParent;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        Controls.Add(Web);
    }

    public async void Navigate(CoreWebView2Environment env, string url)
    {
        try
        {
            await Web.EnsureCoreWebView2Async(env);
            Web.CoreWebView2.NavigationCompleted += (_, e) =>
            {
                if (!e.IsSuccess) MessageBox.Show(this, $"{url} didn't open ({e.WebErrorStatus}). Note this in the report: WebView2 may not open extension pages.", Text);
            };
            Web.CoreWebView2.Navigate(url);
        }
        catch (Exception ex) { MessageBox.Show(this, "Couldn't open " + url + ": " + ex.Message, Text); }
    }
}
