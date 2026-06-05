import argparse
import ctypes.util
import json
import os
import re
import sys
import tempfile
import time
import traceback
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

JA_LANG = "jpn_Jpan"
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".wmv"}

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "30")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")

WORKER_STARTED_AT = time.monotonic()
STAGE_STARTED_AT = {}


def find_dll(name):
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        if not directory:
            continue
        candidate = Path(directory) / name
        if candidate.exists():
            return str(candidate)
    found = ctypes.util.find_library(name)
    return found


def cuda_runtime_status():
    cublas = find_dll("cublas64_12.dll")
    cudnn_candidates = []
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        if directory and Path(directory).exists():
            cudnn_candidates.extend(str(path) for path in Path(directory).glob("cudnn64*.dll"))
    dll_directories = sorted(
        {
            str(Path(path).parent)
            for path in ([cublas] if cublas else []) + cudnn_candidates[:5]
            if path
        }
    )
    return {
        "source": os.environ.get("ASMR_TRANS_CUDA_RUNTIME_SOURCE") or "system",
        "cublas64_12": cublas,
        "cublasFound": bool(cublas),
        "cudnnDlls": cudnn_candidates[:5],
        "cudnnFound": len(cudnn_candidates) > 0,
        "cudnnAvailable": len(cudnn_candidates) > 0,
        "dllDirectories": dll_directories,
    }


