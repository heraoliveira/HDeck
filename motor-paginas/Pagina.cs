using System.Drawing;
using System.Drawing.Imaging;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace HDeck.Motor;

/// <summary>
/// A página de uma conta: um controlador WebView2 no perfil da conta, filho da janela do HDeck.
/// Ao vivo fica no retângulo do espaço; em foto ou fora da tela continua visível (rodando sem
/// desacelerar), só que fora da área da janela. Os scripts do HDeck rodam num mundo isolado (CDP).
/// </summary>
sealed class Pagina
{
    /// <summary>Posição fora da área da janela, para quem não está ao vivo.</summary>
    private const int Fora = -30000;
    private const string Mundo = "hdeck";
    private const string MundoUso = "hdeck-uso";

    private readonly Motor motor;
    private CoreWebView2Controller? ctl;
    private IntPtr pai;
    private bool viva;
    private Rectangle ret = new(Fora, 0, 960, 600);
    private bool vigiando;
    private bool renovando;
    private string? urlDesejada;
    private int? pidRender;
    private readonly Dictionary<string, long> ultimoDado = new();
    private readonly Dictionary<string, string> wsUrls = new();
    private readonly HashSet<string> fechadas = new();
    private readonly List<(string, EventHandler<CoreWebView2DevToolsProtocolEventReceivedEventArgs>)> receptores = new();

    public string Id { get; }

    /// <summary>Termina quando o controlador está montado (depois de criar ou renovar).</summary>
    public Task Pronta { get; set; } = Task.CompletedTask;
    public bool Mudo { get; set; }
    public double Zoom { get; set; } = 1;
    public bool Notificacoes { get; set; }
    public bool Estrangular { get; set; }

    public Pagina(Motor motor, string id, IntPtr pai)
    {
        this.motor = motor;
        Id = id;
        this.pai = pai;
    }

    /// <summary>Nome do perfil WebView2 da conta (letras, números e hífen; até 64).</summary>
    public static string PerfilDa(string conta)
    {
        var limpo = new string(conta.Where(c => char.IsAsciiLetterOrDigit(c) || c == '-').ToArray());
        return ("conta-" + limpo)[..Math.Min(64, 6 + limpo.Length)];
    }

    private CoreWebView2 Wv => ctl?.CoreWebView2 ?? throw new InvalidOperationException("página fechada");

    private void Ev(string ev, JsonObject? dados = null) => motor.Evento(ev, Id, dados);

    public async Task Montar()
    {
        var op = motor.Env.CreateCoreWebView2ControllerOptions();
        op.ProfileName = PerfilDa(Id);
        op.IsInPrivateModeEnabled = false;
        var c = await motor.Env.CreateCoreWebView2ControllerAsync(pai, op);
        ctl = c;
        c.DefaultBackgroundColor = Color.FromArgb(255, 8, 17, 31);
        c.ShouldDetectMonitorScaleChanges = true;
        var w = c.CoreWebView2;
        var s = w.Settings;
        s.IsStatusBarEnabled = false;
        s.IsZoomControlEnabled = false;
        s.IsPinchZoomEnabled = false;
        s.IsSwipeNavigationEnabled = false;
        s.IsPasswordAutosaveEnabled = false;
        s.IsGeneralAutofillEnabled = false;
        s.AreBrowserAcceleratorKeysEnabled = false;
        s.AreDevToolsEnabled = true;
        s.AreHostObjectsAllowed = false;
        s.IsWebMessageEnabled = false;
        s.IsBuiltInErrorPageEnabled = true;
        w.Profile.PreferredTrackingPreventionLevel = CoreWebView2TrackingPreventionLevel.Basic;
        Ligar(c, w);
        AplicarMudo();
        AplicarZoom();
        Posicionar();
        AplicarVisibilidade();
        await InstalarScriptUso(w);
        await w.AddScriptToExecuteOnDocumentCreatedAsync(Identidade.ScriptEsconder);
        await Identidade.Aplicar(w);
        // A rede é observada desde antes da primeira navegação: assim o vigia conhece toda conexão
        // que a página abrir (ligar depois deixaria de fora as que já existiam). Os avisos só saem com o vigia ligado.
        await LigarRede(w);
    }

