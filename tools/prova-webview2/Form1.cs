using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Prova;

/// <summary>
/// Prova da troca de motor (ADR 0014): uma janela WebView2 (Edge) com o pokeidle.io, para a dona
/// tentar o login e a verificação do Cloudflare com as próprias mãos e comparar com o HDeck.
/// </summary>
public partial class Form1 : Form
{
    public Form1()
    {
        InitializeComponent();
        Text = "Prova WebView2 · Cloudflare";
        Width = 1200; Height = 820;
        var wv = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(wv);
        Load += async (_, _) =>
        {
            var pasta = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HDeck-prova-webview2");
            var env = await CoreWebView2Environment.CreateAsync(null, pasta);
            await wv.EnsureCoreWebView2Async(env);
            var url = Environment.GetCommandLineArgs().Skip(1).FirstOrDefault() ?? "https://pokeidle.io/";
            wv.CoreWebView2.Navigate(url);
        };
    }
}
