# Khmer Voice to Text

高棉语语音转文字测试应用 - 用于测试和评估高棉语语音识别模型。

## 功能特性

- ✅ 实时录音并转录高棉语语音
- ✅ 上传音频文件进行转录（支持 WAV, MP3, OGG, WEBM）
- ✅ 实时显示转录预览
- ✅ 简洁的单页面界面

## 使用的模型

**主模型**: [seanghay/whisper-small-khmer](https://huggingface.co/seanghay/whisper-small-khmer)
- 基于 OpenAI Whisper 架构
- 专门针对高棉语训练
- 支持浏览器端 ONNX 运行

**备选模型**: Xenova/whisper-tiny（如果主模型加载失败）

## 快速开始

### 安装依赖

```bash
npm install --legacy-peer-deps
```

### 启动开发服务器

```bash
npm run dev
```

应用将在 http://localhost:3000 启动

### 构建生产版本

```bash
npm run build
npm run preview
```

## 使用方法

### 方式 1: 录音转录

1. 点击 "● Start Recording" 按钮
2. 允许浏览器访问麦克风权限
3. 说高棉语（可以看到实时转录预览）
4. 点击 "■ Stop Recording" 停止录音
5. 查看最终转录结果

### 方式 2: 上传音频文件

1. 点击上传区域或拖拽音频文件
2. 等待模型处理
3. 查看转录结果

## 项目结构

```
khmer-voice-to-line/
├── src/
│   ├── main.jsx              # React 应用入口
│   ├── KhmerVoiceApp.jsx     # 主UI组件
│   ├── whisperLive.js        # 高棉语STT核心逻辑
│   └── resample.js           # 音频预处理工具
├── index.html                # HTML入口
├── style.css                 # 样式文件
├── package.json              # 依赖配置
└── vite.config.js            # Vite构建配置
```

## 技术栈

- **React 18** - UI框架
- **@xenova/transformers** - 浏览器端运行机器学习模型
- **Vite** - 开发服务器和构建工具
- **Web Audio API** - 音频处理
- **MediaRecorder API** - 录音功能

## 模型性能

首次加载模型时需要从 Hugging Face 下载模型文件（约 150MB），请耐心等待。
模型加载后会缓存在浏览器中，后续使用会更快。

## 测试建议

1. **录音测试**: 使用清晰的高棉语音频，避免背景噪音
2. **文件测试**: 准备不同说话人、不同口音的高棉语音频文件
3. **评估准确率**: 对比转录结果与实际内容
4. **性能监测**: 观察模型加载时间和转录速度

## 故障排除

### 模型加载失败
- 检查网络连接（需要访问 Hugging Face）
- 等待模型下载完成（首次使用需要时间）
- 清除浏览器缓存后重试

### 麦克风无法访问
- 检查浏览器权限设置
- 确保使用 HTTPS 或 localhost
- 尝试其他浏览器

### 转录结果为空
- 确保音频清晰，语音明确
- 检查音频格式是否支持
- 查看浏览器控制台的错误信息

## 下一步计划

- [ ] 测试更多高棉语语音样本
- [ ] 评估模型准确率
- [ ] 尝试其他高棉语模型（如 gagan3012/wav2vec2-xlsr-khmer）
- [ ] 添加录音管理功能（保存、播放、删除历史记录）
- [ ] 性能优化和UI改进

## 参考资源

- [Whisper模型文档](https://huggingface.co/docs/transformers/model_doc/whisper)
- [@xenova/transformers](https://github.com/xenova/transformers.js)
- [高棉语Whisper模型](https://huggingface.co/seanghay/whisper-small-khmer)

## License

本项目基于原始代码架构，用于高棉语语音识别测试。

