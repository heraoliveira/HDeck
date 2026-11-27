using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;

namespace HDeck.Motor;

/// <summary>
/// Cópia fiel, em C#, das regras puras de src/main/nucleo/seguranca/politicas.ts que precisam ser
/// decididas na hora (sem ida e volta ao HDeck). Os testes de segurança conferem as duas.
/// </summary>
static class Politicas
{
    private static bool EhLocal(Uri u) => u.Host is "localhost" or "127.0.0.1" or "[::1]";

    /// <summary>RN-153: só https (e http em localhost); about:blank.</summary>
    public static bool NavegacaoPermitida(string url)
    {
        if (url == "about:blank") return true;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return false;
        if (u.Scheme == "https") return true;
        return u.Scheme == "http" && EhLocal(u);
    }

    public static string SemParametros(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) ? u.GetLeftPart(UriPartial.Path) : "?";

    public static bool DominioPertence(string host, string dominio)
    {
        var h = host.ToLowerInvariant();
        var d = dominio.ToLowerInvariant();
        return h == d || h.EndsWith("." + d);
    }

    /// <summary>Erro do WebView2 no código de rede do Chromium que o núcleo já conhece (-3 = abortado).</summary>
    public static int CodigoDeErro(CoreWebView2WebErrorStatus s) => s switch
    {
        CoreWebView2WebErrorStatus.OperationCanceled => -3,
        CoreWebView2WebErrorStatus.Timeout => -7,
        CoreWebView2WebErrorStatus.ConnectionReset => -101,
        CoreWebView2WebErrorStatus.CannotConnect => -102,
        CoreWebView2WebErrorStatus.ConnectionAborted => -103,
        CoreWebView2WebErrorStatus.HostNameNotResolved => -105,
        CoreWebView2WebErrorStatus.Disconnected => -106,
        CoreWebView2WebErrorStatus.ServerUnreachable => -109,
        CoreWebView2WebErrorStatus.CertificateCommonNameIsIncorrect => -200,
        CoreWebView2WebErrorStatus.CertificateExpired => -201,
        CoreWebView2WebErrorStatus.ClientCertificateContainsErrors => -202,
        CoreWebView2WebErrorStatus.CertificateRevoked => -206,
        CoreWebView2WebErrorStatus.CertificateIsInvalid => -207,
        CoreWebView2WebErrorStatus.ErrorHttpInvalidServerResponse => -320,
        CoreWebView2WebErrorStatus.RedirectFailed => -310,
        CoreWebView2WebErrorStatus.ValidAuthenticationCredentialsRequired => -401,
        CoreWebView2WebErrorStatus.ValidProxyAuthenticationRequired => -407,
        _ => -2,
    };
}

/// <summary>
/// RN-154: só nas páginas de login do Google a página se apresenta como Firefox, sem client hints
/// (o Google recusa login em navegador embutido olhando esses dois). Fora delas, nada muda (RN-002).
/// A troca vale a partir da navegação: a atual é cancelada, a identidade muda e ela recomeça.
/// </summary>
sealed class LoginGoogle
{
    public const string Firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0";
    private static readonly string[] Hosts = ["accounts.google.com", "accounts.youtube.com", "myaccount.google.com"];
    private bool ativo;

    public static bool Eh(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) && Hosts.Any(h => Politicas.DominioPertence(u.Host, h));

    /// <summary>Devolve true se cancelou a navegação para trocar a identidade (ela recomeça sozinha).</summary>
    public bool Trocar(CoreWebView2 w, CoreWebView2NavigationStartingEventArgs e)
    {
        var quer = Eh(e.Uri);
        if (quer == ativo) return false;
        e.Cancel = true;
        var uri = e.Uri;
        _ = Aplicar(w, quer).ContinueWith(_ => w.Navigate(uri), TaskScheduler.FromCurrentSynchronizationContext());
        return true;
    }

    public async Task Aplicar(CoreWebView2 w, bool google)
    {
        ativo = google;
        // Sem userAgentMetadata o Chromium não manda client hints; texto vazio desfaz a troca.
        await w.CallDevToolsProtocolMethodAsync("Network.setUserAgentOverride",
            new System.Text.Json.Nodes.JsonObject { ["userAgent"] = google ? Firefox : "" }.ToJsonString());
    }
}

