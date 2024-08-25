// client/pbft_client.js
const net = require("net");
const readline = require("readline");
const crypto = require("crypto");
const fs = require("fs");

// Get the node count from environment variables
const nodeCount = parseInt(process.env.NODE_COUNT, 10);

// Generate the list of nodes dynamically
const nodes = [];
for (let i = 1; i <= nodeCount; i++) {
  nodes.push({ hostname: `node${i}`, port: 4000 });
}
// Log the nodes array for debugging purposes
console.log(nodes);

let consensusState = {};
let consensusReached = {};
let privateKey;

function signMessage(message) {
  const privateKey = fs.readFileSync("private_key.pem", "utf8");
  const signer = crypto.createSign("SHA256");
  signer.update(JSON.stringify(message));
  const signature = signer.sign(privateKey, "base64");

  return {
    message,
    signature,
  };
}

// Function to connect to a server and send a message
async function sendMessage(node, message) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    client.connect(node.port, node.hostname, () => {
      console.log(`Connected to ${node.hostname}:${node.port}`);
      client.write(JSON.stringify(message));
    });

    client.on("data", (data) => {
      console.log(`Received reply from ${node.hostname}:${node.port}: ${data}`);
      // Handle the reply as needed
      const response = JSON.parse(data);
      if (response.body && response.body.success) {
        consensusState[message.message.seq].push(response.transaction);
        if (
          !consensusReached[message.message.seq] &&
          consensusState[message.message.seq].length >=
            Math.floor((nodes.length - 1) / 3) + 1 &&
          consensusState[message.message.seq].every(
            (value) =>
              JSON.stringify(value) === JSON.stringify(response.transaction)
          )
        ) {
          console.log(
            "Consensus reached with ",
            consensusState[message.message.seq].length,
            " replies"
          );
          consensusReached[message.message.seq] = true;
        }
      }
      client.destroy(); // Close the connection
      resolve({ node: node.hostname, data });
    });

    client.on("close", () => {
      console.log(`Connection to ${node.hostname}:${node.port} closed`);
    });

    client.on("error", (err) => {
      console.error(
        `Error connecting to ${node.hostname}:${node.port}: ${err.message}`
      );
      client.destroy(); // Close the connection
      reject(err);
    });
  });
}

// Function to handle user input from CLI
async function startCli() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.setPrompt("> ");
  rl.prompt();

  rl.on("line", async (input) => {
    const [command, ...args] = input.trim().split(" ");

    if (command === "send" && args[0] === "transaction") {
      const [from, to, amountStr] = args.slice(1);
      const amount = parseInt(amountStr);

      if (from && to && !isNaN(amount)) {
        const responses = [];
        const transactionData = { from, to, amount };
        const seqNumber = Date.now(); // Use timestamp as sequence number (for simplicity)

        consensusState[seqNumber] = [];
        consensusReached[seqNumber] = false;
        const message = {
          type: "request",
          data: transactionData,
          seq: seqNumber,
          client: process.env.HOSTNAME,
        };
        // Signature to ensure authentication and integrity
        const signedMessage = signMessage(message);

        // Send the transaction request to all nodes
        nodes.forEach((node) => {
          responses.push(sendMessage(node, signedMessage));
        });

        console.log("Transaction sent. Waiting for consensus...");

        // Create a promise to check consensus
        const consensusPromise = new Promise((resolve) => {
          const checkConsensus = setInterval(() => {
            if (consensusReached[seqNumber]) {
              clearInterval(checkConsensus);
              resolve();
            }
          }, 50); // Check every second
        });

        // Timeout promise
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => {
            if (!consensusReached[seqNumber]) {
              reject("Timeout");
            }
          }, 60000) // 60 seconds timeout
        );

        try {
          await Promise.race([consensusPromise, timeoutPromise]);

          if (consensusReached[seqNumber]) {
            const end = new Date().getTime();
            console.log(
              `Transaction processed in ${end - seqNumber}ms. Response:`
            );
            // Optionally, you can log all the responses if needed
            // responses.forEach((response) => {
            //   console.log(`- ${response.node}: ${response.data}`);
            // });
          }
        } catch (err) {
          console.error(`Transaction failed or timed out! Error: ${err}`);
        }
      } else {
        console.error(
          "Invalid transaction command. Usage: send transaction <from> <to> <amount>"
        );
      }
    } else if (command === "get" && args[0] === "state") {
      // Request the state from one of the nodes (e.g., the first node)
      const message = { type: "get_state" };
      sendMessage(nodes[0], message); // Adjust if you want to send to multiple nodes
    } else {
      console.error(
        "Invalid command. Available commands: send transaction <from> <to> <amount>, get state"
      );
    }

    rl.setPrompt("> ");
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Exiting CLI...");
    process.exit(0);
  });
}

// Start the CLI
startCli();
