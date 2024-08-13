// node/pbft.js
const express = require("express");
const bodyParser = require("body-parser");
const db = require("./db");
const axios = require("axios");
const net = require("net");
const app = express();
const crypto = require("crypto");
const fs = require("fs");
app.use(bodyParser.json());

const nodes = [
  "http://node1:3000",
  "http://node2:3000",
  "http://node3:3000",
  "http://node4:3000",
];

// To have first primary as faulty, put at false if you want normal behaviour
let faulty_example = false;
if (`http://${process.env.HOSTNAME}:3000` == "http://node1:3000"){
  faulty_example = true
} else{
  faulty_example = false
}

let currentState = {};
let log = [];
let view = 0; // View number
let primary = nodes[view % nodes.length];
let sequenceNumber = 0; // Message sequence number
let prePrepareCount = {};
let prepareCount = {};
let commitCount = {};
let replies = {};
let consensusReached = {};
let faultyNodes = new Set();
let socketClient = {};

const privateKeyPath = "./privateKey.pem";
const publicKeyPath = "./publicKey.pem";
const clientPublicKeyPath = "./public_key_client.pem";
const publicKeys = new Map(); // Store public keys with node address as key

// Calculate the required prepare count to reach consensus
const requiredPrepareCount = Math.floor((2 * (nodes.length - 1)) / 3);

function generateKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  // Save the keys to files
  fs.writeFileSync(
    privateKeyPath,
    privateKey.export({ type: "pkcs1", format: "pem" })
  );
  fs.writeFileSync(
    publicKeyPath,
    publicKey.export({ type: "spki", format: "pem" })
  );
}

function keysExist() {
  return fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath);
}

function distributePublicKey() {
  const publicKey = fs.readFileSync(publicKeyPath, "utf8");
  nodes.forEach((node) => {
    // if (node !== `http://${process.env.HOSTNAME}:3000`) {
    axios
      .post(`${node}/receivePublicKey`, {
        publicKey,
        nodeAddress: `http://${process.env.HOSTNAME}:3000`,
      })
      .catch(console.error);
    // }
  });
}

function initializeNode() {
  if (!keysExist()) {
    // console.log("Generating new keys for the node...");
    generateKeys();
  }
  setTimeout(distributePublicKey, 1000);
}

initializeNode();

// Failure detection variables
let lastHealthCheck = Date.now();
const HEALTH_CHECK_INTERVAL = 10000; // Check nodes health every 5 seconds

// Track which nodes are suspected faulty
let crashedNodes = new Set();

function signMessage(message) {
  const privateKey = fs.readFileSync(privateKeyPath, "utf8");
  const signer = crypto.createSign("SHA256");
  signer.update(JSON.stringify(message));
  const signature = signer.sign(privateKey, "base64");

  return {
    message,
    signature,
  };
}

function verifySignature(data, publicKey) {
  const verifier = crypto.createVerify("SHA256");
  verifier.update(JSON.stringify(data.message));
  return verifier.verify(publicKey, data.signature, "base64");
}

function broadcast(message) {
  console.log(`Broadcasting message: ${JSON.stringify(message)}`);
  nodes.forEach((node) => {
    if (
      // Considering broadcast also to self
      // node !== `http://${process.env.HOSTNAME}:3000` &&
      !crashedNodes.has(node)
    ) {
      axios.post(`${node}/message`, message).catch(console.error);
    }
  });
}

function switchView() {
  // Find next view that is not faulty
  while (crashedNodes.has(nodes[view]) || faultyNodes.has(nodes[view])) {
    view = (view + 1) % nodes.length;
  }
  primary = nodes[view];
  console.log(`Switched to view ${view}. Primary: ${primary}`);
}

