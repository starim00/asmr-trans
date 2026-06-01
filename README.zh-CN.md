# ASMR Trans 中文介绍

ASMR Trans 是一款面向 Windows 桌面的本地批量音视频转写工具，重点服务 ASMR、口语音频和长音频素材整理。它把 Whisper 本地识别、可编辑分段结果、日语到中文的 AI 翻译、TXT/SRT 导出和任务历史整合在一个桌面客户端里。

## 适合做什么

- 批量导入音频或视频文件，按队列顺序本地处理。
- 将中文音频/视频转写为带时间戳的中文文本。
- 将日语音频/视频转写为日语原文，并通过 OpenAI 兼容接口翻译为中文。
- 在导出前直接编辑分段文本，修正识别或翻译结果。
- 导出单个任务或批量导出 TXT、SRT 字幕文件。
- 为低音量 ASMR 素材启用可选的音频增强预处理。

## 核心特点

- 本地优先：媒体文件在本机处理，不上传到云端服务。
- 队列稳定：Whisper 转写默认串行执行，避免 GPU 资源争抢。
- 翻译灵活：日语翻译使用可配置的 OpenAI 兼容 LLM 接口。
- 代理分离：依赖/模型下载代理与 AI 翻译代理相互独立。
- 历史保留：任务历史、设置和模型缓存保存在本机用户目录。
- 打包友好：Windows 安装包内置轻量 Python 运行时，模型按需下载。

## 支持格式

```text
mp3, wav, m4a, flac, ogg, aac, mp4, mkv, mov, webm, avi, wmv
```

视频文件会读取其中的音频轨道。如果视频没有可读取音轨，任务会以明确错误失败。

## 快速开始

开发环境运行：

```powershell
npm install
py -3 -m pip install -r python/requirements.txt
npm run dev
```

首次转写会把 Whisper 模型下载到应用模型目录。Windows 上建议使用 `py -3` 作为 Python 启动方式。

## AI 翻译配置

日语音频的中文翻译依赖 OpenAI 兼容的 Chat Completions 接口。你可以在设置抽屉中配置：

- Base URL
- API Key
- 模型名称
- 采样参数
- 上下文窗口
- 翻译提示词
- AI 翻译专用代理

如果检测到日语音频但没有配置 API Key，任务会直接给出配置错误，不会回退到本地 NLLB 翻译。

## 隐私和本地文件

项目不会内置 API Key，也不会强制设置代理。用户自己的设置、历史、模型、运行时依赖和生成文件都应保留在本机环境，不应提交到 git 仓库。

已忽略的典型本地内容包括：

- `.env*`
- `settings.json`
- `history.json`
- `release/`
- `runtime/`
- `models/`
- 音频、视频、安装包和压缩包

## 打包

```powershell
npm run dist
```

安装包会输出到 `release/`。发布前应先更新版本号，并确认安装包、便携版、模型文件和本地运行时依赖没有被提交到仓库。