    private void Ligar(CoreWebView2Controller c, CoreWebView2 w)
    {
        w.NavigationStarting += (_, e) =>
        {
            // RN-153: só https (e http em localhost).
            if (!Politicas.NavegacaoPermitida(e.Uri))
            {
                e.Cancel = true;
                motor.Log("aviso", $"navegação bloqueada: {Politicas.SemParametros(e.Uri)}");
                return;
            }
            pidRender = null;
            Ev("comecou");
        };
        w.FrameNavigationStarting += (_, e) =>
        {
            if (!Politicas.NavegacaoPermitida(e.Uri) && !e.Uri.StartsWith("about:")) e.Cancel = true;
        };
        w.NavigationCompleted += async (_, e) =>
        {
            // Página de erro do servidor (4xx/5xx) carregou: igual ao Chromium, é carregamento com status.
            if (e.IsSuccess || e.HttpStatusCode >= 400)
            {
                renovando = false;
                Ev("carregou", new JsonObject { ["url"] = w.Source, ["status"] = e.HttpStatusCode });
                await AtualizarPid();
            }
            else
            {
                Ev("falhou", new JsonObject
                {
                    ["codigo"] = Politicas.CodigoDeErro(e.WebErrorStatus),
                    ["descricao"] = e.WebErrorStatus.ToString(),
                    ["status"] = e.HttpStatusCode,
                });
            }
        };
        w.SourceChanged += (_, _) => Ev("navegou", new JsonObject { ["url"] = w.Source });
        w.DocumentTitleChanged += (_, _) => Ev("titulo", new JsonObject { ["titulo"] = w.DocumentTitle });
        w.ProcessFailed += (_, e) =>
        {
            pidRender = null;
            var tipo = e.ProcessFailedKind;
            if (tipo == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)
            {
                Ev("travou");
                return;
            }
            if (renovando) return;
            if (tipo is CoreWebView2ProcessFailedKind.RenderProcessExited or CoreWebView2ProcessFailedKind.BrowserProcessExited)
                Ev("morreu", new JsonObject { ["motivo"] = e.Reason.ToString(), ["tipo"] = tipo.ToString() });
        };
        w.LaunchingExternalUriScheme += (_, e) => e.Cancel = true;
        w.PermissionRequested += (_, e) =>
        {
            // RN-152: nega tudo; notificações só se a conta permitir; som automático liberado.
            e.State = e.PermissionKind switch
            {
                CoreWebView2PermissionKind.Notifications => Notificacoes ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny,
                CoreWebView2PermissionKind.Autoplay => CoreWebView2PermissionState.Allow,
                // Cada download ainda pede confirmação (RN-150); esta só deixa o pedido chegar.
                CoreWebView2PermissionKind.MultipleAutomaticDownloads => CoreWebView2PermissionState.Allow,
                _ => CoreWebView2PermissionState.Deny,
            };
            e.SavesInProfile = false;
        };
        w.NewWindowRequested += async (_, e) =>
        {
            // RN-151: o HDeck decide (login abre na sessão da conta; outros perguntam).
            e.Handled = true;
            var adiar = e.GetDeferral();
            try
            {
                var r = await motor.Perguntar("popup", Id, new JsonObject { ["url"] = e.Uri });
                var acao = r?["acao"]?.GetValue<string>() ?? "negar";
                if (acao == "login" || acao == "abrir")
                {
                    var jan = new JanelaPopup(motor, Id, acao == "login" ? r?["fecharEm"]?.GetValue<string>() : null,
                        acao == "login" ? 520 : 900, acao == "login" ? 720 : 700);
                    var nova = await jan.Montar(e.Uri);
                    if (acao == "login") e.NewWindow = nova;
                    else nova.Navigate(e.Uri);
                }
            }
            catch (Exception ex)
            {
                motor.Log("aviso", $"pop-up falhou: {ex.Message}");
            }
            finally
            {
                adiar.Complete();
            }
        };
        w.DownloadStarting += async (_, e) =>
        {
            // RN-150: downloads pedem confirmação; executáveis são bloqueados (decisão no HDeck).
            var adiar = e.GetDeferral();
            try
            {
                var op = e.DownloadOperation;
                var r = await motor.Perguntar("download", Id, new JsonObject
                {
                    ["nome"] = Path.GetFileName(e.ResultFilePath),
                    ["url"] = op.Uri,
                    ["tamanho"] = (long?)op.TotalBytesToReceive ?? 0,
                });
                e.Cancel = r?["baixar"]?.GetValue<bool>() != true;
            }
            catch
            {
                e.Cancel = true;
            }
            finally
            {
                adiar.Complete();
            }
        };
        c.AcceleratorKeyPressed += (_, e) =>
        {
            if (e.KeyEventKind is not (CoreWebView2KeyEventKind.KeyDown or CoreWebView2KeyEventKind.SystemKeyDown)) return;
            var texto = Teclas.Texto(e.VirtualKey);
            if (texto == null || !motor.Atalhos.Contains(texto)) return;
            e.Handled = true;
            Ev("tecla", new JsonObject { ["texto"] = texto });
        };
        var uso = w.GetDevToolsProtocolEventReceiver("Runtime.bindingCalled");
        uso.DevToolsProtocolEventReceived += (_, _) => Ev("uso");
    }

