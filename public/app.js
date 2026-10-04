// ==========================================================================
// VIRTUAL LIBRARY FRONTEND CLIENT JS (Socket.IO + REST API)
// ==========================================================================

const socket = io();

// State
let currentUser = 'Alex Student';
let activeRoomId = null;
let catalogBooks = [];
let roomList = [];

// Pomodoro Timer State
let timerInterval = null;
let timerSecondsTotal = 25 * 60;
let timerSecondsLeft = 25 * 60;
let isTimerRunning = false;
let currentTimerMode = '25'; // '25', '50', '5'

// Ambient Audio Synthesizer / Audio Context
let currentAmbientSound = null;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  setupEventListeners();
  setupSocketListeners();
  
  // Register default username
  const usernameInput = document.getElementById('username-input');
  if (usernameInput) {
    currentUser = usernameInput.value || 'Alex Student';
    socket.emit('register-user', { username: currentUser });
  }

  // Load initial data
  fetchStats();
  fetchBooks();
  fetchRooms();
  fetchNotes();
  fetchActivityLog();
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Username Change
  const usernameInput = document.getElementById('username-input');
  usernameInput.addEventListener('change', (e) => {
    currentUser = e.target.value.trim() || 'Alex Student';
    socket.emit('register-user', { username: currentUser });
    showToast('Profile Updated', `Signed in as ${currentUser}`, 'info');
  });

  // Navigation Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-tab');
      document.getElementById(`tab-${targetTab}`).classList.add('active');

      if (targetTab === 'catalog') fetchBooks();
      if (targetTab === 'rooms') fetchRooms();
      if (targetTab === 'notes') fetchNotes();
      if (targetTab === 'activity') fetchActivityLog();
    });
  });

  // Catalog Search & Filters
  document.getElementById('catalog-search').addEventListener('input', filterAndRenderBooks);
  document.getElementById('category-filter').addEventListener('change', filterAndRenderBooks);
  document.getElementById('status-filter').addEventListener('change', filterAndRenderBooks);

  // Add Book Modal Triggers
  document.getElementById('btn-open-add-book').addEventListener('click', () => {
    openModal('modal-add-book');
  });

  document.getElementById('btn-close-add-modal').addEventListener('click', () => {
    closeModal('modal-add-book');
  });

  document.getElementById('btn-cancel-add-modal').addEventListener('click', () => {
    closeModal('modal-add-book');
  });

  document.getElementById('btn-close-book-modal').addEventListener('click', () => {
    closeModal('modal-book-details');
  });

  document.getElementById('btn-close-room-modal').addEventListener('click', () => {
    closeModal('modal-active-room');
  });

  // Form Submission: Add Book
  document.getElementById('form-add-book').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('add-book-title').value.trim();
    const author = document.getElementById('add-book-author').value.trim();
    const category = document.getElementById('add-book-category').value;
    const coverColor = document.getElementById('add-book-color').value;
    const pages = document.getElementById('add-book-pages').value;
    const description = document.getElementById('add-book-desc').value.trim();

    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, category, coverColor, pages, description })
      });

      if (res.ok) {
        closeModal('modal-add-book');
        document.getElementById('form-add-book').reset();
        showToast('Book Added', `"${title}" has been published to the catalog.`, 'success');
        fetchBooks();
        fetchStats();
      } else {
        showToast('Error', 'Failed to add book.', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Form Submission: Create Note
  document.getElementById('form-create-note').addEventListener('submit', async (e) => {
    e.preventDefault();
    const subject = document.getElementById('note-subject').value;
    const title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();

    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: currentUser, subject, title, content })
      });

      if (res.ok) {
        document.getElementById('form-create-note').reset();
        showToast('Note Shared', 'Your study note is live on the knowledge board!', 'success');
        fetchNotes();
        fetchStats();
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Room Chat Form
  document.getElementById('form-room-chat').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('input-room-chat');
    const msg = input.value.trim();
    if (msg && activeRoomId) {
      socket.emit('send-room-message', {
        roomId: activeRoomId,
        message: msg,
        username: currentUser
      });
      input.value = '';
    }
  });

  // Leave Room Button
  document.getElementById('btn-leave-room').addEventListener('click', () => {
    if (activeRoomId) {
      socket.emit('leave-room', { roomId: activeRoomId });
      activeRoomId = null;
      closeModal('modal-active-room');
      fetchRooms();
    }
  });

  // Pomodoro Controls
  document.getElementById('btn-timer-toggle').addEventListener('click', toggleTimer);
  document.getElementById('btn-timer-reset').addEventListener('click', resetTimer);
  
  document.getElementById('btn-timer-mode-25').addEventListener('click', () => setTimerMode('25', 25));
  document.getElementById('btn-timer-mode-50').addEventListener('click', () => setTimerMode('50', 50));
  document.getElementById('btn-timer-mode-5').addEventListener('click', () => setTimerMode('5', 5));

  // Ambient Audio Toggles
  const ambientBtns = document.querySelectorAll('.ambient-btn');
  ambientBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const soundType = btn.getAttribute('data-sound');
      toggleAmbientAudio(soundType, btn);
    });
  });
}

