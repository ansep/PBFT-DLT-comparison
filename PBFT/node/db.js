const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("data/data.db");
const { exec } = require("child_process");

// Ensure the state table exists; create it if it doesn't
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS state (
      username TEXT PRIMARY KEY,
      balance INTEGER,
      email TEXT,
      phone TEXT
    )`);

  const initialData = [
    {
      username: "alice",
      balance: 500,
      email: "alice@example.com",
      phone: "123-456-7890",
    },
    {
      username: "bob",
      balance: 500,
      email: "bob@example.com",
      phone: "234-567-8901",
    },
    {
      username: "charlie",
      balance: 500,
      email: "charlie@example.com",
      phone: "345-678-9012",
    },
    {
      username: "david",
      balance: 500,
      email: "david@example.com",
      phone: "456-789-0123",
    },
    {
      username: "eve",
      balance: 500,
      email: "eve@example.com",
      phone: "567-890-1234",
    },
    {
      username: "frank",
      balance: 500,
      email: "frank@example.com",
      phone: "678-901-2345",
    },
    {
      username: "grace",
      balance: 500,
      email: "grace@example.com",
      phone: "789-012-3456",
    },
    {
      username: "henry",
      balance: 500,
      email: "henry@example.com",
      phone: "890-123-4567",
    },
    {
      username: "ivy",
      balance: 500,
      email: "ivy@example.com",
      phone: "901-234-5678",
    },
    {
      username: "jack",
      balance: 500,
      email: "jack@example.com",
      phone: "012-345-6789",
    },
  ];

  // Insert initial data into the state table
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO state(username, balance, email, phone) VALUES (?, ?, ?, ?)"
  );
  initialData.forEach(({ username, balance, email, phone }) => {
    stmt.run(username, balance, email, phone);
  });
  stmt.finalize();

  db.run(`CREATE TABLE IF NOT EXISTS consensus (
      type TEXT,
      seq INTEGER,
      client TEXT,
      message TEXT,
      sender TEXT,
      decision BOOLEAN,
      round INTEGER,
      timestamp INTEGER,
      PRIMARY KEY (type, seq, client, sender, round)
    )`);
});

// Function to run SQL queries
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    // Check if the query is a SELECT statement or not
    const isSelect = sql.trim().startsWith("SELECT");

    if (isSelect) {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    } else {
      db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    }
  });
}

// Function to close the database connection
function close() {
  db.close();
}

function exportDatabase(dbPath, outputFilePath) {
  return new Promise((resolve, reject) => {
    const command = `sqlite3 -header -csv ${dbPath} "select * from state; select * from consensus;" > ${outputFilePath}`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`Error exporting database: ${stderr}`);
      } else {
        resolve(`Database exported successfully to ${outputFilePath}`);
      }
    });
  });
}

module.exports = {
  query,
  close,
  exportDatabase,
};
