// client/pbft_client.js
const net = require("net");
const readline = require("readline");
const crypto = require("crypto");
const fs = require("fs");

// List of nodes (servers) to connect to
const nodes = [
  { hostname: "node1", port: 4000 }, // Update to match your node setup
  { hostname: "node2", port: 4000 }, // Adjust ports as needed
  { hostname: "node3", port: 4000 },
  { hostname: "node4", port: 4000 },
];

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
            Math.floor((2 * nodes.length) / 3) + 1 &&
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
function startCli() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.setPrompt("> ");
  rl.prompt();

  rl.on("line", (input) => {
    const [command, ...args] = input.trim().split(" ");

    if (command === "send" && args[0] === "transaction") {
      const [from, to, amountStr] = args.slice(1);
      const amount = parseInt(amountStr);

      if (from && to && !isNaN(amount)) {
        const responses = [];
        // Check if the transaction is valid (simplified check)
        const transactionData = { from, to, amount };
        const seqNumber = Date.now(); // Use timestamp as sequence number (for simplicity)

        consensusState[seqNumber] = [];
        consensusReached[seqNumber] = false;
        // Send the transaction request to all nodes
        nodes.forEach((node) => {
          const message = {
            type: "request",
            data: transactionData,
            seq: seqNumber,
            client: process.env.HOSTNAME,
          };
          // Signature to ensure authentication and integrity
          const signedMessage = signMessage(message);

          // const hash = crypto
          //   .createHash("sha256")
          //   .update(JSON.stringify({ data: transactionData, seq: seqNumber }))
          //   .digest("hex");
          responses.push(sendMessage(node, signedMessage));
        });

        Promise.race([
          Promise.all(responses).then((values) => {
            const end = new Date().getTime();
            console.log(
              `Transaction processed in ${end - seqNumber}ms. Response:`
            );
            // values.forEach((value) => {
            //   console.log(`- ${value.node}: ${value.data}`);
            // });
          }),
          new Promise((resolve, reject) => {
            setTimeout(() => reject("Timeout"), 10000);
          }),
        ]).catch((err) => {
          console.error(`Transaction failed or timed out: ${err}`);
        });
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
