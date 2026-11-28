using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace HDeck.Motor;

/// <summary>
/// Recebe os pedidos do HDeck e os despacha às páginas. Um único ambiente WebView2 (um processo
/// do navegador, GPU e rede compartilhados); cada conta tem o próprio perfil (cookies, armazenamento
/// e cache separados), que é o equivalente à partição de antes.
/// </summary>
sealed class Motor
{
    private readonly Saida saida;
    private readonly Dictionary<string, Pagina> paginas = new();
    private readonly Dictionary<long, TaskCompletionSource<JsonNode?>> perguntas = new();
    private long proximaPergunta;
    private CoreWebView2Environment? env;
    private Form? oculta;
    private bool encerrando;

    /// <summary>Atalhos do HDeck (RN-176): teclas que não chegam ao jogo.</summary>
    public HashSet<string> Atalhos { get; } = new();

    /// <summary>Modo de teste do HDeck (libera ler a página no mundo dela).</summary>
    public bool Teste { get; private set; }

    private readonly Metricas metricas = new();
    private readonly System.Windows.Forms.Timer ordem = new() { Interval = 1000 };

    public Motor(Saida saida)
    {
        this.saida = saida;
        // O Electron pode recriar as filhas dele (redimensionar, tela cheia): a cada 1 s as contas voltam para cima.
        ordem.Tick += (_, _) =>
        {
            foreach (var pai in paginas.Values.Select(p => p.Pai).Distinct()) Win32.TrazerContasParaFrente(pai);
        };
        ordem.Start();
    }

    public CoreWebView2Environment Env => env ?? throw new InvalidOperationException("motor não iniciado");

    public void Evento(string ev, string conta, JsonObject? dados = null)
    {
        var o = dados ?? new JsonObject();
        o["ev"] = ev;
        o["conta"] = conta;
        saida.Enviar(o);
    }

    public void Log(string nivel, string msg) => saida.Log(nivel, msg);

    /// <summary>Pergunta ao HDeck (pop-up, download) e espera a resposta.</summary>
    public Task<JsonNode?> Perguntar(string tipo, string conta, JsonObject dados)
    {
        var id = ++proximaPergunta;
        var tcs = new TaskCompletionSource<JsonNode?>();
        perguntas[id] = tcs;
        dados["ev"] = "pergunta";
        dados["tipo"] = tipo;
        dados["conta"] = conta;
        dados["pergunta"] = id;
        saida.Enviar(dados);
        return tcs.Task;
    }

    /// <summary>Janela escondida, dona dos controladores usados só para apagar perfis.</summary>
    public IntPtr JanelaOculta
    {
        get
        {
            if (oculta == null)
            {
                oculta = new Form { ShowInTaskbar = false, Opacity = 0, FormBorderStyle = FormBorderStyle.None };
                _ = oculta.Handle;
            }
            return oculta.Handle;
        }
    }

    public async void Receber(string linha)
    {
        JsonObject? m = null;
        try
        {
            m = JsonNode.Parse(linha)!.AsObject();
            if (m["resposta"] is JsonNode resp)
            {
                var id = resp.GetValue<long>();
                if (perguntas.Remove(id, out var tcs)) tcs.TrySetResult(m["r"]?.DeepClone());
                return;
            }
            var r = await Executar(m["cmd"]!.GetValue<string>(), m);
            if (m["id"] != null) saida.Enviar(new JsonObject { ["id"] = m["id"]!.DeepClone(), ["ok"] = true, ["r"] = r });
        }
        catch (Exception e)
        {
            if (m?["id"] != null)
                saida.Enviar(new JsonObject { ["id"] = m["id"]!.DeepClone(), ["ok"] = false, ["erro"] = e.Message });
            else
                saida.Log("aviso", $"pedido falhou: {e.Message}");
        }
    }

    private Pagina P(JsonObject m)
    {
        var id = m["conta"]!.GetValue<string>();
        return paginas.TryGetValue(id, out var p) ? p : throw new InvalidOperationException($"conta {id} não existe no motor");
    }

    private static string S(JsonObject m, string k, string padrao = "") => m[k]?.GetValue<string>() ?? padrao;
    private static bool B(JsonObject m, string k, bool padrao = false) => m[k]?.GetValue<bool>() ?? padrao;
    private static double D(JsonObject m, string k, double padrao = 0) => m[k]?.GetValue<double>() ?? padrao;

