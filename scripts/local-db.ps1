# Starts/stops the portable PostgreSQL in .toolchain (Windows, no install or admin rights needed).
# Usage: powershell -File scripts\local-db.ps1 start|stop|status
# Anyone with Docker or their own PostgreSQL can ignore this and use docker-compose.yml instead.
param([ValidateSet('start', 'stop', 'status')][string]$Action = 'start')

$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root '.toolchain\pg\node_modules\@embedded-postgres\windows-x64\native\bin'
$data = Join-Path $root '.data\pg'
$log = Join-Path $root '.data\pg.log'

switch ($Action) {
  'start' { & "$bin\pg_ctl.exe" -D $data -l $log -w -o '-p 5432' start }
  'stop' { & "$bin\pg_ctl.exe" -D $data -m fast -w stop }
  'status' { & "$bin\pg_ctl.exe" -D $data status }
}
