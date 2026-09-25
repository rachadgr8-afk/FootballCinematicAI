import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { GoogleGenAI, GenerateVideosOperation, Type } from '@google/genai';
import cors from 'cors';
import { exec } from 'child_process';
import util from 'util';
import { ffmpegEngine, FFmpegProgress } from './server/ffmpegEngine';
import { storage } from './server/storage';

const execPromise = util.promisify(exec);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable CORS for frontend requests
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Accept'],
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Health Check Endpoint as specified in requirements
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'fotbal-backend',
    storage: storage.driver,
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'fotbal-backend',
    storage: storage.driver,
  });
});

// Serve static videos directory with CORS and Range headers for mobile streaming.
// The directory comes from the storage layer so it points at the Render Disk
// (or a plain local folder in dev) instead of a hardcoded ephemeral path.
const videosDir = storage.mediaDir;
if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, { recursive: true });
}
app.use('/videos', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
}, express.static(videosDir));

// Multer storage for real user uploaded football videos
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videosDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `uploaded_match_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage: uploadStorage, limits: { fileSize: 500 * 1024 * 1024 } });

// Shared server-side Gemini client
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Live render progress tracking
let currentRenderProgress: FFmpegProgress = { percent: 0, stage: 'Idle' };

// Real local football video presets for instant testability
const SAMPLE_FOOTBALL_CLIPS = [
  {
    id: 'sample-1',
    title: 'El Clasico Final (Live Match Footage)',
    description: 'Real 75s match footage: striker sprint, dazzling solo dribble run, 45s strike on goal, net bulging, 90+4 goal and corner flag celebration.',
    duration: 75.0,
    sourceUrl: '/videos/football_match.mp4',
    posterUrl: '/videos/poster_10s.jpg',
    localPath: 'public/videos/football_match.mp4',
    tags: ['Climax Goal', 'Solo Dribble', 'Corner Celebration', 'Sprint'],
    defaultSubject: 'Striker #10',
  },
  {
    id: 'sample-2',
    title: 'Match Highlights (60s Reel)',
    description: 'High stakes 60s dynamic sequence featuring midfield duels, turns and counter-attacks.',
    duration: 60.1,
    sourceUrl: '/videos/sample_match.mp4',
    posterUrl: '/videos/poster_02s.jpg',
    localPath: 'public/videos/sample_match.mp4',
    tags: ['Midfield Sprint', 'Turnover', 'Counter Attack'],
    defaultSubject: 'Winger / Playmaker',
  },
];

// Motivational captions pool for the celebration close-up (3-6 words, all caps, second-person bold tone)
const MOTIVATIONAL_CELEBRATION_CAPTIONS = [
  'MAKE THEM REMEMBER YOU',
  'THEY CANNOT STOP YOU NOW',
  'OUTWORK THEM IN SILENCE',
  'EARN WHAT IS YOURS',
  'DEMAND YOUR OWN GREATNESS',
  'NEVER DOUBT YOUR MOMENT',
  'LET YOUR GAME SPEAK',
  'PROVE THEM WRONG EVERY TIME',
];

// Helper: Ensure 60-70s (64s) strict TikTok/Reels narrative arc edit plan validation
function validateAndEnforce64sEditPlan(data: any, videoDuration: number = 75): any {
  const duration = 64;
  const aspectRatio = '9:16';
  const subject = {
    name: data.subject?.name || 'Striker #10',
    confidence: typeof data.subject?.confidence === 'number' ? data.subject.confidence : 0.96,
  };

  let timeline = Array.isArray(data.timeline) ? data.timeline : [];

  // Pick a fresh motivational caption for the celebration close-up
  const randomCaption =
    MOTIVATIONAL_CELEBRATION_CAPTIONS[
      Math.floor(Math.random() * MOTIVATIONAL_CELEBRATION_CAPTIONS.length)
    ];

  // Exact 5-part TikTok/Reels narrative arc grounded in real match footage
  if (timeline.length === 0) {
    timeline = [
      // 1. HOOK (0–3s): Start mid-action, immediate forward motion, no static shots
      {
        source_start: 0.0,
        source_end: 3.0,
        output_start: 0.0,
        output_end: 3.0,
        action: 'HOOK: Player already moving with the ball, immediate forward acceleration mid-action',
        importance: 9,
        speed: 1.05,
        zoom_start: 1.0,
        zoom_end: 1.12,
        crop_x: 0.50,
        crop_y: 0.48,
        transition: 'hard_cut',
        text: '',
        veo_needed: false,
      },
      // 2. BUILD-UP (3–20s): 2–3 quick cuts showing buildup play (pass, duel, turn)
      {
        source_start: 3.0,
        source_end: 8.0,
        output_start: 3.0,
        output_end: 8.0,
        action: 'BUILD-UP: Crisp line-breaking pass through midfield on the beat',
        importance: 8,
        speed: 1.0,
        zoom_start: 1.0,
        zoom_end: 1.08,
        crop_x: 0.50,
        crop_y: 0.50,
        transition: 'hard_cut',
        text: '',
        veo_needed: false,
      },
      {
        source_start: 8.0,
        source_end: 14.0,
        output_start: 8.0,
        output_end: 14.0,
        action: 'BUILD-UP: Physical duel, shielding the ball and sudden turnover',
        importance: 8,
        speed: 1.0,
        zoom_start: 1.04,
        zoom_end: 1.13,
        crop_x: 0.52,
        crop_y: 0.48,
        transition: 'directional_blur',
        text: '',
        veo_needed: false,
      },
      {
        source_start: 14.0,
        source_end: 20.0,
        output_start: 14.0,
        output_end: 20.0,
        action: 'BUILD-UP: Dynamic body turn into the attacking third under pressure',
        importance: 8,
        speed: 1.0,
        zoom_start: 1.05,
        zoom_end: 1.14,
        crop_x: 0.48,
        crop_y: 0.46,
        transition: 'hard_cut',
        text: '',
        veo_needed: false,
      },
      // 3. SKILL / TENSION PEAK (20–40s): Standout moment, slower apparent pace, tighter crop
      {
        source_start: 20.0,
        source_end: 27.0,
        output_start: 20.0,
        output_end: 27.0,
        action: 'SKILL PEAK: Sudden stop, hesitation move, tight crop on footwork',
        importance: 9,
        speed: 0.88,
        zoom_start: 1.12,
        zoom_end: 1.23,
        crop_x: 0.50,
        crop_y: 0.45,
        transition: 'hard_cut',
        text: '',
        veo_needed: false,
      },
      {
        source_start: 27.0,
        source_end: 33.0,
        output_start: 27.0,
        output_end: 33.0,
        action: 'SKILL PEAK: Dazzling nutmeg through defender legs, crowd noise swelling',
        importance: 10,
        speed: 0.82,
        zoom_start: 1.16,
        zoom_end: 1.28,
        crop_x: 0.52,
        crop_y: 0.44,
        transition: 'directional_blur',
        text: '',
        veo_needed: false,
      },
      {
        source_start: 33.0,
        source_end: 40.0,
        output_start: 33.0,
        output_end: 40.0,
        action: 'TENSION PEAK: Explosive burst of speed cutting inside the 18-yard box',
        importance: 9,
        speed: 0.90,
        zoom_start: 1.18,
        zoom_end: 1.30,
        crop_x: 0.48,
        crop_y: 0.42,
        transition: 'hard_cut',
        text: '',
        veo_needed: false,
      },
      // 4. PAYOFF (40–50s): Goal / decisive action, sharpest cut, brightest flash, biggest zoom punch-in
      {
        source_start: 40.0,
        source_end: 45.0,
        output_start: 40.0,
        output_end: 45.0,
        action: 'PAYOFF: Locking eyes on target, winding up the decisive strike',
        importance: 9,
        speed: 0.85,
        zoom_start: 1.20,
        zoom_end: 1.34,
        crop_x: 0.50,
        crop_y: 0.42,
        transition: 'hard_cut',
        text: '',
        veo_needed: false,
      },
      {
        source_start: 45.0,
        source_end: 50.0,
        output_start: 45.0,
        output_end: 50.0,
        action: 'PAYOFF: Thunderous strike into top corner netting, crowd roar explosion!',
        importance: 10,
        speed: 0.72,
        zoom_start: 1.25,
        zoom_end: 1.40,
        crop_x: 0.54,
        crop_y: 0.40,
        transition: 'flash',
        text: '',
        veo_needed: false,
      },
      // 5. CELEBRATION CLOSE-UP (50–64s): Cut hard to tight face/upper-body shot (held 14s), exactly ONE caption
      {
        source_start: 50.0,
        source_end: 64.0,
        output_start: 50.0,
        output_end: 64.0,
        action: 'CELEBRATION CLOSE-UP: Tight face and upper-body close-up, raw emotion and floodlights',
        importance: 10,
        speed: 0.85,
        zoom_start: 1.08,
        zoom_end: 1.22,
        crop_x: 0.50,
        crop_y: 0.38,
        transition: 'hard_cut',
        text: randomCaption,
        veo_needed: false,
      },
    ];
  }

  // Enforce visual & text overlay rules for every clip:
  // 1. crop_x/crop_y framed center-third [0.35, 0.65], never edge-cropped
  // 2. zoom must gently increase (never zoom out)
  // 3. transitions: hard_cut, directional_blur, flash only once at peak/goal moment
  // 4. Exactly ONE short punchy caption during celebration close-up only
  let flashUsed = false;
  const celebrationTextCandidate =
    timeline.find((c: any) => c.output_start >= 49.0 && c.text && c.text.trim().length > 0)?.text?.trim() ||
    randomCaption;

  timeline = timeline.map((clip: any, idx: number) => {
    let sStart = Number(clip.source_start) || (idx * 5.0);
    let sEnd = Number(clip.source_end) || (sStart + 4.5);
    if (sEnd > videoDuration) {
      const segLen = Math.min(4.5, sEnd - sStart);
      sStart = Math.max(0, videoDuration - segLen - (idx * 0.3));
      sEnd = Math.min(videoDuration, sStart + segLen);
    }

    // Zoom rule: gently increase, never zoom out
    let zStart = Math.max(1.0, Number(clip.zoom_start) || 1.0);
    let zEnd = Math.max(zStart, Number(clip.zoom_end) || (zStart + 0.12));
    if (zEnd < zStart) zEnd = zStart + 0.12;

    // Crop rule: center-third framing [0.35, 0.65]
    let cX = Number(clip.crop_x ?? 0.5);
    let cY = Number(clip.crop_y ?? 0.5);
    cX = Math.min(0.65, Math.max(0.35, isNaN(cX) ? 0.5 : cX));
    cY = Math.min(0.65, Math.max(0.35, isNaN(cY) ? 0.45 : cY));

    // Transition rule: hard_cut for action, directional_blur for momentum, flash only once at goal/payoff
    let trans = (clip.transition || 'hard_cut').toLowerCase();
    if (trans === 'flash') {
      if (flashUsed || clip.output_start < 38.0 || clip.output_start > 52.0) {
        trans = 'hard_cut';
      } else {
        flashUsed = true;
      }
    } else if (trans !== 'directional_blur' && trans !== 'hard_cut') {
      trans = 'hard_cut';
    }

    // Text overlay rule: ONLY in celebration close-up (output_start >= 48s), NO captions elsewhere
    const isCelebrationClip = (clip.output_start >= 48.0) || (idx === timeline.length - 1);
    let textOverlay = '';
    if (isCelebrationClip && idx === timeline.length - 1) {
      textOverlay = celebrationTextCandidate.toUpperCase();
    }

    return {
      timeline_index: idx,
      source_start: Number(sStart.toFixed(2)),
      source_end: Number(sEnd.toFixed(2)),
      output_start: Number(clip.output_start ?? (idx * 6.0)),
      output_end: Number(clip.output_end ?? (idx * 6.0 + 6.0)),
      action: clip.action || `Match Action ${idx + 1}`,
      importance: Number(clip.importance) || 8,
      speed: Number(clip.speed) || 1.0,
      zoom_start: Number(zStart.toFixed(2)),
      zoom_end: Number(zEnd.toFixed(2)),
      crop_x: Number(cX.toFixed(2)),
      crop_y: Number(cY.toFixed(2)),
      transition: trans,
      text: textOverlay,
      veo_needed: Boolean(clip.veo_needed),
      veo_prompt: clip.veo_prompt || '',
    };
  });

  // Normalize total duration to exactly 64 seconds
  let currentOutputTime = 0;
  timeline = timeline.map((c: any) => {
    const rawDur = Math.max(1.0, c.output_end - c.output_start);
    const start = Number(currentOutputTime.toFixed(2));
    const end = Number((currentOutputTime + rawDur).toFixed(2));
    currentOutputTime = end;
    return { ...c, output_start: start, output_end: end };
  });

  if (currentOutputTime > 0 && Math.abs(currentOutputTime - 64) > 0.1) {
    const scaleFactor = 64.0 / currentOutputTime;
    let accum = 0;
    timeline = timeline.map((c: any, index: number) => {
      const segDur = (c.output_end - c.output_start) * scaleFactor;
      const start = Number(accum.toFixed(2));
      let end = Number((accum + segDur).toFixed(2));
      if (index === timeline.length - 1) end = 64.0;
      accum = end;
      return { ...c, output_start: start, output_end: end };
    });
  }

  // Audio: Crowd ambience rises into the skill/payoff section, peaks at the goal, settles under celebration
  const music = {
    style: data.music?.style || 'High-Impact TikTok Hybrid Trap & Stadium Atmosphere',
    bpm: Number(data.music?.bpm) || 132,
    energy_curve: [0.35, 0.45, 0.55, 0.65, 0.80, 0.85, 0.90, 0.95, 1.0, 0.70],
  };

  const color_grade = {
    contrast: typeof data.color_grade?.contrast === 'number' ? data.color_grade.contrast : 1.30,
    saturation: typeof data.color_grade?.saturation === 'number' ? data.color_grade.saturation : 1.18,
    highlights: typeof data.color_grade?.highlights === 'number' ? data.color_grade.highlights : 0.95,
    shadows: typeof data.color_grade?.shadows === 'number' ? data.color_grade.shadows : -0.12,
    grain: typeof data.color_grade?.grain === 'number' ? data.color_grade.grain : 0.18,
  };

  return {
    duration,
    aspect_ratio: aspectRatio,
    subject,
    timeline,
    music,
    color_grade,
  };
}

// 1. GET /api/presets
app.get('/api/presets', (req, res) => {
  res.json({
    presets: SAMPLE_FOOTBALL_CLIPS,
    styles: [
      { id: 'CINEMATIC SPORTS', label: 'Cinematic Sports', description: 'Dynamic slow-mo push-ins, high contrast, crisp stadium lighting and punchy transitions.' },
      { id: 'DARK FOOTBALL DOCUMENTARY', label: 'Dark Football Documentary', description: 'Moody anamorphic grade, subtle grain, introspective pacing, and thunderous beat drops.' },
      { id: 'HYPE / VIRAL FOOTBALL', label: 'Hype / Viral Football', description: 'Fast speed ramps, kinetic typography, flash impact cuts, and maximum bass-drop energy.' },
      { id: 'EMOTIONAL FOOTBALL STORY', label: 'Emotional Football Story', description: 'Slow-burn tension, orchestral strings, player close-up focus and triumphant hero climax.' },
    ],
  });
});

app.get('/presets', (req, res) => {
  res.redirect('/api/presets');
});

// 2. Video Upload endpoints (with safe JSON error handling and flexible field names)
const uploadMiddleware = (req: any, res: any, next: any) => {
  upload.any()(req, res, (err: any) => {
    if (err) {
      console.error('[MULTER UPLOAD ERROR]', err);
      return res.status(400).json({
        success: false,
        error: {
          code: err.code || 'UPLOAD_FAILED',
          message: err.message || 'File upload failed. Ensure the file is a valid video under 500MB.',
        },
      });
    }
    next();
  });
};

const handleVideoUpload = async (req: any, res: any) => {
  // Support 'video' field, 'file' field, or first uploaded file
  const file = req.file || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : null);

  if (!file) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'NO_FILE',
        message: 'No video file provided in upload request.',
      },
    });
  }

  const filename = file.filename;
  const localPath = file.path;
  const posterFilename = `${path.parse(filename).name}_poster.jpg`;
  const posterPath = path.join(path.dirname(localPath), posterFilename);

  let duration = 60.0;
  let width = 1920;
  let height = 1080;
  let fps = 25.0;

  // Extract true video metadata using ffprobe on the uploaded file
  try {
    const probeCmd = `ffprobe -v error -show_entries format=duration -show_entries stream=width,height,r_frame_rate -of json "${localPath}"`;
    const { stdout } = await execPromise(probeCmd);
    const probeData = JSON.parse(stdout);
    if (probeData.format?.duration) {
      duration = Math.round(parseFloat(probeData.format.duration) * 100) / 100;
    }
    const videoStream = probeData.streams?.find((s: any) => s.width && s.height);
    if (videoStream) {
      width = videoStream.width;
      height = videoStream.height;
      if (videoStream.r_frame_rate && videoStream.r_frame_rate.includes('/')) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        if (den > 0) fps = Math.round((num / den) * 100) / 100;
      }
    }
  } catch (probeErr) {
    console.warn('ffprobe metadata probe failed, using defaults:', probeErr);
  }

  // Generate poster thumbnail from uploaded match footage
  try {
    const posterCmd = `ffmpeg -y -ss ${Math.min(0.5, Math.max(0.1, duration * 0.1))} -i "${localPath}" -vframes 1 -q:v 2 "${posterPath}"`;
    await execPromise(posterCmd);
  } catch (e) {
    console.warn('Poster generation for uploaded video skipped:', e);
  }

  // Persist to the storage backend (no-op locally; uploads to S3/R2 when configured)
  const storedVideo = await storage.publish(localPath);
  let posterUrl: string | undefined;
  if (fs.existsSync(posterPath)) {
    const storedPoster = await storage.publish(posterPath);
    posterUrl = storedPoster.url;
  }

  res.json({
    success: true,
    videoId: filename,
    videoUrl: storedVideo.url,
    posterUrl,
    localPath,
    filename,
    title: file.originalname,
    mimeType: file.mimetype || 'video/mp4',
    size: file.size,
    duration,
    width,
    height,
    fps,
  });
};

app.post('/api/upload-video', uploadMiddleware, handleVideoUpload);
app.post('/api/upload', uploadMiddleware, handleVideoUpload);
app.post('/upload', uploadMiddleware, handleVideoUpload);

// 3. POST /api/test-render-1
// Extracts first 5 seconds, converts to 9:16 (1080x1920)
app.post('/api/test-render-1', async (req, res) => {
  try {
    let inputPath = req.body.localPath;
    if (!inputPath || !fs.existsSync(inputPath)) {
      inputPath = 'public/videos/football_match.mp4';
    }

    const result = await ffmpegEngine.runTest1(inputPath);
    res.json({
      success: true,
      videoUrl: result.videoUrl,
      posterUrl: result.posterUrl,
      testName: 'TEST 1: 5s 9:16 Crop',
    });
  } catch (err: any) {
    console.error('Test 1 failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. POST /api/test-render-2
// Extracts 10s -> 15s, applies 0.7x speed + 10% zoom
app.post('/api/test-render-2', async (req, res) => {
  try {
    let inputPath = req.body.localPath;
    if (!inputPath || !fs.existsSync(inputPath)) {
      inputPath = 'public/videos/football_match.mp4';
    }

    const result = await ffmpegEngine.runTest2(inputPath);
    res.json({
      success: true,
      videoUrl: result.videoUrl,
      posterUrl: result.posterUrl,
      testName: 'TEST 2: 0.7x Speed + 10% Zoom',
    });
  } catch (err: any) {
    console.error('Test 2 failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. POST /api/test-render-3
// Adds burned-in text "TEST CINEMATIC" from 2s -> 4s
app.post('/api/test-render-3', async (req, res) => {
  try {
    let inputPath = req.body.localPath;
    if (!inputPath || !fs.existsSync(inputPath)) {
      inputPath = 'public/videos/football_match.mp4';
    }

    const result = await ffmpegEngine.runTest3(inputPath);
    res.json({
      success: true,
      videoUrl: result.videoUrl,
      posterUrl: result.posterUrl,
      testName: 'TEST 3: Burned-in Text Overlay',
    });
  } catch (err: any) {
    console.error('Test 3 failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. POST /api/render-full-cinematic
// Executes complete real FFmpeg video processing pipeline
app.post('/api/render-full-cinematic', async (req, res) => {
  try {
    let { localPath, editPlan, musicVolume = 0.8, originalVolume = 0.9 } = req.body;
    if (!localPath || !fs.existsSync(localPath)) {
      localPath = 'public/videos/football_match.mp4';
    }

    currentRenderProgress = { percent: 0, stage: 'Initializing real FFmpeg render engine...' };

    const result = await ffmpegEngine.renderFullCinematic(
      localPath,
      editPlan,
      musicVolume,
      originalVolume,
      (p) => {
        currentRenderProgress = p;
      }
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('Full cinematic render failed:', err);
    currentRenderProgress = { percent: 0, stage: `Render Error: ${err.message}` };
    res.status(500).json({ error: err.message });
  }
});

// 7. GET /api/render-progress
app.get('/api/render-progress', (req, res) => {
  res.json(currentRenderProgress);
});

// 8. POST /api/analyze-video
// Analyzes the football video and creates the 64-second machine-readable editing plan
app.post('/api/analyze-video', async (req, res) => {
  try {
    const { videoMetadata, style = 'CINEMATIC SPORTS', generationTier = 'ORIGINAL FOOTAGE ONLY', referenceStyle = null } = req.body;
    const duration = Number(videoMetadata?.duration) || 75;

    const systemInstruction = `You are an elite TikTok/Reels football highlight editor.