    public static IntPtr Hwnd(string s) => (IntPtr)long.Parse(s);

    private async Task<JsonNode?> Executar(string cmd, JsonObject m)
    {
        switch (cmd)
        {
            case "iniciar":
            {
                var op = new CoreWebView2EnvironmentOptions(S(m, "argumentos"))
                {
                    AreBrowserExtensionsEnabled = false,
                    IsCustomCrashReportingEnabled = true,
                    EnableTrackingPrevention = true,
                };
                Teste = B(m, "teste");
                env = await CoreWebView2Environment.CreateAsync(null, S(m, "pasta"), op);
                env.BrowserProcessExited += (_, e) =>
                {
                    if (encerrando) return;
                    saida.Enviar(new JsonObject { ["ev"] = "navegadorSaiu", ["motivo"] = e.BrowserProcessExitKind.ToString() });
                };
                return new JsonObject { ["versao"] = env.BrowserVersionString };
            }
            case "criar":
            {
                var id = S(m, "conta");
                if (paginas.ContainsKey(id)) throw new InvalidOperationException("conta já existe");
                var p = new Pagina(this, id, Hwnd(S(m, "janela")))
                {
                    Mudo = B(m, "mudo"),
                    Zoom = D(m, "zoom", 1),
                    Notificacoes = B(m, "notificacoes"),
                };
                paginas[id] = p;
                try
                {
                    p.Pronta = p.Montar();
                    await p.Pronta;
                }
                catch
                {
                    paginas.Remove(id);
                    throw;
                }
                p.Carregar(S(m, "url"));
                return null;
            }
            case "atalhos":
                Atalhos.Clear();
                foreach (var a in m["lista"]!.AsArray()) Atalhos.Add(a!.GetValue<string>());
                return null;
            case "apagarSessao":
                await ApagarPerfil(S(m, "conta"));
                return null;
            case "sair":
                await Encerrar();
                return null;
            case "popups": return JanelaPopup.Abertas;
            case "popupsInfo":
            {
                // Diagnóstico: o que cada pop-up/login mostra ao site (identidade e endereço).
                var lista = new JsonArray();
                foreach (var f in Application.OpenForms.OfType<JanelaPopup>().ToList())
                {
                    var w = f.Web;
                    if (w == null) continue;
                    var info = await w.ExecuteScriptAsync("JSON.stringify({ ua: navigator.userAgent, marcas: navigator.userAgentData && navigator.userAgentData.brands, webview: typeof (window.chrome && window.chrome.webview), titulo: document.title })");
                    lista.Add(new JsonObject { ["perfil"] = f.Perfil, ["url"] = w.Source, ["info"] = info });
                }
                return lista;
            }
            case "fecharPopups":
                foreach (var f in Application.OpenForms.OfType<JanelaPopup>().ToList()) f.Close();
                return null;
            case "abrirLogin":
            {
                // Regra: todo login (Twitch, Kick, Google…) abre aqui, no Edge, com a mesma identidade das contas.
                // Os cookies dos domínios pedidos voltam ao HDeck a cada página carregada (para a sessão das lives).
                var chave = S(m, "chave");
                var dominios = m["dominios"]?.AsArray().Select(x => x!.GetValue<string>()).ToList() ?? [];
                var jan = new JanelaPopup(this, S(m, "perfil"), null, 520, 760)
                {
                    AoCarregar = async w =>
                    {
                        var lista = new JsonArray();
                        foreach (var d in dominios)
                            foreach (var c in await w.CookieManager.GetCookiesAsync("https://" + d))
                                lista.Add(new JsonObject
                                {
                                    ["nome"] = c.Name,
                                    ["valor"] = c.Value,
                                    ["dominio"] = c.Domain,
                                    ["caminho"] = c.Path,
                                    ["expira"] = c.IsSession ? null : c.Expires.ToUniversalTime().Subtract(DateTime.UnixEpoch).TotalSeconds,
                                    ["httpOnly"] = c.IsHttpOnly,
                                    ["seguro"] = c.IsSecure,
                                    ["sameSite"] = c.SameSite.ToString(),
                                });
                        saida.Enviar(new JsonObject { ["ev"] = "cookiesLogin", ["chave"] = chave, ["cookies"] = lista });
                    },
                };
                var wv = await jan.Montar(S(m, "url"));
                wv.Navigate(S(m, "url"));
                return null;
            }
            case "teclado": return Win32.DonoDoTeclado(Hwnd(S(m, "janela")));
            case "devolverTeclado":
                Win32.DevolverTeclado(Hwnd(S(m, "janela")));
                return null;
            case "metricas":
                return await metricas.Coletar(env, paginas.Values, m["pids"]?.AsArray().Select(x => x!.GetValue<int>()) ?? []);
            case "processos":
            {
                var lista = new JsonArray();
                foreach (var info in Env.GetProcessInfos())
                    lista.Add(new JsonObject { ["pid"] = info.ProcessId, ["tipo"] = info.Kind.ToString() });
                return lista;
            }
        }

        var pg = P(m);
        // Os pedidos de uma página esperam ela ficar pronta (criar e renovar são assíncronos).
        try
        {
            await pg.Pronta;
        }
        catch
        {
            // a montagem falhou; o pedido abaixo vai acusar
        }
        switch (cmd)
        {
            case "carregar": pg.Carregar(S(m, "url")); return null;
            case "recarregar": await pg.Recarregar(B(m, "semCache")); return null;
            case "renovar": await pg.Renovar(); return null;
            case "fechar":
                paginas.Remove(pg.Id);
                pg.Fechar();
                return null;
            case "exibir":
                pg.Exibir(S(m, "modo"), m["janela"] is JsonNode j ? Hwnd(j.GetValue<string>()) : IntPtr.Zero,
                    D(m, "x"), D(m, "y"), D(m, "largura"), D(m, "altura"));
                return null;
            case "mudo": pg.Mudo = B(m, "valor"); pg.AplicarMudo(); return null;
            case "zoom": pg.Zoom = D(m, "valor", 1); pg.AplicarZoom(); return null;
            case "estrangular": pg.Estrangular = B(m, "valor"); pg.AplicarVisibilidade(); return null;
            case "notificacoes": pg.Notificacoes = B(m, "valor"); return null;
            case "vigiar": await pg.Vigiar(B(m, "valor")); return null;
            case "capturar":
            {
                var b = await pg.Capturar((int)D(m, "largura"), (int)D(m, "altura"), (int)D(m, "qualidade", 80),
                    (int)D(m, "naturalLargura"), (int)D(m, "naturalAltura"));
                return b == null ? null : Convert.ToBase64String(b);
            }
            case "avaliar": return await pg.Avaliar(S(m, "codigo"));
            case "avaliarPagina":
                // Só no modo de teste: lê contadores do jogo falso no mundo da página.
                if (!Teste) throw new InvalidOperationException("só no modo de teste");
                return await pg.AvaliarNaPagina(S(m, "codigo"));
            case "pid": return pg.Pid() is int pid ? pid : null;
            case "url": return pg.UrlAtual();
            case "limparCache": await pg.LimparCache(); return null;
            case "devtools": pg.AbrirDevtools(); return null;
            case "moveu": pg.PaiMoveu(); return null;
            case "estado": return pg.Estado();
            case "focar":
                // O teclado vai para a página (Ctrl+Tab e Ctrl+1…9 deixam a conta pronta para jogar).
                pg.Focar();
                return null;
        }
        throw new InvalidOperationException($"pedido desconhecido: {cmd}");
    }

