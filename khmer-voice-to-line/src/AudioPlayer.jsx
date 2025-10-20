import React, { useState, useRef, useEffect } from 'react';

export default function AudioPlayer({ blob, title = "Audio" }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!blob) return;
    
    const audio = new Audio();
    audioRef.current = audio;
    
    const url = URL.createObjectURL(blob);
    audio.src = url;
    
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setLoading(false);
    };
    
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    
    const handleEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    
    const handleError = () => {
      setLoading(false);
      console.error('Audio loading error');
    };
    
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    
    setLoading(true);
    
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted]);

  useEffect(() => {
    if (playing) {
      const animate = () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
          animationRef.current = requestAnimationFrame(animate);
        }
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playing]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const handleProgressClick = (e) => {
    if (!audioRef.current || !progressRef.current) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const newTime = (clickX / width) * duration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setMuted(newVolume === 0);
  };

  const toggleMute = () => {
    setMuted(!muted);
  };

  const formatTime = (time) => {
    if (!isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="audio-player">
        <div className="card" style={{ background: '#f8f9fa' }}>
          <p className="m-0">Loading audio...</p>
        </div>
      </div>
    );
  }

  if (!blob) {
    return (
      <div className="audio-player">
        <div className="card" style={{ background: '#f8f9fa' }}>
          <p className="m-0">No audio available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="audio-player">
      <div className="card" style={{ background: '#f8f9fa' }}>
        <div className="card-row">
          <strong className="card-title grow">{title}</strong>
          <span className="pill">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        
        <div className="row">
          <button 
            className="btn btn-primary" 
            onClick={togglePlayPause}
            disabled={loading}
          >
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          
          <div 
            className="grow" 
            ref={progressRef}
            onClick={handleProgressClick}
            style={{
              height: '8px',
              background: '#e9ecef',
              borderRadius: '4px',
              cursor: 'pointer',
              position: 'relative',
              margin: '0 8px'
            }}
          >
            <div
              style={{
                height: '100%',
                background: '#3498db',
                borderRadius: '4px',
                width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                transition: 'width 0.1s ease'
              }}
            />
          </div>
        </div>
        
        <div className="row player-controls">
          <button 
            className="btn btn-ghost" 
            onClick={toggleMute}
            style={{ minWidth: '40px' }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          
          <div className="volume-container" style={{ minWidth: '80px' }}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              style={{ width: '100%' }}
            />
          </div>
          
          <span className="pill" style={{ fontSize: '12px' }}>
            {Math.round((muted ? 0 : volume) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
