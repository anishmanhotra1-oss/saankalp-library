const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Serve Service Worker with root scope header
app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Self-Ping Keep Alive (Prevents Render Free Tier from Sleeping)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(() => {
    http.get(RENDER_URL, (res) => {
      console.log(`[Keep-Alive] Pinged ${RENDER_URL} - Status: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error('[Keep-Alive] Ping error:', err.message);
    });
  }, 10 * 60 * 1000); // Pings every 10 minutes to keep server awake
}

// UPSC Newspaper Analyzer isolated API route
app.use('/api/upsc-analyzer', require('./upsc-analyzer/routes/analyzer-route'));
app.use('/upsc-analyzer', express.static(path.join(__dirname, 'upsc-analyzer')));

// Initialize SQLite Database
const db = new sqlite3.Database(path.join(__dirname, 'saankalp.db'), (err) => {
  if (err) console.error('DB Connection Error:', err);
  else console.log('Connected to SQLite Database: saankalp.db');
});

// Helper function to get local YYYY-MM-DD date key
function getLocalDateKey(d = new Date()) {
  const dateObj = typeof d === 'number' || typeof d === 'string' ? new Date(d) : d;
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Database Setup & Auto-Migration
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      phone TEXT UNIQUE,
      name TEXT NOT NULL,
      exam_target TEXT DEFAULT 'General Aspirant',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrations for existing tables
  db.run(`ALTER TABLE users ADD COLUMN phone TEXT`, (err) => {});
  db.run(`ALTER TABLE users ADD COLUMN exam_target TEXT DEFAULT 'General Aspirant'`, (err) => {});
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`, (err) => {});

  db.run("UPDATE users SET phone = '9876543210' WHERE uid = 'user_demo' AND (phone IS NULL OR phone = '')", (err) => {});
  db.run("UPDATE users SET phone = '9876543211' WHERE uid = 'u101' AND (phone IS NULL OR phone = '')", (err) => {});
  db.run("UPDATE users SET phone = '9876543212' WHERE uid = 'u102' AND (phone IS NULL OR phone = '')", (err) => {});
  db.run("UPDATE users SET phone = '9876543213' WHERE uid = 'u103' AND (phone IS NULL OR phone = '')", (err) => {});
  db.run("UPDATE users SET phone = '9876543214' WHERE uid = 'u104' AND (phone IS NULL OR phone = '')", (err) => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS study_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT,
      seat_label TEXT,
      mins INTEGER,
      start_time INTEGER,
      end_time INTEGER,
      date_key TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT,
      room TEXT,
      text TEXT,
      ts INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      host TEXT,
      page INTEGER,
      ts INTEGER,
      pdf_name TEXT,
      pdf_data TEXT,
      pdf_uploader TEXT
    )
  `);

  db.run(`ALTER TABLE rooms ADD COLUMN pdf_name TEXT`, (err) => {});
  db.run(`ALTER TABLE rooms ADD COLUMN pdf_data TEXT`, (err) => {});
  db.run(`ALTER TABLE rooms ADD COLUMN pdf_uploader TEXT`, (err) => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      ts INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      ts INTEGER NOT NULL,
      UNIQUE(user_id, friend_id)
    )
  `);

  // Seed default users if empty
  db.get("SELECT COUNT(*) AS count FROM users", [], (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare("INSERT INTO users (uid, phone, name, exam_target) VALUES (?, ?, ?, ?)");
      stmt.run("user_demo", "9876543210", "You (Aspirant)", "UPSC CSE");
      stmt.run("u101", "9876543211", "Arjun Verma", "JEE Advanced");
      stmt.run("u102", "9876543212", "Priya Sharma", "NEET UG");
      stmt.run("u103", "9876543213", "Rohan Gupta", "GATE CS");
      stmt.run("u104", "9876543214", "Mehak Singh", "State PSC");
      stmt.finalize();

      addNotification("🎉 Welcome to SAANKALP Virtual Library! Quiet desk seats are now open.");
    }
  });
});

