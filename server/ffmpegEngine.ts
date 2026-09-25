import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import util from 'util';
import { storage } from './storage';

const execPromise = util.promisify(exec);

/**
 * Memory-safe libx264 flags for low-RAM free/entry-level hosts.
 *
 * The default `preset fast` keeps multiple B-frame lookahead buffers and uses
 * all cores, which easily exhausts ~512MB–1GB RAM when encoding 1080x1920 and
 * gets the whole container OOM-killed (observed as a Render 502 + restart).
 *
 * `ultrafast` uses a single reference frame and no lookahead; combined with
 * `-threads 1` it keeps peak RSS low enough to survive on small instances while
 * still producing fully valid, standard H.264 output.
 */
const MEM_SAFE_VIDEO_ARGS = '-preset ultrafast -x264-params "rc-lookahead=0:sync-lookahead=0:ref=1:bframes=0" -tune zerolatency';

export interface FFmpegProgress {
  percent: number;
  stage: string;
}

export class FFmpegEngine {
  private tempDir: string;
  private outputDir: string;

  constructor() {
    // Scratch space for per-clip segments. Kept on the fast local filesystem
    // (/tmp) on purpose: intermediate segments are disposable and must NOT be
    // written to the persistent disk (avoids filling it). Configurable for
    // platforms where /tmp is small or restricted.
    this.tempDir = path.resolve(process.env.TMP_WORK_DIR || '/tmp/football_engine/work');
    // Final outputs go to the storage media dir (Render Disk or S3-backed).
    this.outputDir = storage.mediaDir;

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * TEST 1: Extract first 5 seconds, convert to 9:16 (1080x1920) with faststart and poster
   */
  public async runTest1(inputPath: string): Promise<{ videoUrl: string; posterUrl: string }> {
    const outputPath = path.join(this.outputDir, 'test_output.mp4');
    const posterPath = path.join(this.outputDir, 'test_output_poster.jpg');

    const vf = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2';
    const cmd = `ffmpeg -y -ss 0 -t 5 -i "${inputPath}" -vf "${vf}" -c:v libx264 -profile:v baseline -level 3.1 ${MEM_SAFE_VIDEO_ARGS} -pix_fmt yuv420p -c:a aac -movflags +faststart -threads 1 "${outputPath}"`;
    await execPromise(cmd);

    // Extract poster frame
    const posterCmd = `ffmpeg -y -ss 0.5 -i "${outputPath}" -vframes 1 -q:v 2 "${posterPath}"`;
    try { await execPromise(posterCmd); } catch (e) {}

    // Publish to the configured storage backend (no-op in local mode)
    const vid = await storage.publish(outputPath);
    let posterUrl = storage.publicUrlFor(posterPath);
    if (fs.existsSync(posterPath)) {
      const p = await storage.publish(posterPath);
      posterUrl = p.url;
    }

    return {
      videoUrl: `${vid.url}?t=${Date.now()}`,
      posterUrl: `${posterUrl}${posterUrl.includes('?') ? '&' : '?'}t=${Date.now()}`,
    };
  }

  /**
   * TEST 2: Extract 10s -> 15s, apply 0.7x speed + 10% zoom with faststart and poster
   */
  public async runTest2(inputPath: string): Promise<{ videoUrl: string; posterUrl: string }> {
    const outputPath = path.join(this.outputDir, 'test_effects.mp4');
    const posterPath = path.join(this.outputDir, 'test_effects_poster.jpg');

    const filterComplex = `[0:v]setpts=(1/0.7)*PTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,zoompan=z='min(zoom+0.001,1.10)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=24[v];[0:a]atempo=0.7[a]`;
    const cmd = `ffmpeg -y -ss 10 -t 5 -i "${inputPath}" -filter_complex "${filterComplex}" -map "[v]" -map "[a]" -c:v libx264 -profile:v baseline -level 3.1 ${MEM_SAFE_VIDEO_ARGS} -pix_fmt yuv420p -c:a aac -movflags +faststart -threads 1 "${outputPath}"`;
    await execPromise(cmd);

    const posterCmd = `ffmpeg -y -ss 0.5 -i "${outputPath}" -vframes 1 -q:v 2 "${posterPath}"`;
    try { await execPromise(posterCmd); } catch (e) {}

    const vid = await storage.publish(outputPath);
    let posterUrl = storage.publicUrlFor(posterPath);
    if (fs.existsSync(posterPath)) {
      const p = await storage.publish(posterPath);
      posterUrl = p.url;
    }

    return {
      videoUrl: `${vid.url}?t=${Date.now()}`,
      posterUrl: `${posterUrl}${posterUrl.includes('?') ? '&' : '?'}t=${Date.now()}`,
    };
  }

  /**
   * TEST 3: Add burned-in drawtext "TEST CINEMATIC" from 2s -> 4s with faststart and poster
   */
  public async runTest3(inputPath: string): Promise<{ videoUrl: string; posterUrl: string }> {
    const outputPath = path.join(this.outputDir, 'test_text.mp4');
    const posterPath = path.join(this.outputDir, 'test_text_poster.jpg');

    const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,drawtext=text='TEST CINEMATIC':fontcolor=white:fontsize=64:box=1:boxcolor=black@0.65:boxborderw=10:x=(w-text_w)/2:y=h*0.75:enable='between(t,2,4)'`;
    const cmd = `ffmpeg -y -ss 0 -t 5 -i "${inputPath}" -vf "${vf}" -c:v libx264 -profile:v baseline -level 3.1 ${MEM_SAFE_VIDEO_ARGS} -pix_fmt yuv420p -c:a aac -movflags +faststart -threads 1 "${outputPath}"`;
    await execPromise(cmd);

    const posterCmd = `ffmpeg -y -ss 2.5 -i "${outputPath}" -vframes 1 -q:v 2 "${posterPath}"`;
    try { await execPromise(posterCmd); } catch (e) {}

    const vid = await storage.publish(outputPath);
    let posterUrl = storage.publicUrlFor(posterPath);
    if (fs.existsSync(posterPath)) {
      const p = await storage.publish(posterPath);
      posterUrl = p.url;
    }

    return {
      videoUrl: `${vid.url}?t=${Date.now()}`,
      posterUrl: `${posterUrl}${posterUrl.includes('?') ? '&' : '?'}t=${Date.now()}`,
    };
  }

  /**
   * FULL REAL VIDEO PROCESSING PIPELINE
   * Extracts every clip in editPlan, applies speed, crop, zoom, color grading, text overlays,
   * concatenates them into final_video.mp4, and moves moov atom to front with +faststart for instant mobile playback.
   */
  public async renderFullCinematic(
    inputPath: string,
    editPlan: any,
    musicVolume: number = 0.8,
    originalVolume: number = 0.9,
    onProgress?: (progress: FFmpegProgress) => void
  ): Promise<{ videoUrl: string; posterUrl: string; duration: number; fileSize: number }> {
    const timeline = editPlan.timeline || [];
    if (timeline.length === 0) {
      throw new Error('EditPlan has no timeline clips');
    }

    const sessionDir = path.join(this.tempDir, `session_${Date.now()}`);
    fs.mkdirSync(sessionDir, { recursive: true });

    const segmentFiles: string[] = [];
    const totalClips = timeline.length;

    onProgress?.({ percent: 5, stage: 'Starting FFmpeg clip extraction...' });

    // 1. Process each individual clip
    for (let i = 0; i < totalClips; i++) {
      const clip = timeline[i];
      const segFileName = `clip_${String(i).padStart(3, '0')}.mp4`;
      const segPath = path.join(sessionDir, segFileName);

      const sourceStart = Math.max(0, Number(clip.source_start) || 0);
      const sourceEnd = Math.max(sourceStart + 0.5, Number(clip.source_end) || sourceStart + 4);
      const sourceDuration = Math.max(0.5, sourceEnd - sourceStart);

      const speed = Math.max(0.5, Math.min(2.0, Number(clip.speed) || 1.0));
      const cropX = Math.max(0.0, Math.min(1.0, Number(clip.crop_x ?? 0.5)));
      const cropY = Math.max(0.0, Math.min(1.0, Number(clip.crop_y ?? 0.5)));
      const text = (clip.text || '').replace(/'/g, '');

      // Color grade params
      const contrast = editPlan.color_grade?.contrast || 1.2;
      const saturation = editPlan.color_grade?.saturation || 1.15;

      const cropFilter = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:'max(0,min(in_w-1080,(in_w-1080)*${cropX}))':'max(0,min(in_h-1920,(in_h-1920)*${cropY}))'`;
      const colorFilter = `eq=contrast=${contrast}:saturation=${saturation}`;

      let vf = `${cropFilter},${colorFilter}`;

      // Zoom effect if specified
      if (clip.zoom_end && clip.zoom_end > 1.05) {
        vf += `,zoompan=z='min(zoom+0.001,${Math.min(1.2, clip.zoom_end)})':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25`;
      }

      // Burned-in Action Text Overlay
      if (text.length > 0) {
        const isClimax = (clip.output_start >= 44 && clip.output_start <= 50) || text.includes('GOAL');
        const boxColor = isClimax ? 'red@0.85' : 'black@0.7';
        const fontSize = isClimax ? 56 : 42;
        const fontColor = isClimax ? 'yellow' : 'white';
        vf += `,drawtext=text='${text}':fontcolor=${fontColor}:fontsize=${fontSize}:box=1:boxcolor=${boxColor}:boxborderw=12:x=(w-text_w)/2:y=h*0.75`;
      }

      // Speed PTS filter
      const videoSpeedFilter = `setpts=(1/${speed})*PTS`;
      const audioSpeedFilter = `atempo=${speed}`;

      const filterComplex = `[0:v]${videoSpeedFilter},${vf}[v];[0:a]${audioSpeedFilter},volume=${originalVolume}[a]`;

      // Memory-safe encode flags: single-threaded, ultrafast preset, no B-frame
      // lookahead. 9:16 1080x1920 on low-RAM free hosts otherwise OOMs and the
      // whole container is killed (Render 502).
      const clipCmd = `ffmpeg -y -ss ${sourceStart} -t ${sourceDuration} -i "${inputPath}" -filter_complex "${filterComplex}" -map "[v]" -map "[a]" -c:v libx264 -profile:v baseline -level 3.1 ${MEM_SAFE_VIDEO_ARGS} -pix_fmt yuv420p -r 25 -c:a aac -b:a 128k -ar 44100 -movflags +faststart -threads 1 -filter_threads 1 -filter_complex_threads 1 "${segPath}"`;

      try {
        await execPromise(clipCmd);
        segmentFiles.push(segPath);
      } catch (clipErr: any) {
        console.warn(`Segment ${i} filter failed, falling back:`, clipErr.message);
        const fallbackCmd = `ffmpeg -y -ss ${sourceStart} -t ${sourceDuration} -i "${inputPath}" -vf "${vf}" -c:v libx264 -profile:v baseline -level 3.1 ${MEM_SAFE_VIDEO_ARGS} -pix_fmt yuv420p -r 25 -an -movflags +faststart -threads 1 -filter_threads 1 -filter_complex_threads 1 "${segPath}"`;
        await execPromise(fallbackCmd);
        segmentFiles.push(segPath);
      }

      const pct = Math.floor(10 + ((i + 1) / totalClips) * 65);
      onProgress?.({
        percent: pct,
        stage: `Rendering segment ${i + 1}/${totalClips} (${clip.action.split(':')[0]})...`,
      });
    }

    onProgress?.({ percent: 80, stage: 'Concatenating 9:16 football segments...' });

    // 2. Concatenate all segments using FFmpeg concat demuxer
    const concatListPath = path.join(sessionDir, 'concat_list.txt');
    const listContent = segmentFiles.map((f) => `file '${f}'`).join('\n');
    fs.writeFileSync(concatListPath, listContent);

    const concatenatedPath = path.join(sessionDir, 'concatenated.mp4');
    const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -profile:v baseline -level 3.1 ${MEM_SAFE_VIDEO_ARGS} -pix_fmt yuv420p -r 25 -c:a aac -b:a 128k -movflags +faststart -threads 1 "${concatenatedPath}"`;
    await execPromise(concatCmd);

    onProgress?.({ percent: 90, stage: 'Optimizing mobile streaming header & faststart...' });

    // 3. Final Master Export with +faststart
    const finalMasterPath = path.join(this.outputDir, 'final_video.mp4');
    const posterPath = path.join(this.outputDir, 'final_video_poster.jpg');

    const mixCmd = `ffmpeg -y -i "${concatenatedPath}" -c:v copy -c:a aac -b:a 192k -movflags +faststart "${finalMasterPath}"`;
    await execPromise(mixCmd);

    // Extract vibrant poster from middle of video (e.g. 25% mark)
    const posterCmd = `ffmpeg -y -ss 10 -i "${finalMasterPath}" -vframes 1 -q:v 2 "${posterPath}"`;
    try { await execPromise(posterCmd); } catch (e) {}

    // Get final duration
    const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalMasterPath}"`;
    const { stdout: durOut } = await execPromise(probeCmd);
    const finalDuration = parseFloat(durOut.trim()) || 64.0;

    // Clean up temporary session dir
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {}

    onProgress?.({ percent: 100, stage: 'Master video ready!' });

    // Publish final assets to the configured storage backend.
    // In S3 mode this uploads the MP4 + poster and returns a CDN URL, so the
    // rendered result survives deploys/restarts even on an ephemeral container.
    const finalVideo = await storage.publish(finalMasterPath);
    let posterUrl = storage.publicUrlFor(posterPath);
    if (fs.existsSync(posterPath)) {
      const p = await storage.publish(posterPath);
      posterUrl = p.url;
    }

    const now = Date.now();
    return {
      videoUrl: `${finalVideo.url}?t=${now}`,
      posterUrl: `${posterUrl}${posterUrl.includes('?') ? '&' : '?'}t=${now}`,
      duration: finalDuration,
      fileSize: finalVideo.size,
    };
  }
}

export const ffmpegEngine = new FFmpegEngine();