    /// <summary>
    /// RN-043/RN-053: percebe clique ou tecla do usuário. O ouvinte mora num mundo isolado e só avisa
    /// (no máximo 1 vez por segundo); nada é injetado no mundo da página do jogo.
    /// </summary>
    private static async Task InstalarScriptUso(CoreWebView2 w)
    {
        await w.CallDevToolsProtocolMethodAsync("Runtime.addBinding",
            new JsonObject { ["name"] = "__hdeckUso", ["executionContextName"] = MundoUso }.ToJsonString());
        const string fonte = "(() => { let t = 0; const f = () => { const a = Date.now(); if (a - t < 1000) return; t = a; try { __hdeckUso('1') } catch {} };" +
            " for (const n of ['pointerdown', 'keydown']) addEventListener(n, f, { capture: true, passive: true }) })()";
        await w.CallDevToolsProtocolMethodAsync("Page.addScriptToEvaluateOnNewDocument",
            new JsonObject { ["source"] = fonte, ["worldName"] = MundoUso }.ToJsonString());
    }

    public void Carregar(string url)
    {
        urlDesejada = url;
        if (!Politicas.NavegacaoPermitida(url)) return;
        try
        {
            Wv.Navigate(url);
        }
        catch (Exception e)
        {
            Ev("falhou", new JsonObject { ["codigo"] = -300, ["descricao"] = e.Message });
        }
    }

    public string UrlAtual() => ctl == null ? urlDesejada ?? "" : (Wv.Source is { Length: > 0 } s && s != "about:blank" ? s : urlDesejada ?? "");

    public async Task Recarregar(bool semCache)
    {
        if (semCache)
        {
            try
            {
                await Wv.CallDevToolsProtocolMethodAsync("Page.reload", "{\"ignoreCache\":true}").WaitAsync(TimeSpan.FromSeconds(3));
                return;
            }
            catch
            {
                // Página travada não atende: abre num processo novo.
                await Renovar();
                return;
            }
        }
        Wv.Reload();
    }

    /// <summary>
    /// RN-058 e página travada: fecha o controlador (o processo da página vai embora com a memória
    /// acumulada) e abre outro no mesmo perfil, na mesma URL. O login fica (está no perfil).
    /// </summary>
    public async Task Renovar()
    {
        var url = UrlAtual();
        renovando = true;
        var velho = ctl;
        ctl = null;
        receptores.Clear();
        velho?.Close();
        Pronta = Montar();
        await Pronta;
        Carregar(url);
    }

    public void Fechar()
    {
        var c = ctl;
        ctl = null;
        c?.Close();
    }

    public void Exibir(string modo, IntPtr janela, double x, double y, double largura, double altura)
    {
        viva = modo == "viva";
        // Muda de janela (conta solta, grupo em janela própria, ou volta para a principal) sem recarregar.
        if (janela != IntPtr.Zero && janela != pai && Win32.IsWindow(janela))
        {
            pai = janela;
            if (ctl != null) ctl.ParentWindow = janela;
        }
        var k = Win32.Escala(pai);
        if (viva)
            ret = new Rectangle((int)Math.Round(x * k), (int)Math.Round(y * k), (int)Math.Round(largura * k), (int)Math.Round(altura * k));
        else
            ret = new Rectangle(Fora, 0, ret.Width > 0 ? ret.Width : 960, ret.Height > 0 ? ret.Height : 600);
        Posicionar();
        AplicarVisibilidade();
    }

    private void Posicionar()
    {
        if (ctl == null) return;
        ctl.Bounds = ret;
        Win32.TrazerContasParaFrente(pai);
    }

    public IntPtr Pai => pai;

    /// <summary>Onde a página está agora (em pontos da interface), para o diagnóstico e os testes.</summary>
    public JsonObject Estado()
    {
        var k = Win32.Escala(pai);
        return new JsonObject
        {
            ["viva"] = viva,
            ["naTela"] = viva && ret.X > Fora / 2,
            ["visivel"] = ctl?.IsVisible ?? false,
            ["x"] = Math.Round(ret.X / k),
            ["y"] = Math.Round(ret.Y / k),
            ["largura"] = Math.Round(ret.Width / k),
            ["altura"] = Math.Round(ret.Height / k),
            ["janela"] = ((long)pai).ToString(),
            ["pid"] = pidRender,
            ["devtools"] = devtools,
        };
    }