    /// <summary>RN-015: apaga cookies, armazenamento e cache do perfil da conta, e o próprio perfil.</summary>
    private async Task ApagarPerfil(string conta)
    {
        if (paginas.Remove(conta, out var aberta)) aberta.Fechar();
        var op = Env.CreateCoreWebView2ControllerOptions();
        op.ProfileName = Pagina.PerfilDa(conta);
        var c = await Env.CreateCoreWebView2ControllerAsync(JanelaOculta, op);
        var perfil = c.CoreWebView2.Profile;
        await perfil.ClearBrowsingDataAsync();
        c.Close();
        perfil.Delete();
    }

    private bool encerrado;

    public async Task Encerrar()
    {
        if (encerrado) return;
        encerrado = true;
        encerrando = true;
        foreach (var t in perguntas.Values) t.TrySetResult(null);
        var navegador = env != null ? (int?)TryPid() : null;
        // Regra: nada fica aberto escondido. Pop-ups e janelas de login fecham junto com o motor.
        foreach (var f in Application.OpenForms.OfType<JanelaPopup>().ToList()) f.Close();
        foreach (var p in paginas.Values) p.Fechar();
        paginas.Clear();
        // Fechar a última página encerra o navegador, que grava cookies e armazenamento no disco (RN-011).
        if (navegador is int pid)
        {
            try
            {
                using var proc = System.Diagnostics.Process.GetProcessById(pid);
                await Task.Run(() => proc.WaitForExit(8000));
            }
            catch
            {
                // já saiu
            }
        }
        Application.ExitThread();
    }

