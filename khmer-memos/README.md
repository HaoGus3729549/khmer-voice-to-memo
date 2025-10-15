# 高棉语语音备忘录

精简版高棉语语音备忘录应用，支持录音、转录、保存和管理。

## 功能
- 实时录音转录（高棉语）
- 语音备忘录保存和管理
- 播放已保存的录音
- 下载录音文件
- 删除备忘录
- 本地数据持久化（IndexedDB）

## 启动
```bash
npm install
npm run dev
```

访问 http://localhost:3002

## 文件结构
```
src/
├── main.jsx      # React 入口
├── App.jsx       # 主组件
├── whisper.js    # 高棉语 STT
├── audio.js      # 音频处理
└── db.js         # 数据持久化
```