def emit(message_type, payload):
    sys.stdout.write(json.dumps({"type": message_type, "payload": payload}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def progress(stage, message, percent=None, **extra):
    now = time.monotonic()
    if stage not in STAGE_STARTED_AT:
        STAGE_STARTED_AT[stage] = now
    payload = {"stage": stage, "message": message}
    if percent is not None:
        payload["percent"] = percent
    payload["elapsedSeconds"] = round(now - WORKER_STARTED_AT, 2)
    payload["stageElapsedSeconds"] = round(now - STAGE_STARTED_AT[stage], 2)
    for key, value in extra.items():
        if value is not None:
            payload[key] = value
    emit("progress", payload)


def parse_request(request_file=None):
    if request_file:
        return json.loads(Path(request_file).read_text(encoding="utf-8"))

    raw = sys.stdin.buffer.read().decode("utf-8")
    if not raw.strip():
        raise ValueError("Worker received no input.")
    return json.loads(raw)


def get_hardware_status():
    diagnostics = []
    supported_cuda_compute_types = []
    try:
        import ctranslate2

        ctranslate_cuda_count = ctranslate2.get_cuda_device_count()
        if ctranslate_cuda_count:
            try:
                supported_cuda_compute_types = sorted(ctranslate2.get_supported_compute_types("cuda"))
            except Exception as error:
                diagnostics.append(f"Unable to query CUDA compute types: {error}")
    except Exception as error:
        diagnostics.append(f"Unable to query CTranslate2 CUDA devices: {error}")
        ctranslate_cuda_count = 0

    runtime = cuda_runtime_status()
    runtime_ready = bool(runtime.get("cublasFound")) and bool(runtime.get("cudnnFound"))
    ctranslate2_cuda_smoke_ok = ctranslate_cuda_count > 0 and bool(supported_cuda_compute_types) and runtime_ready
    source = runtime.get("source") or "system"
    if ctranslate_cuda_count <= 0 and source != "system":
        source = "missing"
    elif ctranslate_cuda_count > 0 and not ctranslate2_cuda_smoke_ok and source not in {"system", "python-wheel"}:
        source = "failed"
    runtime["source"] = source
    error = None
    if ctranslate_cuda_count > 0 and not runtime_ready:
        error = "CUDA device was detected, but cuBLAS/cuDNN runtime DLLs were not found."
    elif ctranslate_cuda_count <= 0:
        error = "No CUDA device was detected by CTranslate2."
    elif not supported_cuda_compute_types:
        error = "CTranslate2 CUDA compute types could not be queried."

    return {
        "ctranslate2CudaAvailable": ctranslate2_cuda_smoke_ok,
        "ctranslate2CudaDeviceCount": ctranslate_cuda_count,
        "ctranslate2CudaSmokeOk": ctranslate2_cuda_smoke_ok,
        "ctranslate2SupportedCudaComputeTypes": supported_cuda_compute_types,
        "cudaAvailable": ctranslate2_cuda_smoke_ok,
        "cudaDeviceCount": ctranslate_cuda_count,
        "cudaDeviceName": "CUDA device" if ctranslate_cuda_count else None,
        "cudaRuntime": runtime,
        "diagnostics": diagnostics,
        "error": error,
    }


def check_dependencies():
    missing = []
    modules = [
        ("faster_whisper", "faster-whisper"),
        ("av", "av"),
        ("requests", "requests"),
        ("socks", "PySocks"),
        ("ctranslate2", "ctranslate2"),
        ("numpy", "numpy"),
    ]
    for module_name, package_name in modules:
        try:
            __import__(module_name)
        except Exception:
            missing.append(package_name)
    return missing


def check_tts_dependencies():
    missing = []
    modules = [
        ("torch", "torch"),
        ("torchaudio", "torchaudio"),
        ("soundfile", "soundfile"),
        ("librosa", "librosa"),
        ("numpy", "numpy"),
        ("av", "av"),
    ]
    for module_name, package_name in modules:
        try:
            __import__(module_name)
        except Exception as error:
            missing.append(f"{package_name}: {error}")
    try:
        from voxcpm import VoxCPM  # noqa: F401
    except Exception as error:
        missing.append(f"voxcpm: {error}")
    return missing


def resolve_device(requested_device):
    requested = (requested_device or "auto").lower()
    hardware_status = get_hardware_status()
    whisper_cuda_available = bool(hardware_status.get("ctranslate2CudaAvailable"))
    supported_cuda_compute_types = set(hardware_status.get("ctranslate2SupportedCudaComputeTypes") or [])

    if requested == "cuda":
        if not whisper_cuda_available:
            source = (hardware_status.get("cudaRuntime") or {}).get("source") or "unknown"
            message = hardware_status.get("error") or "CUDA is not available to faster-whisper."
            raise RuntimeError(f"GPU mode was requested, but CTranslate2 CUDA is not ready ({source}). {message}")
        return "cuda", select_cuda_compute_type(supported_cuda_compute_types), hardware_status

    if requested == "auto" and whisper_cuda_available:
        return "cuda", select_cuda_compute_type(supported_cuda_compute_types), hardware_status

    return "cpu", "int8", hardware_status


def select_cuda_compute_type(supported_compute_types):
    supported = set(supported_compute_types or [])
    if "int8_float16" in supported:
        return "int8_float16"
    if "float16" in supported:
        return "float16"
    raise RuntimeError(
        "CTranslate2 CUDA is available, but neither int8_float16 nor float16 compute type is supported. "
        f"Supported compute types: {sorted(supported)}"
    )


def is_cuda_runtime_error(error):
    message = str(error).lower()
    return any(
        needle in message
        for needle in ["cublas", "cudnn", "cuda", "cublas64_12.dll", "out of memory", "unsupported compute type"]
    )


def cuda_error_message(error):
    message = str(error)
    lower_message = message.lower()
    if "out of memory" in lower_message:
        reason = "CUDA mode failed because GPU memory is insufficient. Try a smaller Whisper model, Auto/CPU, or a lower-memory CUDA compute mode."
    elif "unsupported compute type" in lower_message:
        reason = "CUDA mode failed because the selected compute type is not supported by this GPU/CTranslate2 backend."
    elif "cublas" in lower_message or "cudnn" in lower_message or "cublas64_12.dll" in lower_message:
        reason = "CUDA mode failed because CUDA runtime DLLs are missing. Install/repair CUDA dependencies, or choose Auto/CPU."
    else:
        reason = "CUDA mode failed. Install/repair CUDA dependencies, update the NVIDIA driver, or choose Auto/CPU."
    return f"{reason} Original error: {message}"


def model_dirs(models_dir):
    root = Path(models_dir)
    return root / "whisper"


def media_seconds_label(seconds):
    if not seconds or seconds <= 0:
        return "unknown"
    minutes = int(seconds // 60)
    remaining = int(seconds % 60)
    return f"{minutes:02d}:{remaining:02d}"


def inspect_media_audio(media_path):
    import av

    path = Path(media_path)
    try:
        with av.open(str(path), mode="r") as container:
            audio_streams = [stream for stream in container.streams if stream.type == "audio"]
            duration = 0.0
            for stream in audio_streams:
                if stream.duration and stream.time_base:
                    duration = max(duration, float(stream.duration * stream.time_base))
            if not duration and container.duration:
                duration = float(container.duration) / 1_000_000
    except av.FFmpegError as error:
        raise RuntimeError(
            f"Unable to open media file for audio decoding: {path.name}. "
            "The file may be corrupted, encrypted, or encoded with an unsupported codec."
        ) from error

    if not audio_streams:
        if path.suffix.lower() in VIDEO_EXTENSIONS:
            raise RuntimeError(f"Video file has no audio track: {path.name}")
        raise RuntimeError(f"Media file has no readable audio stream: {path.name}")

    return {"audioStreamCount": len(audio_streams), "duration": duration}


def clamp_float(value, default, minimum=None, maximum=None):
    number = as_float(value, default)
    if minimum is not None:
        number = max(number, minimum)
    if maximum is not None:
        number = min(number, maximum)
    return number


def decode_media_to_mono_float32(media_path, sample_rate=16000, max_seconds=None):
    import av
    import numpy as np

    chunks = []
    sample_limit = int(sample_rate * max_seconds) if max_seconds else None
    total_samples = 0
    with av.open(str(media_path), mode="r") as container:
        audio_streams = [stream for stream in container.streams if stream.type == "audio"]
        if not audio_streams:
            raise RuntimeError(f"Media file has no readable audio stream: {Path(media_path).name}")
        stream = audio_streams[0]
        resampler = av.AudioResampler(format="s16", layout="mono", rate=sample_rate)
        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                array = resampled.to_ndarray()
                if array.ndim > 1:
                    array = array.reshape(-1)
                samples = array.astype(np.float32) / 32768.0
                if sample_limit is not None:
                    remaining = sample_limit - total_samples
                    if remaining <= 0:
                        break
                    samples = samples[:remaining]
                chunks.append(samples)
                total_samples += samples.size
            if sample_limit is not None and total_samples >= sample_limit:
                break

    if not chunks:
        raise RuntimeError(f"No audio samples could be decoded from: {Path(media_path).name}")
    return np.concatenate(chunks).astype(np.float32, copy=False)


def enhance_audio_samples(samples, config):
    import numpy as np

    audio = np.asarray(samples, dtype=np.float32)
    if audio.size == 0:
        return audio

    if config.get("denoise"):
        threshold = 10 ** (clamp_float(config.get("noiseGateDb"), -48, -80, -12) / 20)
        audio = np.where(np.abs(audio) < threshold, 0.0, audio)

    if config.get("compression"):
        threshold = 0.22
        ratio = 4.0
        magnitude = np.abs(audio)
        compressed = np.where(magnitude > threshold, threshold + (magnitude - threshold) / ratio, magnitude)
        audio = np.sign(audio) * compressed

    if config.get("normalize"):
        target_peak = clamp_float(config.get("targetPeak"), 0.9, 0.1, 0.99)
        peak = float(np.max(np.abs(audio))) if audio.size else 0.0
        if peak > 0:
            audio = audio * min(target_peak / peak, 12.0)

    return np.clip(audio, -1.0, 1.0).astype(np.float32, copy=False)


def prepare_audio_input(media_path, config):
    if not config.get("enabled"):
        return media_path
    progress("preprocess", "Enhancing audio before transcription...", 8)
    samples = decode_media_to_mono_float32(media_path)
    enhanced = enhance_audio_samples(samples, config)
    progress("preprocess", "Audio enhancement ready.", 18)
    return enhanced


def as_int(value, default):
    try:
        if value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def as_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def as_float(value, default):
    try:
        if value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def build_whisper_options(config):
    beam_size = max(as_int(config.get("beamSize"), 5), 1)
    no_speech_threshold = clamp_float(config.get("noSpeechThreshold"), 0.6, 0.0, 1.0)
    options = {
        "beam_size": beam_size,
        "vad_filter": as_bool(config.get("vadFilter"), True),
        "condition_on_previous_text": as_bool(config.get("conditionOnPreviousText"), False),
        "no_speech_threshold": no_speech_threshold,
    }
    initial_prompt = str(config.get("initialPrompt") or "").strip()
    if initial_prompt:
        options["initial_prompt"] = initial_prompt
    return options


def normalize_chat_completions_url(base_url):
    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise ValueError("AI translation baseUrl is empty.")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/chat/completions"


def extract_json_array(content):
    cleaned = (content or "").strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL | re.IGNORECASE)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start < 0 or end <= start:
            raise
        value = json.loads(cleaned[start : end + 1])
    if isinstance(value, dict) and isinstance(value.get("translations"), list):
        value = value["translations"]
    if not isinstance(value, list):
        raise ValueError("AI translation response is not a JSON array.")
    return value


def build_translation_windows(segments, window_size, overlap):
    total = len(segments)
    window_size = max(as_int(window_size, 6), 1)
    overlap = max(as_int(overlap, 1), 0)
    windows = []
    for start in range(0, total, window_size):
        end = min(start + window_size, total)
        before_start = max(0, start - overlap)
        after_end = min(total, end + overlap)
        items = []
        for index in range(start, end):
            context_before = [
                segments[context_index]["sourceText"]
                for context_index in range(before_start, start)
            ]
            context_after = [
                segments[context_index]["sourceText"]
                for context_index in range(end, after_end)
            ]
            segment = segments[index]
            items.append(
                {
                    "id": index,
                    "start": segment["start"],
                    "end": segment["end"],
                    "text": segment["sourceText"],
                    "contextBefore": context_before,
                    "contextAfter": context_after,
                }
            )
        windows.append(items)
    return windows


def build_ai_payload(config, window_items):
    system_prompt = (config.get("systemPrompt") or "").strip()
    user_prompt = (config.get("userPromptTemplate") or "").strip()
    if not system_prompt:
        system_prompt = "Translate Japanese transcription text into natural Simplified Chinese."
    if not user_prompt:
        user_prompt = "Translate the following JSON array. Return only a JSON array with id and translation."

    payload = {
        "model": (config.get("model") or "").strip(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"{user_prompt}\n\nitems:\n{json.dumps(window_items, ensure_ascii=False)}",
            },
        ],
        "stream": False,
    }
    if not payload["model"]:
        raise ValueError("AI translation model is empty.")

    optional_params = {
        "temperature": as_float(config.get("temperature"), None),
        "top_p": as_float(config.get("topP"), None),
        "max_tokens": as_int(config.get("maxTokens"), None),
    }
    top_k = config.get("topK")
    if top_k not in (None, ""):
        optional_params["top_k"] = as_int(top_k, None)
    reasoning_effort = (config.get("reasoningEffort") or "").strip()
    if reasoning_effort:
        optional_params["reasoning_effort"] = reasoning_effort
    if config.get("thinking"):
        optional_params["thinking"] = {"type": "enabled"}

    for key, value in optional_params.items():
        if value is not None and value != "":
            payload[key] = value
    return payload


def build_ai_proxy_url(config):
    if not config.get("proxyEnabled"):
        return ""
    host = str(config.get("proxyHost") or "").strip()
    port = str(config.get("proxyPort") or "").strip()
    proxy_type = "socks5" if config.get("proxyType") == "socks5" else "http"
    if not host or not port:
        return ""
    return f"{proxy_type}://{host}:{port}"


def request_ai_translation_window(config, window_items):
    import requests

    api_key = (config.get("apiKey") or "").strip()
    if not api_key:
        raise ValueError("AI translation API key is empty.")

    url = normalize_chat_completions_url(config.get("baseUrl"))
    payload = build_ai_payload(config, window_items)
    timeout = max(as_int(config.get("timeoutSeconds"), 120), 10)
    session = requests.Session()
    session.trust_env = False
    proxy_url = build_ai_proxy_url(config)
    if proxy_url:
        session.proxies.update({"http": proxy_url, "https": proxy_url})
    response = session.post(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=timeout,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"AI translation request failed with HTTP {response.status_code}: {response.text[:500]}")
    body = response.json()
    content = body["choices"][0]["message"]["content"]
    translated_items = extract_json_array(content)
    translations = {}
    for item in translated_items:
        if isinstance(item, dict) and "id" in item and "translation" in item:
            translations[int(item["id"])] = str(item["translation"]).strip()
    missing = [item["id"] for item in window_items if int(item["id"]) not in translations]
    if missing:
        raise ValueError(f"AI translation response missed segment ids: {missing}")
    return translations


def translate_segments_with_ai(segments, config):
    windows = build_translation_windows(
        segments,
        config.get("contextWindow", 6),
        config.get("contextOverlap", 1),
    )
    retries = max(as_int(config.get("retries"), 2), 0)
    translated = [{**segment, "translatedText": ""} for segment in segments]

    for window_index, window_items in enumerate(windows):
        total = max(len(windows), 1)
        progress(
            "translate",
            f"Calling AI translation window {window_index + 1}/{total}...",
            60 + int(((window_index + 1) / total) * 32),
        )
        last_error = None
        for attempt in range(retries + 1):
            try:
                translations = request_ai_translation_window(config, window_items)
                for segment_id, translation in translations.items():
                    translated[segment_id]["translatedText"] = translation
                break
            except Exception as error:
                last_error = error
                if attempt < retries:
                    time.sleep(min(2 ** attempt, 8))
        else:
            raise RuntimeError(f"AI translation failed: {last_error}") from last_error

    return translated


def transcribe(request):
    from faster_whisper import WhisperModel

    audio_path = request["audioPath"]
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file does not exist: {audio_path}")

    media_info = inspect_media_audio(audio_path)
    audio_stream_count = media_info["audioStreamCount"]
    media_duration = media_info["duration"]
    if Path(audio_path).suffix.lower() in VIDEO_EXTENSIONS:
        progress(
            "media",
            f"Video input detected; using {audio_stream_count} audio track(s), duration {media_seconds_label(media_duration)}.",
            2,
            totalSeconds=media_duration,
        )
    elif media_duration:
        progress("media", f"Audio duration: {media_seconds_label(media_duration)}.", 2, totalSeconds=media_duration)

    whisper_model = request.get("whisperModel", "small")
    requested_device = request.get("computeDevice", "auto")
    device, compute_type, hardware_status = resolve_device(requested_device)
    models_dir = request.get("modelsDir") or str(Path.home() / ".asmr-trans" / "models")
    whisper_dir = model_dirs(models_dir)
    whisper_dir.mkdir(parents=True, exist_ok=True)

    progress("hardware", f"Using {device.upper()} compute ({compute_type}).", 3)
    if device == "cuda":
        progress("hardware", f"GPU: {hardware_status.get('cudaDeviceName') or 'CUDA device'}", 4)

    progress("model", f"Loading Whisper model: {whisper_model}", 5)
    try:
        model = WhisperModel(
            whisper_model,
            device=device,
            compute_type=compute_type,
            download_root=str(whisper_dir),
        )
    except Exception as error:
        message = str(error)
        cuda_runtime_missing = is_cuda_runtime_error(error)
        if device == "cuda" and requested_device == "auto" and cuda_runtime_missing:
            progress(
                "hardware",
                "CUDA device was detected, but CUDA runtime DLLs are missing. Falling back to CPU.",
                6,
            )
            device = "cpu"
            compute_type = "int8"
            model = WhisperModel(
                whisper_model,
                device=device,
                compute_type=compute_type,
                download_root=str(whisper_dir),
            )
        else:
            if device == "cuda" and cuda_runtime_missing:
                raise RuntimeError(cuda_error_message(message)) from error
            raise

    audio_input = prepare_audio_input(audio_path, request.get("audioEnhancement") or {})
    whisper_options = build_whisper_options(request.get("whisperAdvanced") or {})
    progress(
        "transcribe",
        f"Transcribing audio with beam size {whisper_options['beam_size']}...",
        20,
    )
    try:
        raw_segments, info = model.transcribe(
            audio_input,
            **whisper_options,
        )
    except Exception as error:
        if device == "cuda" and requested_device == "auto" and is_cuda_runtime_error(error):
            progress(
                "hardware",
                "CUDA runtime failed during transcription. Retrying Whisper on CPU.",
                21,
            )
            device = "cpu"
            compute_type = "int8"
            model = WhisperModel(
                whisper_model,
                device=device,
                compute_type=compute_type,
                download_root=str(whisper_dir),
            )
            raw_segments, info = model.transcribe(
                audio_input,
                **whisper_options,
            )
        else:
            if device == "cuda" and is_cuda_runtime_error(error):
                raise RuntimeError(cuda_error_message(error)) from error
            raise

    transcription_duration = media_duration or float(getattr(info, "duration", 0) or 0)
    segments = []
    for index, segment in enumerate(raw_segments):
        text = segment.text.strip()
        if not text:
            continue
        segments.append(
            {
                "start": float(segment.start),
                "end": float(segment.end),
                "sourceText": text,
            }
        )
        if transcription_duration > 0:
            segment_ratio = min(max(float(segment.end) / transcription_duration, 0), 1)
            percent = min(51, 20 + int(segment_ratio * 31))
            elapsed = max(time.monotonic() - STAGE_STARTED_AT.get("transcribe", time.monotonic()), 0.001)
            speed_factor = float(segment.end) / elapsed
            remaining_media = max(transcription_duration - float(segment.end), 0)
            eta_seconds = remaining_media / speed_factor if speed_factor > 0 else None
            progress(
                "transcribe",
                f"Transcribed {media_seconds_label(segment.end)} / {media_seconds_label(transcription_duration)}.",
                percent,
                processedSeconds=float(segment.end),
                totalSeconds=transcription_duration,
                speedFactor=round(speed_factor, 3),
                etaSeconds=round(eta_seconds, 2) if eta_seconds is not None else None,
            )
        elif index % 5 == 0:
            progress("transcribe", f"Recognized {len(segments)} segments...", min(50, 25 + len(segments)))

    detected_language = getattr(info, "language", "unknown") or "unknown"
    progress("transcribe", f"Transcription done. Detected language: {detected_language}", 52)

    translate_after_transcribe = bool(request.get("translateAfterTranscribe", True))

    if detected_language.startswith("ja") and translate_after_transcribe:
        ai_config = request.get("aiTranslationConfig") or {}
        if not (ai_config.get("apiKey") or "").strip():
            raise RuntimeError("Japanese audio requires AI translation. Configure an AI API key first.")
        progress("translate", "Using AI translation with context windows...", 58)
        segments = translate_segments_with_ai(segments, ai_config)
    elif detected_language.startswith("ja"):
        for segment in segments:
            segment["translatedText"] = ""
    elif detected_language.startswith("zh"):
        for segment in segments:
            segment["translatedText"] = None
    else:
        progress("transcribe", "Language is not Chinese or Japanese; outputting source text only.", 95)
        for segment in segments:
            segment["translatedText"] = None

    progress("done", "Done.", 100)
    return {
        "detectedLanguage": detected_language,
        "computeDevice": device,
        "segments": segments,
    }


def translate(request):
    segments = request.get("segments") or []
    ai_config = request.get("aiTranslationConfig") or {}
    if not segments:
      raise ValueError("Translation request has no segments.")
    if not (ai_config.get("apiKey") or "").strip():
        raise RuntimeError("Japanese audio requires AI translation. Configure an AI API key first.")
    progress("translate", "Using AI translation with context windows...", 5)
    translated_segments = translate_segments_with_ai(segments, ai_config)
    progress("done", "Translation done.", 100)
    return {
        "detectedLanguage": request.get("detectedLanguage", "ja"),
        "computeDevice": request.get("computeDevice"),
        "segments": translated_segments,
    }


def select_reference_audio_window(samples, sample_rate, duration_seconds=20):
    import numpy as np

    audio = np.asarray(samples, dtype=np.float32)
    if audio.size == 0:
        raise RuntimeError("Reference audio extraction produced no samples.")

    target_samples = int(sample_rate * duration_seconds)
    if audio.size <= target_samples:
        return audio

    frame = max(int(sample_rate), 1)
    rms_values = []
    for start in range(0, audio.size - frame + 1, frame):
        window = audio[start : start + frame]
        rms_values.append(float(np.sqrt(np.mean(window * window))))
    if not rms_values:
        return audio[:target_samples]

    window_frames = max(int(duration_seconds), 1)
    best_start_frame = 0
    best_score = -1.0
    for frame_index in range(0, max(len(rms_values) - window_frames + 1, 1)):
        score = sum(rms_values[frame_index : frame_index + window_frames]) / window_frames
        if score > best_score:
            best_score = score
            best_start_frame = frame_index

    start = best_start_frame * frame
    return audio[start : start + target_samples]


def build_tts_text(segment, voice_prompt):
    text = str(segment.get("translatedText") or "").strip()
    if not text:
        return ""
    prompt = str(voice_prompt or "").strip()
    if prompt:
        return f"({prompt}){text}"
    return text


def tts(request):
    import numpy as np
    import soundfile as sf

    media_path = request.get("mediaPath")
    output_path = request.get("outputPath")
    segments = request.get("segments") or []
    config = request.get("tts") or {}
    models_dir = request.get("modelsDir") or str(Path.home() / ".asmr-trans" / "models")

    if not media_path or not os.path.exists(media_path):
        raise FileNotFoundError(f"Reference media file does not exist: {media_path}")
    if not output_path:
        raise ValueError("TTS output path is empty.")

    synth_segments = [segment for segment in segments if str(segment.get("translatedText") or "").strip()]
    if not synth_segments:
        raise ValueError("There is no Chinese translation text to synthesize.")

    voxcpm_cache = Path(models_dir) / "voxcpm"
    voxcpm_cache.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(voxcpm_cache))

    device = str(config.get("device") or "auto").strip().lower()
    if device not in {"auto", "cpu", "cuda"}:
        device = "auto"
    cfg_value = clamp_float(config.get("cfgValue"), 1.6, 1.0, 3.0)
    inference_timesteps = max(as_int(config.get("inferenceTimesteps"), 20), 1)
    normalize_text = as_bool(config.get("normalize"), True)
    denoise_reference = as_bool(config.get("denoise"), False)
    retry_ratio_threshold = clamp_float(config.get("retryBadcaseRatioThreshold"), 4.0, 1.0, 12.0)
    voice_prompt = config.get("voicePrompt") or ""

    progress("tts-reference", "Extracting reference voice from original media...", 4)
    reference_samples = decode_media_to_mono_float32(media_path, sample_rate=16000, max_seconds=300)
    reference_samples = select_reference_audio_window(reference_samples, 16000, duration_seconds=20)
    reference_samples = enhance_audio_samples(reference_samples, {"normalize": True, "targetPeak": 0.85})
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        reference_path = temp_file.name
    try:
        sf.write(reference_path, reference_samples, 16000)
    except Exception as error:
        raise RuntimeError(f"Unable to write VoxCPM2 reference audio: {error}") from error

    try:
        try:
            from voxcpm import VoxCPM
        except Exception as error:
            raise RuntimeError(
                f"VoxCPM2 is not installed or failed to import: {error}. "
                "Use the TTS dependency installer and try again."
            ) from error

        progress("tts-model", f"Loading VoxCPM2 on {device.upper()}...", 10)
        try:
            model = VoxCPM.from_pretrained(
                "openbmb/VoxCPM2",
                load_denoiser=False,
                device=device,
                optimize=device.startswith("cuda"),
            )
        except Exception as error:
            raise RuntimeError(f"Unable to load VoxCPM2: {error}") from error

        sample_rate = int(getattr(model.tts_model, "sample_rate", 48000))
        generated = []
        silence = np.zeros(int(sample_rate * 0.22), dtype=np.float32)
        total = len(synth_segments)
        for index, segment in enumerate(synth_segments):
            tts_text = build_tts_text(segment, voice_prompt)
            if not tts_text:
                continue
            progress(
                "tts",
                f"Generating Chinese voice segment {index + 1}/{total}...",
                12 + int(((index + 1) / max(total, 1)) * 78),
            )
            try:
                wav = model.generate(
                    text=tts_text,
                    reference_wav_path=reference_path,
                    cfg_value=cfg_value,
                    inference_timesteps=inference_timesteps,
                    normalize=normalize_text,
                    denoise=denoise_reference,
                    retry_badcase=True,
                    retry_badcase_ratio_threshold=retry_ratio_threshold,
                )
            except Exception as error:
                raise RuntimeError(f"VoxCPM2 generation failed on segment {index + 1}: {error}") from error
            generated.append(np.asarray(wav, dtype=np.float32))
            generated.append(silence)

        if not generated:
            raise RuntimeError("VoxCPM2 did not produce any audio.")

        output_audio = np.concatenate(generated)
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        progress("tts-save", "Saving Chinese voice WAV...", 96)
        sf.write(output_path, output_audio, sample_rate)
        progress("done", "Chinese voice WAV is ready.", 100)
        return {
            "outputPath": output_path,
            "sampleRate": sample_rate,
            "durationSeconds": round(float(output_audio.size) / sample_rate, 2),
            "segments": total,
            "computeDevice": device,
        }
    finally:
        try:
            Path(reference_path).unlink(missing_ok=True)
        except Exception:
            pass


