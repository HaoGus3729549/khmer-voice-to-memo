# 高棉语语音转文字 - 精简版

精简版高棉语语音识别应用，去除所有日志和异常处理，专注于核心功能。

## 功能
- 实时录音转录
- 音频文件上传转录
- 高棉语 Whisper 模型

## 启动
```bash
npm install
npm run dev
```

访问 http://localhost:3001

## 文件结构
```
src/
├── main.jsx      # React 入口
├── App.jsx       # 主组件
├── whisper.js    # STT 核心
└── audio.js      # 音频处理
```
