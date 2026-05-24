# ASMR Trans

Local desktop MVP for Japanese/Chinese audio transcription.

## Run

```powershell
npm install
py -3 -m pip install -r python/requirements.txt
npm run dev
```

The first transcription downloads local models into the app model directory.

## Proxy

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7890"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
py -3 -m pip install -r python/requirements.txt
```

## GPU Notes

The app has `Auto / CPU / CUDA` compute modes.

- Whisper uses `faster-whisper` / `ctranslate2`; on this machine it can detect the RTX 3080 even when PyTorch is CPU-only.
- NLLB translation uses PyTorch. Because current `transformers` requires `torch >= 2.6` for safe model loading, do not install torch 2.4.x.

Default CPU install:

```powershell
py -3 -m pip install -r python/requirements.txt
```

CUDA PyTorch install:

```powershell
py -3 -m pip uninstall -y torch
py -3 -m pip install -r python/requirements-cuda.txt
```

Verify CUDA:

```powershell
py -3 python\worker.py --hardware
```

Expected values on the target Windows machine include `torchVersion: 2.6.0+cu124`, `torchCudaAvailable: true`, `ctranslate2CudaAvailable: true`, and `cudaDeviceName: NVIDIA GeForce RTX 3080`.

If pip is unstable for large wheels, download from the Aliyun mirror first:

```powershell
New-Item -ItemType Directory -Force vendor | Out-Null
curl.exe -L --noproxy "*" -C - `
  -o "vendor\torch-2.6.0+cu124-cp310-cp310-win_amd64.whl" `
  "https://mirrors.aliyun.com/pytorch-wheels/cu124/torch-2.6.0%2Bcu124-cp310-cp310-win_amd64.whl"
py -3 -m pip install --no-index --no-cache-dir --no-deps "vendor\torch-2.6.0+cu124-cp310-cp310-win_amd64.whl"
```

For a quick safe fallback that fixes the `torch.load` CVE restriction but runs NLLB translation on CPU:

```powershell
curl.exe -L --noproxy "*" `
  -o "vendor\torch-2.6.0+cpu-cp310-cp310-win_amd64.whl" `
  "https://mirrors.aliyun.com/pytorch-wheels/cpu/torch-2.6.0%2Bcpu-cp310-cp310-win_amd64.whl"
py -3 -m pip install --no-index --no-cache-dir --no-deps "vendor\torch-2.6.0+cpu-cp310-cp310-win_amd64.whl"
```

## NLLB Model Download

If Hugging Face model download stalls in the UI, use the resumable downloader. It downloads into the Electron model directory under `%APPDATA%\asmr-trans\models`.

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7890"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
powershell -ExecutionPolicy Bypass -File scripts\download-nllb.ps1
```

To use a mirror:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\download-nllb.ps1 `
  -BaseUrl "https://hf-mirror.com/facebook/nllb-200-distilled-600M/resolve/main"
```

## Audio Formats

Supported input extensions: `mp3`, `wav`, `m4a`, `flac`, `ogg`, `aac`.