def smoke_media(media_path):
    media_info = inspect_media_audio(media_path)
    samples = decode_media_to_mono_float32(media_path, sample_rate=16000, max_seconds=2)
    enhanced = enhance_audio_samples(
        samples,
        {
            "enabled": True,
            "normalize": True,
            "compression": True,
            "denoise": True,
            "mono": True,
            "targetPeak": 0.8,
            "noiseGateDb": -50,
        },
    )
    return {
        "ok": True,
        "audioStreamCount": media_info["audioStreamCount"],
        "duration": round(float(media_info["duration"] or 0), 3),
        "sampleCount": int(getattr(samples, "size", 0)),
        "enhancedSampleCount": int(getattr(enhanced, "size", 0)),
    }


def install_fake_whisper_module(language="zh"):
    class FakeSegment:
        def __init__(self, start, end, text):
            self.start = start
            self.end = end
            self.text = text

    class FakeInfo:
        def __init__(self):
            self.language = language
            self.duration = 1.0

    class FakeWhisperModel:
        def __init__(self, *_args, **_kwargs):
            pass

        def transcribe(self, _audio_input, **_kwargs):
            return [FakeSegment(0.0, 1.0, "smoke transcription")], FakeInfo()

    fake_module = type(sys)("faster_whisper")
    fake_module.WhisperModel = FakeWhisperModel
    sys.modules["faster_whisper"] = fake_module


