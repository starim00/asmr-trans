param(
  [string]$TargetDir = (Join-Path $env:APPDATA "asmr-trans\models\nllb\facebook-nllb-200-distilled-600M-local"),
  [string]$BaseUrl = "https://huggingface.co/facebook/nllb-200-distilled-600M/resolve/main"
)

$ErrorActionPreference = "Stop"

$targetDir = $TargetDir
New-Item -ItemType Directory -Force $targetDir | Out-Null

$files = @(
  "config.json",
  "generation_config.json",
  "pytorch_model.bin",
  "sentencepiece.bpe.model",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json"
)

$expectedSizes = @{
  "config.json" = 846
  "generation_config.json" = 189
  "pytorch_model.bin" = 2460457927
  "sentencepiece.bpe.model" = 4852054
  "special_tokens_map.json" = 3548
  "tokenizer.json" = 17331176
  "tokenizer_config.json" = 564
}

foreach ($file in $files) {
  $url = "$BaseUrl/$file"
  $out = Join-Path $targetDir $file
  if (Test-Path $out) {
    $size = (Get-Item $out).Length
    if ($expectedSizes[$file] -eq $size) {
      Write-Host "Skipping $file (already complete)"
      continue
    }
    if ($expectedSizes[$file] -lt $size) {
      throw "$file is larger than expected. Delete it and run this script again: $out"
    }
  }

  Write-Host "Downloading $file"
  $attempt = 0
  while ($attempt -lt 50) {
    $attempt += 1
    curl.exe -L -C - --retry 8 --retry-delay 5 --connect-timeout 30 -o $out $url
    if ($LASTEXITCODE -eq 0) {
      break
    }
    Write-Warning "curl failed for $file with exit code $LASTEXITCODE, retrying resume attempt $attempt/50"
    Start-Sleep -Seconds 10
  }
  if ($attempt -ge 50 -and $LASTEXITCODE -ne 0) {
    throw "curl failed for $file after repeated resume attempts"
  }
}

Write-Host "NLLB files saved to $targetDir"