function sendFaultyMessage(clientSignedMessage) {
  faulty_example = false
  const { message, signature } = clientSignedMessage;
  const { type, data, seq, client } = message;
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(message))
    .digest("hex");
  let i = 0;
  nodes.forEach((node) => {
    const modifiedSeq = seq + i; // Cambia il seq per ogni nodo
    const body = {
      type: "pre-prepare",
      client,
      seq: modifiedSeq,
      hash,
      sent_by: `http://${process.env.HOSTNAME}:3000`,
    };
    const { signature } = signMessage(body);
    broadcastToNode(node, { body, signature, clientSignedMessage });
    i += 1;
  });
}

function broadcastToNode(node, message) {
  console.log(`Broadcasting message: ${JSON.stringify(message)}`);
  if (
      // Considering broadcast also to self
      // node !== `http://${process.env.HOSTNAME}:3000` &&
      !crashedNodes.has(node)
    ) {
      axios.post(`${node}/message`, message).catch(console.error);
    };
}


async function handleRequest(clientSignedMessage, socket) {
  const { message, signature } = clientSignedMessage;
  const { type, data, seq, client } = message;
  log.push({ type, data, seq, client });
  console.log(
    `TCP Message received: ${type}, Data: ${JSON.stringify(data)}, Seq: ${seq}`
  );

  console.log("Handling Request");
  // Ensure consensusReached is initially set to false
  consensusReached[seq] = false;
  console.log(consensusReached[seq]);
  socketClient[seq] = socket;
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(message))
    .digest("hex");
  try {

    setTimeout(() => {
      if (!consensusReached[seq]) {
        console.log("Timeout reached. Consensus not achieved.");
        if (isPrimary()) {
          handleRequest_afterFaulty(clientSignedMessage);
        }
      }
    }, 10000);

    // Check if the request is a transaction or a state request
    if (data.type === undefined) {
      if (isPrimary()) {
        console.log("Node is primary, broadcasting PrePrepare");
        if (faulty_example == false){
          const body = {
            type: "pre-prepare",
            client,
            seq,
            hash,
            sent_by: `http://${process.env.HOSTNAME}:3000`,
          };
          const { signature } = signMessage(body);

          broadcast({ body, signature, clientSignedMessage });
        } else {
          sendFaultyMessage(clientSignedMessage);
        }
      }
    } else if (data.type === "get_state") {
      //TODO: do same way of transaction
      console.log("Node is primary, broadcasting PrePrepare for get_state");
      broadcast({ type: "pre-prepare", data, seq });
    } else {
      console.error("Invalid request type:", data.type);
      const errorMessage = {
        body: {
          type: "error",
          message: `Invalid request type: ${data.type}`,
          success: false,
        },
      };
      socket.write(JSON.stringify(errorMessage));
    }
  } catch (error) {
    console.error("Error handling request:", error.message);
    const errorMessage = {
      body: {
        type: "error",
        message: error.message,
        success: false,
      },
    };
    socket.write(errorMessage);
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

function handleRequest_afterFaulty(clientSignedMessage) {
  const { message, signature } = clientSignedMessage;
  const { type, data, seq, client } = message;
  log.push({ type, data, seq, client });
  //console.log(
  //  `TCP Message received: ${type}, Data: ${JSON.stringify(data)}, Seq: ${seq}`
  //);

  console.log("Handling Request again after the view chnage");
  // Ensure consensusReached is initially set to false
  consensusReached[seq] = false;
  console.log(consensusReached[seq]);
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(message))
    .digest("hex");
  try {
    // Check if the request is a transaction or a state request
    if (data.type === undefined) {
      if (isPrimary()) {
        console.log("Node is primary, broadcasting PrePrepare");
        if (faulty_example == false){
          const body = {
            type: "pre-prepare",
            client,
            seq,
            hash,
            sent_by: `http://${process.env.HOSTNAME}:3000`,
          };
          const { signature } = signMessage(body);

          broadcast({ body, signature, clientSignedMessage });
        } else {
          sendFaultyMessage(clientSignedMessage);
        }
      }
    } else if (data.type === "get_state") {
      //TODO: do same way of transaction
      console.log("Node is primary, broadcasting PrePrepare for get_state");
      broadcast({ type: "pre-prepare", data, seq });
    } else {
      console.error("Invalid request type:", data.type);
      const errorMessage = {
        body: {
          type: "error",
          message: `Invalid request type: ${data.type}`,
          success: false,
        },
      };
      socketClient[seq].write(JSON.stringify(errorMessage));
    }
  } catch (error) {
    console.error("Error handling request:", error.message);
    const errorMessage = {
      body: {
        type: "error",
        message: error.message,
        success: false,
      },
    };
    socketClient[seq].write(errorMessage);
  }
}