    public void Focar() => ctl?.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);

    public void PaiMoveu() => ctl?.NotifyParentWindowPositionChanged();

    /// <summary>Política Economizar (RN-050): fora da tela e estrangulada, a página fica oculta.</summary>
    public void AplicarVisibilidade()
    {
        if (ctl == null) return;
        var visivel = viva || !Estrangular;
        if (ctl.IsVisible != visivel) ctl.IsVisible = visivel;
    }

    public void AplicarMudo()
    {
        if (ctl != null) ctl.CoreWebView2.IsMuted = Mudo;
    }

    public void AplicarZoom()
    {
        if (ctl != null) ctl.ZoomFactor = Zoom;
    }

    public Task Vigiar(bool ligado)
    {
        vigiando = ligado;
        return Task.CompletedTask;
    }

    /// <summary>Vigia de rede (Seção 6, ADR 0005): só observa; nenhum corpo de resposta guardado.</summary>
    private async Task LigarRede(CoreWebView2 w)
    {
        void Ouvir(string metodo, Action<JsonObject> f)
        {
            var rx = w.GetDevToolsProtocolEventReceiver(metodo);
            EventHandler<CoreWebView2DevToolsProtocolEventReceivedEventArgs> h = (_, e) =>
            {
                try
                {
                    f(JsonNode.Parse(e.ParameterObjectAsJson)!.AsObject());
                }
                catch
                {
                    // evento estranho: ignora
                }
            };
            rx.DevToolsProtocolEventReceived += h;
            receptores.Add((metodo, h));
        }
        // A conexão só conta como aberta quando o servidor aceita (resposta do handshake), não ao ser criada.
        // Os dois eventos podem chegar em qualquer ordem: avisa quando tiver os dois.
        var aceitas = new HashSet<string>();
        void Abriu(string id)
        {
            if (aceitas.Contains(id) && wsUrls.TryGetValue(id, out var url)) EvRede("wsAbriu", new JsonObject { ["ws"] = id, ["url"] = url });
        }
        Ouvir("Network.webSocketCreated", p =>
        {
            var id = p["requestId"]?.ToString() ?? "";
            wsUrls[id] = p["url"]?.ToString() ?? "";
            Abriu(id);
        });
        Ouvir("Network.webSocketHandshakeResponseReceived", p =>
        {
            var id = p["requestId"]?.ToString() ?? "";
            aceitas.Add(id);
            Abriu(id);
        });
        Ouvir("Network.webSocketClosed", p =>
        {
            var id = p["requestId"]?.ToString() ?? "";
            aceitas.Remove(id);
            wsUrls.Remove(id);
            // Quadros atrasados desta conexão (outro receptor) não podem ressuscitá-la.
            fechadas.Add(id);
            EvRede("wsFechou", new JsonObject { ["ws"] = id });
        });
        Ouvir("Network.webSocketFrameReceived", p => Dado(p["requestId"]?.ToString()));
        Ouvir("Network.responseReceived", _ => Dado(null));
        await w.CallDevToolsProtocolMethodAsync("Network.enable",
            "{\"maxTotalBufferSize\":0,\"maxResourceBufferSize\":0,\"maxPostDataSize\":0}");
    }

    private void EvRede(string ev, JsonObject dados)
    {
        if (vigiando) Ev(ev, dados);
    }

    /// <summary>Dados recebidos: no máximo um aviso a cada 250 ms por conexão (o HDeck só quer saber se chega).</summary>
    private void Dado(string? ws)
    {
        if (ws != null && fechadas.Contains(ws)) return;
        var chave = ws ?? "";
        var agora = Environment.TickCount64;
        if (ultimoDado.TryGetValue(chave, out var ultimo) && agora - ultimo < 250) return;
        ultimoDado[chave] = agora;
        EvRede("dado", new JsonObject { ["ws"] = ws });
    }

    /// <summary>Roda um script num mundo isolado do quadro principal e devolve o valor (JSON).</summary>
    public async Task<JsonNode?> Avaliar(string codigo)
    {
        var w = Wv;
        var arvore = JsonNode.Parse(await w.CallDevToolsProtocolMethodAsync("Page.getFrameTree", "{}"))!;
        var quadro = arvore["frameTree"]!["frame"]!["id"]!.GetValue<string>();
        var mundo = JsonNode.Parse(await w.CallDevToolsProtocolMethodAsync("Page.createIsolatedWorld",
            new JsonObject { ["frameId"] = quadro, ["worldName"] = Mundo, ["grantUniveralAccess"] = false }.ToJsonString()))!;
        var ctx = mundo["executionContextId"]!.GetValue<int>();
        var r = JsonNode.Parse(await w.CallDevToolsProtocolMethodAsync("Runtime.evaluate", new JsonObject
        {
            ["expression"] = codigo,
            ["contextId"] = ctx,
            ["returnByValue"] = true,
            ["awaitPromise"] = true,
        }.ToJsonString()))!;
        if (r["exceptionDetails"] is JsonNode erro)
            throw new InvalidOperationException(erro["exception"]?["description"]?.ToString() ?? erro["text"]?.ToString() ?? "erro no script");
        return r["result"]?["value"]?.DeepClone();
    }

    /// <summary>Só no modo de teste: roda no mundo da página (para ler os contadores do jogo falso).</summary>
    public async Task<JsonNode?> AvaliarNaPagina(string codigo)
    {
        var r = JsonNode.Parse(await Wv.CallDevToolsProtocolMethodAsync("Runtime.evaluate", new JsonObject
        {
            ["expression"] = codigo,
            ["returnByValue"] = true,
            ["awaitPromise"] = true,
        }.ToJsonString()))!;
        return r["result"]?["value"]?.DeepClone();
    }

    /// <summary>Foto da página (Seção 4.4). Fora da tela, a página assume o tamanho do espaço antes.</summary>
    public async Task<byte[]?> Capturar(int largura, int altura, int qualidade)
    {
        if (ctl == null) return null;
        if (!viva && largura > 0 && altura > 0)
        {
            var k = Win32.Escala(pai);
            var w = (int)Math.Round(largura * k);
            var h = (int)Math.Round(altura * k);
            if (ret.Width != w || ret.Height != h)
            {
                ret = new Rectangle(Fora, 0, w, h);
                Posicionar();
            }
        }
        // Economizar: a página fica oculta (não desenha) entre as fotos; acorda só para a foto (~120 ms).
        var acordou = false;
        if (!ctl.IsVisible)
        {
            ctl.IsVisible = true;
            acordou = true;
            await Task.Delay(120);
        }
        using var ms = new MemoryStream();
        try
        {
            if (ctl == null) return null;
            var captura = Wv.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, ms);
            if (await Task.WhenAny(captura, Task.Delay(3000)) != captura) return null;
            await captura;
        }
        finally
        {
            if (acordou) AplicarVisibilidade();
        }
        if (ms.Length == 0) return null;
        if (largura == 0 || altura == 0) return ms.ToArray();
        ms.Position = 0;
        using var img = new Bitmap(ms);
        using var saida = new MemoryStream();
        if (img.Width > largura)
        {
            var alt = Math.Max(1, (int)Math.Round(img.Height * (largura / (double)img.Width)));
            using var menor = new Bitmap(largura, alt);
            using (var g = Graphics.FromImage(menor))
            {
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.DrawImage(img, 0, 0, largura, alt);
            }
            Jpeg(menor, saida, qualidade);
        }
        else
        {
            Jpeg(img, saida, qualidade);
        }
        return saida.ToArray();
    }

    private static void Jpeg(Image img, Stream s, int qualidade)
    {
        var cod = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
        using var p = new EncoderParameters(1);
        p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)qualidade);
        img.Save(s, cod, p);
    }

    /// <summary>Descobre o processo que desenha esta página (para RAM e CPU por conta).</summary>
    private async Task AtualizarPid()
    {
        if (ctl == null) return;
        try
        {
            var quadro = Wv.FrameId;
            foreach (var info in await motor.Env.GetProcessExtendedInfosAsync())
            {
                if (info.ProcessInfo.Kind != CoreWebView2ProcessKind.Renderer) continue;
                if (info.AssociatedFrameInfos.Any(f => f.FrameId == quadro))
                {
                    pidRender = info.ProcessInfo.ProcessId;
                    Ev("pid", new JsonObject { ["pid"] = pidRender });
                    return;
                }
            }
        }
        catch
        {
            // tenta de novo no próximo carregamento
        }
    }

    public int? Pid() => pidRender;

    /// <summary>Id do quadro principal (para achar os processos desta página).</summary>
    public uint FrameId => ctl?.CoreWebView2.FrameId ?? 0;

    public async Task LimparCache()
    {
        // Só os arquivos guardados: nunca cookies, armazenamento ou login (RN-056).
        await Wv.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache | CoreWebView2BrowsingDataKinds.CacheStorage);
    }

    private bool devtools;

    public void AbrirDevtools()
    {
        Wv.OpenDevToolsWindow();
        devtools = true;
    }
}
