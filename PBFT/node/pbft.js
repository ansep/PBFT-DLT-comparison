// node/pbft.js
const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db');
const axios = require('axios');
const net = require('net');
const app = express();
app.use(bodyParser.json());

const nodes = [
    'http://node1:3000',
    'http://node2:3000',
    'http://node3:3000',
    'http://node4:3000'
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

// Failure detection variables
let lastPrimaryCheck = Date.now();
const PRIMARY_CHECK_INTERVAL = 5000; // Check primary status every 5 seconds

// Track which nodes are suspected faulty
let faultyNodes = new Set();

function broadcast(message) {
    console.log(`Broadcasting message: ${JSON.stringify(message)}`);
    nodes.forEach(node => {
        if (node !== `http://${process.env.HOSTNAME}:3000` && !faultyNodes.has(node)) {
            axios.post(`${node}/message`, message).catch(console.error);
        }
    });
}

function switchView() {
    view = (view + 1) % nodes.length;
    primary = nodes[view];
    console.log(`Switched to view ${view}. Primary: ${primary}`);
}

async function handleRequest(data, seq, socket) {
    console.log("Handling Request");
    console.log("Data", data);
    // Ensure consensusReached is initially set to false
    consensusReached[seq] = false;
    console.log(consensusReached[seq])
    try {
        // Check if the request is a transaction or a state request
        if (data.type === undefined) {
            const { from, to, amount } = data;

            // Check if accounts exist
            const fromExists = await accountExists(from);
            const toExists = await accountExists(to);

            if (!fromExists || !toExists) {
                console.error(`One or more accounts do not exist`);
                socket.write(`One or more accounts do not exist`);
                return;
            }

            // Check balance before proceeding
            const fromBalance = await getBalance(from);

            if (fromBalance >= amount) {
                msg_to_send = { from, to, amount }
                if (isPrimary()) {
                    console.log("Node is primary, broadcasting PrePrepare");
                    broadcast({ type: 'pre-prepare', data: { ...data, sent_by: `http://${process.env.HOSTNAME}:3000` }, seq });
                }

                // Await for consensus to be reached
                await new Promise(resolve => {
                    const interval = setInterval(() => {
                        if (consensusReached[seq]) {
                            clearInterval(interval);
                            resolve();
                        }
                    }, 1000); // Check every second for consensus

                    // Update balances in the database
                });
                updateBalancesInDatabase(from, to, amount, socket);

            } else {
                console.error(`Insufficient balance for transaction: ${JSON.stringify(data)}`);
                socket.write(`Insufficient balance for transaction: ${JSON.stringify(data)}`);
            }
        } else if (data.type === 'get_state') {
            console.log("Node is primary, broadcasting PrePrepare for get_state");
            broadcast({ type: 'pre-prepare', data, seq });

            // Await for consensus to be reached
            await new Promise(resolve => {
                const interval = setInterval(() => {
                    if (consensusReached[seq]) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 1000); // Check every second for consensus

                // Once consensus is reached, send current state response
                const stateResponse = {
                    type: 'state_response',
                    data: getCurrentState(), // Retrieve the current state from the database
                    seq: seq
                };
                socket.write(JSON.stringify(stateResponse));
            });

        } else {
            console.error('Invalid request type:', data.type);
            socket.write(`Invalid request type: ${data.type}`);
        }
    } catch (error) {
        console.error('Error handling request:', error.message);
        socket.write(`Error handling request: ${error.message}`);
    }
}

async function getCurrentState() {
    try {
        const rows = await db.query("SELECT username, balance FROM state");
        const state = {};
        rows.forEach(row => {
            state[row.username] = { balance: row.balance };
        });
        console.log('Current state retrieved:', state);
        return state;
    } catch (error) {
        console.error('Error retrieving current state:', error.message);
        throw error;
    }
}


async function accountExists(account) {
    try {
        const result = await db.query("SELECT COUNT(*) AS count FROM state WHERE username = ?", [account]);
        return result[0].count > 0;
    } catch (error) {
        console.error('Error checking account existence:', error.message);
        return false;
    }
}

async function getBalance(account) {
    try {
        const result = await db.query("SELECT balance FROM state WHERE username = ?", [account]);
        return result[0].balance || 0;
    } catch (error) {
        console.error('Error fetching balance:', error.message);
        return 0;
    }
}

async function updateBalancesInDatabase(from, to, amount, socket) {
    try {
        console.log("Consensus reached for message ", { transaction: { from, to, amount } })
        const message = { type: "Reply", success: true, transaction: { from, to, amount } };
        socket.write(JSON.stringify(message));
    } catch (error) {
        console.error('Error updating balances:', error.message);
        // Handle error appropriately, e.g., logging or sending an error message
        const errorMessage = { type: "Reply", success: false, error: error.message };
        socket.write(JSON.stringify(errorMessage));
    }

}


function handlePrePrepare(data, seq) {
    console.log("Handling PrePrepare");

    // Extract the sender information from the data (assuming it is included)
    const { sent_by } = data;

    // Verify that the pre-prepare message is sent by the current primary
    if (sent_by === primary) {
        console.log("PrePrepare message is from the primary. Broadcasting prepare.");
        broadcast({ type: 'prepare', data, seq });
    } else {
        console.warn(`PrePrepare message not from primary. Ignored. Expected from: ${primary}, but got from: ${sent_by}`);
    }
}

let broadcastedCommits = {}; // Track broadcasted commit messages

function handlePrepare(data, seq) {
    console.log("Handling Prepare");
    prepareCount[seq] = (prepareCount[seq] || 0) + 1;
    console.log(`Prepare count for seq ${seq}: ${prepareCount[seq]}`);

    // Calculate the required prepare count to reach consensus
    const requiredPrepareCount = Math.floor((2 * (nodes.length - 1)) / 3);

    if (prepareCount[seq] >= requiredPrepareCount) {
        // Ensure the commit message is only broadcasted once
        if (!broadcastedCommits[seq]) {
            broadcastedCommits[seq] = true; // Mark the commit message as broadcasted
            broadcast({ type: 'commit', data, seq });
        } else {
            console.log(`Commit message for seq ${seq} already broadcasted.`);
        }
    }
}

async function handleCommit(data, seq) {
    console.log("Handling Commit");

    // Initialize commit count for this sequence number if it doesn't exist
    commitCount[seq] = (commitCount[seq] || 0) + 1;
    console.log(`Commit count for seq ${seq}: ${commitCount[seq]}`);

    // Check if consensus is reached
    if (commitCount[seq] >= Math.floor((2 * (nodes.length - 1)) / 3)) {
        if (!consensusReached[seq]) {
            consensusReached[seq] = true;
            console.log(consensusReached[seq])

            const { from, to, amount } = data; // Ensure `from`, `to`, and `amount` are correctly accessed from `data`

            try {
                console.log(`Updating database: ${amount} from ${from} to ${to}`);
                db.query("UPDATE state SET balance = balance - ? WHERE username = ?", [amount, from]);
                db.query("UPDATE state SET balance = balance + ? WHERE username = ?", [amount, to]);

                //Now, reply should be sent directly by the handle request function

                // broadcast({ type: 'reply', data, seq });

                // Send confirmation to the original requester (if socket is provided)
                // if (data.socket) {
                //     const message = { type: "Reply", success: true };
                //     data.socket.write(JSON.stringify(message));
                // }
            } catch (err) {
                console.error('Error updating balances in database:', err.message);

                // if (data.socket) {
                //     const errorMessage = { type: "Reply", success: false, error: err.message };
                //     data.socket.write(JSON.stringify(errorMessage));
                // }

                // // Still broadcast the reply to inform other nodes about the error
                // broadcast({ type: 'reply', data, seq });
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
    if (now - lastPrimaryCheck >= PRIMARY_CHECK_INTERVAL && primary !== `http://${process.env.HOSTNAME}:3000`) {
        lastPrimaryCheck = now;
        axios.get(`${primary}/health`) // Adjust to your actual health endpoint path
            .then(response => {
                // Primary responded, reset suspicion
                if (faultyNodes.has(primary)) {
                    console.log(`Primary ${primary} recovered`);
                    faultyNodes.delete(primary);
                }
            })
            .catch(error => {
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
app.get('/health', (req, res) => {
    // Customize health check logic based on node's actual health criteria
    const healthStatus = {
        status: 'OK',
        node: process.env.HOSTNAME
    };
    res.json(healthStatus);
});

app.post('/transaction', async (req, res) => {
    console.log("Transaction endpoint hit");
    const data = req.body;
    const seq = sequenceNumber++;

    // Example: Check balance before proceeding
    const { from, to, amount } = data;
    const fromBalance = await getBalance(from); // Replace with actual function to get balance

    if (fromBalance >= amount && isPrimary) {
        msg_to_send = { from, to, amount }
        console.log("Node is primary, broadcasting PrePrepare");
        broadcast({ type: 'pre-prepare', data: { ...data, sent_by: `http://${process.env.HOSTNAME}:3000` }, seq });

        // Await for consensus to be reached
        await new Promise(resolve => {
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
        const responseMessage = `Consensus reached for transaction: ${JSON.stringify(data)}`;
        res.send(responseMessage);
    } else {
        console.error(`Insufficient balance for transaction: ${JSON.stringify(data)}`);
        res.status(400).send(`Insufficient balance for transaction: ${JSON.stringify(data)}`);
    }
});

app.post('/message', (req, res) => {
    const { type, data, seq } = req.body;
    log.push({ type, data, seq });
    console.log(`Message received: ${type}, Data: ${JSON.stringify(data)}, Seq: ${seq}`);

    switch (type) {
        case 'pre-prepare':
            handlePrePrepare(data, seq);
            break;
        case 'prepare':
            handlePrepare(data, seq);
            break;
        case 'commit':
            handleCommit(data, seq);
            break;
        case 'reply':
            handleReply(data, seq);
            break;
        case 'get_state':
            // Send the current state back
            const responseMessage = {
                type: 'state_response',
                data: currentState,
                seq: seq
            };
            res.json(responseMessage);
            break;
    }
    res.sendStatus(200);
});

// Periodically check primary health
setInterval(checkPrimaryHealth, PRIMARY_CHECK_INTERVAL);

// TCP Server to receive messages
const tcpServer = net.createServer(socket => {
    socket.on('data', data => {
        try {
            const message = JSON.parse(data);
            const { type, data: msgData, seq } = message;
            log.push({ type, data: msgData, seq });
            console.log(`TCP Message received: ${type}, Data: ${JSON.stringify(msgData)}, Seq: ${seq}`);

            switch (type) {
                case 'request':
                    handleRequest(msgData, seq, socket);
                    break;
                case 'pre-prepare':
                    handlePrePrepare(msgData, seq);
                    break;
                case 'prepare':
                    handlePrepare(msgData, seq);
                    break;
                case 'commit':
                    handleCommit(msgData, seq);
                    break;
                case 'reply':
                    handleReply(msgData, seq);
                    break;
                case 'get_state':
                    handleRequest(message, seq, socket);
                    break;
            }
        } catch (err) {
            console.error('Error processing TCP message:', err);
        }
    });

    socket.on('error', err => {
        console.error('TCP connection error:', err);
    });

    socket.on('close', () => {
        console.log('TCP connection closed');
    });
});

tcpServer.listen(4000, () => {
    console.log('TCP server listening on port 4000');
});

const port = 3000;
app.listen(port, () => {
    console.log(`PBFT node running on ${process.env.HOSTNAME}:3000`);
    console.log(`Initial view: ${primary}`);
});