    private int? TryPid()
    {
        try
        {
            foreach (var i in Env.GetProcessInfos())
                if (i.Kind == CoreWebView2ProcessKind.Browser) return i.ProcessId;
        }
        catch
        {
            // sem processos
        }
        return null;
    }
}

static class Win32
{
    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hwnd);

    private delegate bool Visitar(IntPtr h, IntPtr l);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr pai, Visitar f, IntPtr l);

    [DllImport("user32.dll")]
    private static extern IntPtr GetParent(IntPtr h);

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindow(IntPtr h, uint cmd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr h, IntPtr depois, int x, int y, int cx, int cy, uint flags);

    private const uint SwpNoSize = 0x1, SwpNoMove = 0x2, SwpNoActivate = 0x10, SwpNoOwnerZOrder = 0x200;
    private const uint GwChild = 5, GwHwndNext = 2;

    /// <summary>
    /// A janela do Electron tem filhas próprias (a "Intermediate D3D Window" do compositor) que ficam por
    /// cima de tudo e cobrem a conta: a tela fica preta e o mouse não chega ao jogo. As filhas deste
    /// processo (as contas) sobem para o topo da ordem; devolve true se precisou mexer.
    /// </summary>
    public static bool TrazerContasParaFrente(IntPtr pai)
    {
        if (pai == IntPtr.Zero || !IsWindow(pai)) return false;
        var meu = (uint)Environment.ProcessId;
        var nossas = new List<IntPtr>();
        EnumChildWindows(pai, (h, _) =>
        {
            if (GetParent(h) == pai && GetWindowThreadProcessId(h, out var pid) != 0 && pid == meu) nossas.Add(h);
            return true;
        }, IntPtr.Zero);
        if (nossas.Count == 0) return false;
        // Já está certo se as primeiras filhas (topo da ordem) são todas nossas.
        var topo = GetWindow(pai, GwChild);
        var certo = true;
        for (var i = 0; i < nossas.Count && topo != IntPtr.Zero; i++, topo = GetWindow(topo, GwHwndNext))
            if (!nossas.Contains(topo)) { certo = false; break; }
        if (certo) return false;
        foreach (var h in nossas)
            SetWindowPos(h, IntPtr.Zero, 0, 0, 0, 0, SwpNoMove | SwpNoSize | SwpNoActivate | SwpNoOwnerZOrder);
        return true;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetFocus();

    [DllImport("user32.dll")]
    private static extern IntPtr SetFocus(IntPtr h);

    [DllImport("user32.dll")]
    private static extern bool IsChild(IntPtr pai, IntPtr filho);

    /// <summary>
    /// O teclado fica com a janela nativa da conta depois de um clique no jogo; clicar na interface do
    /// Electron não o pega de volta (para o Chromium a janela já está ativa). As janelas das contas são filhas
    /// da do HDeck e dividem a fila de entrada, então daqui dá para devolver o foco à janela principal.
    /// </summary>
    /// <summary>Com quem está o teclado: "interface" (Electron), "conta" (WebView2) ou "nenhum".</summary>
    public static string DonoDoTeclado(IntPtr janela)
    {
        var atual = GetFocus();
        if (atual == IntPtr.Zero) return "nenhum";
        GetWindowThreadProcessId(janela, out var dono);
        GetWindowThreadProcessId(atual, out var deQuem);
        return deQuem == dono ? "interface" : "conta";
    }

    public static void DevolverTeclado(IntPtr janela)
    {
        if (janela == IntPtr.Zero || !IsWindow(janela)) return;
        var atual = GetFocus();
        // Já está com o Electron (mesmo processo da janela): nada a fazer, para não tirar o foco de um campo.
        GetWindowThreadProcessId(janela, out var dono);
        if (atual != IntPtr.Zero && GetWindowThreadProcessId(atual, out var deQuem) != 0 && deQuem == dono) return;
        SetFocus(janela);
    }

    public static double Escala(IntPtr hwnd)
    {
        var dpi = hwnd != IntPtr.Zero ? GetDpiForWindow(hwnd) : 0;
        return dpi > 0 ? dpi / 96.0 : 1.0;
    }
}