def smoke_transcribe(media_path):
    with tempfile.TemporaryDirectory(prefix="asmr-trans-worker-models-") as models_dir:
        install_fake_whisper_module("zh")
        return transcribe(
            {
                "audioPath": media_path,
                "whisperModel": "smoke",
                "computeDevice": "cpu",
                "modelsDir": models_dir,
                "translateAfterTranscribe": False,
                "audioEnhancement": {
                    "enabled": True,
                    "normalize": True,
                    "compression": True,
                    "denoise": True,
                    "mono": True,
                    "targetPeak": 0.8,
                    "noiseGateDb": -50,
                },
                "whisperAdvanced": {
                    "beamSize": 1,
                    "vadFilter": False,
                    "noSpeechThreshold": 0.6,
                    "conditionOnPreviousText": False,
                },
            }
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--check-deps", action="store_true")
    parser.add_argument("--check-tts-deps", action="store_true")
    parser.add_argument("--hardware", action="store_true")
    parser.add_argument("--smoke-media")
    parser.add_argument("--smoke-transcribe")
    parser.add_argument("--request-file")
    args = parser.parse_args()

    if args.check:
        print("Python worker OK")
        return

    if args.check_deps:
        missing = check_dependencies()
        print(json.dumps({"ok": len(missing) == 0, "missing": missing}, ensure_ascii=False))
        if missing:
            sys.exit(1)
        return

    if getattr(args, "check_tts_deps", False):
        missing = check_tts_dependencies()
        print(json.dumps({"ok": len(missing) == 0, "missing": missing}, ensure_ascii=False))
        if missing:
            sys.exit(1)
        return

    if args.hardware:
        print(json.dumps(get_hardware_status(), ensure_ascii=False))
        return

    if args.smoke_media:
        print(json.dumps(smoke_media(args.smoke_media), ensure_ascii=False))
        return

    if args.smoke_transcribe:
        try:
            emit("done", smoke_transcribe(args.smoke_transcribe))
        except Exception as error:
            emit("error", {"message": str(error), "traceback": traceback.format_exc()})
            sys.exit(1)
        return

    try:
        request = parse_request(args.request_file)
        if request.get("mode") == "translate":
            result = translate(request)
        elif request.get("mode") == "tts":
            result = tts(request)
        else:
            result = transcribe(request)
        emit("done", result)
    except Exception as error:
        emit("error", {"message": str(error), "traceback": traceback.format_exc()})
        sys.exit(1)


if __name__ == "__main__":
    main()
