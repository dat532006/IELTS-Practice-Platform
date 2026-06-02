#requires -Version 5.1
# ============================================================
# Verify migrations + RLS smoke trên Postgres tạm (Docker).
# Cần: Docker Desktop đang chạy.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/verify-db.ps1
# Note: dùng $LASTEXITCODE thủ công (không dựa ErrorActionPreference) vì
#       stderr của native exe (docker/psql) hay làm PS 5.1 hiểu nhầm là lỗi.
# ============================================================
$ErrorActionPreference = 'Continue'
$pg   = 'ielts_pg_verify'
$img  = 'postgres:16-alpine'
$root = Split-Path -Parent $PSScriptRoot

function Cleanup { docker rm -f $pg 2>&1 | Out-Null }
function Fail([string]$msg) { Write-Host "==> $msg" -ForegroundColor Red; Cleanup; exit 1 }

Write-Host '==> Cleanup old container (if any)'
$old = docker ps -aq -f "name=^$pg$" 2>&1
if ($old) { docker rm -f $pg 2>&1 | Out-Null }

Write-Host "==> Starting $img"
docker run -d --name $pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app $img 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'docker run failed' }

Write-Host '==> Waiting for Postgres'
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  docker exec $pg pg_isready -U postgres -d app 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { docker logs $pg 2>&1 | Write-Host; Fail 'Postgres not ready' }

function Apply([string]$file) {
  $name = Split-Path -Leaf $file
  Write-Host "==> psql $name"
  docker cp $file "${pg}:/tmp/$name" 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "docker cp failed: $name" }
  $out = docker exec $pg psql -U postgres -d app -v ON_ERROR_STOP=1 -f "/tmp/$name" 2>&1
  $code = $LASTEXITCODE
  $out | ForEach-Object { Write-Host "    $_" }
  if ($code -ne 0) { Fail "FAILED: $name" }
}

Apply (Join-Path $root 'supabase\tests\_supabase_shim.local.sql')
Get-ChildItem (Join-Path $root 'supabase\migrations\*.sql') | Sort-Object Name | ForEach-Object { Apply $_.FullName }
Apply (Join-Path $root 'supabase\tests\rls_smoke.sql')

Write-Host ''
Write-Host '==> ALL PASSED' -ForegroundColor Green
Cleanup
