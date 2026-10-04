const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'virtual_library.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database: virtual_library.db');
  }
});

function initDatabase() {
  db.serialize(() => {
    // 1. Books / Resources Table
    db.run(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        cover_color TEXT DEFAULT '#4f46e5',
        status TEXT DEFAULT 'available', -- 'available', 'borrowed'
        rating REAL DEFAULT 4.8,
        pages INTEGER DEFAULT 350,
        pdf_url TEXT DEFAULT '',
        borrowed_by TEXT DEFAULT NULL,
        due_date TEXT DEFAULT NULL
      )
    `);

    // 2. Study Sessions / Rooms Table
    db.run(`
      CREATE TABLE IF NOT EXISTS study_rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        capacity INTEGER DEFAULT 10,
        current_occupants INTEGER DEFAULT 0,
        room_type TEXT DEFAULT 'quiet' -- 'quiet', 'pomodoro', 'group'
      )
    `);

    // 3. User Shared Notes Table
    db.run(`
      CREATE TABLE IF NOT EXISTS study_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT NOT NULL,
        subject TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        likes INTEGER DEFAULT 0
      )
    `);

    // 4. Study Activity Log
    db.run(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed Books if empty
    db.get('SELECT COUNT(*) as count FROM books', [], (err, row) => {
      if (err) return;
      if (row.count === 0) {
        console.log('Seeding initial books...');
        const initialBooks = [
          [
            'Introduction to Algorithms & Data Structures',
            'Dr. Thomas Cormen',
            'Computer Science',
            'Fundamental algorithms, dynamic programming, graph algorithms, and asymptotic complexity analysis for students.',
            'linear-gradient(135deg, #4f46e5, #7c3aed)',
            'available',
            4.9,
            840
          ],
          [
            'Quantum Mechanics for Curious Minds',
            'Prof. Richard Feynman',
            'Physics',
            'A conceptual and mathematical journey into wave mechanics, superposition, entanglement, and quantum states.',
            'linear-gradient(135deg, #2563eb, #06b6d4)',
            'available',
            4.8,
            412
          ],
          [
            'Linear Algebra Done Right',
            'Sheldon Axler',
            'Mathematics',
            'Proof-oriented approach focusing on vector spaces, linear operators, eigenvalues, and inner product spaces.',
            'linear-gradient(135deg, #059669, #10b981)',
            'available',
            4.7,
            380
          ],
          [
            'Artificial Intelligence: Modern Approach',
            'Stuart Russell & Peter Norvig',
            'Computer Science',
            'Comprehensive guide covering search trees, machine learning, neural networks, logic systems, and robotics.',
            'linear-gradient(135deg, #d97706, #f59e0b)',
            'available',
            4.9,
            1150
          ],
          [
            'Principles of Cognitive Psychology',
            'Dr. Sarah Jenkins',
            'Psychology',
            'Exploring human memory systems, attention span mechanisms, problem solving, and neural pathways of learning.',
            'linear-gradient(135deg, #ec4899, #8b5cf6)',
            'available',
            4.6,
            290
          ],
          [
            'Organic Chemistry: Structure & Reactivity',
            'Prof. Jonathan Clayden',
            'Chemistry',
            'In-depth breakdown of reaction mechanisms, stereochemistry, synthesis pathways, and molecular orbitals.',
            'linear-gradient(135deg, #e11d48, #f43f5e)',
            'available',
            4.8,
            620
          ],
          [
            'Macroeconomics & Global Markets',
            'Dr. Paul Krugman',
            'Economics',
            'Understanding monetary policy, inflation metrics, international trade models, and fiscal dynamics.',
            'linear-gradient(135deg, #0d9488, #14b8a6)',
            'available',
            4.5,
            510
          ],
          [
            'Clean Architecture & Code Craftsmanship',
            'Robert C. Martin',
            'Software Engineering',
            'Practical principles for software design, decoupled modules, testing strategies, and maintainable systems.',
            'linear-gradient(135deg, #6366f1, #3b82f6)',
            'available',
            4.9,
            430
          ]
        ];

        const stmt = db.prepare(`
          INSERT INTO books (title, author, category, description, cover_color, status, rating, pages)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        initialBooks.forEach(b => stmt.run(b));
        stmt.finalize();
      }
    });

    // Seed Study Rooms if empty
    db.get('SELECT COUNT(*) as count FROM study_rooms', [], (err, row) => {
      if (err) return;
      if (row.count === 0) {
        console.log('Seeding study rooms...');
        const initialRooms = [
          ['Silent Reading Sanctuary', 'Strictly silent environment for deep focus, reading, and exam preparation.', 20, 'quiet'],
          ['Pomodoro Focus Zone', 'Group timer synchronized for 25-min study and 5-min rest cycles.', 15, 'pomodoro'],
          ['CS & Math Collaborative Hub', 'Open chat for solving problem sets, algorithm discussions, and coding.', 12, 'group'],
          ['Late Night Study Lounge', 'Calm lo-fi background ambiance and active streak study sessions.', 25, 'quiet']
        ];

        const stmt = db.prepare(`
          INSERT INTO study_rooms (name, description, capacity, room_type)
          VALUES (?, ?, ?, ?)
        `);

        initialRooms.forEach(r => stmt.run(r));
        stmt.finalize();
      }
    });

    // Seed Study Notes if empty
    db.get('SELECT COUNT(*) as count FROM study_notes', [], (err, row) => {
      if (err) return;
      if (row.count === 0) {
        console.log('Seeding study notes...');
        const initialNotes = [
          ['Alex Developer', 'Computer Science', 'Big O Notation Cheatsheet', 'O(1) Constant, O(log N) Binary Search, O(N) Linear, O(N log N) Merge Sort, O(N^2) Nested Loops. Always aim for O(N log N) or better on large datasets!'],
          ['Elena Physics', 'Physics', 'Quantum Superposition Formula', 'The wave function |Ψ⟩ = α|0⟩ + β|1⟩ where |α|^2 + |β|^2 = 1. Measurement collapses the state to eigenbasis.'],
          ['Marcus Math', 'Mathematics', 'Eigenvalues Quick Tip', 'To find eigenvalues λ, solve det(A - λI) = 0. Trace of matrix equals sum of eigenvalues, determinant equals product!']
        ];

        const stmt = db.prepare(`
          INSERT INTO study_notes (user_name, subject, title, content)
          VALUES (?, ?, ?, ?)
        `);

        initialNotes.forEach(n => stmt.run(n));
        stmt.finalize();
      }
    });

  });
}

module.exports = { db, initDatabase };
