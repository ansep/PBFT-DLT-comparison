// node/pbft.js
const express = require("express");
const bodyParser = require("body-parser");
const db = require("./db");
const axios = require("axios");
const net = require("net");
const app = express();
const crypto = require("crypto");
app.use(bodyParser.json());

const nodes = [
  "http://node1:3000",
  "http://node2:3000",
  "http://node3:3000",
  "http://node4:3000",
];

let currentState = {};
let log = [];
let view = 0; // View number
let primary = nodes[view % nodes.length];
let sequenceNumber = 0; // Message sequence number
let prepareCount = {};
let commitCount = {};
let replies = {};
let consensusReached = {};
let socketClient = {};

// Failure detection variables
let lastPrimaryCheck = Date.now();
const PRIMARY_CHECK_INTERVAL = 5000; // Check primary status every 5 seconds

// Track which nodes are suspected faulty
let faultyNodes = new Set();

function broadcast(message) {
  console.log(`Broadcasting message: ${JSON.stringify(message)}`);
  nodes.forEach((node) => {
    if (
      node !== `http://${process.env.HOSTNAME}:3000` &&
      !faultyNodes.has(node)
    ) {
      axios.post(`${node}/message`, message).catch(console.error);
    }
  });
}

function switchView() {
  view = (view + 1) % nodes.length;
  primary = nodes[view];
  console.log(`Switched to view ${view}. Primary: ${primary}`);
}

async function handleRequest(data, hash, seq, socket) {
  console.log("Handling Request");
  console.log("Data", data);
  // Ensure consensusReached is initially set to false
  consensusReached[seq] = false;
  console.log(consensusReached[seq]);
  socketClient[seq] = socket;
  try {
    // Check if the request is a transaction or a state request
    if (data.type === undefined) {
      if (isPrimary()) {
        console.log("Node is primary, broadcasting PrePrepare");
        broadcast({
          type: "pre-prepare",
          data,
          sent_by: `http://${process.env.HOSTNAME}:3000`,
          hash,
          seq,
        });
      }

      //   // Await for consensus to be reached
      //   await new Promise((resolve) => {
      //     const interval = setInterval(() => {
      //       if (consensusReached[seq]) {
      //         clearInterval(interval);
      //         resolve();
      //       }
      //     }, 1000); // Check every second for consensus

      //     // Update balances in the database
      //   });

      //   updateBalancesInDatabase(from, to, amount, socket);
      //   } else {
      //     console.error(
      //       `Insufficient balance for transaction: ${JSON.stringify(data)}`
      //     );
      //     socket.write(
      //       `Insufficient balance for transaction: ${JSON.stringify(data)}`
      //     );
      //   }
    } else if (data.type === "get_state") {
      //TODO: do same way of transaction
      console.log("Node is primary, broadcasting PrePrepare for get_state");
      broadcast({ type: "pre-prepare", data, seq });

      // Await for consensus to be reached
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (consensusReached[seq]) {
            clearInterval(interval);
            resolve();
          }
        }, 1000); // Check every second for consensus

        // Once consensus is reached, send current state response
        const stateResponse = {
          type: "state_response",
          data: getCurrentState(), // Retrieve the current state from the database
          seq: seq,
        };
        socket.write(JSON.stringify(stateResponse));
      });
    } else {
      console.error("Invalid request type:", data.type);
      socket.write(`Invalid request type: ${data.type}`);
    }
  } catch (error) {
    console.error("Error handling request:", error.message);
    socket.write(`Error handling request: ${error.message}`);
  }
}

async function getCurrentState() {
  try {
    const rows = await db.query("SELECT username, balance FROM state");
    const state = {};
    rows.forEach((row) => {
      state[row.username] = { balance: row.balance };
    });
    console.log("Current state retrieved:", state);
    return state;
  } catch (error) {
    console.error("Error retrieving current state:", error.message);
    throw error;
  }
}

async function accountExists(account) {
  try {
    const result = await db.query(
      "SELECT COUNT(*) AS count FROM state WHERE username = ?",
      [account]
    );
    return result[0].count > 0;
  } catch (error) {
    console.error("Error checking account existence:", error.message);
    return false;
  }
}

async function getBalance(account) {
  try {
    const result = await db.query(
      "SELECT balance FROM state WHERE username = ?",
      [account]
    );
    return result[0].balance || 0;
  } catch (error) {
    console.error("Error fetching balance:", error.message);
    return 0;
  }
}

async function updateBalancesInDatabase(from, to, amount, socket) {
  try {
    console.log("Consensus reached for message ", {
      transaction: { from, to, amount },
    });
    const message = {
      type: "Reply",
      success: true,
      transaction: { from, to, amount },
    };
    socket.write(JSON.stringify(message));
  } catch (error) {
    console.error("Error updating balances:", error.message);
    // Handle error appropriately, e.g., logging or sending an error message
    const errorMessage = {
      type: "Reply",
      success: false,
      error: error.message,
    };
    socket.write(JSON.stringify(errorMessage));
  }
}

