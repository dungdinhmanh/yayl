# Copies the extracted official key art into the local design lab.
# These files are gitignored and are for local visual review only.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $repoRoot
$dest = Join-Path $repoRoot "design\assets\img"

$assets = @(
    @{
        Name = "arknights.png"
        Source = Join-Path $workspaceRoot "game-extracted\A9_extracted\out\renderer\assets\bg-dc3bf025.png"
    },
    @{
        Name = "stella.png"
        Source = Join-Path $workspaceRoot "game-extracted\SS_extracted\out\renderer\assets\bg-df33ba5f.png"
    }
)

if (-not (Test-Path $dest)) {
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
}

foreach ($asset in $assets) {
    if (-not (Test-Path $asset.Source)) {
        Write-Warning "Missing source art: $($asset.Source)"
        continue
    }

    Copy-Item -LiteralPath $asset.Source -Destination (Join-Path $dest $asset.Name) -Force
    Write-Host "Copied $($asset.Name)"
}

Write-Host "Design art ready in $dest"
