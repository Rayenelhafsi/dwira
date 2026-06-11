$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Error $message
  exit 1
}

function Test-QdrantHttp {
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:6333/collections" -TimeoutSec 3
    return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500)
  } catch {
    return $false
  }
}

try {
  $null = Get-Command docker -ErrorAction Stop
} catch {
  Fail "Docker CLI introuvable. Installe Docker Desktop ou demarre Qdrant manuellement sur localhost:6333."
}

try {
  docker info | Out-Null
} catch {
  Fail "Docker Desktop n'est pas demarre. Lance Docker Desktop puis relance ce script."
}
if ($LASTEXITCODE -ne 0) {
  Fail "Docker Desktop n'est pas demarre. Lance Docker Desktop puis relance ce script."
}

$containerName = "dwira-qdrant"
$existing = docker ps -a --filter "name=^/${containerName}$" --format "{{.Names}}"
if ($LASTEXITCODE -ne 0) {
  Fail "Impossible d'interroger Docker. Verifie que Docker Desktop tourne correctement."
}

if (Test-QdrantHttp) {
  Write-Host "Qdrant local est deja accessible sur http://localhost:6333"
  Write-Host "Ensuite lance: npm run rag:index-properties"
  exit 0
}

if (-not $existing) {
  Write-Host "Creation du conteneur Qdrant local..."
  docker run -d `
    --name $containerName `
    -p 6333:6333 `
    -p 6334:6334 `
    qdrant/qdrant:latest | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Fail "La creation du conteneur Qdrant a echoue."
  }
} else {
  $running = docker ps --filter "name=^/${containerName}$" --format "{{.Names}}"
  if ($LASTEXITCODE -ne 0) {
    Fail "Impossible de verifier le statut du conteneur Qdrant."
  }
  if (-not $running) {
    Write-Host "Demarrage du conteneur Qdrant existant..."
    docker start $containerName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Fail "Le demarrage du conteneur Qdrant a echoue."
    }
  } else {
    Write-Host "Qdrant local est deja demarre."
  }
}

Write-Host "Qdrant local disponible sur http://localhost:6333"
Write-Host "Ensuite lance: npm run rag:index-properties"
