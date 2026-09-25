import React, { useRef, useEffect, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Zap,
  Sparkles,
  Download,
  ExternalLink,
  Sliders,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { EditPlan } from '../types/football';

interface AndroidMedia3PlayerProps {
  videoUrl: string;
  posterUrl?: string;
  editPlan?: EditPlan | null;
  title?: string;
  isRenderedMaster?: boolean;
}

export const AndroidMedia3Player: React.FC<AndroidMedia3PlayerProps> = ({
  videoUrl,
  posterUrl = '/videos/poster_10s.jpg',
  editPlan,
  title = 'Real Match Footage',
  isRenderedMaster = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // إضافة Cache-Buster لضمان عدم قراءة الفيديو القديم من الذاكرة المؤقتة
  const formattedVideoUrl = React.useMemo(() => {
    if (!videoUrl) return '';
    const cacheBuster = `t=${Date.now()}`;
    return videoUrl.includes('?') ? `${videoUrl}&${cacheBuster}` : `${videoUrl}?${cacheBuster}`;
  }, [videoUrl]);

  // إعادة تحميل المشغل عند تغير الرابط
  useEffect(() => {
    const video = videoRef.current;
    if (video && formattedVideoUrl) {
      setHasError(false);
      setErrorMessage('');
      setIsPlaying(false);
      setCurrentTime(0);

      video.pause();
      video.load();
    }
  }, [formattedVideoUrl]);

  const handlePlayPause = async () => {
    if (!videoRef.current) return;
    try {
      if (videoRef.current.paused) {
        await videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Error playing video:', err);
      setHasError(true);
      setErrorMessage('فشل في تشغيل الفيديو');
    }
  };

  const handleMuteToggle = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black shadow-2xl group">
      {/* مشغل الفيديو الأساسي */}
      <video
        ref={videoRef}
        key={formattedVideoUrl} // يفرض إعادة بناء العنصر عند تغير المسار
        src={formattedVideoUrl}
        poster={posterUrl}
        className="w-full h-auto max-h-[70vh] object-contain mx-auto"
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setHasError(true);
          setErrorMessage('تعذر تحميل ملف الفيديو المعدل.');
        }}
        playsInline
      />

      {/* رسالة الخطأ إن وجدت */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white p-4">
          <AlertCircle className="w-6 h-6 text-red-500 mr-2" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* شريط التحكم بالفيديو */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
        <button
          onClick={handlePlayPause}
          className="p-2 text-white hover:text-emerald-400 transition"
        >
          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
        </button>

        <span className="text-xs text-gray-300">
          {Math.floor(currentTime)}s / {Math.floor(duration)}s
        </span>

        <button
          onClick={handleMuteToggle}
          className="p-2 text-white hover:text-emerald-400 transition"
        >
          {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
};