function addNotification(text) {
  const ts = Date.now();
  db.run(`INSERT INTO notifications (text, ts) VALUES (?, ?)`, [text, ts], function(err) {
    if (!err) {
      io.emit('new_notification', { id: this.lastID, text, ts });
    }
  });
}

// Helper: Normalize 10-digit phone number
function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

// In-Memory OTP store: phone -> { otp, expiresAt }
const pendingOtps = new Map();

// In-Memory state for live seated users & webRTC streams & camera states
let activeSeats = {}; 
let activeCameras = {}; // socketId -> { uid, cameraOn, screenOn }

// --- AUTHENTICATION & PROFILE API ENDPOINTS ---

// 0. Check Phone Registration Status Endpoint
app.post('/api/auth/check-phone', (req, res) => {
  const { phone } = req.body;
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number required' });
  }

  db.get('SELECT * FROM users WHERE phone = ? OR uid = ? OR phone LIKE ?', [cleanPhone, cleanPhone, `%${cleanPhone}`], (err, user) => {
    if (user) {
      return res.json({ exists: true, user: { uid: user.uid, name: user.name, exam_target: user.exam_target, phone: user.phone || cleanPhone } });
    }
    return res.json({ exists: false });
  });
});

// 1. Send OTP Endpoint
app.post('/api/auth/send-otp', (req, res) => {
  const { phone } = req.body;
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number required' });
  }

  const realOtp = Math.floor(100000 + Math.random() * 900000).toString(); 
  pendingOtps.set(cleanPhone, { otp: realOtp, expiresAt: Date.now() + 15 * 60 * 1000 });

  console.log(`\n=================================================`);
  console.log(`📩 OTP REQUEST FOR MOBILE +91-${cleanPhone}: [ ${realOtp} ]`);
  console.log(`=================================================\n`);

  res.json({
    success: true,
    message: 'OTP Code sent successfully',
    otp: realOtp
  });
});

// 2. Failproof Verify OTP Endpoint
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, otp, name, examTarget } = req.body;
  const cleanPhone = normalizePhone(phone);
  
  if (!cleanPhone || cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number required' });
  }

  registerOrLoginUser(cleanPhone, name, examTarget, res);
});

// 3. Update User Profile Endpoint
app.post('/api/user/profile', (req, res) => {
  const { uid, name, examTarget } = req.body;
  if (!uid) return res.status(400).json({ error: 'User ID required' });

  const newName = name || 'Aspirant';
  const newTarget = examTarget || 'General Aspirant';

  db.run(
    'UPDATE users SET name = ?, exam_target = ? WHERE uid = ?',
    [newName, newTarget, uid],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      io.emit('profile_updated', { uid, name: newName, examTarget: newTarget });
      addNotification(`📝 Aspirant ${newName} updated their profile (${newTarget})`);

      res.json({ success: true, message: 'Profile updated successfully' });
    }
  );
});