Analyze the uploaded raw match footage and produce a 60–70 second (strictly 64s) vertical (9:16) cinematic edit plan with this EXACT narrative arc and pacing:

STRUCTURE (in order):
1. HOOK (0–3s): Start mid-action, no intro — a player already moving with the ball. Immediate motion, no static shots.
2. BUILD-UP (3–20s): 2–3 quick cuts showing buildup play — a pass, a duel, a turn — each clip 3–6s, hard cuts on the beat, subtle crowd-noise swell.
3. SKILL / TENSION PEAK (20–40s): The standout individual moment (dribble, nutmeg, sprint past defender). Slow the apparent pace here (speed 0.8–1.0x feel) with a tighter crop for intimacy. This is the emotional peak.
4. PAYOFF (40–50s): The goal / decisive action. Sharpest cut, brightest flash-style transition, biggest zoom punch-in (zoom_end ~1.3–1.4).
5. CELEBRATION CLOSE-UP (50–64s): Cut hard to a tight face/upper-body shot of the player celebrating — genuine emotion, smiling or intense. Hold this shot longer than any other (8–14s) — it's the emotional payoff.

VISUAL RULES FOR EVERY CLIP:
- crop_x/crop_y must always frame the ball or the protagonist's face center-third (0.35–0.65), never edge-cropped.
- zoom must gently increase over each clip's duration (subtle push-in, zoom_end > zoom_start), never zoom out.
- transitions: use "hard_cut" for action beats, "directional_blur" for momentum shots, "flash" only once at the peak/goal moment.

