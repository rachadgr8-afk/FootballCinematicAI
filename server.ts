import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const app = express();

app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

// نقطة معالجة الفيديو (Video Processing Endpoint)
app.post('/api/process-video', async (req: Request, res: Response): Promise<void> => {
  try {
    const { plan, currentVideoUrl } = req.body;

    if (!currentVideoUrl) {
      res.status(400).json({ error: 'مسار الفيديو الأصلي غير متوفر.' });
      return;
    }

    // 1. إنشاء اسم ومسار فريد لملف الإخراج
    const uniqueFileName = `output_${Date.now()}.mp4`;
    const inputPath = path.join(__dirname, 'public', 'input.mp4');
    const outputPath = path.join(__dirname, 'public', 'outputs', uniqueFileName);

    // التأكد من وجود مجلد المخرجات
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 2. تنفيذ أمر التعديل (مثال باستخدام FFmpeg لدمج المؤثرات)
    // قم بتعديل الأمر ليناسب نوع التعديل المطلوبة في مشروعك
    const ffmpegCommand = `ffmpeg -y -i "${inputPath}" -vf "eq=contrast=1.2:brightness=0.05:saturation=1.3" -c:a copy "${outputPath}"`;

    const { stderr } = await execPromise(ffmpegCommand);

    // 3. التأكد من إنشاء الملف بنجاح وحجمه أكبر من 0
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      const outputVideoUrl = `/static/outputs/${uniqueFileName}`;
      
      // إرجاع الرابط الجديد بالكامل
      res.status(200).json({
        success: true,
        outputVideoUrl: outputVideoUrl,
        message: 'تمت معالجة الفيديو بنجاح.',
      });
    } else {
      throw new Error(`فشلت المعالجة: ${stderr}`);
    }

  } catch (error: any) {
    console.error('Server Processing Error:', error);
    res.status(500).json({
      success: false,
      error: 'فشل في رندر وتعديل الفيديو على الخادم.',
      details: error.message || error,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
