# Растянуть уже запущенный симулятор обратно на весь экран (после сна монитора
# Windows сжимает окно). Без перезапуска.
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class FitWin {
  [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
}
"@
[FitWin]::SetProcessDpiAwareness(2) | Out-Null
$sim = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'sim'
$target = [System.Windows.Forms.Screen]::AllScreens | Where-Object { -not $_.Primary } | Select-Object -First 1
if (-not $target) { $target = [System.Windows.Forms.Screen]::PrimaryScreen }
$b = $target.Bounds
$p = Get-Process firefox -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$sim*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { 'симулятор не запущен'; exit 1 }
[FitWin]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, $b.X, $b.Y, $b.Width, $b.Height, 0x40) | Out-Null
'симулятор растянут на {0}x{1}' -f $b.Width, $b.Height