function registerOrLoginUser(rawPhone, name, examTarget, res) {
  const phone = normalizePhone(rawPhone);
  pendingOtps.delete(phone);

  const queryUser = () => {
    db.get('SELECT * FROM users WHERE phone = ? OR uid = ? OR phone LIKE ?', [phone, phone, `%${phone}`], (err, user) => {
      if (err) {
        if (err.message && err.message.includes('no such column')) {
          db.run(`ALTER TABLE users ADD COLUMN phone TEXT UNIQUE`, () => {
            queryUser();
          });
          return;
        }
        return res.status(500).json({ error: err.message });
      }

      const target = examTarget || 'UPSC / Competitive Exams';

      if (user) {
        let updateNeeded = false;
        let newName = user.name;
        let newTarget = user.exam_target || target;

        if (name && name.trim() && name !== user.name) {
          newName = name.trim();
          updateNeeded = true;
        }
        if (examTarget && examTarget !== user.exam_target) {
          newTarget = examTarget;
          updateNeeded = true;
        }

        if (updateNeeded) {
          db.run('UPDATE users SET name = ?, exam_target = ? WHERE uid = ?', [newName, newTarget, user.uid]);
          user.name = newName;
          user.exam_target = newTarget;
          io.emit('profile_updated', { uid: user.uid, name: newName, examTarget: newTarget });
        }
        addNotification(`🚪 Aspirant ${user.name} joined the library floor.`);
        return res.json({ success: true, user });
      } else {
        const newUid = 'u_' + Date.now();
        const userName = (name && name.trim()) ? name.trim() : `Aspirant ${phone.slice(-4)}`;

        db.run('INSERT INTO users (uid, phone, name, exam_target) VALUES (?, ?, ?, ?)', [newUid, phone, userName, target], (err) => {
          if (err) {
            db.run('INSERT INTO users (uid, name) VALUES (?, ?)', [newUid, userName], () => {
              res.json({ success: true, user: { uid: newUid, phone, name: userName, exam_target: target } });
            });
            return;
          }
          const newUser = { uid: newUid, phone, name: userName, exam_target: target };
          io.emit('profile_updated', { uid: newUid, name: userName, examTarget: target });
          addNotification(`🎉 New Aspirant ${userName} (${target}) registered!`);
          res.json({ success: true, user: newUser });
        });
      }
    });
  };

  queryUser();
}

// Initial Data API
app.get('/api/initial-data', (req, res) => {
  db.all("SELECT * FROM users", [], (err, users) => {
    db.all("SELECT * FROM chats ORDER BY ts ASC LIMIT 100", [], (err, chats) => {
      db.all("SELECT * FROM rooms", [], (err, rooms) => {
        db.all("SELECT * FROM study_logs ORDER BY id DESC", [], (err, logs) => {
          db.all("SELECT * FROM notifications ORDER BY id DESC LIMIT 50", [], (err, notifications) => {
            db.all("SELECT * FROM friends", [], (err, friends) => {
              res.json({
                users: users || [],
                chats: chats || [],
                rooms: rooms || [],
                logs: logs || [],
                notifications: notifications || [],
                friends: friends || [],
                activeSeats,
                activeCameras
              });
            });
          });
        });
      });
    });
  });
});

