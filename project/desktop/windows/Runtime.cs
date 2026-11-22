using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;

namespace BotcPdf
{
    /// <summary>Распаковывает комплект генератора и запускает его с выбранными путями.</summary>
    internal static class Runtime
    {
        internal static async Task<string[]> Generate(string script, string output, bool renameDuplicates)
        {
            string runtime = Prepare();
            ProcessStartInfo start = new ProcessStartInfo(Path.Combine(runtime, "node.exe"))
            {
                Arguments = @"dist\desktop\generate.js",
                WorkingDirectory = runtime,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            start.EnvironmentVariables["BOTC_DESKTOP_SCRIPT"] = script;
            start.EnvironmentVariables["BOTC_DESKTOP_OUTPUT"] = output;
            start.EnvironmentVariables["BOTC_DESKTOP_RENAME_DUPLICATES"] = renameDuplicates ? "1" : "0";
            start.EnvironmentVariables["PLAYWRIGHT_BROWSERS_PATH"] = Path.Combine(runtime, "browsers");
            start.EnvironmentVariables.Remove("NODE_OPTIONS");
            start.EnvironmentVariables.Remove("NODE_PATH");

            using (Process process = Process.Start(start))
            {
                Task<string> stdout = process.StandardOutput.ReadToEndAsync();
                Task<string> stderr = process.StandardError.ReadToEndAsync();
                await Task.WhenAll(stdout, stderr);
                process.WaitForExit();
                if (process.ExitCode != 0)
                {
                    string message = stderr.Result.Trim();
                    throw new InvalidOperationException(message.Length == 0 ? "Не удалось создать PDF." : message);
                }

                string[] files = stdout.Result.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                if (files.Length != 2 || !files.All(File.Exists))
                    throw new InvalidOperationException("Не удалось найти обе готовые памятки.");
                return files;
            }
        }

        private static string Prepare()
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            string resource = assembly.GetManifestResourceNames().Single(name => name.StartsWith("BotcRuntime."));
            string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string cache = Path.GetFullPath(Path.Combine(localData, "BOTC PDF"));
            string runtime = Path.GetFullPath(Path.Combine(cache, Path.GetFileNameWithoutExtension(resource)));
            string staging = Path.GetFullPath(Path.Combine(cache, "extract-" + Guid.NewGuid().ToString("N")));
            if (Path.GetDirectoryName(staging) != cache || Path.GetDirectoryName(runtime) != cache)
                throw new IOException("Не удалось определить папку встроенного движка.");
            if (Directory.Exists(runtime)) return runtime;

            try
            {
                using (Stream stream = assembly.GetManifestResourceStream(resource))
                using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
                    archive.ExtractToDirectory(staging);

                try
                {
                    Directory.Move(staging, runtime);
                }
                catch (IOException)
                {
                    if (!Directory.Exists(runtime)) throw;
                }
                return runtime;
            }
            catch (Exception error)
            {
                throw new IOException("Не удалось распаковать встроенный движок. Проверьте свободное место на диске.", error);
            }
            finally
            {
                try
                {
                    if (Directory.Exists(staging)) Directory.Delete(staging, true);
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }
    }
}
