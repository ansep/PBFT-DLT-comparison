let createABCIServer = require("abci");
let fs = require("fs");
let path = require("path");

let state = loadState() || [
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

let handlers = {
  info(request) {
    return {
      data: "Node.js DLT app",
      version: "0.0.0",
      lastBlockHeight: 0,
      lastBlockAppHash: Buffer.alloc(0),
    };
  },

  // requests of transactions must be sent in format ':sender:recipient:amount'
  checkTx(request) {
    let tx = padTx(request.tx);
    let nameSender = tx.toString().split(":")[1];
    let nameRecipient = tx.toString().split(":")[2];
    let amount = parseInt(tx.toString().split(":")[3]);
    let sender = state.find((account) => account.username === nameSender);
    let recipient = state.find((account) => account.username === nameRecipient);
    if (!sender) {
      return { code: 1, log: "sender account does not exist" };
    }
    if (!recipient) {
      return { code: 1, log: "recipient account does not exist" };
    }
    if (sender.balance < amount) {
      return { code: 1, log: "insufficient funds" };
    }
    return { code: 0, log: "tx succeeded" };
  },

  // transactions are composed by a sender, an amount and a recipient
  // requests of transactions must be sent in format ':sender:recipient:amount'
  deliverTx(request) {
    let tx = padTx(request.tx);
    let nameSender = tx.toString().split(":")[1];
    let nameRecipient = tx.toString().split(":")[2];
    let amount = parseInt(tx.toString().split(":")[3]);
    let sender = state.find((account) => account.username === nameSender);
    let recipient = state.find((account) => account.username === nameRecipient);
    if (!sender) {
      return {
        code: 1,
        log:
          "sender account does not exist " +
          nameSender +
          " " +
          nameRecipient +
          " " +
          amount,
      };
    }
    if (!recipient) {
      return { code: 1, log: "recipient account does not exist" };
    }
    if (sender.balance < amount) {
      return { code: 1, log: "insufficient funds" };
    }
    sender.balance -= amount;
    recipient.balance += amount;
    saveState(state);
    return { code: 0, log: "tx succeeded" };
  },
};

function padTx(tx) {
  let buf = Buffer.alloc(32);
  tx.copy(buf, 32 - tx.length);
  return buf;
}

function loadState() {
  const filePath = path.join(__dirname, "db/state.json");
  try {
    const state = JSON.parse(fs.readFileSync(filePath));
    return state;
  } catch (err) {
    return undefined;
  }
}

function saveState(state) {
  console.log(__dirname);
  const filePath = "db/state.json";
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

let port = 26658;
createABCIServer(handlers).listen(port, () => {
  console.log(`listening on port ${port}`);

  // console.log("state", state); // TODO: remove
});