function handlePrePrepare(body, clientSignedMessage) {
  console.log("Handling PrePrepare");

  // Verify that the pre-prepare message is sent by the current primary
  // TODO: it has not accepted a pre-prepare message for view v
  if (body.sent_by === primary) {
    console.log(
      "PrePrepare message is from the primary. Broadcasting prepare."
    );
    if (body.seq in consensusReached) {

      if (prePrepareCount[body.seq] === undefined) {
        prePrepareCount[body.seq] = {sender: body.sent_by, message: clientSignedMessage.message};
      } 
      //else {
      //  if (!prePrepareCount[body.seq].includes({sender: body.sent_by, message: clientSignedMessage.message})) {
      //    prePrepareCount[body.seq].push({sender: body.sent_by, message: clientSignedMessage.message});
      //  }
      //}
      console.log(
        `Pre-Prepare count for seq ${body.seq}: ${prePrepareCount[body.seq].length}`
      );

      const newBody = {
        type: "prepare",
        view,
        seq: body.seq,
        hash: body.hash,
        sent_by: `http://${process.env.HOSTNAME}:3000`,
      };
      const { signature } = signMessage(newBody);

      broadcast({
        body: newBody,
        signature,
        clientSignedMessage,
      });
    } else{
      console.log("Sequence number not found in Request phase");
      if (!faultyNodes.has(body.sent_by)) {
        faultyNodes.add(body.sent_by);
        console.error(`Node ${body.sent_by} suspected faulty`);
        if (body.sent_by === primary) {
          switchView();
          if (isPrimary()){
            // handleRequest_afterFaulty(clientSignedMessage)
          }
        }
      }
    }
  } else {
    console.warn(
      `PrePrepare message not from primary. Ignored. Expected from: ${primary}, but got from: ${body.sent_by}`
    );
  }
}

let broadcastedCommits = {}; // Track broadcasted commit messages

function checkPrepareCount(prepareCountList,seq){
    // Estrai il messaggio di riferimento da prePrepareCount[body.seq]
    if (prePrepareCount[seq]){
      const referenceMessage = prePrepareCount[seq].message;

      // Conta le occorrenze dei messaggi nella lista prepareCountList
      let messageCount = 0;
      const referenceMessageString = JSON.stringify(referenceMessage);

      for (let i = 0; i < prepareCountList.length; i++) {
          // Converti il messaggio corrente in una stringa JSON
        const currentMessageString = JSON.stringify(prepareCountList[i].message);
        
        if (currentMessageString === referenceMessageString) {
          messageCount++;
        }
      }

      return messageCount >= Math.floor(2 * (nodes.length - 1) / 3);
    }else{
      console.log("Sequence number not found before in Prepare");
    }
}

