# ASMR Trans

Local desktop MVP for Japanese/Chinese audio/video transcription.

[中文项目介绍](README.zh-CN.md)

## Batch Queue

The desktop UI supports selecting multiple media files at once. Video files are decoded through their audio track. Supported audio/video extensions:

```text
mp3, wav, m4a, flac, ogg, aac, mp4, mkv, mov, webm, avi, wmv
```

Files are processed sequentially with one local worker. Each queued item keeps its own progress, result, error state, and TXT export action. Video files without a readable audio track fail with an explicit error.

## Run

```powershell
npm install
py -3 -m pip install -r python/requirements.txt
npm run dev
```

The first transcription downloads the Whisper model into the app model directory.

## AI Translation

Japanese audio translation now uses only an OpenAI-compatible chat completion API. Configure Base URL, API Key, model name, sampling parameters, context window, and prompts in the settings drawer. If Japanese audio is detected and no API Key is configured, the task fails with a clear configuration error instead of falling back to a local translation model.

The DeepSeek V4 Pro preset uses:

```text
Base URL: https://api.deepseek.com
Model: deepseek-v4-pro
Temperature: 0.2
Top P: 0.9
Max Tokens: 4096
```

AI translation sends context windows of nearby Japanese segments and writes the translated text back to the original timed segments, so TXT export keeps the same format. Chinese audio is transcribed directly and does not call the AI translation API.

## Proxy

The app does not inject a default proxy. It uses the network path available to the current Windows session. Configure a system proxy, TUN mode, VPN, or set an HTTP/SOCKS5 proxy in the app settings.

There are two independent proxy settings:

- Dependency/model proxy: applies to first-run Python dependency installation and Whisper model downloads.
- AI translation proxy: applies only to AI translation requests. It is disabled by default because services such as DeepSeek may work better without a proxy.

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7890"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
py -3 -m pip install -r python/requirements.txt
```

Packaged builds install Python dependencies on first launch. If the default PyPI connection fails, the app retries with Aliyun and Tsinghua PyPI mirrors. The settings drawer also has a dependency-install retry button. To force a specific package index, launch the app with:

```powershell
$env:ASMR_TRANS_PIP_INDEX_URL="https://mirrors.aliyun.com/pypi/simple/"
```

## GPU Notes

The app has `Auto / CPU / CUDA` compute modes for Whisper. CUDA mode uses `faster-whisper` / `ctranslate2`; PyTorch is no longer required because local NLLB translation has been removed.

Install dependencies:

```powershell
py -3 -m pip install -r python/requirements.txt
```

Verify CUDA visibility:

```powershell
py -3 python\worker.py --hardware
```

Expected CUDA-capable output includes `ctranslate2CudaAvailable: true` and a positive `ctranslate2CudaDeviceCount`. If CUDA mode reports missing DLLs, install NVIDIA CUDA 12 runtime/cuBLAS/cuDNN and ensure those DLL directories are in `PATH`.

## Packaging

The installer embeds the lightweight Python runtime under `runtime/python`. It does not embed Whisper models; models and Python packages are downloaded/installed on first run.

```powershell
npm run dist
```

The Windows installer is written to `release/`.