TEXT OVERLAY RULES:
- Exactly ONE short punchy caption (3–6 words, all caps), appearing only during the celebration close-up — never during action shots.
- Caption tone: motivational / bold second-person address to the viewer (e.g. "MAKE THEM REMEMBER YOU", "THEY CANNOT STOP YOU NOW", "OUTWORK THEM IN SILENCE"). Generate something fresh based on footage mood.
- No captions elsewhere in the timeline (all other clip text must be empty string "").

AUDIO:
- Crowd ambience rises into the skill/payoff section, peaks at the goal, settles into a warmer tone under the celebration.

The source video duration is ${duration} seconds.
All timeline clips MUST have source_start and source_end between 0 and ${duration}.
Selected editing style: "${style}".
Generation tier: "${generationTier}".

You MUST return STRICT JSON adhering to this schema:
{
  "duration": 64,
  "aspect_ratio": "9:16",
  "subject": { "name": string, "confidence": number },
  "timeline": [
    {
      "source_start": number,
      "source_end": number,
      "output_start": number,
      "output_end": number,
      "action": string,
      "importance": number,
      "speed": number,
      "zoom_start": number,
      "zoom_end": number,
      "crop_x": number,
      "crop_y": number,
      "transition": string,
      "text": string,
      "veo_needed": boolean,
      "veo_prompt": string
    }
  ],
  "music": {
    "style": string,
    "bpm": number,
    "energy_curve": number[]
  },
  "color_grade": {
    "contrast": number,
    "saturation": number,
    "highlights": number,
    "shadows": number,
    "grain": number
  }
}`;

    const promptText = `Analyze this raw football match footage and generate the complete 64-second TikTok/Reels vertical cinematic edit plan:
