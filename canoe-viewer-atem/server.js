const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const app = express();
const PORT = 3000;
const DEFAULT_VIDEO_DIR = '/Volumes/ArchiDrive';

const videoDir_default = process.argv[2]
  ? path.resolve(process.argv[2])
  : DEFAULT_VIDEO_DIR;

let videoDir = videoDir_default;

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.m4v', '.webm', '.mxf']);

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: true
}));
app.use(express.json());

// Change video directory at runtime
app.post('/api/path', (req, res) => {
  const newPath = req.body.path;
  if (!newPath) return res.status(400).json({ error: 'path is required' });
  const resolved = path.resolve(newPath);
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: `Directory not found: ${resolved}` });
  }
  videoDir = resolved;
  console.log(`  📂  Video directory changed to: ${videoDir}`);
  res.json({ path: videoDir });
});
// Browse directories on the server
app.get('/api/browse', (req, res) => {
  const dirPath = req.query.path || '/';
  const resolved = path.resolve(dirPath);
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const hasVideos = entries.some(e => {
      const ext = path.extname(e.name).toLowerCase();
      return e.isFile() && VIDEO_EXTENSIONS.has(ext);
    });
    res.json({ path: resolved, dirs, hasVideos });
  } catch (err) {
    res.status(403).json({ error: `Cannot read: ${resolved}`, path: resolved, dirs: [], hasVideos: false });
  }
});
// Extract creation_time from a video file using ffprobe. Cached per file path
// because the header tag never changes, even while a live ISO keeps growing —
// this avoids re-running (blocking) ffprobe on every reload of the file list.
const creationTimeCache = new Map();

function getCreationTime(filePath) {
  const cached = creationTimeCache.get(filePath);
  if (cached) return cached;
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath
    ], { encoding: 'utf8', timeout: 10000 });
    const data = JSON.parse(output);
    const creationTime = data.format?.tags?.creation_time || null;
    if (creationTime) creationTimeCache.set(filePath, creationTime);
    return creationTime;
  } catch {
    return null;
  }
}

// List video files in the directory
app.get('/api/videos', (_req, res) => {
  if (!fs.existsSync(videoDir)) {
    return res.json({ error: `Video directory not found: ${videoDir}`, files: [] });
  }

  const files = fs.readdirSync(videoDir)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return VIDEO_EXTENSIONS.has(ext) && !f.startsWith('.');
    })
    .sort();

  // Get creation time from the first video
  let creationTime = null;
  if (files.length > 0) {
    creationTime = getCreationTime(path.join(videoDir, files[0]));
  }

  res.json({
    path: videoDir,
    files,
    creationTime,
    needsPathSelection: !process.argv[2] && videoDir === DEFAULT_VIDEO_DIR
  });
});

// Serve video files with range support
app.use('/videos', (req, res, next) => {
  express.static(videoDir, {
    acceptRanges: true,
    lastModified: true,
    etag: true,
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.m4v': 'video/x-m4v',
        '.webm': 'video/webm',
        '.mxf': 'application/mxf',
      };
      if (mimeTypes[ext]) {
        res.setHeader('Content-Type', mimeTypes[ext]);
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  })(req, res, next);
});

app.listen(PORT, () => {
  console.log(`\n  🎬  ATEM Viewer running at http://localhost:${PORT}`);
  console.log(`  📂  Video directory: ${videoDir}\n`);
});