/// <summary>Tecla do WebView2 no mesmo texto dos atalhos do HDeck ("Ctrl+Shift+R", "F5").</summary>
static class Teclas
{
    [DllImport("user32.dll")]
    private static extern short GetKeyState(int vk);

    private static bool Apertada(int vk) => (GetKeyState(vk) & 0x8000) != 0;

    public static string? Texto(uint vk)
    {
        string? k = vk switch
        {
            >= 0x41 and <= 0x5A => ((char)vk).ToString(),
            >= 0x30 and <= 0x39 => ((char)vk).ToString(),
            >= 0x60 and <= 0x69 => ((char)('0' + (vk - 0x60))).ToString(),
            >= 0x70 and <= 0x87 => "F" + (vk - 0x6F),
            0x09 => "Tab",
            0x20 => "Space",
            0x1B => "Escape",
            0x0D => "Enter",
            0x25 => "ArrowLeft",
            0x26 => "ArrowUp",
            0x27 => "ArrowRight",
            0x28 => "ArrowDown",
            0xBC => ",",
            0xBE => ".",
            0xBD => "-",
            0xBB => "=",
            _ => null,
        };
        if (k == null) return null;
        var partes = new List<string>();
        if (Apertada(0x11) || Apertada(0x5B) || Apertada(0x5C)) partes.Add("Ctrl");
        if (Apertada(0x12)) partes.Add("Alt");
        if (Apertada(0x10)) partes.Add("Shift");
        partes.Add(k);
        return string.Join("+", partes);
    }
}

/// <summary>
/// Pop-up de uma conta (RN-151), na mesma sessão (perfil) dela. O de login fecha sozinho quando
/// volta ao site do jogo.
/// </summary>
sealed class JanelaPopup : Form
{
    private readonly Motor motor;
    private readonly string conta;
    private readonly string? fecharEm;
    private readonly LoginGoogle google = new();
    private CoreWebView2Controller? ctl;

    /** Pop-ups abertos agora (diagnóstico e testes). */
    public static int Abertas { get; private set; }

    public JanelaPopup(Motor motor, string conta, string? fecharEm, int largura, int altura)
    {
        this.motor = motor;
        this.conta = conta;
        this.fecharEm = fecharEm;
        Text = "HDeck";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(LogicalToDeviceUnits(largura), LogicalToDeviceUnits(altura));
        BackColor = Color.FromArgb(8, 17, 31);
        Resize += (_, _) =>
        {
            if (ctl != null) ctl.Bounds = ClientRectangle;
        };
        Abertas++;
        FormClosed += (_, _) =>
        {
            Abertas--;
            ctl?.Close();
        };
    }

    public async Task<CoreWebView2> Montar(string urlInicial)
    {
        Show();
        var op = motor.Env.CreateCoreWebView2ControllerOptions();
        op.ProfileName = Pagina.PerfilDa(conta);
        ctl = await motor.Env.CreateCoreWebView2ControllerAsync(Handle, op);
        ctl.Bounds = ClientRectangle;
        var w = ctl.CoreWebView2;
        w.Settings.IsPasswordAutosaveEnabled = false;
        w.Settings.IsGeneralAutofillEnabled = false;
        w.Settings.AreHostObjectsAllowed = false;
        w.Settings.IsWebMessageEnabled = false;
        if (LoginGoogle.Eh(urlInicial)) await google.Aplicar(w, true);
        w.NavigationStarting += (_, e) =>
        {
            if (!Politicas.NavegacaoPermitida(e.Uri)) e.Cancel = true;
            else google.Trocar(w, e);
        };
        w.LaunchingExternalUriScheme += (_, e) => e.Cancel = true;
        w.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
        w.NewWindowRequested += (_, e) => e.Handled = true;
        w.DownloadStarting += (_, e) => e.Cancel = true;
        w.DocumentTitleChanged += (_, _) => Text = w.DocumentTitle;
        w.WindowCloseRequested += (_, _) => Close();
        w.SourceChanged += (_, _) =>
        {
            if (fecharEm == null || !Uri.TryCreate(w.Source, UriKind.Absolute, out var u)) return;
            if (Politicas.DominioPertence(u.Host, fecharEm) || Politicas.DominioPertence(fecharEm, u.Host))
                _ = Task.Delay(1000).ContinueWith(_ => BeginInvoke(Close));
        };
        return w;
    }
}