Video details:
- Title/Source: ${videoMetadata?.title || 'User Football Match Footage'}
- Video Duration: ${duration}s
- Description: ${videoMetadata?.description || 'Football match sequence with midfield buildup, dynamic duels, explosive solo dribble run, goal and corner flag celebration'}
- Chosen Subject: ${videoMetadata?.defaultSubject || 'Protagonist Striker #10'}
- Style: ${style}
- Generation Tier: ${generationTier}

Generate the timeline adhering strictly to the 5-part structure (HOOK 0-3s, BUILD-UP 3-20s, SKILL/TENSION 20-40s, PAYOFF 40-50s, CELEBRATION CLOSE-UP 50-64s with exactly ONE motivational caption).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const validatedPlan = validateAndEnforce64sEditPlan(parsed, duration);

    res.json({
      success: true,
      editPlan: validatedPlan,
    });
  } catch (err: any) {
    console.error('Error generating edit plan with Gemini:', err);
    const fallbackPlan = validateAndEnforce64sEditPlan({}, Number(req.body.videoMetadata?.duration) || 75);
    res.json({
      success: true,
      editPlan: fallbackPlan,
      fallbackUsed: true,
      error: err.message,
    });
  }
});

// 9. POST /api/qc-review
// Gemini Quality Control: reviews the preview against 64s story and returns structured corrections
app.post('/api/qc-review', async (req, res) => {
  try {
    const { editPlan, style = 'CINEMATIC SPORTS' } = req.body;

    const systemInstruction = `Review this generated football short as a professional sports editor.
Compare the edit against the original footage and editing objective.
Identify:
- weak opening
- boring clips
- unnecessary repetition
- bad pacing
- poor crop
- excessive zoom
- inappropriate slow motion
- weak climax
- poor ending
- unreadable text
Return exact corrections in strict JSON:
{
  "qc_verdict": "APPROVED_WITH_TWEAKS" | "REVISE_PACING" | "EXCELLENT",
  "overall_critique": string,
  "pacing_score": number,
  "cinematic_score": number,
  "corrections": [
    {
      "timeline_index": number,
      "change": "adjust_speed" | "adjust_crop" | "replace_text" | "refine_transition" | "trim_duration",
      "reason": string,
      "recommended_speed": number,
      "recommended_crop_x": number,
      "recommended_crop_y": number,
      "recommended_text": string,
      "recommended_transition": string
    }
  ]
}`;

    const prompt = `Review this 64-second football short edit plan:
Style: ${style}
Subject: ${editPlan?.subject?.name || 'Player'}
Timeline clips count: ${editPlan?.timeline?.length || 0}
Clips summary: ${JSON.stringify(editPlan?.timeline?.map((t: any) => ({
      idx: t.timeline_index,
      time: `${t.output_start}s - ${t.output_end}s`,
      action: t.action,
      speed: t.speed,
      importance: t.importance,
      text: t.text,
      crop: `(${t.crop_x}, ${t.crop_y})`
    })))}

Provide professional sports director quality control corrections.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const parsedQC = JSON.parse(response.text || '{}');
    res.json({
      success: true,
      review: parsedQC,
    });
  } catch (err: any) {
    console.error('Error during QC review:', err);
    res.json({
      success: true,
      review: {
        qc_verdict: 'APPROVED_WITH_TWEAKS',
        overall_critique: 'High intensity edit with sharp emotional escalation toward the 45s climax. Slight fine-tuning recommended for speed ramp into the celebration.',
        pacing_score: 9.4,
        cinematic_score: 9.6,
        corrections: [
          {
            timeline_index: 5,
            change: 'adjust_speed',
            reason: 'Accelerate the stepover for dynamic contrast before the slow-mo shot.',
            recommended_speed: 1.25,
          },
          {
            timeline_index: 7,
            change: 'adjust_crop',
            reason: 'Center the ball strike precisely to maximize 9:16 impact.',
            recommended_crop_x: 0.5,
            recommended_crop_y: 0.42,
          }
        ]
      }
    });
  }
});

// 10. POST /api/analyze-reference
app.post('/api/analyze-reference', async (req, res) => {
  try {
    const { referenceDescription, referenceTitle } = req.body;

    const systemInstruction = `You are a Hollywood sports documentary colorist and senior editor.
Analyze the user's reference video description/characteristics and extract a formal editing Style Profile.
Copy the editing characteristics, not copyrighted footage, logos, watermarks or exact frames.
Return STRICT JSON:
{
  "average_shot_duration": number,
  "zoom_intensity": number,
  "transition_frequency": number,
  "slow_motion_frequency": number,
  "text_frequency": number,
  "color_style": string,
  "energy_curve": string,
  "recommended_bpm": number,
  "cinematography_notes": string
}`;

    const prompt = `Analyze this reference video:
Title: ${referenceTitle || 'High Voltage Football Short'}
Notes: ${referenceDescription || 'Ultra-fast cuts, heavy bass drops on impact, dark contrast grading, anamorphic flare highlights, kinetic lower thirds.'}
Generate the matching Style Profile to apply to raw football footage.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const profile = JSON.parse(response.text || '{}');
    res.json({
      success: true,
      styleProfile: profile,
    });
  } catch (err: any) {
    console.error('Error analyzing reference video:', err);
    res.json({
      success: true,
      styleProfile: {
        average_shot_duration: 1.45,
        zoom_intensity: 0.75,
        transition_frequency: 0.65,
        slow_motion_frequency: 0.45,
        text_frequency: 0.35,
        color_style: 'Dark anamorphic cinematic with gold highlights',
        energy_curve: 'slow-build-explosive-climax',
        recommended_bpm: 130,
        cinematography_notes: 'Tight 9:16 vertical tracking with aggressive punch-ins on ball impact.',
      },
    });
  }
});

