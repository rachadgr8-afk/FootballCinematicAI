<video
  key={formattedVideoUrl}
  ref={videoRef}
  src={formattedVideoUrl}
  poster={posterUrl}
  className="w-full h-auto max-h-[70vh] object-contain mx-auto"
  onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
  onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
  onEnded={() => setIsPlaying(false)}
  onError={(e) => {
    const error = videoRef.current?.error;
    let details = 'خطأ غير معروف';
    if (error) {
      switch (error.code) {
        case error.MEDIA_ERR_ABORTED:
          details = 'تم توقيف التحميل بواسطة المستخدم.';
          break;
        case error.MEDIA_ERR_NETWORK:
          details = 'خطأ في الشبكة أثناء تحميل الفيديو.';
          break;
        case error.MEDIA_ERR_DECODE:
          details = 'فشل في فك ترميز الفيديو (Codec / Format Mismatch).';
          break;
        case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
          details = 'صيغة الفيديو غير مدعومة أو المسار غير صالح.';
          break;
      }
    }
    setHasError(true);
    setErrorMessage(details);
    console.error(`[MediaError Code ${error?.code}]: ${details}`, e);
  }}
  playsInline
/>
