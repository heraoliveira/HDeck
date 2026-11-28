using System.Text.Json.Nodes;
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
/// RN-154: as contas se apresentam como o Microsoft Edge comum da mesma versão: o mesmo texto de user
/// agent que o WebView2 já manda, só que sem a marca "Microsoft Edge WebView2" nas client hints, que faz
/// Google (e sites que entram com Google) recusarem o login. Vale para a página inteira desde o começo:
/// trocar no meio do caminho (só no Google) cancelava e refazia navegações e quebrava logins por redirecionamento.
/// </summary>
static class Identidade
{
    /// <summary>Aplica uma vez, antes da primeira navegação: nada é trocado no meio de um login.</summary>
    public static async Task Aplicar(CoreWebView2 w)
    {
        var versao = w.Environment.BrowserVersionString.Split(' ')[0];
        var maior = versao.Split('.')[0];
        JsonArray Marcas(string v) => new()
        {
            new JsonObject { ["brand"] = "Microsoft Edge", ["version"] = v },
            new JsonObject { ["brand"] = "Chromium", ["version"] = v },
            new JsonObject { ["brand"] = "Not.A/Brand", ["version"] = maior == v ? "24" : "24.0.0.0" },
        };
        var pedido = new JsonObject
        {
            ["userAgent"] = $"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{maior}.0.0.0 Safari/537.36 Edg/{maior}.0.0.0",
            ["userAgentMetadata"] = new JsonObject
            {
                ["brands"] = Marcas(maior),
                ["fullVersionList"] = Marcas(versao),
                ["fullVersion"] = versao,
                ["platform"] = "Windows",
                ["platformVersion"] = "19.0.0",
                ["architecture"] = "x86",
                ["model"] = "",
                ["mobile"] = false,
                ["bitness"] = "64",
                ["wow64"] = false,
            },
        };
        await w.CallDevToolsProtocolMethodAsync("Network.setUserAgentOverride", pedido.ToJsonString());
    }

    /// <summary>
    /// Só nas páginas de login do Google: tira o objeto chrome.webview, que denuncia o navegador embutido.
    /// Roda no começo de cada documento e não faz nada em nenhum outro site (o jogo não é tocado).
    /// </summary>
    public const string ScriptEsconder =
        @"(() => { const h = location.hostname; if (!/(^|\.)(accounts\.google\.com|accounts\.youtube\.com|myaccount\.google\.com)$/.test(h)) return;" +
        " try { if (window.chrome) delete window.chrome.webview } catch {} })()";
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
    private readonly string perfil;
    private readonly string? fecharEm;

    /// <summary>Depois de cada página carregada (ex.: copiar os cookies do login para as lives).</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public Func<CoreWebView2, Task>? AoCarregar { get; set; }
    private CoreWebView2Controller? ctl;

    public string Perfil => perfil;

    /// <summary>Pop-ups abertos agora (diagnóstico e testes).</summary>
    public static int Abertas { get; private set; }

    public JanelaPopup(Motor motor, string perfil, string? fecharEm, int largura, int altura)
    {
        this.motor = motor;
        this.perfil = perfil;
        this.fecharEm = fecharEm;
        Text = "HDeck";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
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
        op.ProfileName = perfil;
        ctl = await motor.Env.CreateCoreWebView2ControllerAsync(Handle, op);
        ctl.Bounds = ClientRectangle;
        var w = ctl.CoreWebView2;
        w.Settings.IsPasswordAutosaveEnabled = false;
        w.Settings.IsGeneralAutofillEnabled = false;
        w.Settings.AreHostObjectsAllowed = false;
        w.Settings.IsWebMessageEnabled = false;
        await w.AddScriptToExecuteOnDocumentCreatedAsync(Identidade.ScriptEsconder);
        await Identidade.Aplicar(w);
        w.NavigationStarting += (_, e) =>
        {
            if (!Politicas.NavegacaoPermitida(e.Uri)) e.Cancel = true;
        };
        w.LaunchingExternalUriScheme += (_, e) => e.Cancel = true;
        w.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
        // Pop-up de dentro do login (ex.: "Entrar com Google" na Twitch): abre noutra janela no mesmo perfil,
        // com a mesma identidade de Edge; ela fecha sozinha quando o site a fecha.
        w.NewWindowRequested += async (_, e) =>
        {
            e.Handled = true;
            if (!Politicas.NavegacaoPermitida(e.Uri)) return;
            var adiar = e.GetDeferral();
            try
            {
                var filha = new JanelaPopup(motor, perfil, null, 520, 720) { AoCarregar = AoCarregar };
                e.NewWindow = await filha.Montar(e.Uri);
            }
            catch (Exception ex)
            {
                motor.Log("aviso", $"pop-up do login falhou: {ex.Message}");
            }
            finally
            {
                adiar.Complete();
            }
        };
        w.NavigationCompleted += async (_, _) =>
        {
            if (AoCarregar == null) return;
            try
            {
                await AoCarregar(w);
            }
            catch
            {
                // a janela fechou no meio: na próxima carga copia de novo
            }
        };
        w.DownloadStarting += (_, e) => e.Cancel = true;
        w.DocumentTitleChanged += (_, _) => Text = w.DocumentTitle;
        w.WindowCloseRequested += (_, _) => Close();
        w.SourceChanged += (_, _) =>
        {
            if (fecharEm == null || !Uri.TryCreate(w.Source, UriKind.Absolute, out var u)) return;
            if (Politicas.DominioPertence(u.Host, fecharEm) || Politicas.DominioPertence(fecharEm, u.Host))
                _ = Task.Delay(2500).ContinueWith(_ => BeginInvoke(Close));
        };
        return w;
    }
}