// Socket.IO Real-Time Sync
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_seat', ({ seatId, uid, kind, place, n, name }) => {
    const now = Date.now();
    activeSeats[seatId] = {
      seatId,
      uid,
      kind,
      place,
      n,
      since: now,
      status: 'seated',
      socketId: socket.id
    };
    const seatLabel = kind === 'W' ? `Window Desk W${n}` : `Table ${place} Seat S${n}`;
    const aspirantName = name || uid;
    addNotification(`🪑 ${aspirantName} took seat at ${seatLabel}`);
    io.emit('seat_updated', activeSeats);
  });

  socket.on('toggle_break', ({ seatId, name }) => {
    const seat = activeSeats[seatId];
    if (seat) {
      if (seat.status === 'seated') {
        seat.status = 'break';
        seat.breakStartedAt = Date.now();
        addNotification(`☕ ${name || 'Aspirant'} took a quick study break.`);
      } else {
        seat.status = 'seated';
        if (seat.breakStartedAt) {
          const breakDuration = Date.now() - seat.breakStartedAt;
          seat.since += breakDuration;
          delete seat.breakStartedAt;
        }
        addNotification(`⚡ ${name || 'Aspirant'} resumed studying.`);
      }
      io.emit('seat_updated', activeSeats);
    }
  });

  socket.on('leave_seat', ({ seatId, mins, seatLabel, name }) => {
    const seat = activeSeats[seatId];
    if (seat) {
      const start = seat.since;
      const end = Date.now();
      const calculatedMins = Math.max(1, Math.round((end - start) / 60000));
      const finalMins = mins && mins > 0 ? mins : calculatedMins;
      const dateKey = getLocalDateKey(end);

      db.run(
        `INSERT INTO study_logs (uid, seat_label, mins, start_time, end_time, date_key) VALUES (?, ?, ?, ?, ?, ?)`,
        [seat.uid, seatLabel, finalMins, start, end, dateKey],
        function(err) {
          if (!err) {
            const newLog = { id: this.lastID, uid: seat.uid, seat_label: seatLabel, mins: finalMins, start_time: start, end_time: end, date_key: dateKey };
            io.emit('log_added', newLog);
            addNotification(`⏱️ ${name || 'Aspirant'} completed a ${finalMins}m study session!`);
          }
        }
      );
      delete activeSeats[seatId];
      delete activeCameras[socket.id];
      io.emit('seat_updated', activeSeats);
      io.emit('camera_updated', activeCameras);
    }
  });

  socket.on('toggle_camera', ({ uid, active, isScreen, name }) => {
    if (active) {
      activeCameras[socket.id] = { socketId: socket.id, uid, cameraOn: !isScreen, screenOn: !!isScreen };
      addNotification(`📹 ${name || 'Aspirant'} turned on their ${isScreen ? 'screen share' : 'study camera'}`);
    } else {
      delete activeCameras[socket.id];
    }
    io.emit('camera_updated', activeCameras);
  });

  // Cross-Device Realtime Video Frame Snapshot Broadcast for Camera Viewers
  socket.on('video_frame', (data) => {
    // data: { uid, frameData }
    socket.broadcast.emit('video_frame_received', { socketId: socket.id, uid: data.uid, frameData: data.frameData });
  });

  socket.on('send_chat', (data) => {
    const { uid, room, text, ts } = data;
    db.run(
      `INSERT INTO chats (uid, room, text, ts) VALUES (?, ?, ?, ?)`,
      [uid, room, text, ts],
      function(err) {
        if (!err) {
          const newMsg = { id: this.lastID, uid, room, text, ts };
          io.emit('new_chat', newMsg);
        }
      }
    );
  });

  socket.on('create_room', (roomData) => {
    const { id, name, host, page, ts } = roomData;
    db.run(
      `INSERT INTO rooms (id, name, host, page, ts) VALUES (?, ?, ?, ?, ?)`,
      [id, name, host, page || 1, ts || Date.now()],
      (err) => {
        if (!err) {
          io.emit('room_created', roomData);
          addNotification(`📚 New study group created: ${name}`);
        }
      }
    );
  });

  socket.on('delete_room', ({ roomId, uid: requesterUid }) => {
    db.get('SELECT * FROM rooms WHERE id = ?', [roomId], (err, room) => {
      if (room && room.host === requesterUid) {
        db.run('DELETE FROM rooms WHERE id = ?', [roomId], (err) => {
          if (!err) {
            io.emit('room_deleted', { roomId });
            addNotification(`🗑️ Study room "${room.name}" was closed by host.`);
          }
        });
      }
    });
  });

  socket.on('upload_pdf', ({ roomId, pdfName, pdfData, uploaderUid }) => {
    db.run(
      `UPDATE rooms SET pdf_name = ?, pdf_data = ?, pdf_uploader = ?, page = 1 WHERE id = ?`,
      [pdfName, pdfData, uploaderUid, roomId],
      (err) => {
        if (!err) {
          io.emit('pdf_uploaded', { roomId, pdfName, pdfData, pdfUploader: uploaderUid, page: 1 });
          addNotification(`📄 New document uploaded in study room: ${pdfName}`);
        }
      }
    );
  });

  socket.on('delete_pdf', ({ roomId, uid: requesterUid }) => {
    db.get('SELECT * FROM rooms WHERE id = ?', [roomId], (err, room) => {
      if (room && (room.pdf_uploader === requesterUid || room.host === requesterUid)) {
        db.run(
          `UPDATE rooms SET pdf_name = NULL, pdf_data = NULL, pdf_uploader = NULL, page = 1 WHERE id = ?`,
          [roomId],
          (err) => {
            if (!err) {
              io.emit('pdf_deleted', { roomId });
              addNotification(`🗑️ PDF removed from study room "${room.name}".`);
            }
          }
        );
      }
    });
  });

  socket.on('sync_pdf_page', ({ roomId, page }) => {
    db.run(`UPDATE rooms SET page = ? WHERE id = ?`, [page, roomId], () => {
      io.emit('pdf_page_changed', { roomId, page });
    });
  });

  socket.on('send_friend_request', ({ fromUid, toUid, fromName }) => {
    const ts = Date.now();
    db.run(
      `INSERT OR REPLACE INTO friends (user_id, friend_id, status, ts) VALUES (?, ?, ?, ?)`,
      [fromUid, toUid, 'pending', ts],
      function(err) {
        if (!err) {
          const friendObj = { id: this.lastID, user_id: fromUid, friend_id: toUid, status: 'pending', ts };
          io.emit('friend_updated', friendObj);
          addNotification(`🤝 ${fromName || 'An aspirant'} sent a friend request!`);
        }
      }
    );
  });

  socket.on('accept_friend_request', ({ fromUid, toUid, toName }) => {
    const ts = Date.now();
    db.run(
      `UPDATE friends SET status = 'accepted', ts = ? WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      [ts, fromUid, toUid, toUid, fromUid],
      function(err) {
        if (!err) {
          const friendObj = { user_id: fromUid, friend_id: toUid, status: 'accepted', ts };
          io.emit('friend_updated', friendObj);
          addNotification(`🎉 You and ${toName || 'Aspirant'} are now study friends!`);
        }
      }
    );
  });

  socket.on('remove_friend', ({ fromUid, toUid }) => {
    db.run(
      `DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      [fromUid, toUid, toUid, fromUid],
      function(err) {
        if (!err) {
          io.emit('friend_removed', { user_id: fromUid, friend_id: toUid });
        }
      }
    );
  });

  socket.on('disconnect', () => {
    // Auto-save active study session if user disconnected or closed tab while seated
    Object.keys(activeSeats).forEach(seatId => {
      const seat = activeSeats[seatId];
      if (seat && seat.socketId === socket.id) {
        const start = seat.since;
        const end = Date.now();
        let liveMs = end - start;
        if (seat.status === 'break' && seat.breakStartedAt) {
          liveMs -= (end - seat.breakStartedAt);
        }
        const calculatedMins = Math.max(1, Math.round(liveMs / 60000));
        const seatLabel = seat.kind === 'W' ? `Window Desk W${seat.n}` : `Table ${seat.place} Seat S${seat.n}`;
        const dateKey = getLocalDateKey(end);
        const uid = seat.uid;

        db.run(
          `INSERT INTO study_logs (uid, seat_label, mins, start_time, end_time, date_key) VALUES (?, ?, ?, ?, ?, ?)`,
          [uid, seatLabel, calculatedMins, start, end, dateKey],
          function(err) {
            if (!err) {
              const newLog = { id: this.lastID, uid, seat_label: seatLabel, mins: calculatedMins, start_time: start, end_time: end, date_key: dateKey };
              io.emit('log_added', newLog);
              addNotification(`⏱️ Aspirant session of ${calculatedMins}m saved on disconnect.`);
            }
          }
        );
        delete activeSeats[seatId];
      }
    });
    delete activeCameras[socket.id];
    io.emit('seat_updated', activeSeats);
    io.emit('camera_updated', activeCameras);
    console.log('User disconnected socket:', socket.id);
  });
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  const localIp = getLocalIp();
  console.log(`\n=================================================`);
  console.log(`🚀 SAANKALP Virtual Library Server is Live!`);
  console.log(`💻 Local PC Access:      http://localhost:${PORT}`);
  console.log(`📱 Mobile / Network URL: http://${localIp}:${PORT}`);
  console.log(`=================================================\n`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const ALT_PORT = Number(PORT) + 1;
    const localIp = getLocalIp();
    console.log(`Port ${PORT} in use, starting on http://${localIp}:${ALT_PORT}`);
    server.listen(ALT_PORT, HOST);
  } else {
    console.error('Server error:', err);
  }
});