// --- SOCKET.IO REAL-TIME LISTENERS ---
function setupSocketListeners() {
  socket.on('online-count-changed', ({ count }) => {
    const el = document.getElementById('active-students-count');
    if (el) el.textContent = count;
  });

  socket.on('book-added', (newBook) => {
    showToast('New Book Available', `"${newBook.title}" by ${newBook.author} was added!`, 'info');
    fetchBooks();
    fetchStats();
  });

  socket.on('book-updated', (updatedBook) => {
    fetchBooks();
    fetchStats();
  });

  socket.on('note-added', (note) => {
    fetchNotes();
    fetchStats();
  });

  socket.on('note-liked', () => {
    fetchNotes();
  });

  socket.on('room-occupants-updated', ({ roomId, count, occupants }) => {
    // If user is currently in this room modal, update UI
    if (activeRoomId === roomId) {
      document.getElementById('active-room-count').textContent = count;
      renderRoomOccupants(occupants);
    }
    fetchRooms();
  });

  socket.on('room-chat-message', ({ sender, message, timestamp }) => {
    appendRoomChatMessage({ sender, message, timestamp });
  });

  socket.on('room-system-message', ({ text, timestamp }) => {
    appendRoomChatMessage({ sender: 'System', message: text, timestamp, isSystem: true });
  });

  socket.on('global-toast', ({ title, message, type }) => {
    showToast(title, message, type);
  });
}

// --- FETCH & REST API CALLS ---
async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    document.getElementById('stat-total-books').textContent = data.totalBooks || 0;
    document.getElementById('stat-available-books').textContent = data.availableBooks || 0;
    document.getElementById('stat-borrowed-books').textContent = data.borrowedBooks || 0;
    document.getElementById('stat-notes-count').textContent = data.totalNotes || 0;
    document.getElementById('active-students-count').textContent = data.activeUsers || 1;
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

async function fetchBooks() {
  try {
    const res = await fetch('/api/books');
    catalogBooks = await res.json();
    filterAndRenderBooks();
  } catch (err) {
    console.error('Error fetching books:', err);
  }
}

function filterAndRenderBooks() {
  const searchTerm = document.getElementById('catalog-search').value.toLowerCase();
  const categoryFilter = document.getElementById('category-filter').value;
  const statusFilter = document.getElementById('status-filter').value;

  const filtered = catalogBooks.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(searchTerm) ||
                          book.author.toLowerCase().includes(searchTerm) ||
                          (book.description && book.description.toLowerCase().includes(searchTerm));

    const matchesCategory = (categoryFilter === 'All') || (book.category === categoryFilter);
    const matchesStatus = (statusFilter === 'all') || (book.status === statusFilter);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  renderBooksGrid(filtered);
}

