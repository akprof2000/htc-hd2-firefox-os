# Симулятор Firefox OS 2.6 (Mulet, Gecko 45): окно размером с экран HD2, во всю высоту монитора, без рамки.
# Если подключён второй монитор, симулятор уходит на него, иначе на основной.
# Ключ -chrome обязателен: без него Mulet открывается обычным браузером.
# Закрыть: Alt+F4, когда окно симулятора в фокусе.
#
# Размер окна задаётся сразу при запуске (-screen в CSS-пикселях с учётом
# масштаба Windows): если растягивать окно во время загрузки, оболочка
# застревает на заставке.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sim  = Join-Path $root 'sim'

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class SimWin {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int v);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(POINT p, uint flags);
  [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr m, int type, out uint dx, out uint dy);
}
"@

# Масштаб Windows (200 %): без этого размеры экранов приходят «в половину».
# Режим «масштаб каждого монитора», иначе DPI второго монитора не узнать.
[SimWin]::SetProcessDpiAwareness(2) | Out-Null

$screens = [System.Windows.Forms.Screen]::AllScreens
$target  = ($screens | Where-Object { -not $_.Primary } | Select-Object -First 1)
if (-not $target) { $target = [System.Windows.Forms.Screen]::PrimaryScreen }
$b = $target.Bounds

$pt = New-Object SimWin+POINT
$pt.X = $b.X + 10; $pt.Y = $b.Y + 10
$mon = [SimWin]::MonitorFromPoint($pt, 2)
$dx = [uint32]96; $dy = [uint32]96
[SimWin]::GetDpiForMonitor($mon, 0, [ref]$dx, [ref]$dy) | Out-Null
# Экран телефона HD2 — 480x800. Оболочка телефонная: на «планшетный» размер
# во весь монитор она не рассчитана (белый экран). Поэтому окно — в пропорциях
# HD2, во всю высоту экрана и по центру.
# Ключ Mulet -screen ШxВ@K: размер «экрана телефона» в CSS-пикселях и масштаб K
# (не DPI!). Firefox дополнительно умножает всё на масштаб Windows того монитора,
# где стоит окно (второй монитор — 150 %). Поэтому экран = монитор / масштаб / K. Домашний экран считает колонки от этого размера, так что растягивать
# окно после запуска нельзя. Снизу у Mulet панель кнопок 50 CSS-пикселей.
# Окно переносится на нужный монитор сразу, как появилось, до загрузки Gaia.
$panel = 50
$scale = $dx / 96.0
# Шире ~500 CSS-пикселей Gaia включает планшетную вёрстку, поэтому K = 2:
# телефон шириной ~400 CSS-пикселей, как крупный смартфон.
$kArg = 2
$dpr = '2'
$cssW = [int][Math]::Floor($b.Width / $scale / $kArg)
$cssH = [int][Math]::Floor($b.Height / $scale / $kArg) - $panel
$winW = $b.Width
$winH = $b.Height
$winX = $b.X + [int](($b.Width - $winW) / 2)


Get-Process firefox -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$sim*" } | Stop-Process -Force
Start-Sleep -Seconds 1

# Всё только в своём профиле: XRE_PROFILE_PATH действует и при самоперезапуске
# (без него Firefox перезапускался в %APPDATA%\Mozilla как обычный Nightly).
# Отчёты о сбоях тоже писались в %APPDATA% — отключены.
$env:XRE_PROFILE_PATH = Join-Path $sim 'profile-run'
$env:MOZ_NO_REMOTE = '1'
$env:MOZ_CRASHREPORTER_DISABLE = '1'
# Служебные папки Gecko (Extensions, Crash Reports) создаёт в %APPDATA%\Mozilla
# при любом профиле; путь берётся у Windows, переменные окружения не помогают.
# Скрытый ключ -UAppData переносит их в папку симулятора.
$appdata = Join-Path $sim 'appdata'
New-Item -ItemType Directory -Force $appdata | Out-Null
# Вывод симулятора (dump() приложений, ошибки) — в sim\sim.log и sim\sim-err.log.
$proc = Start-Process -FilePath (Join-Path $sim 'firefox\firefox.exe') -PassThru `
    -RedirectStandardOutput (Join-Path $sim 'sim.log') `
    -RedirectStandardError (Join-Path $sim 'sim-err.log') -ArgumentList @(
    '-chrome', 'chrome://b2g/content/shell.html',
    '-profile', "`"$(Join-Path $sim 'profile-run')`"",
    '-no-remote', '-UAppData', "`"$appdata`"", '-screen', "${cssW}x${cssH}@$dpr")

for ($i = 0; $i -lt 300 -and $proc.MainWindowHandle -eq 0; $i++) {
    Start-Sleep -Milliseconds 50
    $proc.Refresh()
}
if ($proc.MainWindowHandle -eq 0) { throw 'окно симулятора не появилось' }
$SWP_NOSIZE = 0x0001
# Mulet задаёт размер окна по масштабу основного монитора, и при переносе он
# не пересчитывается — растягиваем сразу, до загрузки Gaia.
[SimWin]::SetWindowPos($proc.MainWindowHandle, [IntPtr]::Zero, $b.X, $b.Y, $b.Width, $b.Height, 0) | Out-Null

# Убрать рамку и прижать окно к углу экрана.
Start-Sleep -Seconds 2
$h = (Get-Process -Id $proc.Id).MainWindowHandle
if ($h -eq 0) { $h = (Get-Process firefox | Where-Object { $_.Path -like "$sim*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle }
$GWL_STYLE = -16; $WS_CAPTION = 0x00C00000; $WS_THICKFRAME = 0x00040000
$style = [SimWin]::GetWindowLong($h, $GWL_STYLE) -band (-bnot $WS_CAPTION) -band (-bnot $WS_THICKFRAME)
[SimWin]::SetWindowLong($h, $GWL_STYLE, $style) | Out-Null
$SWP_FRAMECHANGED = 0x0020
$SWP_SHOWWINDOW = 0x0040
[SimWin]::SetWindowPos($h, [IntPtr]::Zero, $b.X, $b.Y, $b.Width, $b.Height, $SWP_FRAMECHANGED -bor $SWP_SHOWWINDOW) | Out-Null
# Gecko всё равно создаёт пустые служебные папки Mozilla\Extensions и
# Mozilla\Firefox\Crash Reports в настоящем %APPDATA%. После закрытия
# симулятора их убирает в Корзину фоновый процесс (только если в Mozilla
# больше ничего не появилось).
$cleanup = @"
# firefox.exe перезапускает сам себя, поэтому ждём все процессы из папки sim.
while (Get-Process firefox -ErrorAction SilentlyContinue | Where-Object { `$_.Path -like '$sim*' }) { Start-Sleep -Seconds 3 }
Start-Sleep -Seconds 2
Add-Type -AssemblyName Microsoft.VisualBasic
foreach (`$d in "`$env:APPDATA\Mozilla\Extensions", "`$env:APPDATA\Mozilla\Firefox\Crash Reports") {
    if (Test-Path `$d) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(`$d, 'OnlyErrorDialogs', 'SendToRecycleBin') }
}
"@
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cleanup))
Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile', '-EncodedCommand', $enc
"симулятор: экран {0}x{1}, масштаб {2}%, экран телефона {3}x{4} CSS-пикселей" -f $b.Width, $b.Height, [int]($dx * 100 / 96), $cssW, $cssH, $dpr
