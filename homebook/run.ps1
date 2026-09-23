# One-command start for Windows PowerShell. Creates a virtualenv on first run.
Set-Location $PSScriptRoot
if (-not (Test-Path .venv)) {
  py -3 -m venv .venv
  .\.venv\Scripts\pip install -q --upgrade pip
  .\.venv\Scripts\pip install -q -r requirements.txt
}
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python -m app.main