function handlePrepare(body, clientSignedMessage) {
  console.log("Handling Prepare");

  if (prepareCount[body.seq] === undefined) {
    prepareCount[body.seq] = [{sender: body.sent_by, message: clientSignedMessage.message}];
  } else {
    if (!prepareCount[body.seq].includes({sender: body.sent_by, message: clientSignedMessage.message})) {
      prepareCount[body.seq].push({sender: body.sent_by, message: clientSignedMessage.message});
    }
  }
  console.log(
    `Prepare count for seq ${body.seq}: ${prepareCount[body.seq].length}`
  );
  // prepareCount[body.seq].length >= requiredPrepareCount

  // TODO: Add check timeout to see if the checkPrepareCount is not passed in fast time, probably there are too many faulty processes or primary is faulty
  // Try to change primary and see if the PBFT works
  // So we need a function that allows faulty actions by the primary, that will lead to not accepted messages (There is always the check of the signature of the client)
  if (checkPrepareCount(prepareCount[body.seq],body.seq)) {
    // Ensure the commit message is only broadcasted once
    if (!broadcastedCommits[body.seq]) {
      broadcastedCommits[body.seq] = true; // Mark the commit message as broadcasted

      const newBody = {
        type: "commit",
        view,
        seq: body.seq,
        hash: body.hash,
        sent_by: `http://${process.env.HOSTNAME}:3000`,
      };
      const { signature } = signMessage(newBody);
      broadcast({ body: newBody, signature, clientSignedMessage });
    } else {
      console.log(`Commit message for seq ${body.seq} already broadcasted.`);
    }
  }
}

async function handleCommit(body, clientSignedMessage) {
  console.log("Handling Commit");
  // Initialize commit count for this sequence number if it doesn't exist
  if (commitCount[body.seq] === undefined) {
    commitCount[body.seq] = [body.sent_by];
  } else {
    if (!commitCount[body.seq].includes(body.sent_by)) {
      commitCount[body.seq].push(body.sent_by);
    }
  }
  console.log(
    `Commit count for seq ${body.seq}: ${commitCount[body.seq].length}`
  );

  // Check if consensus is reached
  
  // Check that preparedCount is true and if commitCount is true
  if (prepareCount[body.seq].length >= requiredPrepareCount) {
    if (
      commitCount[body.seq].length >=
      Math.floor((2 * (nodes.length - 1)) / 3 + 1)
    ) {
      if (!consensusReached[body.seq]) {
        consensusReached[body.seq] = true;
        console.log(consensusReached[body.seq]);

        //Handle Reply
        const { from, to, amount } = clientSignedMessage.message.data; // Ensure `from`, `to`, and `amount` are correctly accessed from `data`

        const fromExists = await accountExists(from);
        const toExists = await accountExists(to);

        if (!fromExists || !toExists) {
          const errorMessage = {
            body: {
              type: "Reply",
              success: false,
              error: `One or more accounts do not exist`,
            },
          };
          console.error(`One or more accounts do not exist`);
          socketClient[body.seq].write(JSON.stringify(errorMessage));
          return;
        }

        //TODO: check sequential order of requests from clients

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
            if (socketClient[body.seq]) {
              // const message = {
              //   type: "Reply",
              //   success: true,
              //   transaction: { from, to, amount },
              // };
              const newBody = {
                type: "Reply",
                view,
                seq: body.seq,
                sent_by: `http://${process.env.HOSTNAME}:3000`,
                success: true,
                transaction: { from, to, amount },
              };
              // TODO: sign message and get all public keys from client from nodes at startup
              socketClient[body.seq].write(
                JSON.stringify({
                  body: newBody,
                  signature: signMessage(newBody),
                })
              );
            }
          } catch (error) {
            console.error("Error updating balances:", error.message);
            const errorMessage = {
              body: {
                type: "Reply",
                success: false,
                error: error.message,
              },
            };
            socketClient[body.seq].write(JSON.stringify(errorMessage));
          }
        } else {
          console.error(
            `Insufficient balance for transaction: ${JSON.stringify(
              clientSignedMessage.message.data
            )}`
          );
          const errorMessage = {
            body: {
              type: "Reply",
              success: false,
              error: `Insufficient balance for transaction: ${JSON.stringify(
                clientSignedMessage.message.data
              )}`,
            },
          };
          socketClient[seq].write(JSON.stringify(errorMessage));
        }
      }
    }
  }
}

function isPrimary() {
  return `http://${process.env.HOSTNAME}:3000` === primary;
}

