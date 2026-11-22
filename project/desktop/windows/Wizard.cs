using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BotcPdf
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new Wizard());
        }
    }

    /// <summary>Проводит пользователя от выбора сценариев до открытия готовых памяток.</summary>
    internal sealed class Wizard : Form
    {
        private readonly Label heading = new Label();
        private readonly Label prompt = new Label();
        private readonly Label status = new Label();
        private readonly TextBox location = new TextBox { ReadOnly = true };
        private readonly Button browse = new Button { Text = "Обзор…" };
        private readonly Button back = new Button { Text = "Назад" };
        private readonly Button forward = new Button();
        private readonly TableLayoutPanel picker = new TableLayoutPanel();
        private readonly FlowLayoutPanel results = new FlowLayoutPanel();
        private string[] scripts = new string[0];
        private string destination = "";
        private int step;
        private bool busy;

        internal Wizard()
        {
            Text = "BOTC — генератор памяток";
            Font = new Font("Segoe UI", 10);
            AutoScaleMode = AutoScaleMode.Dpi;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(610, 450);
            MinimumSize = Size;
            BackColor = Color.White;
            MaximizeBox = false;

            TableLayoutPanel layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 6, Padding = new Padding(24)
            };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 85));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            Controls.Add(layout);

            heading.Font = new Font(Font.FontFamily, 19, FontStyle.Bold);
            heading.Dock = DockStyle.Fill;
            prompt.Dock = DockStyle.Fill;
            status.Dock = DockStyle.Fill;
            layout.Controls.Add(heading, 0, 0);
            layout.Controls.Add(prompt, 0, 1);
            layout.Controls.Add(picker, 0, 2);
            layout.Controls.Add(status, 0, 3);
            layout.Controls.Add(results, 0, 4);

            picker.Dock = DockStyle.Fill;
            picker.ColumnCount = 2;
            picker.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            picker.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 104));
            location.Dock = DockStyle.Fill;
            browse.Dock = DockStyle.Fill;
            picker.Controls.Add(location, 0, 0);
            picker.Controls.Add(browse, 1, 0);
            browse.Click += (sender, args) => ChooseLocation();

            results.Dock = DockStyle.Fill;
            results.AutoScroll = true;
            results.WrapContents = false;
            results.FlowDirection = FlowDirection.TopDown;
            FlowLayoutPanel navigation = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft
            };
            forward.AutoSize = true;
            forward.MinimumSize = new Size(112, 28);
            forward.BackColor = Color.FromArgb(87, 55, 99);
            forward.ForeColor = Color.White;
            forward.FlatStyle = FlatStyle.Flat;
            navigation.Controls.Add(forward);
            navigation.Controls.Add(back);
            layout.Controls.Add(navigation, 0, 5);
            AcceptButton = forward;

            forward.Click += async (sender, args) => await Advance();
            back.Click += (sender, args) => ShowStep(step == 2 ? 0 : step - 1);
            FormClosing += (sender, args) => { args.Cancel = busy; };
            ShowStep(0);
        }

        private void ShowStep(int next)
        {
            step = next;
            heading.Text = new[] { "Выбор сценариев", "Сохранение памяток", "Результаты генерации" }[step];
            prompt.Text = new[]
            {
                "Шаг 1 из 2. Выберите один или несколько JSON-файлов BOTC.",
                "Шаг 2 из 2. Выберите папку для всех памяток.",
                "Откройте готовые памятки или папку с результатами."
            }[step];
            browse.Text = step == 2 ? "Папка" : "Обзор…";
            location.AccessibleName = step == 0 ? "Выбранные сценарии" : "Папка для памяток";
            string selection = scripts.Length == 1
                ? scripts[0]
                : string.Join("; ", Array.ConvertAll<string, string>(scripts, Path.GetFileName));
            location.Text = step == 0 ? selection : destination;
            status.Text = "";
            back.Visible = step != 0;
            back.Text = step == 2 ? "Выбрать сценарии" : "Назад";
            back.AutoSize = true;
            results.Visible = step == 2;
            forward.Text = new[] { "Далее", "Создать PDF", "Закрыть" }[step];
            forward.Enabled = step != 0 || scripts.Length > 0;
        }

        private void ChooseLocation()
        {
            if (step == 0)
            {
                using (OpenFileDialog dialog = new OpenFileDialog())
                {
                    dialog.Filter = "Сценарий BOTC (*.json)|*.json";
                    dialog.Multiselect = true;
                    if (scripts.Length > 0) dialog.InitialDirectory = Path.GetDirectoryName(scripts[0]);
                    if (scripts.Length == 1) dialog.FileName = scripts[0];
                    if (dialog.ShowDialog(this) != DialogResult.OK) return;
                    scripts = dialog.FileNames;
                    destination = Path.GetDirectoryName(scripts[0]);
                }
            }
            else if (step == 1)
            {
                using (FolderBrowserDialog dialog = new FolderBrowserDialog())
                {
                    dialog.Description = "Выберите папку для PDF";
                    dialog.SelectedPath = destination;
                    if (dialog.ShowDialog(this) != DialogResult.OK) return;
                    destination = dialog.SelectedPath;
                }
            }
            else
            {
                OpenPath(destination);
                return;
            }
            ShowStep(step);
        }

        private async Task Advance()
        {
            if (step == 0)
            {
                ShowStep(1);
                return;
            }
            if (step == 2)
            {
                Close();
                return;
            }

            SetBusy(true);
            status.ForeColor = Color.FromArgb(95, 82, 101);
            try
            {
                while (results.Controls.Count > 0)
                    results.Controls[0].Dispose();
                bool batch = scripts.Length > 1;
                int failures = 0;
                for (int index = 0; index < scripts.Length; index++)
                {
                    string script = scripts[index];
                    string name = Path.GetFileName(script);
                    status.Text = string.Format("Создаём PDF для сценария {0} из {1}.{2}{3}",
                        index + 1, scripts.Length, Environment.NewLine, name);
                    string[] files;
                    try
                    {
                        files = await Task.Run(() => Runtime.Generate(script, destination, batch));
                    }
                    catch (Exception error)
                    {
                        if (!batch) throw;
                        failures++;
                        AddResultLabel(name + Environment.NewLine + error.Message, Color.FromArgb(145, 37, 44));
                        continue;
                    }
                    if (batch) AddResultLabel(name, ForeColor);
                    foreach (string file in files)
                    {
                        LinkLabel link = new LinkLabel
                        {
                            AutoSize = true, UseMnemonic = false, Text = Path.GetFileName(file), Tag = file,
                            Margin = new Padding(batch ? 16 : 3, 3, 3, 3)
                        };
                        link.LinkClicked += ResultClick;
                        results.Controls.Add(link);
                    }
                }
                ShowStep(2);
                if (batch)
                    status.Text = string.Format("Сценариев обработано успешно — {0}. С ошибками — {1}.",
                        scripts.Length - failures, failures);
            }
            catch (Exception error)
            {
                status.ForeColor = Color.FromArgb(145, 37, 44);
                status.Text = error.Message;
            }
            finally
            {
                SetBusy(false);
            }
        }

        private void AddResultLabel(string text, Color color)
        {
            results.Controls.Add(new Label
            {
                Text = text, ForeColor = color, AutoSize = true, UseMnemonic = false,
                MaximumSize = new Size(Math.Max(1, picker.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 8), 0)
            });
        }

        private void SetBusy(bool value)
        {
            busy = value;
            UseWaitCursor = value;
            back.Enabled = !value;
            browse.Enabled = !value;
            forward.Enabled = !value;
        }

        private void ResultClick(object sender, LinkLabelLinkClickedEventArgs args)
        {
            OpenPath((string)((Control)sender).Tag);
        }

        private void OpenPath(string path)
        {
            try
            {
                Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
            }
            catch (Exception)
            {
                MessageBox.Show(this, "Не удалось открыть этот файл или папку.", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