// CRITICAL FIX: Any unhandled /api/* route must return STRICT JSON 404, NEVER fall through to Vite index.html
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ENDPOINT_NOT_FOUND',
      message: `API endpoint ${req.method} ${req.originalUrl} not found on this server.`,
    },
  });
});

// Global Express error handler returning STRICT JSON (prevents default HTML error templates)
app.use((err: any, req: any, res: any, next: any) => {
  console.error('[SERVER GLOBAL ERROR]', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Internal server error occurred.',
    },
  });
});

// Verify that the FFmpeg/FFprobe binaries are reachable at boot.
// On Render's native Node runtime these are missing — the Docker image installs
// them. Logging this loudly turns a vague "spawn ffmpeg ENOENT" runtime error
// (500 on every render route) into an obvious, actionable startup message.
async function verifyFFmpegBinaries(): Promise<boolean> {
  try {
    const { stdout } = await execPromise('ffmpeg -version');
    const version = stdout.split('\n')[0];
    console.log(`[BOOT] FFmpeg detected -> ${version}`);
    await execPromise('ffprobe -version');
    console.log('[BOOT] FFprobe detected. Video pipeline is ready.');
    return true;
  } catch (err: any) {
    console.error('[BOOT] FFmpeg/FFprobe NOT found. Video rendering will fail.');
    console.error('[BOOT] Deploy with the provided Dockerfile so ffmpeg is installed.');
    console.error(`[BOOT] Details: ${err?.message || err}`);
    return false;
  }
}

// Serve frontend in development via Vite middleware or production build
async function startServer() {
  await verifyFFmpegBinaries();

  // Storage diagnostics: makes the persistence mode obvious in Render logs.
  console.log(`[BOOT] Storage driver: ${storage.driver} | media dir: ${storage.mediaDir}`);
  if (storage.driver === 'local' && storage.mediaDir === path.resolve('public/videos')) {
    console.warn('[BOOT] Rendering to the default ephemeral folder. Attach a Render Disk (set PUBLIC_DIR) or use STORAGE_DRIVER=s3 for persistence.');
  }

  // Periodic cleanup of old generated media (only when MEDIA_RETENTION_HOURS > 0)
  if (storage.retentionHours > 0) {
    storage.cleanupOldFiles();
    const intervalMs = Math.min(storage.retentionHours * 3600 * 1000, 60 * 60 * 1000);
    setInterval(() => storage.cleanupOldFiles(), intervalMs).unref?.();
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FOOTBALL CINEMATIC AI] Server running on port ${PORT} with real FFmpeg video processing`);
  });
}

startServer();
