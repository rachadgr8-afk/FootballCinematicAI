import React, { useState } from 'react';
import { AndroidMedia3Player } from './components/AndroidMedia3Player';
import { PipelineProgressModal } from './components/PipelineProgressModal';
import { EditPlan } from './types/football';

export const App: React.FC = () => {
  const [videoUrl, setVideoUrl] = useState<string>('/videos/input.mp4');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentPlan, setCurrentPlan] = useState<EditPlan | null>(null);

  // دالة المعالجة غير المتزامنة (تطبيق الخطوة 2)
  const handleApplyEdits = async (plan: EditPlan) => {
    try {
      setIsProcessing(true);
      setProgress(10);

      // محاكاة إرسال طلب التعديل أو استدعاء API للمعالجة (FFmpeg / AI Pipeline)
      const response = await fetch('/api/process-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, currentVideoUrl: videoUrl }),
      });

      setProgress(60);

      if (!response.ok) {
        throw new Error('فشلت عملية التعديل في خادم المعالجة');
      }

      const data = await response.json();
      setProgress(90);

      // التأكد من أن الرابط الجديد متوفر قبل إجراء الاستبدال
      if (data && data.outputVideoUrl) {
        setCurrentPlan(plan);
        // تحديث الرابط بالمسار الجديد
        setVideoUrl(data.outputVideoUrl);
      } else {
        throw new Error('لم يتم إرجاع مسار فيديو صالح.');
      }

      setProgress(100);
    } catch (error) {
      console.error('Error processing video:', error);
      alert('حدث خطأ أثناء معالجة الفيديو. يرجى إعادة المحاولة.');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-emerald-400">Football Cinematic AI</h1>
      </header>

      <main className="max-w-4xl mx-auto space-y-6">
        {/* مشغل الفيديو المعدل */}
        <AndroidMedia3Player
          videoUrl={videoUrl}
          editPlan={currentPlan}
          title="Match Scene Analysis"
        />

        {/* مؤشر تقدم العملية لمنع التفاعل حتى انتهاء الرندر */}
        {isProcessing && (
          <PipelineProgressModal
            isOpen={isProcessing}
            progress={progress}
            message="جاري تطبيق المؤثرات السينمائية ورندر الفيديو..."
          />
        )}
      </main>
    </div>
  );
};

export default App;