function checkNodesHealth() {
  const now = Date.now();
  if (now - lastHealthCheck >= HEALTH_CHECK_INTERVAL) {
    lastHealthCheck = now;
    nodes.forEach((node) => {
      axios
        .get(`${node}/health`)
        .then((response) => {
          // Node responded, reset suspicion
          if (crashedNodes.has(node)) {
            console.log(`Node ${node} recovered`);
            crashedNodes.delete(node);
          }
        })
        .catch((error) => {
          // Node didn't respond, mark as faulty
          if (!crashedNodes.has(node)) {
            crashedNodes.add(node);
            console.error(`Node ${node} suspected crashed`);
            if (node === primary) {
              switchView();
            }
          }
        });
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
  const { body, signature, clientSignedMessage } = req.body;
  const publicKey = publicKeys.get(body.sent_by);
  if (!publicKey) {
    console.error(`Public key not found for node: ${body.sent_by}`);
    return res.status(400).send("Public key not found");
  } else {
    if (!verifySignature({ message: body, signature }, publicKey)) {
      console.error("Invalid signature. Message not authenticated.");
      return res.status(400).send("Invalid signature");
    } else {
      // console.log("Tried public key for node:", body.sent_by, "and verified");

      // Check hash of received message
      const computedHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(clientSignedMessage.message))
        .digest("hex");
      if (computedHash !== body.hash) {
        console.error(
          `Hash mismatch. Expected ${body.hash}, but got ${computedHash}`
        );
      } else {
        if (
          !verifySignature(
            clientSignedMessage,
            fs.readFileSync(clientPublicKeyPath, "utf8")
          )
        ) {
          console.error("Invalid signature. Message not authenticated.");
          console.log(clientSignedMessage);
          // const errorMessage = {
          //   type: "error",
          //   message: "Invalid signature",
          //   success: false,
          // };
          // socket.write(JSON.stringify(errorMessage)); // socket variable undefined
        } else {
          // TODO: Check if it is in view v
          const timeNow = Date.now();
          // Check if the sequence number is within the expected range
          if (body.seq < timeNow - 900000 || body.seq > timeNow + 900000) {
            console.error(
              `Message seq ${body.seq} outside of expected range. Ignoring message.`
            );
            return res.status(400).send("Invalid sequence number");
          } else {
            switch (body.type) {
              case "pre-prepare":
                // TODO:
                // The message is processed only if no other message with same view and sequence number has been processed
                handlePrePrepare(body, clientSignedMessage);
                break;
              case "prepare":
                handlePrepare(body, clientSignedMessage);
                break;
              case "commit":
                handleCommit(body, clientSignedMessage);
                break;
              // case "reply":
              //   handleReply(body, clientSignedMessage);
              //   break;
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
        }
      }
    }
  }
});

app.post("/receivePublicKey", (req, res) => {
  const { publicKey, nodeAddress } = req.body; // Assuming nodeAddress is sent to identify the node
  if (publicKey && nodeAddress) {
    // Validate publicKey if necessary
    publicKeys.set(nodeAddress, publicKey);
    // console.log(`Public key received and stored for node: ${nodeAddress}`);
    res.status(200).send("Public key stored successfully.");
  } else {
    res
      .status(400)
      .send("Invalid request. Public key or node address missing.");
  }
});

// Periodically check nodes health
// setInterval(checkPrimaryHealth, PRIMARY_CHECK_INTERVAL);
setInterval(checkNodesHealth, HEALTH_CHECK_INTERVAL);

// TCP Server to receive messages from client
const tcpServer = net.createServer((socket) => {
  socket.on("data", (data) => {
    try {
      const clientSignedMessage = JSON.parse(data);
      if (
        !verifySignature(
          clientSignedMessage,
          fs.readFileSync(clientPublicKeyPath, "utf8")
        )
      ) {
        console.error("Invalid signature. Message not authenticated.");
        const errorMessage = {
          body: {
            type: "error",
            message: "Invalid signature",
            success: false,
          },
        };
        socket.write(JSON.stringify(errorMessage));
      } else {
        switch (clientSignedMessage.message.type) {
          case "request":
            handleRequest(clientSignedMessage, socket);
            break;
          // case "get_state":
          //   handleRequest(message, seq, socket);
          //   break;
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
