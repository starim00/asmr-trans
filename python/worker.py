import argparse
import ctypes.util
import json
import os
import sys
import traceback
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

NLLB_MODEL_ID = "facebook/nllb-200-distilled-600M"
JA_LANG = "jpn_Jpan"
ZH_LANG = "zho_Hans"
NLLB_ALLOW_PATTERNS = [
    "config.json",
    "generation_config.json",
    "pytorch_model.bin",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
]

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "30")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")


def add_torch_dll_directory():
    try:
        import torch

        torch_lib = Path(torch.__file__).resolve().parent / "lib"
        if torch_lib.exists():
            os.environ["PATH"] = f"{torch_lib}{os.pathsep}{os.environ.get('PATH', '')}"
            if hasattr(os, "add_dll_directory"):
                os.add_dll_directory(str(torch_lib))
            return str(torch_lib)
    except Exception:
        return None
    return None


TORCH_DLL_DIR = add_torch_dll_directory()


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
        "torchDllDir": TORCH_DLL_DIR,
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


def get_torch_status():
    try:
        import torch

        cuda_available = torch.cuda.is_available()
        torch_status = {
            "torchInstalled": True,
            "torchVersion": torch.__version__,
            "torchCudaAvailable": cuda_available,
            "torchCudaVersion": torch.version.cuda,
            "cudaDeviceCount": torch.cuda.device_count() if cuda_available else 0,
            "cudaDeviceName": torch.cuda.get_device_name(0) if cuda_available else None,
        }
    except Exception as error:
        torch_status = {
            "torchInstalled": False,
            "torchVersion": None,
            "torchCudaAvailable": False,
            "torchCudaVersion": None,
            "cudaDeviceCount": 0,
            "cudaDeviceName": None,
            "error": str(error),
        }

    try:
        import ctranslate2

        ctranslate_cuda_count = ctranslate2.get_cuda_device_count()
    except Exception:
        ctranslate_cuda_count = 0

    torch_status["ctranslate2CudaAvailable"] = ctranslate_cuda_count > 0
    torch_status["ctranslate2CudaDeviceCount"] = ctranslate_cuda_count
    torch_status["cudaRuntime"] = cuda_runtime_status()
    torch_status["cudaAvailable"] = bool(
        torch_status["torchCudaAvailable"] or torch_status["ctranslate2CudaAvailable"]
    )
    return torch_status


def resolve_device(requested_device):
    requested = (requested_device or "auto").lower()
    torch_status = get_torch_status()
    whisper_cuda_available = bool(torch_status.get("ctranslate2CudaAvailable"))

    if requested == "cuda":
        if not whisper_cuda_available:
            raise RuntimeError("GPU mode was requested, but CUDA is not available to faster-whisper.")
        return "cuda", "float16", torch_status

    if requested == "auto" and whisper_cuda_available:
        return "cuda", "float16", torch_status

    return "cpu", "int8", torch_status


def is_cuda_runtime_error(error):
    message = str(error).lower()
    return any(
        needle in message
        for needle in ["cublas", "cudnn", "cuda", "cublas64_12.dll"]
    )


def model_dirs(models_dir):
    root = Path(models_dir)
    return root / "whisper", root / "nllb"


def local_nllb_dir(nllb_dir):
    return Path(nllb_dir) / "facebook-nllb-200-distilled-600M-local"


def ensure_nllb_model(nllb_dir):
    from huggingface_hub import snapshot_download

    local_dir = local_nllb_dir(nllb_dir)
    if all((local_dir / name).exists() for name in NLLB_ALLOW_PATTERNS):
        return str(local_dir)

    progress("model", "Checking/downloading NLLB model files...", 55)
    return snapshot_download(
        repo_id=NLLB_MODEL_ID,
        cache_dir=str(nllb_dir),
        allow_patterns=NLLB_ALLOW_PATTERNS,
        max_workers=1,
        resume_download=True,
    )


def translate_segments(segments, nllb_dir, device):
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    translation_device = "cuda" if device == "cuda" and torch.cuda.is_available() else "cpu"
    if device == "cuda" and translation_device == "cpu":
        progress("hardware", "PyTorch is CPU-only; NLLB translation will run on CPU.", 54)

    model_path = ensure_nllb_model(nllb_dir)
    progress("model", f"Loading NLLB translation model on {translation_device}...", 56)
    tokenizer = AutoTokenizer.from_pretrained(model_path, src_lang=JA_LANG, local_files_only=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_path, local_files_only=True)
    model.to(translation_device)
    model.eval()
    forced_bos_token_id = tokenizer.convert_tokens_to_ids(ZH_LANG)

    translated = []
    total = max(len(segments), 1)
    for index, segment in enumerate(segments):
        text = segment["sourceText"].strip()
        translated_text = ""
        if text:
            inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512).to(model.device)
            with torch.inference_mode():
                generated_tokens = model.generate(
                    **inputs,
                    forced_bos_token_id=forced_bos_token_id,
                    max_length=256,
                    no_repeat_ngram_size=3,
                    repetition_penalty=1.1,
                )
            translated_text = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0].strip()
        translated.append({**segment, "translatedText": translated_text})
        progress("translate", f"Translating segment {index + 1}/{total}...", 60 + int(((index + 1) / total) * 35))
    return translated


def transcribe(request):
    from faster_whisper import WhisperModel

    audio_path = request["audioPath"]
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file does not exist: {audio_path}")

    whisper_model = request.get("whisperModel", "small")
    requested_device = request.get("computeDevice", "auto")
    device, compute_type, torch_status = resolve_device(requested_device)
    models_dir = request.get("modelsDir") or str(Path.home() / ".asmr-trans" / "models")
    whisper_dir, nllb_dir = model_dirs(models_dir)
    whisper_dir.mkdir(parents=True, exist_ok=True)
    nllb_dir.mkdir(parents=True, exist_ok=True)

    progress("hardware", f"Using {device.upper()} compute ({compute_type}).", 3)
    if device == "cuda":
        progress("hardware", f"GPU: {torch_status.get('cudaDeviceName') or 'CUDA device'}", 4)

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
        segments = translate_segments(segments, nllb_dir, device)
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
    parser.add_argument("--hardware", action="store_true")
    parser.add_argument("--request-file")
    args = parser.parse_args()

    if args.check:
        print("Python worker OK")
        return

    if args.hardware:
        print(json.dumps(get_torch_status(), ensure_ascii=False))
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
