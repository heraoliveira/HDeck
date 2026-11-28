using System.Text;
using System.Text.Json.Nodes;

namespace HDeck.Motor;

/// <summary>
/// Ponto de entrada. Uma thread lê os pedidos (uma linha JSON cada) do stdin e entrega à thread da
/// interface, onde mora o WebView2. Quando o stdin fecha (o HDeck saiu ou caiu), o motor encerra
/// gravando as sessões.
/// </summary>
static class Programa
{
    [System.Runtime.InteropServices.DllImport("shell32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string id);

    [STAThread]
    static void Main()
    {
        // Mesma identidade do HDeck na barra de tarefas (as janelas de pop-up agrupam com ele, com o ícone dele).
        SetCurrentProcessExplicitAppUserModelID(Environment.GetEnvironmentVariable("HDECK_AUMID") ?? "br.hera.hdeck");
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        var sc = new WindowsFormsSynchronizationContext();
        SynchronizationContext.SetSynchronizationContext(sc);
        var saida = new Saida();
        var motor = new Motor(saida);
        Application.ThreadException += (_, e) => saida.Log("erro", e.Exception.ToString());
        AppDomain.CurrentDomain.UnhandledException += (_, e) => saida.Log("erro", e.ExceptionObject?.ToString() ?? "?");
        var leitor = new Thread(() =>
        {
            using var entrada = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
            string? linha;
            while ((linha = entrada.ReadLine()) != null)
            {
                var l = linha;
                sc.Post(_ => motor.Receber(l), null);
            }
            sc.Post(_ => _ = motor.Encerrar(), null);
        })
        { IsBackground = true, Name = "leitor" };
        leitor.Start();
        saida.Enviar(new JsonObject { ["ev"] = "pronto", ["pid"] = Environment.ProcessId });
        Application.Run();
    }
}

/// <summary>Escreve as respostas e eventos no stdout, uma linha JSON cada (seguro entre threads).</summary>
sealed class Saida
{
    private readonly Stream s = Console.OpenStandardOutput();
    private readonly object trava = new();

    public void Enviar(JsonObject o)
    {
        var b = Encoding.UTF8.GetBytes(o.ToJsonString() + "\n");
        lock (trava)
        {
            try
            {
                s.Write(b);
                s.Flush();
            }
            catch
            {
                // O HDeck fechou o cano: o leitor vai encerrar o motor.
            }
        }
    }

    public void Log(string nivel, string msg) =>
        Enviar(new JsonObject { ["ev"] = "log", ["nivel"] = nivel, ["msg"] = msg });
}
