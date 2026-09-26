export const videoLogger = {
  info: (message: string, data?: any) => {
    console.log(`[VideoLogger - INFO] ${new Date().toISOString()}: ${message}`, data || '');
  },
  
  error: (message: string, error?: any) => {
    console.error(`[VideoLogger - ERROR] ${new Date().toISOString()}: ${message}`, error || '');
    
    // إرسال تقرير الخطأ للخادم إذا لزم الأمر
    if (window.navigator.onLine) {
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'ERROR',
          message,
          error: error?.toString() || error,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
  }
};
