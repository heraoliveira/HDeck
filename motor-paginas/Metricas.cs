using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace HDeck.Motor;

/// <summary>
/// RAM e CPU de todos os processos do HDeck (Electron, motor e WebView2), medidos do mesmo jeito que o
/// Gerenciador de Tarefas: memória = conjunto de trabalho privado; CPU = % do computador inteiro
/// (todos os núcleos somam 100%). Cada processo renderer do WebView2 é atribuído à conta dona dos
/// quadros dele (a página e os iframes).
/// </summary>
sealed class Metricas
{
    private readonly Dictionary<int, (TimeSpan cpu, long quando)> anteriores = new();

    [StructLayout(LayoutKind.Sequential)]
    private struct Contadores
    {
        public uint cb;
        public uint PageFaultCount;
        public nuint PeakWorkingSetSize, WorkingSetSize, QuotaPeakPagedPoolUsage, QuotaPagedPoolUsage,
            QuotaPeakNonPagedPoolUsage, QuotaNonPagedPoolUsage, PagefileUsage, PeakPagefileUsage, PrivateUsage,
            PrivateWorkingSetSize;
        public ulong SharedCommitUsage;
    }

    [DllImport("psapi.dll", SetLastError = true)]
    private static extern bool GetProcessMemoryInfo(IntPtr processo, ref Contadores c, uint tamanho);

    private static double RamMb(Process p)
    {
        var c = new Contadores { cb = (uint)Marshal.SizeOf<Contadores>() };
        try
        {
            if (GetProcessMemoryInfo(p.Handle, ref c, c.cb)) return c.PrivateWorkingSetSize / 1048576.0;
        }
        catch
        {
            // sem acesso: cai no conjunto de trabalho
        }
        return p.WorkingSet64 / 1048576.0;
    }

    /// <summary>% do computador desde a última medição deste processo (0 na primeira).</summary>
    private double CpuPct(Process p)
    {
        var agora = Stopwatch.GetTimestamp();
        var cpu = p.TotalProcessorTime;
        var pct = 0.0;
        if (anteriores.TryGetValue(p.Id, out var antes))
        {
            var parede = (agora - antes.quando) / (double)Stopwatch.Frequency;
            if (parede > 0) pct = (cpu - antes.cpu).TotalSeconds / parede / Environment.ProcessorCount * 100;
        }
        anteriores[p.Id] = (cpu, agora);
        return Math.Max(0, Math.Round(pct, 1));
    }

    private JsonObject? Medir(int pid, string tipo)
    {
        try
        {
            using var p = Process.GetProcessById(pid);
            return new JsonObject { ["pid"] = pid, ["tipo"] = tipo, ["ramMb"] = Math.Round(RamMb(p), 1), ["cpuPct"] = CpuPct(p) };
        }
        catch
        {
            anteriores.Remove(pid);
            return null;
        }
    }

    public async Task<JsonObject> Coletar(CoreWebView2Environment? env, IEnumerable<Pagina> paginas, IEnumerable<int> pidsElectron)
    {
        var processos = new JsonArray();
        var porConta = new JsonObject();
        var vistos = new HashSet<int>();
        void Somar(string conta, JsonObject m)
        {
            if (porConta[conta] is JsonObject s)
            {
                s["ramMb"] = Math.Round(s["ramMb"]!.GetValue<double>() + m["ramMb"]!.GetValue<double>(), 1);
                s["cpuPct"] = Math.Round(s["cpuPct"]!.GetValue<double>() + m["cpuPct"]!.GetValue<double>(), 1);
            }
            else
            {
                porConta[conta] = new JsonObject { ["ramMb"] = m["ramMb"]!.DeepClone(), ["cpuPct"] = m["cpuPct"]!.DeepClone() };
            }
        }
        if (env != null)
        {
            var quadroDaConta = paginas.Where(p => p.FrameId != 0).ToDictionary(p => p.FrameId, p => p.Id);
            foreach (var info in await env.GetProcessExtendedInfosAsync())
            {
                var pid = info.ProcessInfo.ProcessId;
                if (!vistos.Add(pid)) continue;
                var m = Medir(pid, info.ProcessInfo.Kind.ToString());
                if (m == null) continue;
                string? dona = null;
                foreach (var q in info.AssociatedFrameInfos)
                {
                    var raiz = q;
                    while (raiz.ParentFrameInfo != null) raiz = raiz.ParentFrameInfo;
                    if (quadroDaConta.TryGetValue(raiz.FrameId, out var c))
                    {
                        dona = c;
                        if (q.ParentFrameInfo == null) m["principal"] = true;
                    }
                }
                if (dona != null)
                {
                    m["conta"] = dona;
                    Somar(dona, m);
                }
                processos.Add(m);
            }
        }
        foreach (var (pid, tipo) in pidsElectron.Select(p => (p, "Electron")).Append((Environment.ProcessId, "Motor")))
            if (vistos.Add(pid) && Medir(pid, tipo) is JsonObject m) processos.Add(m);
        // Processos que sumiram não guardam medição velha.
        foreach (var pid in anteriores.Keys.Where(k => !vistos.Contains(k)).ToList()) anteriores.Remove(pid);
        return new JsonObject { ["processos"] = processos, ["porConta"] = porConta, ["nucleos"] = Environment.ProcessorCount };
    }
}
