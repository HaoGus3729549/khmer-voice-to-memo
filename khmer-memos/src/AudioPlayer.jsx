import React, { useState, useRef, useEffect } from 'react';

export default function AudioPlayer({ blob, title = "音频播放" }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef(null);
  const progressRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [blob]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgressClick = (e) => {
    const audio = audioRef.current;
    const progress = progressRef.current;
    if (!audio || !progress) return;

    const rect = progress.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const newTime = (clickX / width) * duration;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const formatTime = (time) => {
    if (!isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={blob ? URL.createObjectURL(blob) : null} preload="metadata" />
      
      <div className="player-header">
        <span className="player-title">{title}</span>
        <span className="player-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="player-controls">
        <button className="btn-play" onClick={togglePlay}>
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        
        <div className="progress-container">
          <div 
            className="progress-bar" 
            ref={progressRef}
            onClick={handleProgressClick}
          >
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            />
            <div 
              className="progress-thumb" 
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>

        <div className="volume-container">
          <span className="volume-icon">🔊</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            className="volume-slider"
          />
        </div>
      </div>

      <style jsx>{`
        .audio-player {
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 12px;
          margin: 8px 0;
        }
        
        .player-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .player-title {
          font-weight: 600;
          color: #2c3e50;
        }
        
        .player-time {
          font-size: 14px;
          color: #7f8c8d;
          font-family: monospace;
        }
        
        .player-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .btn-play {
          background: #3498db;
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
        }
        
        .btn-play:hover {
          background: #2980b9;
          transform: scale(1.05);
        }
        
        .progress-container {
          flex: 1;
          position: relative;
        }
        
        .progress-bar {
          width: 100%;
          height: 6px;
          background: #e9ecef;
          border-radius: 3px;
          cursor: pointer;
          position: relative;
        }
        
        .progress-fill {
          height: 100%;
          background: #3498db;
          border-radius: 3px;
          transition: width 0.1s;
        }
        
        .progress-thumb {
          position: absolute;
          top: -4px;
          width: 14px;
          height: 14px;
          background: #3498db;
          border-radius: 50%;
          transform: translateX(-50%);
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .progress-thumb:hover {
          transform: translateX(-50%) scale(1.2);
        }
        
        .volume-container {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 100px;
        }
        
        .volume-icon {
          font-size: 14px;
        }
        
        .volume-slider {
          width: 80px;
          height: 4px;
          background: #e9ecef;
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }
        
        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          background: #3498db;
          border-radius: 50%;
          cursor: pointer;
        }
        
        .volume-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          background: #3498db;
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}