function handlePrePrepare(data, sent_by, hash, seq) {
  console.log("Handling PrePrepare");

  // Verify that the pre-prepare message is sent by the current primary
  // TODO: Check if is checking the view
  if (sent_by === primary) {
    console.log(
      "PrePrepare message is from the primary. Broadcasting prepare."
    );
    broadcast({
      type: "prepare",
      view,
      seq,
      hash,
      sent_by: `http://${process.env.HOSTNAME}:3000`,
      data,
    });
  } else {
    console.warn(
      `PrePrepare message not from primary. Ignored. Expected from: ${primary}, but got from: ${sent_by}`
    );
  }
}

let broadcastedCommits = {}; // Track broadcasted commit messages

function handlePrepare(data, sent_by, hash, seq) {
  //TODO: check view of prepare
  console.log("Handling Prepare");
  if (prepareCount[seq] === undefined) {
    prepareCount[seq] = [sent_by];
  } else {
    if (!prepareCount[seq].includes(sent_by)) {
      prepareCount[seq].push(sent_by);
    }
  }
  console.log(`Prepare count for seq ${seq}: ${prepareCount[seq].length}`);

  // Calculate the required prepare count to reach consensus
  const requiredPrepareCount = Math.floor((2 * (nodes.length - 1)) / 3);

  if (prepareCount[seq].length >= requiredPrepareCount) {
    // Ensure the commit message is only broadcasted once
    if (!broadcastedCommits[seq]) {
      broadcastedCommits[seq] = true; // Mark the commit message as broadcasted
      broadcast({
        type: "commit",
        view,
        seq,
        hash,
        sent_by: `http://${process.env.HOSTNAME}:3000`,
        data,
      });
    } else {
      console.log(`Commit message for seq ${seq} already broadcasted.`);
    }
  }
}

async function handleCommit(data, sent_by, hash, seq) {
  console.log("Handling Commit");

  // Initialize commit count for this sequence number if it doesn't exist
  if (commitCount[seq] === undefined) {
    commitCount[seq] = [sent_by];
  } else {
    if (!commitCount[seq].includes(sent_by)) {
      commitCount[seq].push(sent_by);
    }
  }
  console.log(`Commit count for seq ${seq}: ${commitCount[seq].length}`);

  // Check if consensus is reached
  if (commitCount[seq].length >= Math.floor((2 * (nodes.length - 1)) / 3)) {
    if (!consensusReached[seq]) {
      consensusReached[seq] = true;
      console.log(consensusReached[seq]);
      console.log("Socket seq commit", socketClient[seq]);

      const { from, to, amount } = data; // Ensure `from`, `to`, and `amount` are correctly accessed from `data`

      const fromExists = await accountExists(from);
      const toExists = await accountExists(to);

      if (!fromExists || !toExists) {
        const errorMessage = {
          type: "Reply",
          success: false,
          error: `One or more accounts do not exist`,
        };
        console.error(`One or more accounts do not exist`);
        socketClient[seq].write(JSON.stringify(errorMessage));
        return;
      }

      // Check balance before proceeding
      const fromBalance = await getBalance(from);

      if (fromBalance >= amount) {
        try {
          console.log(`Updating database: ${amount} from ${from} to ${to}`);
          db.query(
            "UPDATE state SET balance = balance - ? WHERE username = ?",
            [amount, from]
          );
          db.query(
            "UPDATE state SET balance = balance + ? WHERE username = ?",
            [amount, to]
          );

          // Send confirmation to the original requester (if socket is provided)
          if (socketClient[seq]) {
            const message = {
              type: "Reply",
              success: true,
              transaction: { from, to, amount },
            };
            socketClient[seq].write(JSON.stringify(message));
          }
        } catch (error) {
          console.error("Error updating balances:", error.message);
          const errorMessage = {
            type: "Reply",
            success: false,
            error: error.message,
          };
          socketClient[seq].write(JSON.stringify(errorMessage));
        }
      } else {
        console.error(
          `Insufficient balance for transaction: ${JSON.stringify(data)}`
        );
        const errorMessage = {
          type: "Reply",
          success: false,
          error: `Insufficient balance for transaction: ${JSON.stringify(
            data
          )}`,
        };
        socketClient[seq].write(JSON.stringify(errorMessage));
      }
    }
  }
}

// function handleReply(data, seq) {
//     console.log("Handling Reply");
//     replies[seq] = (replies[seq] || 0) + 1;
//     console.log(`Reply count for seq ${seq}: ${replies[seq]}`);
//     if (replies[seq] >= Math.floor((2 * (nodes.length - 1)) / 3)) {
//         console.log('Return. Msg:', data);
//     }
// }

function isPrimary() {
  return `http://${process.env.HOSTNAME}:3000` === primary;
}

