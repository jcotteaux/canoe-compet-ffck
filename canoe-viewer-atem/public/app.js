(function () {
  'use strict';

  const grid = document.getElementById('grid');
  const btnPlay = document.getElementById('btn-play');
  const btnReverse = document.getElementById('btn-reverse');
  const btnRwSlow = document.getElementById('btn-rw-slow');
  const btnFwSlow = document.getElementById('btn-fw-slow');
  const btnMulticam = document.getElementById('btn-multicam');
  const modeSelect = document.getElementById('mode-select');
  const btnSidebar = document.getElementById('btn-sidebar');
  const sidebar = document.getElementById('sidebar');
  const timecodeEl = document.getElementById('timecode');
  const timecodeInput = document.getElementById('timecode-input');
  const clockEl = document.getElementById('clock');
  const clockInput = document.getElementById('clock-input');
  const scrubber = document.getElementById('scrubber');
  const speedSelect = document.getElementById('speed-select');
  const camList = document.getElementById('cam-list');
  const pathInput = document.getElementById('path-input');
  const btnLoad = document.getElementById('btn-load');
  const btnBrowse = document.getElementById('btn-browse');
  const browseModal = document.getElementById('browse-modal');
  const modalClose = document.getElementById('modal-close');
  const modalPath = document.getElementById('modal-path');
  const modalList = document.getElementById('modal-list');
  const modalUp = document.getElementById('modal-up');
  const modalSelect = document.getElementById('modal-select');

  let currentBrowsePath = '/Volumes';

  let videos = [];       // all <video> elements
  let cells = [];        // all .video-cell elements
  let playing = false;
  let reverseInterval = null; // for reverse playback
  let reverseSpeed = 0;  // current reverse speed (negative = reverse)
  let duration = 0;      // max duration among all videos
  let scrubbing = false;
  let recordingStartTime = null; // Date object for when recording started
  let zoomedIndex = -1;  // -1 = no zoom
  let durationTimer = null;
  let isoReloading = false;
  let mediaVersion = Date.now();
  let viewerMode = 'videos';
  let liveStream = null;
  let programCell = null;
  let initialSelectionShown = false;

  // Cameras the user has hidden, persisted across page reloads (keyed by name).
  const HIDDEN_CAMS_KEY = 'atem-hidden-cams';
  let hiddenCams = loadHiddenCams();

  function loadHiddenCams() {
    try {
      return new Set(JSON.parse(localStorage.getItem(HIDDEN_CAMS_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }

  function saveHiddenCams() {
    try {
      localStorage.setItem(HIDDEN_CAMS_KEY, JSON.stringify([...hiddenCams]));
    } catch { /* storage unavailable */ }
  }

  // Collapsed state of the left camera menu, persisted across page reloads.
  const SIDEBAR_KEY = 'atem-sidebar-collapsed';
  if (localStorage.getItem(SIDEBAR_KEY) === '1') {
    sidebar.classList.add('collapsed');
  }

  // --- Load videos from server ---
  async function init() {
    const res = await fetch('/api/videos', { cache: 'no-store' });
    const data = await res.json();

    // Show current path in input
    if (data.path) pathInput.value = data.path;

    const shouldOpenInitialSelection = data.needsPathSelection && !initialSelectionShown;
    if (shouldOpenInitialSelection) initialSelectionShown = true;

    // Reset any previously rendered ISO videos and sidebar entries so that
    // reloading never duplicates the camera list on the left.
    grid.innerHTML = '';
    camList.innerHTML = '';
    videos = [];
    cells = [];
    programCell = null;

    if (data.error || data.files.length === 0) {
      grid.innerHTML = `<div class="empty-state">
        ${data.error ? data.error + '<br><br>' : ''}
        Aucune vidéo trouvée.<br>
        Sélectionnez le dossier contenant vos enregistrements ATEM.
      </div>`;
      if (viewerMode === 'videos') {
        await ensureLiveForMultiview();
        if (liveStream) {
          grid.innerHTML = '';
          appendProgramCell();
        }
      }
      openBrowseModal(data.error ? '/Volumes' : data.path);
      return;
    }

    // Store recording start time
    if (data.creationTime) {
      recordingStartTime = new Date(data.creationTime);
    }

    // Compute grid layout
    const count = data.files.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    // Create video elements
    for (let i = 0; i < data.files.length; i++) {
      const file = data.files[i];
      const camName = file.replace(/\.[^.]+$/, '');
      const camHidden = hiddenCams.has(camName);

      const cell = document.createElement('div');
      cell.className = 'video-cell';
      cell.dataset.index = i;
      cell.classList.toggle('hidden', camHidden);

      const video = document.createElement('video');
      video.src = `/videos/${encodeURIComponent(file)}?v=${mediaVersion}`;
      // Hidden cameras only load their metadata: no full download and no
      // decoding, which keeps bandwidth and the video decoders free for the
      // visible ISOs (much smoother playback and seeking).
      video.preload = camHidden ? 'metadata' : 'auto';
      video.muted = true;
      video.playsInline = true;

      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = camName;

      cell.appendChild(video);
      cell.appendChild(label);
      grid.appendChild(cell);
      videos.push(video);
      cells.push(cell);

      // Click to zoom
      cell.addEventListener('dblclick', () => switchToCamera(i));

      // Sidebar toggle
      const toggle = document.createElement('label');
      toggle.className = 'cam-toggle';
      toggle.dataset.index = i;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !camHidden;
      cb.addEventListener('change', () => {
        const nowHidden = !cb.checked;
        cell.classList.toggle('hidden', nowHidden);
        if (nowHidden) {
          // Stop decoding this camera to free resources for the visible ones.
          hiddenCams.add(camName);
          video.pause();
        } else {
          hiddenCams.delete(camName);
          if (video.preload !== 'auto') video.preload = 'auto';
          video.currentTime = getCurrentTime();
          if (playing) {
            video.playbackRate = parseFloat(speedSelect.value);
            video.play().catch(() => {});
          }
        }
        saveHiddenCams();
        updateGridLayout();
      });
      toggle.appendChild(cb);
      toggle.appendChild(document.createTextNode(camName));
      camList.appendChild(toggle);
    }

    // Wait for metadata to get durations
    await Promise.all(videos.map(v =>
      new Promise(resolve => {
        if (v.readyState >= 1) return resolve();
        v.addEventListener('loadedmetadata', resolve, { once: true });
        v.addEventListener('error', resolve, { once: true });
      })
    ));

    duration = Math.max(...videos.map(v => v.duration || 0));
    scrubber.max = Math.floor(duration * 1000); // ms precision

    // Periodically update duration as videos grow (live recording)
    clearInterval(durationTimer);
    durationTimer = setInterval(updateDuration, 2000);

    if (viewerMode === 'videos') {
      await ensureLiveForMultiview();
      appendProgramCell();
    }
    updateGridLayout();

    if (shouldOpenInitialSelection) {
      openBrowseModal('/Volumes/ArchiDrive');
    }
  }

  // --- Update duration for growing files ---
  function updateDuration() {
    const newDuration = Math.max(...videos.map(v => v.duration || 0));
    if (isFinite(newDuration) && newDuration > duration) {
      duration = newDuration;
      scrubber.max = Math.floor(duration * 1000);
    }
  }

  // --- Live / recorded videos mode ---
  async function setViewerMode(mode) {
    if (mode === viewerMode || isoReloading) return;
    viewerMode = mode;
    modeSelect.disabled = true;
    document.body.classList.toggle('live-mode', mode === 'live');

    try {
      if (mode === 'live') {
        closeBrowseModal();
        await startLiveWebcam();
      } else {
        await reloadISOFiles();
        pause();
      }
    } finally {
      modeSelect.value = viewerMode;
      document.body.classList.toggle('live-mode', viewerMode === 'live');
      modeSelect.disabled = false;
    }
  }

  async function startLiveWebcam() {
    try {
      const stream = await acquireLiveStream();
      showLiveStream(stream);
    } catch (err) {
      showLiveError(liveErrorMessage(err));
    }
  }

  // Ensure the ATEM webcam is available for the multiview (right-side panel)
  // without taking over the whole grid. Fails silently: if no ATEM webcam is
  // connected/authorised we simply show the ISO videos alone.
  async function ensureLiveForMultiview() {
    if (liveStream?.getVideoTracks()[0]?.readyState === 'live') return;
    try {
      await acquireLiveStream();
    } catch (err) {
      console.warn('Webcam ATEM indisponible pour le multiview:', err.message);
    }
  }

  function liveErrorMessage(err) {
    return err.name === 'NotAllowedError'
      ? 'Autorise l’accès caméra dans le navigateur pour afficher le Live ATEM.'
      : err.message || 'Impossible d’ouvrir la webcam ATEM.';
  }

  // Acquire the ATEM webcam stream and store it in `liveStream`. Throws on error.
  async function acquireLiveStream() {
    const activeTrack = liveStream?.getVideoTracks()[0];
    if (activeTrack?.readyState === 'live') return liveStream;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Ce navigateur ne permet pas l’accès à la webcam ATEM.');
    }

    stopLiveWebcam();
    const probeStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
      audio: false
    });
    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter(device => device.kind === 'videoinput');
    const atemDevice = devices.find(device => /atem|blackmagic/i.test(device.label));

    if (!atemDevice) {
      probeStream.getTracks().forEach(track => track.stop());
      throw new Error('Webcam ATEM non détectée. Vérifie la connexion USB-C et la sortie webcam du G2.');
    }

    const probeDeviceId = probeStream.getVideoTracks()[0]?.getSettings().deviceId;
    let stream = probeStream;
    if (probeDeviceId !== atemDevice.deviceId) {
      probeStream.getTracks().forEach(track => track.stop());
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: atemDevice.deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 }
        },
        audio: false
      });
    }

    liveStream = stream;
    const track = stream.getVideoTracks()[0];
    if (track) track.onended = () => {
      liveStream = null;
      if (viewerMode === 'live') {
        showLiveError('Le flux ATEM a été interrompu. Sélectionne Vidéos puis Live pour le reconnecter.');
      } else {
        removeProgramCell();
      }
    };
    return stream;
  }

  function showLiveStream(stream) {
    videos.forEach(video => video.pause());
    clearInterval(durationTimer);
    stopReverse();
    playing = false;
    videos = [];
    cells = [];
    camList.innerHTML = '';
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gridTemplateRows = '1fr';

    const cell = document.createElement('div');
    cell.className = 'video-cell';
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `LIVE — ${stream.getVideoTracks()[0]?.label || 'ATEM G2'}`;
    cell.appendChild(video);
    cell.appendChild(label);
    grid.appendChild(cell);

    liveStream = stream;
    programCell = cell;
    const track = stream.getVideoTracks()[0];
    if (track) track.onended = () => {
      liveStream = null;
      if (viewerMode === 'live') {
        showLiveError('Le flux ATEM a été interrompu. Sélectionne Vidéos puis Live pour le reconnecter.');
      } else {
        removeProgramCell();
      }
    };
    video.play().catch(() => {});
  }

  function appendProgramCell() {
    const track = liveStream?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live' || programCell?.isConnected) return;

    const cell = document.createElement('div');
    cell.className = 'video-cell program-cell live-slot';
    cell.dataset.index = cells.length;

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = liveStream;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = '● PROGRAM — LIVE';

    const programIndex = cells.length;
    cell.appendChild(video);
    cell.appendChild(label);
    // Single click on the live feed enlarges it (and clicking again restores).
    cell.addEventListener('click', () => toggleZoom(programIndex));
    grid.appendChild(cell);
    cells.push(cell);
    programCell = cell;
    updateGridLayout();
    video.play().catch(() => {});
  }

  function removeProgramCell() {
    if (!programCell) return;
    const index = cells.indexOf(programCell);
    if (index >= 0) cells.splice(index, 1);
    programCell.remove();
    programCell = null;
    updateGridLayout();
  }

  function showLiveError(message) {
    grid.innerHTML = `<div class="empty-state">${message}</div>`;
  }

  function stopLiveWebcam() {
    liveStream?.getTracks().forEach(track => track.stop());
    liveStream = null;
    removeProgramCell();
  }

  // Recreate all media elements so the browser sees new ISO files, a newly
  // written MP4 index and updated durations instead of stale metadata.
  async function reloadISOFiles() {
    if (isoReloading) return false;
    isoReloading = true;

    const savedTime = getCurrentTime();
    const shouldResume = playing;
    videos.forEach(video => video.pause());
    clearInterval(durationTimer);
    stopReverse();

    grid.innerHTML = '';
    camList.innerHTML = '';
    videos = [];
    cells = [];
    programCell = null;
    playing = false;
    duration = 0;
    recordingStartTime = null;
    zoomedIndex = -1;
    scrubber.value = 0;
    scrubber.max = 1000;
    btnPlay.textContent = '\u25b6 Play';
    btnPlay.classList.remove('playing');
    btnMulticam.classList.add('hidden');
    mediaVersion = Date.now();

    try {
      await init();
      if (videos.length === 0) return false;

      const targetTime = Math.min(savedTime, duration);
      seekAll(targetTime);
      if (shouldResume) play();
      return true;
    } catch (err) {
      console.error('Impossible de recharger les fichiers ISO', err);
      grid.innerHTML = '<div class="empty-state">Impossible de recharger les fichiers ISO.</div>';
      return false;
    } finally {
      isoReloading = false;
    }
  }

  // --- Playback controls ---
  function togglePlay() {
    if (playing) {
      pause();
    } else {
      play();
    }
  }

  function play() {
    stopReverse();
    const speed = parseFloat(speedSelect.value);
    videos.forEach((v, i) => {
      v.playbackRate = speed;
      // Only decode/play visible cameras; hidden ones stay paused.
      if (cells[i] && !cells[i].classList.contains('hidden')) {
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
    playing = true;
    btnPlay.textContent = '⏸ Pause';
    btnPlay.classList.add('playing');
  }

  function pause() {
    stopReverse();
    videos.forEach(v => v.pause());
    playing = false;
    btnPlay.textContent = '▶ Play';
    btnPlay.classList.remove('playing');
  }

  // --- Reverse playback (simulated with interval seeking) ---
  function startReverse(speed) {
    pause();
    reverseSpeed = speed;
    const stepPerFrame = Math.abs(speed) / 30; // 30fps steps
    reverseInterval = setInterval(() => {
      const t = getCurrentTime() - stepPerFrame;
      if (t <= 0) {
        seekAll(0);
        stopReverse();
        return;
      }
      seekAll(t);
    }, 1000 / 30);
    updateReverseButtons();
  }

  function stopReverse() {
    if (reverseInterval) {
      clearInterval(reverseInterval);
      reverseInterval = null;
    }
    reverseSpeed = 0;
    updateReverseButtons();
  }

  function updateReverseButtons() {
    btnReverse.classList.toggle('active', reverseSpeed === 1);
    btnRwSlow.classList.toggle('active', reverseSpeed === 0.25);
    btnFwSlow.classList.toggle('active', false);
  }

  function playSlowForward() {
    stopReverse();
    videos.forEach((v, i) => {
      v.playbackRate = 0.25;
      if (cells[i] && !cells[i].classList.contains('hidden')) {
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
    playing = true;
    btnPlay.textContent = '⏸ Pause';
    btnPlay.classList.add('playing');
    btnFwSlow.classList.add('active');
  }

  function seekAll(time) {
    videos.forEach((v, i) => {
      // Skip hidden cameras: no point fetching frames for what isn't shown.
      if (cells[i] && cells[i].classList.contains('hidden')) return;
      if (!isFinite(v.duration) || v.duration <= 0) return;
      v.currentTime = Math.max(0, Math.min(time, v.duration - 0.001));
    });
  }

  function getCurrentTime() {
    if (videos.length === 0) return 0;
    // Use the first visible camera as the time reference (hidden ones are paused).
    for (let i = 0; i < videos.length; i++) {
      if (cells[i] && !cells[i].classList.contains('hidden')) {
        return videos[i].currentTime || 0;
      }
    }
    return videos[0].currentTime || 0;
  }

  // --- Timecode display ---
  function formatTimecode(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  function formatClock(date) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function updateClock(seconds) {
    if (recordingStartTime) {
      const current = new Date(recordingStartTime.getTime() + seconds * 1000);
      clockEl.textContent = '🕐 ' + formatClock(current);
    }
  }

  function updateLoop() {
    if (!scrubbing) {
      const t = getCurrentTime();
      timecodeEl.textContent = formatTimecode(t);
      scrubber.value = Math.floor(t * 1000);
      updateClock(t);
    }
    requestAnimationFrame(updateLoop);
  }

  // --- Scrubber interaction ---
  scrubber.addEventListener('input', () => {
    scrubbing = true;
    const time = parseFloat(scrubber.value) / 1000;
    seekAll(time);
    timecodeEl.textContent = formatTimecode(time);
    updateClock(time);
  });

  scrubber.addEventListener('change', () => {
    scrubbing = false;
  });

  // --- Mouse wheel scrub on the grid ---
  grid.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (viewerMode === 'live') return;
    const step = e.shiftKey ? 1 / 30 : 1 / 10; // shift = frame-by-frame (30fps)
    const delta = e.deltaY > 0 ? step : -step;
    const current = getCurrentTime();
    const newTime = Math.max(0, Math.min(duration, current + delta));
    
    if (playing) pause();
    seekAll(newTime);
    timecodeEl.textContent = formatTimecode(newTime);
    scrubber.value = Math.floor(newTime * 1000);
  }, { passive: false });

  // --- Speed change ---
  speedSelect.addEventListener('change', () => {
    const speed = parseFloat(speedSelect.value);
    videos.forEach(v => { v.playbackRate = speed; });
  });

  // --- Keyboard controls ---
  document.addEventListener('keydown', (e) => {
    if (viewerMode === 'live' && ['Space', 'ArrowRight', 'ArrowLeft'].includes(e.code)) {
      e.preventDefault();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      // Pause: 1/10s, Shift: 1 frame (1/30s). Playing: 1s / Shift: 5s
      const step = playing
        ? (e.shiftKey ? 5 : 1)
        : (e.shiftKey ? 1 / 30 : 1 / 10);
      seekAll(Math.min(duration, getCurrentTime() + step));
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      const step = playing
        ? (e.shiftKey ? 5 : 1)
        : (e.shiftKey ? 1 / 30 : 1 / 10);
      seekAll(Math.max(0, getCurrentTime() - step));
    }
  });

  // --- Zoom ---
  function toggleZoom(index) {
    if (zoomedIndex === index) {
      exitZoom();
    } else {
      // Zoom on this camera
      zoomedIndex = index;
      cells.forEach((c, i) => {
        c.classList.toggle('zoomed', i === index);
        c.classList.toggle('hidden', i !== index);
      });
      document.querySelectorAll('.cam-toggle').forEach((t, i) => {
        t.classList.toggle('zoomed', i === index);
      });
      grid.style.gridTemplateColumns = '1fr';
      grid.style.gridTemplateRows = '1fr';
      btnMulticam.classList.remove('hidden');
    }
  }

  function switchToCamera(index) {
    toggleZoom(index);
  }

  function returnToMulticam() {
    exitZoom();
  }

  function exitZoom() {
    zoomedIndex = -1;
    cells.forEach(c => {
      c.classList.remove('zoomed');
      c.classList.remove('hidden');
    });
    // Restore checkbox state
    document.querySelectorAll('.cam-toggle').forEach((t, i) => {
      t.classList.remove('zoomed');
      const cb = t.querySelector('input');
      cells[i].classList.toggle('hidden', !cb.checked);
    });
    btnMulticam.classList.add('hidden');
    updateGridLayout();
  }

  function updateGridLayout() {
    if (zoomedIndex >= 0) return;
    const hasLive = programCell && programCell.isConnected;
    const visibleIso = cells.filter(c => c !== programCell && !c.classList.contains('hidden'));
    const count = visibleIso.length;
    if (count === 0) {
      // Only the live feed (or nothing) is visible: let it fill the whole area.
      grid.style.gridTemplateColumns = '1fr';
      grid.style.gridTemplateRows = '1fr';
      return;
    }
    if (hasLive) {
      // Webcam large on top (full width), ISO videos organised in a row below.
      // Optimised for 4 videos + 1 webcam: 4 columns on a single bottom row.
      const cols = count <= 4 ? count : Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.style.gridTemplateRows = `minmax(0, 1.8fr) repeat(${rows}, minmax(0, 1fr))`;
    } else {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    }
  }

  // --- Button ---
  btnPlay.addEventListener('click', togglePlay);
  btnReverse.addEventListener('click', () => {
    if (reverseSpeed === 1) { stopReverse(); } else { startReverse(1); }
  });
  btnRwSlow.addEventListener('click', () => {
    if (reverseSpeed === 0.25) { stopReverse(); } else { startReverse(0.25); }
  });
  btnFwSlow.addEventListener('click', () => {
    if (playing && videos[0]?.playbackRate === 0.25) { pause(); btnFwSlow.classList.remove('active'); }
    else { playSlowForward(); }
  });
  btnMulticam.addEventListener('click', returnToMulticam);
  modeSelect.addEventListener('change', () => setViewerMode(modeSelect.value));
  btnSidebar.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  });

  // --- Timecode input: click to type a time ---
  timecodeEl.addEventListener('click', () => {
    timecodeEl.style.display = 'none';
    timecodeInput.classList.remove('hidden');
    timecodeInput.value = '';
    timecodeInput.focus();
  });

  timecodeInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      jumpToInput(timecodeInput.value.trim());
      closeTimecodeInput();
    } else if (e.code === 'Escape') {
      closeTimecodeInput();
    }
    e.stopPropagation();
  });

  timecodeInput.addEventListener('blur', () => {
    closeTimecodeInput();
  });

  function closeTimecodeInput() {
    timecodeInput.classList.add('hidden');
    timecodeEl.style.display = '';
  }

  // --- Clock input: click to type a clock time ---
  clockEl.addEventListener('click', () => {
    clockEl.style.display = 'none';
    clockInput.classList.remove('hidden');
    clockInput.value = '';
    clockInput.focus();
  });

  clockInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      jumpToClockTime(clockInput.value.trim());
      closeClockInput();
    } else if (e.code === 'Escape') {
      closeClockInput();
    }
    e.stopPropagation();
  });

  clockInput.addEventListener('blur', () => {
    closeClockInput();
  });

  function closeClockInput() {
    clockInput.classList.add('hidden');
    clockEl.style.display = '';
  }

  function jumpToClockTime(value) {
    if (!recordingStartTime) return;
    const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      const h = parseInt(match[1]);
      const m = parseInt(match[2]);
      const s = parseInt(match[3] || '0');
      const targetDate = new Date(recordingStartTime);
      targetDate.setHours(h, m, s, 0);
      const offset = (targetDate.getTime() - recordingStartTime.getTime()) / 1000;
      if (offset >= 0 && offset <= duration) {
        seekAll(offset);
      }
    }
  }

  function jumpToInput(value) {
    // Try to parse as clock time (HH:MM:SS) — jump relative to recording start
    const clockMatch = value.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (clockMatch && recordingStartTime) {
      const targetH = parseInt(clockMatch[1]);
      const targetM = parseInt(clockMatch[2]);
      const targetS = parseInt(clockMatch[3]);
      const targetDate = new Date(recordingStartTime);
      targetDate.setHours(targetH, targetM, targetS, 0);
      const offset = (targetDate.getTime() - recordingStartTime.getTime()) / 1000;
      if (offset >= 0 && offset <= duration) {
        seekAll(offset);
        return;
      }
    }
    // Try to parse as timecode (HH:MM:SS.mmm or HH:MM:SS or MM:SS)
    const tcMatch = value.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (tcMatch) {
      const h = parseInt(tcMatch[1] || '0');
      const m = parseInt(tcMatch[2]);
      const s = parseInt(tcMatch[3]);
      const ms = parseInt((tcMatch[4] || '0').padEnd(3, '0'));
      const time = h * 3600 + m * 60 + s + ms / 1000;
      if (time <= duration) {
        seekAll(time);
        return;
      }
    }
    // Try plain seconds
    const secs = parseFloat(value);
    if (!isNaN(secs) && secs >= 0 && secs <= duration) {
      seekAll(secs);
    }
  }

  // --- Keyboard: Escape to exit zoom ---
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && zoomedIndex >= 0) {
      returnToMulticam();
    }
  });

  // --- Load path ---
  async function loadPath(newPath) {
    const res = await fetch('/api/path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: newPath })
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    // Clear current state and reload
    grid.innerHTML = '';
    camList.innerHTML = '';
    videos = [];
    cells = [];
    playing = false;
    reverseSpeed = 0;
    zoomedIndex = -1;
    stopReverse();
    btnPlay.textContent = '\u25b6 Play';
    btnPlay.classList.remove('playing');
    btnMulticam.classList.add('hidden');
    init();
  }

  btnLoad.addEventListener('click', () => {
    const val = pathInput.value.trim();
    if (val) loadPath(val);
  });

  pathInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      const val = pathInput.value.trim();
      if (val) loadPath(val);
    }
    e.stopPropagation();
  });

  // --- Browse modal ---
  btnBrowse.addEventListener('click', () => {
    openBrowseModal();
  });

  function openBrowseModal(startPath) {
    browseModal.classList.remove('hidden');
    browseTo(startPath || pathInput.value.trim() || '/Volumes');
  }

  modalClose.addEventListener('click', closeBrowseModal);
  browseModal.addEventListener('click', (e) => {
    if (e.target === browseModal) closeBrowseModal();
  });

  modalUp.addEventListener('click', () => {
    const parent = currentBrowsePath.replace(/\/[^/]+\/?$/, '') || '/';
    browseTo(parent);
  });

  modalSelect.addEventListener('click', () => {
    pathInput.value = currentBrowsePath;
    closeBrowseModal();
    loadPath(currentBrowsePath);
  });

  function closeBrowseModal() {
    browseModal.classList.add('hidden');
  }

  async function browseTo(dirPath) {
    currentBrowsePath = dirPath;
    modalPath.textContent = dirPath;
    modalList.innerHTML = '<div style="padding:18px;color:#666">Chargement...</div>';
    modalSelect.disabled = true;

    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();

      if (data.error) {
        modalList.innerHTML = `<div style="padding:18px;color:#e44">${data.error}</div>`;
        return;
      }

      currentBrowsePath = data.path;
      modalPath.textContent = data.path;
      modalSelect.disabled = !data.hasVideos;

      if (data.dirs.length === 0) {
        modalList.innerHTML = '<div style="padding:18px;color:#666">Aucun sous-dossier</div>';
        return;
      }

      modalList.innerHTML = '';
      for (const dir of data.dirs) {
        const item = document.createElement('div');
        item.className = 'dir-item';
        item.innerHTML = `<span class="icon">\ud83d\udcc1</span> ${dir}`;
        item.addEventListener('click', () => {
          browseTo(currentBrowsePath + '/' + dir);
        });
        modalList.appendChild(item);
      }
    } catch (err) {
      modalList.innerHTML = `<div style="padding:18px;color:#e44">Erreur de connexion</div>`;
    }
  }

  // --- Init ---
  window.addEventListener('beforeunload', stopLiveWebcam);
  requestAnimationFrame(updateLoop);
  init();
})();
