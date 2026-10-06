// UPSC Newspaper Analyzer Frontend Component (Scoped under window.UPSCAnalyzer)

(function () {
  let syllabusData = null;
  let currentAnalysis = null;
  let activePaperFilter = 'ALL';
  let imageFilesBase64 = [];
  let currentMode = 'youtube'; // 'youtube' or 'image'

  // Initialize Component inside target container
  function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Load Syllabus Reference
    fetchSyllabus();

    // Render Container Shell
    container.innerHTML = `
      <div class="ua-container">
        <div class="ua-wrapper ua-theme-light" id="uaWrapper">
          
          <!-- Mascot Header & Controls -->
          <div class="ua-header-banner">
            <div class="ua-mascot-box">
              <div class="ua-mascot-icon">🦉</div>
              <div class="ua-mascot-title">
                <h2>UPSC Newspaper Analyzer</h2>
                <p>Let's decode today's news for GS-I, II, III & IV!</p>
              </div>
            </div>
            <div class="ua-header-controls">
              <button class="ua-btn-icon" id="uaHistoryBtn" title="View Saved Analyses">
                📜 History
              </button>
              <button class="ua-btn-icon" id="uaThemeToggleBtn" title="Toggle Theme">
                🌙 Dark Mode
              </button>
            </div>
          </div>

          <!-- Input Card (Two Tabs) -->
          <div class="ua-input-card">
            <div class="ua-tabs">
              <button class="ua-tab-btn ua-active" id="uaTabYoutubeBtn">
                ▶️ YouTube Video Link
              </button>
              <button class="ua-tab-btn" id="uaTabImageBtn">
                📸 Newspaper Image(s) / OCR
              </button>
            </div>

            <!-- Tab A: YouTube Link Input -->
            <div class="ua-tab-content ua-active" id="uaTabYoutubeContent">
              <div class="ua-input-group">
                <label class="ua-label">Paste YouTube Newspaper Analysis Video URL</label>
                <input type="url" class="ua-input-text" id="uaYoutubeUrlInput" placeholder="https://www.youtube.com/watch?v=..." />
              </div>
              
              <details style="margin-top: 10px; font-size: 13px; color: var(--ua-muted);">
                <summary style="cursor: pointer; font-weight: 700;">+ Optional: Paste Transcript Manually (Fallback)</summary>
                <div class="ua-input-group" style="margin-top: 10px;">
                  <textarea class="ua-input-text" id="uaTranscriptInput" rows="4" placeholder="Paste video transcript text here if captions are unavailable..."></textarea>
                </div>
              </details>
            </div>

            <!-- Tab B: Image Upload / Drag & Drop -->
            <div class="ua-tab-content" id="uaTabImageContent">
              <div class="ua-dropzone" id="uaDropzone">
                <div class="ua-dropzone-icon">📰</div>
                <div class="ua-dropzone-title">Drag & drop newspaper clippings here</div>
                <div class="ua-dropzone-sub">or click to browse from device / camera / paste from clipboard (Ctrl+V)</div>
                <input type="file" id="uaFileInput" accept="image/*" multiple style="display: none;" />
              </div>
              <div class="ua-preview-grid" id="uaPreviewGrid"></div>
            </div>

            <!-- Submit Button -->
            <button class="ua-btn-submit" id="uaAnalyzeSubmitBtn">
              🚀 Analyze & Map to UPSC Syllabus
            </button>
          </div>

          <!-- Loading State Animation -->
          <div class="ua-loading-box" id="uaLoadingBox" style="display: none;">
            <div class="ua-spinner-owl">🦉</div>
            <div class="ua-loading-title" id="uaLoadingTitle">Decoding Newspaper Content...</div>
            <div class="ua-steps-list">
              <span class="ua-step-chip ua-active-step" id="uaStep1">1. Reading Input</span>
              <span class="ua-step-chip" id="uaStep2">2. Inventorying Topics</span>
              <span class="ua-step-chip" id="uaStep3">3. Extracting Facts & Quotes</span>
              <span class="ua-step-chip" id="uaStep4">4. Syllabus Mapping</span>
            </div>
          </div>

          <!-- Results Container -->
          <div id="uaResultsContainer" style="display: none;"></div>

        </div>
      </div>

      <!-- History Modal -->
      <div class="ua-history-modal" id="uaHistoryModal">
        <div class="ua-history-content">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0; font-size:18px;">📜 Saved Analysis History</h3>
            <button class="ua-btn-icon" id="uaCloseHistoryBtn" style="padding:4px 10px;">✕</button>
          </div>
          <div id="uaHistoryList"></div>
        </div>
      </div>
    `;

    setupEvents();
  }

  function fetchSyllabus() {
    fetch('/api/upsc-analyzer/syllabus')
      .then(res => res.json())
      .then(data => {
        syllabusData = data;
      })
      .catch(err => console.warn("Could not fetch syllabus reference:", err));
  }

  function setupEvents() {
    // Theme Toggle
    const themeBtn = document.getElementById('uaThemeToggleBtn');
    const wrapper = document.getElementById('uaWrapper');
    if (themeBtn && wrapper) {
      themeBtn.onclick = () => {
        const isDark = wrapper.classList.contains('ua-theme-dark');
        if (isDark) {
          wrapper.classList.remove('ua-theme-dark');
          wrapper.classList.add('ua-theme-light');
          themeBtn.innerHTML = '🌙 Dark Mode';
        } else {
          wrapper.classList.remove('ua-theme-light');
          wrapper.classList.add('ua-theme-dark');
          themeBtn.innerHTML = '☀️ Light Mode';
        }
      };
    }

    // Tab Switcher
    const tabYoutubeBtn = document.getElementById('uaTabYoutubeBtn');
    const tabImageBtn = document.getElementById('uaTabImageBtn');
    const contentYoutube = document.getElementById('uaTabYoutubeContent');
    const contentImage = document.getElementById('uaTabImageContent');

    if (tabYoutubeBtn && tabImageBtn) {
      tabYoutubeBtn.onclick = () => {
        currentMode = 'youtube';
        tabYoutubeBtn.classList.add('ua-active');
        tabImageBtn.classList.remove('ua-active');
        contentYoutube.classList.add('ua-active');
        contentImage.classList.remove('ua-active');
      };
      tabImageBtn.onclick = () => {
        currentMode = 'image';
        tabImageBtn.classList.add('ua-active');
        tabYoutubeBtn.classList.remove('ua-active');
        contentImage.classList.add('ua-active');
        contentYoutube.classList.remove('ua-active');
      };
    }

    // Dropzone & File Upload
    const dropzone = document.getElementById('uaDropzone');
    const fileInput = document.getElementById('uaFileInput');

    if (dropzone && fileInput) {
      dropzone.onclick = () => fileInput.click();
      dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('ua-dragover'); };
      dropzone.ondragleave = () => dropzone.classList.remove('ua-dragover');
      dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove('ua-dragover');
        handleFiles(e.dataTransfer.files);
      };
      fileInput.onchange = (e) => handleFiles(e.target.files);

      // Clipboard Paste Support
      window.addEventListener('paste', (e) => {
        if (currentMode === 'image' && e.clipboardData && e.clipboardData.files.length) {
          handleFiles(e.clipboardData.files);
        }
      });
    }

    // History Modal
    const historyBtn = document.getElementById('uaHistoryBtn');
    const historyModal = document.getElementById('uaHistoryModal');
    const closeHistoryBtn = document.getElementById('uaCloseHistoryBtn');

    if (historyBtn && historyModal && closeHistoryBtn) {
      historyBtn.onclick = () => {
        renderHistoryList();
        historyModal.style.display = 'flex';
      };
      closeHistoryBtn.onclick = () => {
        historyModal.style.display = 'none';
      };
    }

    // Submit Analysis
    const submitBtn = document.getElementById('uaAnalyzeSubmitBtn');
    if (submitBtn) {
      submitBtn.onclick = runAnalysis;
    }
  }

  function compressImage(file, maxDimension = 1600, quality = 0.82) {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => {
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(files) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const compressedB64 = await compressImage(file);
        if (compressedB64) {
          imageFilesBase64.push(compressedB64);
          renderImagePreviews();
        }
      } catch (e) {
        console.warn("[UPSC Analyzer] Compression fallback:", e);
      }
    }
  }

  function renderImagePreviews() {
    const grid = document.getElementById('uaPreviewGrid');
    if (!grid) return;
    grid.innerHTML = imageFilesBase64.map((b64, idx) => `
      <div class="ua-preview-item">
        <img src="${b64}" />
        <button class="ua-preview-remove" onclick="window.UPSCAnalyzer.removeImage(${idx})">✕</button>
      </div>
    `).join('');
  }

  function removeImage(idx) {
    imageFilesBase64.splice(idx, 1);
    renderImagePreviews();
  }

  function runAnalysis() {
    const submitBtn = document.getElementById('uaAnalyzeSubmitBtn');
    const loadingBox = document.getElementById('uaLoadingBox');
    const resultsContainer = document.getElementById('uaResultsContainer');

    const youtubeUrl = document.getElementById('uaYoutubeUrlInput')?.value.trim();
    const manualTranscript = document.getElementById('uaTranscriptInput')?.value.trim();

    if (currentMode === 'youtube' && !youtubeUrl && !manualTranscript) {
      alert("Please enter a YouTube video URL or paste the transcript.");
      return;
    }
    if (currentMode === 'image' && !imageFilesBase64.length) {
      alert("Please upload or paste at least one newspaper clipping image.");
      return;
    }

    // Show Loading Animation & Steps
    if (submitBtn) submitBtn.disabled = true;
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (loadingBox) loadingBox.style.display = 'block';

    animateLoadingSteps();

    const payload = {
      type: currentMode,
      youtubeUrl: currentMode === 'youtube' ? youtubeUrl : null,
      manualTranscript: currentMode === 'youtube' ? manualTranscript : null,
      images: currentMode === 'image' ? imageFilesBase64 : []
    };

    fetch('/api/upsc-analyzer/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async res => {
        const contentType = res.headers.get("content-type");
        if (res.ok && contentType && contentType.includes("application/json")) {
          return res.json();
        } else {
          let errorMsg = `Server Response Error (${res.status})`;
          try {
            if (contentType && contentType.includes("application/json")) {
              const errJson = await res.json();
              errorMsg = errJson.error || errJson.details || errorMsg;
            } else {
              const text = await res.text();
              if (res.status === 502 || res.status === 504 || text.includes("<title>502") || text.includes("<title>504")) {
                errorMsg = "Server connection timed out or is warming up on Render. Please click 'Analyze' again in a few seconds.";
              } else {
                const cleanText = text.replace(/<[^>]*>/g, '').trim().slice(0, 150);
                errorMsg = `Server Error (${res.status}): ${cleanText || 'Unexpected response'}`;
              }
            }
          } catch (e) {}
          throw new Error(errorMsg);
        }
      })
      .then(data => {
        if (loadingBox) loadingBox.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;

        if (!data || data.error) {
          alert(`Analysis Notice: ${data?.error || 'Analysis could not be completed.'}\n${data?.details ? 'Details: ' + data.details : ''}`);
          return;
        }

        currentAnalysis = data.analysis;
        saveToHistory(payload, currentAnalysis);
        renderResults(currentAnalysis);
      })
      .catch(err => {
        if (loadingBox) loadingBox.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
        alert(`Analysis Request: ${err.message || err}`);
      });
  }

  function animateLoadingSteps() {
    const s1 = document.getElementById('uaStep1');
    const s2 = document.getElementById('uaStep2');
    const s3 = document.getElementById('uaStep3');
    const s4 = document.getElementById('uaStep4');

    setTimeout(() => { s2?.classList.add('ua-active-step'); }, 1500);
    setTimeout(() => { s3?.classList.add('ua-active-step'); }, 3000);
    setTimeout(() => { s4?.classList.add('ua-active-step'); }, 4500);
  }

  function renderResults(analysis) {
    const container = document.getElementById('uaResultsContainer');
    if (!container || !analysis || !analysis.articles) return;

    activePaperFilter = 'ALL';

    // Calculate Syllabus Map Overview Counts
    const paperCounts = { 'GS-I': 0, 'GS-II': 0, 'GS-III': 0, 'GS-IV': 0, 'Prelims': 0, 'Essay': 0 };
    
    analysis.articles.forEach(art => {
      (art.syllabus_links || []).forEach(link => {
        const id = link.topic_id || '';
        if (id.startsWith('GS1')) paperCounts['GS-I']++;
        else if (id.startsWith('GS2')) paperCounts['GS-II']++;
        else if (id.startsWith('GS3')) paperCounts['GS-III']++;
        else if (id.startsWith('GS4')) paperCounts['GS-IV']++;
        else if (id.startsWith('PRE')) paperCounts['Prelims']++;
        else if (id.startsWith('ESS')) paperCounts['Essay']++;
      });
    });

    container.innerHTML = `
      <div class="ua-results-header">
        <h3 class="ua-results-title">
          <span>📰 Extracted Articles & UPSC Mapping</span>
          <span style="font-size:13px; font-weight:600; color:var(--ua-muted);">(${analysis.articles.length} topics detected)</span>
        </h3>
        <div class="ua-results-actions">
          <button class="ua-btn-action" onclick="window.UPSCAnalyzer.copyAllNotes()">📋 Copy All Notes</button>
          <button class="ua-btn-action" onclick="window.UPSCAnalyzer.downloadPDF()">📥 Download PDF</button>
        </div>
      </div>

      <!-- Syllabus Map Overview -->
      <div class="ua-syllabus-map-card">
        <div class="ua-syllabus-map-title">📌 Syllabus Coverage Map (Click to Filter Articles)</div>
        <div class="ua-chip-grid">
          <button class="ua-paper-chip ua-active" onclick="window.UPSCAnalyzer.filterPaper('ALL', this)">All Papers (${analysis.articles.length})</button>
          <button class="ua-paper-chip" onclick="window.UPSCAnalyzer.filterPaper('GS-I', this)">GS-I (${paperCounts['GS-I']})</button>
          <button class="ua-paper-chip" onclick="window.UPSCAnalyzer.filterPaper('GS-II', this)">GS-II (${paperCounts['GS-II']})</button>
          <button class="ua-paper-chip" onclick="window.UPSCAnalyzer.filterPaper('GS-III', this)">GS-III (${paperCounts['GS-III']})</button>
          <button class="ua-paper-chip" onclick="window.UPSCAnalyzer.filterPaper('GS-IV', this)">GS-IV (${paperCounts['GS-IV']})</button>
          <button class="ua-paper-chip" onclick="window.UPSCAnalyzer.filterPaper('Prelims', this)">Prelims (${paperCounts['Prelims']})</button>
          <button class="ua-paper-chip" onclick="window.UPSCAnalyzer.filterPaper('Essay', this)">Essay (${paperCounts['Essay']})</button>
        </div>
      </div>

      <!-- Articles List -->
      <div id="uaArticlesList">
        ${analysis.articles.map((art, idx) => renderArticleCard(art, idx)).join('')}
      </div>
    `;

    container.style.display = 'block';
  }

  function renderArticleCard(art, idx) {
    const isFirst = idx === 0;
    
    // Generate detail section HTML snippets
    const dataHtml = art.data && art.data.length ? `
      <div class="ua-section-box">
        <div class="ua-section-title"><span class="ua-chip ua-chip-data">DATA & STATS</span> Key Statistics</div>
        <ul class="ua-section-list">${art.data.map(d => `<li>${d}</li>`).join('')}</ul>
      </div>
    ` : '';

    const quotesHtml = art.quotes && art.quotes.length ? `
      <div class="ua-section-box">
        <div class="ua-section-title"><span class="ua-chip ua-chip-quote">QUOTES</span> Exact Quotes</div>
        <ul class="ua-section-list">${art.quotes.map(q => `<li>"<em>${q.text}</em>" — <b>${q.by || 'Unknown'}</b></li>`).join('')}</ul>
      </div>
    ` : '';

    const judgementsHtml = art.judgements && art.judgements.length ? `
      <div class="ua-section-box">
        <div class="ua-section-title"><span class="ua-chip ua-chip-judgement">JUDGEMENTS</span> Court Rulings & Precedents</div>
        <ul class="ua-section-list">${art.judgements.map(j => `<li><b>${j.case} (${j.year || ''})</b>: ${j.principle}</li>`).join('')}</ul>
      </div>
    ` : '';

    const actsHtml = art.acts && art.acts.length ? `
      <div class="ua-section-box">
        <div class="ua-section-title"><span class="ua-chip ua-chip-acts">ACTS & CONSTITUTION</span> Provisions / Amendments</div>
        <ul class="ua-section-list">${art.acts.map(a => `<li>${a}</li>`).join('')}</ul>
      </div>
    ` : '';

    const committeesHtml = art.commissions_committees && art.commissions_committees.length ? `
      <div class="ua-section-box">
        <div class="ua-section-title"><span class="ua-chip ua-chip-committee">COMMITTEES</span> Reports & Recommendations</div>
        <ul class="ua-section-list">${art.commissions_committees.map(c => `<li><b>${c.name}</b>: ${c.detail}</li>`).join('')}</ul>
      </div>
    ` : '';

    const intlHtml = art.international && art.international.length ? `
      <div class="ua-section-box">
        <div class="ua-section-title"><span class="ua-chip ua-chip-international">INTERNATIONAL</span> Treaties & Global Examples</div>
        <ul class="ua-section-list">${art.international.map(i => `<li>${i}</li>`).join('')}</ul>
      </div>
    ` : '';

    const placesHtml = art.places && art.places.length ? `
      <div class="ua-section-box" style="background: #fdf4ff; border-color: #f5d0fe;">
        <div class="ua-section-title" style="color: #86198f;">📍 Places in News & Map Pointers</div>
        <ul class="ua-section-list" style="color: #701a75;">${art.places.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>
    ` : '';

    const speciesHtml = (art.species_national_parks || art.species) && ((art.species_national_parks && art.species_national_parks.length) || (art.species && art.species.length)) ? `
      <div class="ua-section-box" style="background: #f0fdf4; border-color: #bbf7d0;">
        <div class="ua-section-title" style="color: #166534;">🌿 Species, National Parks & Environment</div>
        <ul class="ua-section-list" style="color: #14532d;">${(art.species_national_parks || art.species).map(s => `<li>${s}</li>`).join('')}</ul>
      </div>
    ` : '';

    const prelimsHtml = art.prelims_pointers && art.prelims_pointers.length ? `
      <div class="ua-section-box" style="background: #eff6ff; border-color: #bfdbfe;">
        <div class="ua-section-title" style="color: #1e40af;">🎯 Possible Prelims Angle</div>
        <ul class="ua-section-list" style="color: #1e3a8a;">${art.prelims_pointers.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>
    ` : '';

    const syllabusHtml = art.syllabus_links && art.syllabus_links.length ? `
      <div class="ua-section-box" style="background: #f0fdf4; border-color: #bbf7d0;">
        <div class="ua-section-title" style="color: #166534;">📚 UPSC Syllabus Mapping & Usage Guide</div>
        <ul class="ua-section-list" style="color: #14532d;">
          ${art.syllabus_links.map(l => `
            <li>
              <b>[${l.topic_id}]</b> <span class="ua-chip" style="background:#dcfce7; color:#166534;">${l.usage_type || 'Example'}</span>: 
              ${l.how_to_use}
            </li>
          `).join('')}
        </ul>
      </div>
    ` : '';

    return `
      <div class="ua-article-card ${isFirst ? 'ua-expanded' : ''}" id="uaArticleCard_${idx}">
        <div class="ua-article-head" onclick="window.UPSCAnalyzer.toggleCard(${idx})">
          <div>
            <h4 class="ua-article-head-title">${art.title || 'Topic Headline'}</h4>
            <div class="ua-article-meta">
              <span>⏱️ ${art.timestamp || 'Article'}</span>
              <span>📝 ${art.summary ? art.summary.slice(0, 75) + '...' : ''}</span>
            </div>
          </div>
          <span class="ua-chevron">▼</span>
        </div>

        <div class="ua-article-body">
          <div class="ua-section-box">
            <div class="ua-section-title"><span class="ua-chip ua-chip-summary">SUMMARY</span> Quick 2-Line Revision</div>
            <p style="margin:0; font-size:13.5px; line-height:1.6; color:var(--ua-text-primary); font-weight:600;">${art.summary || art.context || 'N/A'}</p>
          </div>

          ${syllabusHtml}
          ${dataHtml}
          ${placesHtml}
          ${speciesHtml}
          ${quotesHtml}
          ${judgementsHtml}
          ${actsHtml}
          ${committeesHtml}
          ${intlHtml}
          ${prelimsHtml}

          <button class="ua-btn-action" onclick="window.UPSCAnalyzer.copySingleArticle(${idx})" style="margin-top:10px;">
            📋 Copy Notes for this Article
          </button>
        </div>
      </div>
    `;
  }

  function toggleCard(idx) {
    const card = document.getElementById(`uaArticleCard_${idx}`);
    if (card) {
      card.classList.toggle('ua-expanded');
    }
  }

  function filterPaper(paper, btn) {
    activePaperFilter = paper;
    document.querySelectorAll('.ua-paper-chip').forEach(b => b.classList.remove('ua-active'));
    if (btn) btn.classList.add('ua-active');

    if (!currentAnalysis || !currentAnalysis.articles) return;

    const cards = document.querySelectorAll('.ua-article-card');
    cards.forEach((card, idx) => {
      const art = currentAnalysis.articles[idx];
      if (paper === 'ALL') {
        card.style.display = 'block';
      } else {
        const matches = (art.syllabus_links || []).some(l => {
          const id = l.topic_id || '';
          if (paper === 'GS-I' && id.startsWith('GS1')) return true;
          if (paper === 'GS-II' && id.startsWith('GS2')) return true;
          if (paper === 'GS-III' && id.startsWith('GS3')) return true;
          if (paper === 'GS-IV' && id.startsWith('GS4')) return true;
          if (paper === 'Prelims' && id.startsWith('PRE')) return true;
          if (paper === 'Essay' && id.startsWith('ESS')) return true;
          return false;
        });
        card.style.display = matches ? 'block' : 'none';
      }
    });
  }

  function copySingleArticle(idx) {
    if (!currentAnalysis || !currentAnalysis.articles[idx]) return;
    const art = currentAnalysis.articles[idx];
    const text = formatArticleText(art);
    navigator.clipboard.writeText(text).then(() => alert("Article notes copied to clipboard!"));
  }

  function copyAllNotes() {
    if (!currentAnalysis || !currentAnalysis.articles) return;
    const fullText = currentAnalysis.articles.map(art => formatArticleText(art)).join('\n\n========================================\n\n');
    navigator.clipboard.writeText(fullText).then(() => alert("All analysis notes copied to clipboard!"));
  }

  function formatArticleText(art) {
    let str = `📰 ${art.title.toUpperCase()}\n`;
    if (art.timestamp) str += `Timestamp: ${art.timestamp}\n`;
    str += `Summary: ${art.summary || art.context}\n\n`;

    if (art.data && art.data.length) str += `[KEY DATA & STATS]\n- ${art.data.join('\n- ')}\n\n`;
    if (art.places && art.places.length) str += `[PLACES IN NEWS & MAP POINTERS]\n- ${art.places.join('\n- ')}\n\n`;
    if ((art.species_national_parks || art.species) && (art.species_national_parks?.length || art.species?.length)) str += `[SPECIES & NATIONAL PARKS]\n- ${(art.species_national_parks || art.species).join('\n- ')}\n\n`;
    if (art.judgements && art.judgements.length) str += `[JUDGEMENTS]\n- ` + art.judgements.map(j => `${j.case}: ${j.principle}`).join('\n- ') + `\n\n`;
    if (art.acts && art.acts.length) str += `[ACTS & ARTICLES]\n- ${art.acts.join('\n- ')}\n\n`;
    if (art.prelims_pointers && art.prelims_pointers.length) str += `[PRELIMS POINTERS]\n- ${art.prelims_pointers.join('\n- ')}\n\n`;
    return str;
  }

  function downloadPDF() {
    if (!currentAnalysis || !currentAnalysis.articles) return alert("No analysis available to download.");
    
    const container = document.createElement('div');
    container.style.padding = '24px';
    container.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';
    container.style.color = '#0f172a';
    container.style.background = '#ffffff';

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let html = `
      <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="color: #2563eb; font-size: 22px; margin: 0 0 6px 0;">🦉 SAANKALP UPSC Newspaper Analysis</h1>
        <p style="color: #64748b; font-size: 13px; margin: 0;">High-Yield Exam Notes & Syllabus Mapping · ${dateStr}</p>
      </div>
    `;

    currentAnalysis.articles.forEach((art, idx) => {
      html += `
        <div style="border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 18px; margin-bottom: 20px; page-break-inside: avoid;">
          <h2 style="font-size: 17px; color: #0f172a; margin: 0 0 8px 0;">${idx + 1}. ${art.title || 'Topic Headline'}</h2>
          ${art.timestamp ? `<div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">⏱️ Timestamp: ${art.timestamp}</div>` : ''}
          <p style="font-size: 13px; color: #1e293b; line-height: 1.6; margin: 0 0 14px 0; background: #f8fafc; padding: 10px; border-radius: 8px;">
            <b>Summary:</b> ${art.summary || art.context || 'N/A'}
          </p>
      `;

      if (art.syllabus_links && art.syllabus_links.length) {
        html += `
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px;">
            <b style="color: #166534; font-size: 12.5px;">📚 UPSC Syllabus Mapping & Usage Guide:</b>
            <ul style="margin: 4px 0 0 0; padding-left: 18px; color: #14532d; font-size: 12px; line-height: 1.5;">
              ${art.syllabus_links.map(l => `<li><b>[${l.topic_id}]</b> <span style="color:#166534; font-weight:700;">(${l.usage_type || 'Example'})</span>: ${l.how_to_use}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      if (art.data && art.data.length) {
        html += `
          <div style="margin-bottom: 10px;">
            <b style="font-size: 12.5px; color: #1e40af;">📊 Key Statistics & Data:</b>
            <ul style="margin: 3px 0 0 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.5;">
              ${art.data.map(d => `<li>${d}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      if (art.places && art.places.length) {
        html += `
          <div style="background: #fdf4ff; border: 1px solid #f5d0fe; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px;">
            <b style="color: #86198f; font-size: 12.5px;">📍 Places in News & Map Pointers:</b>
            <ul style="margin: 4px 0 0 0; padding-left: 18px; font-size: 12px; color: #701a75; line-height: 1.5;">
              ${art.places.map(p => `<li>${p}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      if ((art.species_national_parks || art.species) && (art.species_national_parks?.length || art.species?.length)) {
        html += `
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px;">
            <b style="color: #166534; font-size: 12.5px;">🌿 Species, National Parks & Environment:</b>
            <ul style="margin: 4px 0 0 0; padding-left: 18px; font-size: 12px; color: #14532d; line-height: 1.5;">
              ${(art.species_national_parks || art.species).map(s => `<li>${s}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      if (art.judgements && art.judgements.length) {
        html += `
          <div style="margin-bottom: 10px;">
            <b style="font-size: 12.5px; color: #6b21a8;">⚖️ Landmark Judgements:</b>
            <ul style="margin: 3px 0 0 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.5;">
              ${art.judgements.map(j => `<li><b>${j.case} (${j.year || ''})</b>: ${j.principle}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      if (art.acts && art.acts.length) {
        html += `
          <div style="margin-bottom: 10px;">
            <b style="font-size: 12.5px; color: #166534;">📜 Acts & Constitutional Articles:</b>
            <ul style="margin: 3px 0 0 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.5;">
              ${art.acts.map(a => `<li>${a}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      if (art.prelims_pointers && art.prelims_pointers.length) {
        html += `
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px;">
            <b style="color: #1e40af; font-size: 12.5px;">🎯 Possible Prelims Angle:</b>
            <ul style="margin: 4px 0 0 0; padding-left: 18px; font-size: 12px; color: #1e3a8a; line-height: 1.5;">
              ${art.prelims_pointers.map(p => `<li>${p}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      html += `</div>`;
    });

    container.innerHTML = html;

    if (window.html2pdf) {
      const opt = {
        margin: 10,
        filename: `UPSC_Newspaper_Analysis_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      html2pdf().set(opt).from(container).save();
    } else {
      const printWin = window.open('', '_blank');
      printWin.document.write(`<html><head><title>UPSC Newspaper Analysis PDF</title></head><body>${html}</body></html>`);
      printWin.document.close();
      printWin.print();
    }
  }

  function saveToHistory(payload, analysis) {
    try {
      const history = JSON.parse(localStorage.getItem('ua_history') || '[]');
      const item = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        type: payload.type,
        count: analysis.articles ? analysis.articles.length : 0,
        analysis
      };
      history.unshift(item);
      localStorage.setItem('ua_history', JSON.stringify(history.slice(0, 20))); // Keep last 20
    } catch (e) {}
  }

  function renderHistoryList() {
    const listEl = document.getElementById('uaHistoryList');
    if (!listEl) return;
    try {
      const history = JSON.parse(localStorage.getItem('ua_history') || '[]');
      if (!history.length) {
        listEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--ua-muted);">No saved analyses yet.</div>`;
        return;
      }
      listEl.innerHTML = history.map(item => `
        <div style="background:var(--ua-bg); border:1px solid var(--ua-card-border); border-radius:12px; padding:14px; margin-bottom:10px; cursor:pointer;" onclick="window.UPSCAnalyzer.loadFromHistory(${item.id})">
          <b style="color:var(--ua-text-primary); font-size:14px;">${item.date}</b>
          <div style="font-size:12px; color:var(--ua-muted); margin-top:4px;">
            ${item.type.toUpperCase()} · ${item.count} articles extracted
          </div>
        </div>
      `).join('');
    } catch (e) {}
  }

  function loadFromHistory(id) {
    try {
      const history = JSON.parse(localStorage.getItem('ua_history') || '[]');
      const found = history.find(h => h.id === id);
      if (found && found.analysis) {
        currentAnalysis = found.analysis;
        renderResults(currentAnalysis);
        document.getElementById('uaHistoryModal').style.display = 'none';
      }
    } catch (e) {}
  }

  // Export to Global Window namespace
  window.UPSCAnalyzer = {
    init,
    removeImage,
    toggleCard,
    filterPaper,
    copySingleArticle,
    copyAllNotes,
    downloadPDF,
    loadFromHistory
  };
})();