function checkPrimaryHealth() {
  const now = Date.now();
  if (
    now - lastPrimaryCheck >= PRIMARY_CHECK_INTERVAL &&
    primary !== `http://${process.env.HOSTNAME}:3000`
  ) {
    lastPrimaryCheck = now;
    axios
      .get(`${primary}/health`) // Adjust to your actual health endpoint path
      .then((response) => {
        // Primary responded, reset suspicion
        if (faultyNodes.has(primary)) {
          console.log(`Primary ${primary} recovered`);
          faultyNodes.delete(primary);
        }
      })
      .catch((error) => {
        // Primary didn't respond, mark as faulty
        if (!faultyNodes.has(primary)) {
          faultyNodes.add(primary);
          console.error(`Primary ${primary} suspected faulty`);
          switchView();
        }
      });
  }
}

// Health endpoint route
app.get("/health", (req, res) => {
  // Customize health check logic based on node's actual health criteria
  const healthStatus = {
    status: "OK",
    node: process.env.HOSTNAME,
  };
  res.json(healthStatus);
});

app.post("/transaction", async (req, res) => {
  console.log("Transaction endpoint hit");
  const data = req.body;
  const seq = sequenceNumber++;

  // Example: Check balance before proceeding
  const { from, to, amount } = data;
  const fromBalance = await getBalance(from); // Replace with actual function to get balance

  if (fromBalance >= amount && isPrimary) {
    msg_to_send = { from, to, amount };
    console.log("Node is primary, broadcasting PrePrepare");
    broadcast({
      type: "pre-prepare",
      data: { ...data, sent_by: `http://${process.env.HOSTNAME}:3000` },
      seq,
    });

    // Await for consensus to be reached
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (consensusReached[seq]) {
          clearInterval(interval);
          resolve();
        }
      }, 1000); // Check every second for consensus

      // Example: Deduct balance from sender's account after consensus
      // For simplicity, this should be done atomically in a real scenario
      currentState[from] -= amount;
      currentState[to] = (currentState[to] || 0) + amount;
      console.log(`Transaction completed: ${amount} from ${from} to ${to}`);
    });

    // Once consensus is reached, send response
    const responseMessage = `Consensus reached for transaction: ${JSON.stringify(
      data
    )}`;
    res.send(responseMessage);
  } else {
    console.error(
      `Insufficient balance for transaction: ${JSON.stringify(data)}`
    );
    res
      .status(400)
      .send(`Insufficient balance for transaction: ${JSON.stringify(data)}`);
  }
});

app.post("/message", (req, res) => {
  const { type, data, sent_by, hash, seq } = req.body;
  log.push({ type, data, seq });
  console.log(
    `Message received: ${type}, Data: ${JSON.stringify(
      data
    )}, Sent by: ${sent_by}, Seq: ${seq}, Hash: ${hash}`
  );
  // Check hash of received message
  const computedHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ data, seq }))
    .digest("hex");
  if (computedHash !== req.body.hash) {
    console.error(
      `Hash mismatch. Expected ${req.body.hash}, but got ${computedHash}`
    );
  } else {
    switch (type) {
      case "pre-prepare":
        handlePrePrepare(data, sent_by, hash, seq);
        break;
      case "prepare":
        handlePrepare(data, sent_by, hash, seq);
        break;
      case "commit":
        handleCommit(data, sent_by, hash, seq);
        break;
      case "reply":
        handleReply(data, sent_by, hash, seq);
        break;
      case "get_state":
        // Send the current state back
        const responseMessage = {
          type: "state_response",
          data: currentState,
          seq: seq,
        };
        res.json(responseMessage);
        break;
    }
    res.sendStatus(200);
  }
});

// Periodically check primary health
setInterval(checkPrimaryHealth, PRIMARY_CHECK_INTERVAL);

// TCP Server to receive messages from client
const tcpServer = net.createServer((socket) => {
  socket.on("data", (data) => {
    try {
      const message = JSON.parse(data).message;
      const hash = JSON.parse(data).hash;
      const { type, data: msgData, seq } = message;
      log.push({ type, data: msgData, seq });
      console.log(
        `TCP Message received: ${type}, Data: ${JSON.stringify(
          msgData
        )}, Seq: ${seq}, Hash: ${hash}`
      );

      // Check hash of received message
      const computedHash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ data: msgData, seq }))
        .digest("hex");
      if (computedHash !== hash) {
        console.error(
          `Hash mismatch. Expected ${hash}, but got ${computedHash}`
        );
      } else {
        switch (type) {
          case "request":
            handleRequest(msgData, hash, seq, socket);
            break;
          case "pre-prepare":
            handlePrePrepare(msgData, seq);
            break;
          case "prepare":
            handlePrepare(msgData, seq);
            break;
          case "commit":
            handleCommit(msgData, seq);
            break;
          case "reply":
            handleReply(msgData, seq);
            break;
          case "get_state":
            handleRequest(message, seq, socket);
            break;
        }
      }
    } catch (err) {
      console.error("Error processing TCP message:", err);
    }
  });

  socket.on("error", (err) => {
    console.error("TCP connection error:", err);
  });

  socket.on("close", () => {
    console.log("TCP connection closed");
  });
});

tcpServer.listen(4000, () => {
  console.log("TCP server listening on port 4000");
});

const port = 3000;
app.listen(port, () => {
  console.log(`PBFT node running on ${process.env.HOSTNAME}:3000`);
  console.log(`Initial view: ${primary}`);
});
