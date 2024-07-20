const WebSocket = require('ws');

// WebSocket endpoint
const wsEndpoint = 'ws://localhost:26657/websocket';

// Create WebSocket connection
const ws = new WebSocket(wsEndpoint);

// Event listener for WebSocket open
ws.on('open', () => {
  console.log('Connected to Tendermint RPC server.');

  ws.send(JSON.stringify({ "jsonrpc": "2.0", "method": "subscribe", "params":  ["tm.event='NewBlock'"], "id": 1 }));
});


// Event listener for WebSocket messages
ws.on('message', (data) => {
  console.log('Received response from Tendermint RPC server:');
  // Convert buffer to string
  const message = data.toString();

  // Parse JSON string to object
  const jsonData = JSON.parse(message);

  // Log the parsed JSON object
  console.log(jsonData);

  const eventType = jsonData.result.data ? jsonData.result.data.type : undefined;

  if (eventType !== undefined) {
    console.log('Event type:', eventType);
    const eventValue = jsonData.result.data.value;
console.log('Event value:', eventValue);

  } else {
    console.log('Event type is undefined.');
  }
  });

// Event listener for WebSocket errors
ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});