function renderBooksGrid(books) {
  const container = document.getElementById('books-container');
  if (books.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
        <i class="fa-solid fa-book-open" style="font-size: 2.5rem; margin-bottom: 12px; color: var(--accent-primary);"></i>
        <h3>No books found</h3>
        <p>Try adjusting your search query or filter settings.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = books.map(book => {
    const isAvailable = book.status === 'available';
    const statusBadge = isAvailable
      ? `<span class="badge badge-available"><i class="fa-solid fa-check"></i> Available</span>`
      : `<span class="badge badge-borrowed"><i class="fa-solid fa-clock"></i> Checked Out (${book.borrowed_by || 'Student'})</span>`;

    return `
      <div class="book-card">
        <div class="book-cover" style="background: ${book.cover_color || 'linear-gradient(135deg, #4f46e5, #06b6d4)'};">
          <span class="book-category-tag">${escapeHtml(book.category)}</span>
          <h3 class="book-cover-title">${escapeHtml(book.title)}</h3>
        </div>
        <div class="book-details">
          <div>
            <p class="book-author">By ${escapeHtml(book.author)}</p>
            <p class="book-desc">${escapeHtml(book.description || 'No description provided.')}</p>
          </div>
          <div>
            <div class="book-meta">
              <span class="book-rating"><i class="fa-solid fa-star"></i> ${book.rating || 4.8}</span>
              <span>${book.pages || 350} pages</span>
              ${statusBadge}
            </div>

            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-block" onclick="viewBookDetails(${book.id})">
                <i class="fa-solid fa-circle-info"></i> Read & Details
              </button>
              ${isAvailable ? `
                <button class="btn btn-primary" onclick="borrowBook(${book.id}, '${escapeHtml(book.title)}')">
                  <i class="fa-solid fa-bookmark"></i> Checkout
                </button>
              ` : `
                <button class="btn btn-outline" onclick="returnBook(${book.id})">
                  <i class="fa-solid fa-rotate-left"></i> Return
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function viewBookDetails(bookId) {
  try {
    const book = catalogBooks.find(b => b.id === bookId);
    if (!book) return;

    const contentEl = document.getElementById('book-modal-content');
    const isAvailable = book.status === 'available';

    contentEl.innerHTML = `
      <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap;">
        <div style="width: 140px; height: 190px; background: ${book.cover_color}; border-radius: 12px; padding: 14px; color: white; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <span style="font-size: 0.65rem; text-transform: uppercase; font-weight: 700; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 10px; align-self: flex-start;">${escapeHtml(book.category)}</span>
          <h4 style="font-size: 0.95rem; font-family: 'Outfit'; font-weight: 700; line-height: 1.2;">${escapeHtml(book.title)}</h4>
        </div>
        <div style="flex: 1; min-width: 240px;">
          <span style="color: var(--accent-secondary); font-size: 0.8rem; text-transform: uppercase; font-weight: 700;">${escapeHtml(book.category)}</span>
          <h2 style="font-size: 1.5rem; margin: 4px 0 8px;">${escapeHtml(book.title)}</h2>
          <p style="color: var(--text-secondary); font-weight: 600; font-size: 0.95rem; margin-bottom: 12px;">Author: ${escapeHtml(book.author)}</p>

          <div style="display: flex; gap: 16px; margin-bottom: 16px; font-size: 0.85rem; color: var(--text-muted);">
            <span><i class="fa-solid fa-star" style="color: var(--accent-warning);"></i> ${book.rating || 4.8} Rating</span>
            <span><i class="fa-solid fa-file-lines"></i> ${book.pages || 350} Pages</span>
            <span><i class="fa-solid fa-language"></i> English</span>
          </div>

          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; margin-bottom: 20px;">
            <h4 style="font-size: 0.9rem; margin-bottom: 6px;"><i class="fa-solid fa-align-left"></i> Book Synopsis</h4>
            <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6;">${escapeHtml(book.description || 'Comprehensive digital textbook resource covering key principles and practice exercises.')}</p>
          </div>

          <div style="display: flex; gap: 12px;">
            ${isAvailable ? `
              <button class="btn btn-primary" onclick="borrowBook(${book.id}, '${escapeHtml(book.title)}'); closeModal('modal-book-details');">
                <i class="fa-solid fa-bookmark"></i> Checkout for Reading (14 Days)
              </button>
            ` : `
              <button class="btn btn-outline" onclick="returnBook(${book.id}); closeModal('modal-book-details');">
                <i class="fa-solid fa-rotate-left"></i> Return Book
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    openModal('modal-book-details');
  } catch (err) {
    console.error(err);
  }
}

async function borrowBook(bookId, bookTitle) {
  try {
    const res = await fetch(`/api/books/${bookId}/borrow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser })
    });

    if (res.ok) {
      showToast('Book Checked Out', `You have borrowed "${bookTitle}". Enjoy your study session!`, 'success');
      fetchBooks();
      fetchStats();
    } else {
      showToast('Notice', 'Book is currently unavailable.', 'warning');
    }
  } catch (err) {
    console.error(err);
  }
}

async function returnBook(bookId) {
  try {
    const res = await fetch(`/api/books/${bookId}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser })
    });

    if (res.ok) {
      showToast('Book Returned', 'Thank you for returning the book to the virtual library.', 'info');
      fetchBooks();
      fetchStats();
    }
  } catch (err) {
    console.error(err);
  }
}

// --- VIRTUAL STUDY ROOMS ---
async function fetchRooms() {
  try {
    const res = await fetch('/api/rooms');
    roomList = await res.json();
    renderRooms(roomList);
  } catch (err) {
    console.error('Error fetching rooms:', err);
  }
}

function renderRooms(rooms) {
  const container = document.getElementById('rooms-container');
  container.innerHTML = rooms.map(room => {
    const currentCount = room.occupants ? room.occupants.length : (room.current_occupants || 0);
    return `
      <div class="room-card">
        <div>
          <h3>${escapeHtml(room.name)}</h3>
          <p>${escapeHtml(room.description)}</p>
        </div>
        <div>
          <div class="room-meta">
            <span class="room-occupancy">Active: <span>${currentCount}</span> / ${room.capacity}</span>
            <span class="badge ${room.room_type === 'quiet' ? 'badge-purple' : 'badge-live'}">${escapeHtml(room.room_type.toUpperCase())}</span>
          </div>
          <button class="btn btn-secondary btn-block" onclick="joinStudyRoom(${room.id}, '${escapeHtml(room.name)}', '${escapeHtml(room.description)}')">
            <i class="fa-solid fa-right-to-bracket"></i> Enter Room
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function joinStudyRoom(roomId, roomName, roomDesc) {
  activeRoomId = roomId;

  document.getElementById('active-room-title').innerHTML = `<i class="fa-solid fa-headphones"></i> ${roomName}`;
  document.getElementById('active-room-desc').textContent = roomDesc;
  document.getElementById('room-chat-messages').innerHTML = ''; // Clear chat view for clean room session

  socket.emit('join-room', {
    roomId,
    username: currentUser,
    studyGoal: 'Deep Focus'
  });

  openModal('modal-active-room');
}

function renderRoomOccupants(occupants) {
  const container = document.getElementById('active-room-occupants-list');
  if (!occupants || occupants.length === 0) {
    container.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted);">No occupants currently in room.</p>';
    return;
  }

  container.innerHTML = occupants.map(u => `
    <div class="occupant-pill">
      <i class="fa-solid fa-circle" style="font-size: 0.6rem; color: var(--accent-success);"></i>
      <span style="font-weight: 600;">${escapeHtml(u.username)}</span>
    </div>
  `).join('');
}

function appendRoomChatMessage({ sender, message, timestamp, isSystem }) {
  const container = document.getElementById('room-chat-messages');
  const div = document.createElement('div');
  
  if (isSystem) {
    div.className = 'chat-msg system';
    div.textContent = message;
  } else {
    div.className = 'chat-msg';
    div.innerHTML = `
      <div class="chat-msg-sender">${escapeHtml(sender)} <span style="font-weight:400; color:var(--text-muted); font-size:0.7rem;">${timestamp}</span></div>
      <div>${escapeHtml(message)}</div>
    `;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// --- SHARED STUDY NOTES ---
async function fetchNotes() {
  try {
    const res = await fetch('/api/notes');
    const notes = await res.json();
    
    document.getElementById('notes-board-count').textContent = `${notes.length} Notes`;
    renderNotes(notes);
  } catch (err) {
    console.error('Error fetching notes:', err);
  }
}

function renderNotes(notes) {
  const container = document.getElementById('notes-container');
  if (notes.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary);">No study notes published yet. Be the first to share your notes!</p>';
    return;
  }

  container.innerHTML = notes.map(note => `
    <div class="note-card">
      <div>
        <span class="note-tag">${escapeHtml(note.subject || 'General')}</span>
        <h4>${escapeHtml(note.title)}</h4>
        <p>${escapeHtml(note.content)}</p>
      </div>
      <div class="note-footer">
        <span>By ${escapeHtml(note.user_name)}</span>
        <button class="btn-like" onclick="likeNote(${note.id})">
          <i class="fa-solid fa-heart" style="color: var(--accent-danger);"></i> <span>${note.likes || 0}</span>
        </button>
      </div>
    </div>
  `).join('');
}

async function likeNote(noteId) {
  try {
    await fetch(`/api/notes/${noteId}/like`, { method: 'POST' });
  } catch (err) {
    console.error(err);
  }
}

// --- ACTIVITY STREAM ---
async function fetchActivityLog() {
  try {
    const res = await fetch('/api/activity');
    const activities = await res.json();
    renderActivityLog(activities);
  } catch (err) {
    console.error(err);
  }
}

function renderActivityLog(activities) {
  const container = document.getElementById('activity-stream');
  if (activities.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary);">No recent activity recorded.</p>';
    return;
  }

  container.innerHTML = activities.map(act => {
    const initial = (act.username || 'A').charAt(0).toUpperCase();
    const timeStr = new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="activity-item">
        <div class="activity-avatar">${initial}</div>
        <div class="activity-details">
          <h5>${escapeHtml(act.username)} ${escapeHtml(act.action)}</h5>
          <p>${escapeHtml(act.details || '')}</p>
          <div class="activity-time"><i class="fa-regular fa-clock"></i> ${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

// --- POMODORO TIMER LOGIC ---
function setTimerMode(mode, minutes) {
  currentTimerMode = mode;
  timerSecondsTotal = minutes * 60;
  timerSecondsLeft = minutes * 60;
  
  document.getElementById('timer-mode-label').textContent = mode === '5' ? 'Rest Break' : 'Work Session';
  updateTimerUI();

  if (isTimerRunning) {
    clearInterval(timerInterval);
    isTimerRunning = false;
    document.getElementById('timer-icon').className = 'fa-solid fa-play';
    document.getElementById('btn-timer-toggle').innerHTML = `<i class="fa-solid fa-play"></i> Start Session`;
  }
}

function toggleTimer() {
  const btn = document.getElementById('btn-timer-toggle');
  
  if (isTimerRunning) {
    clearInterval(timerInterval);
    isTimerRunning = false;
    btn.innerHTML = `<i class="fa-solid fa-play"></i> Resume`;
  } else {
    isTimerRunning = true;
    btn.innerHTML = `<i class="fa-solid fa-pause"></i> Pause`;

    timerInterval = setInterval(() => {
      if (timerSecondsLeft > 0) {
        timerSecondsLeft--;
        updateTimerUI();
      } else {
        clearInterval(timerInterval);
        isTimerRunning = false;
        btn.innerHTML = `<i class="fa-solid fa-play"></i> Start Session`;

        playTimerCompletionSound();
        showToast('🎉 Session Complete!', 'Great focus! You finished your Pomodoro sprint.', 'success');
        
        socket.emit('completed-focus-session', {
          username: currentUser,
          minutes: timerSecondsTotal / 60
        });

        fetchStats();
      }
    }, 1000);
  }
}

function resetTimer() {
  clearInterval(timerInterval);
  isTimerRunning = false;
  timerSecondsLeft = timerSecondsTotal;
  updateTimerUI();
  document.getElementById('btn-timer-toggle').innerHTML = `<i class="fa-solid fa-play"></i> Start Session`;
}

function updateTimerUI() {
  const mins = Math.floor(timerSecondsLeft / 60);
  const secs = timerSecondsLeft % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  
  document.getElementById('timer-display').textContent = timeStr;

  // SVG Progress Ring calculation
  const ring = document.getElementById('timer-progress-ring');
  if (ring) {
    const totalDash = 283; // 2 * PI * r(45)
    const progress = timerSecondsLeft / timerSecondsTotal;
    const offset = totalDash - (progress * totalDash);
    ring.style.strokeDashoffset = offset;
  }
}

function playTimerCompletionSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 note
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.5); // A5 note

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.8);
  } catch (err) {
    console.error(err);
  }
}

// --- AMBIENT SOUND GENERATOR ---
function toggleAmbientAudio(soundType, buttonEl) {
  const allBtns = document.querySelectorAll('.ambient-btn');
  
  if (currentAmbientSound === soundType) {
    // Turn off
    stopAmbientAudio();
    currentAmbientSound = null;
    allBtns.forEach(b => b.classList.remove('active'));
    showToast('Ambient Audio', 'Background sound muted.', 'info');
  } else {
    stopAmbientAudio();
    currentAmbientSound = soundType;
    allBtns.forEach(b => b.classList.remove('active'));
    buttonEl.classList.add('active');
    
    startWebAudioNoise(soundType);
    showToast('Ambient Audio', `Playing ${soundType} ambiance...`, 'info');
  }
}

let audioCtx = null;
let noiseNode = null;

function startWebAudioNoise(type) {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1; // White noise base
    }

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;

    const filter = audioCtx.createBiquadFilter();
    const gainNode = audioCtx.createGain();

    if (type === 'rain') {
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      gainNode.gain.value = 0.08;
    } else if (type === 'waves') {
      filter.type = 'bandpass';
      filter.frequency.value = 400;
      gainNode.gain.value = 0.12;
    } else { // cafe
      filter.type = 'lowpass';
      filter.frequency.value = 1200;
      gainNode.gain.value = 0.05;
    }

    noiseNode.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    noiseNode.start();
  } catch (e) {
    console.error('Web Audio API not supported:', e);
  }
}

function stopAmbientAudio() {
  if (noiseNode) {
    try { noiseNode.stop(); } catch (e) {}
    noiseNode = null;
  }
  if (audioCtx) {
    try { audioCtx.close(); } catch (e) {}
    audioCtx = null;
  }
}

// --- HELPER UTILITIES ---
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'warning') icon = 'fa-exclamation-triangle';
  if (type === 'error') icon = 'fa-exclamation-circle';

  toast.innerHTML = `
    <i class="fa-solid ${icon}" style="font-size: 1.2rem; color: var(--accent-primary);"></i>
    <div>
      <h5 style="font-size:0.9rem; margin-bottom:2px;">${escapeHtml(title)}</h5>
      <p style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(message)}</p>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
