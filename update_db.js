const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'saankalp.db'), (err) => {
  if (err) {
    console.error("DB connection error:", err);
    process.exit(1);
  }
  console.log("Connected to saankalp.db");
});

db.serialize(() => {
  db.run("ALTER TABLE users ADD COLUMN phone TEXT", (err) => {
    if (err) console.log("Phone column notice:", err.message);
    else console.log("Added phone column to users table.");
  });

  db.run("ALTER TABLE users ADD COLUMN exam_target TEXT DEFAULT 'General Aspirant'", (err) => {
    if (err) console.log("Exam target column notice:", err.message);
    else console.log("Added exam_target column to users table.");
  });

  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone)", (err) => {
    if (err) console.log("Index notice:", err.message);
  });

  db.run("UPDATE users SET phone = '9876543210' WHERE uid = 'user_demo'");
  db.run("UPDATE users SET phone = '9876543211' WHERE uid = 'u101'");
  db.run("UPDATE users SET phone = '9876543212' WHERE uid = 'u102'");
  db.run("UPDATE users SET phone = '9876543213' WHERE uid = 'u103'");
  db.run("UPDATE users SET phone = '9876543214' WHERE uid = 'u104'");

  db.all("SELECT * FROM users", [], (err, rows) => {
    console.log("\n--- Current Users in Database ---");
    console.log(rows);
    process.exit(0);
  });
});
