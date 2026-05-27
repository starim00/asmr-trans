import argparse
import ctypes.util
import json
import os
import re
import sys
import time
import traceback
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

JA_LANG = "jpn_Jpan"

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "30")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")


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
    return {
        "cublas64_12": cublas,
        "cudnnDlls": cudnn_candidates[:5],
        "cudnnAvailable": len(cudnn_candidates) > 0,
    }


def emit(message_type, payload):
    sys.stdout.write(json.dumps({"type": message_type, "payload": payload}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def progress(stage, message, percent=None):
    payload = {"stage": stage, "message": message}
    if percent is not None:
        payload["percent"] = percent
    emit("progress", payload)


def parse_request(request_file=None):
    if request_file:
        return json.loads(Path(request_file).read_text(encoding="utf-8"))

    raw = sys.stdin.buffer.read().decode("utf-8")
    if not raw.strip():
        raise ValueError("Worker received no input.")
    return json.loads(raw)


def get_hardware_status():
    try:
        import ctranslate2

        ctranslate_cuda_count = ctranslate2.get_cuda_device_count()
    except Exception:
        ctranslate_cuda_count = 0

    return {
        "ctranslate2CudaAvailable": ctranslate_cuda_count > 0,
        "ctranslate2CudaDeviceCount": ctranslate_cuda_count,
        "cudaAvailable": ctranslate_cuda_count > 0,
        "cudaDeviceCount": ctranslate_cuda_count,
        "cudaDeviceName": "CUDA device" if ctranslate_cuda_count else None,
        "cudaRuntime": cuda_runtime_status(),
    }


def check_dependencies():
    missing = []
    modules = [
        ("faster_whisper", "faster-whisper"),
        ("requests", "requests"),
        ("ctranslate2", "ctranslate2"),
    ]
    for module_name, package_name in modules:
        try:
            __import__(module_name)
        except Exception:
            missing.append(package_name)
    return missing


def resolve_device(requested_device):
    requested = (requested_device or "auto").lower()
    hardware_status = get_hardware_status()
    whisper_cuda_available = bool(hardware_status.get("ctranslate2CudaAvailable"))

    if requested == "cuda":
        if not whisper_cuda_available:
            raise RuntimeError("GPU mode was requested, but CUDA is not available to faster-whisper.")
        return "cuda", "float16", hardware_status

    if requested == "auto" and whisper_cuda_available:
        return "cuda", "float16", hardware_status

    return "cpu", "int8", hardware_status


def is_cuda_runtime_error(error):
    message = str(error).lower()
    return any(
        needle in message
        for needle in ["cublas", "cudnn", "cuda", "cublas64_12.dll"]
    )


def model_dirs(models_dir):
    root = Path(models_dir)
    return root / "whisper"


def as_int(value, default):
    try:
        if value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def as_float(value, default):
    try:
        if value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


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


def request_ai_translation_window(config, window_items):
    import requests

    api_key = (config.get("apiKey") or "").strip()
    if not api_key:
        raise ValueError("AI translation API key is empty.")

    url = normalize_chat_completions_url(config.get("baseUrl"))
    payload = build_ai_payload(config, window_items)
    timeout = max(as_int(config.get("timeoutSeconds"), 120), 10)
    response = requests.post(
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
                raise RuntimeError(
                    "CUDA mode failed because CUDA runtime DLLs are missing. "
                    "Install NVIDIA CUDA 12 runtime/cuBLAS/cuDNN, or choose Auto/CPU. "
                    f"Original error: {message}"
                ) from error
            raise

    progress("transcribe", "Transcribing audio...", 20)
    try:
        raw_segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
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
                audio_path,
                beam_size=5,
                vad_filter=True,
                condition_on_previous_text=False,
            )
        else:
            if device == "cuda" and is_cuda_runtime_error(error):
                raise RuntimeError(
                    "CUDA mode failed because CUDA runtime DLLs are missing. "
                    "Install NVIDIA CUDA 12 runtime/cuBLAS/cuDNN, or choose Auto/CPU. "
                    f"Original error: {error}"
                ) from error
            raise

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
        if index % 5 == 0:
            progress("transcribe", f"Recognized {len(segments)} segments...", min(50, 25 + len(segments)))

    detected_language = getattr(info, "language", "unknown") or "unknown"
    progress("transcribe", f"Transcription done. Detected language: {detected_language}", 52)

    if detected_language.startswith("ja"):
        ai_config = request.get("aiTranslationConfig") or {}
        if not (ai_config.get("apiKey") or "").strip():
            raise RuntimeError("Japanese audio requires AI translation. Configure an AI API key first.")
        progress("translate", "Using AI translation with context windows...", 58)
        segments = translate_segments_with_ai(segments, ai_config)
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--check-deps", action="store_true")
    parser.add_argument("--hardware", action="store_true")
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

    if args.hardware:
        print(json.dumps(get_hardware_status(), ensure_ascii=False))
        return

    try:
        request = parse_request(args.request_file)
        result = transcribe(request)
        emit("done", result)
    except Exception as error:
        emit("error", {"message": str(error), "traceback": traceback.format_exc()})
        sys.exit(1)


if __name__ == "__main__":
    main()
