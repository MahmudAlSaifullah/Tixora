# Puts the portable Node from .toolchain on PATH for the current terminal.
# Usage: . .\scripts\dev-shell.ps1
# Not needed if Node.js 20.9+ is already installed on this machine.
$env:PATH = (Join-Path (Split-Path -Parent $PSScriptRoot) '.toolchain\node') + ';' + $env:PATH
node -v
