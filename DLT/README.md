# Tendermint Cluster Setup

## Overview

This document provides a formal explanation of setting up a Tendermint cluster using Docker Compose. The cluster consists of multiple Tendermint nodes and ABCI servers running in separate Docker containers. 

## Docker Compose Configuration

The Docker Compose configuration defines services for each Tendermint node (`node0`, `node1`, `node2`, `node3`) and their corresponding ABCI servers (`abci0`, `abci1`, `abci2`, `abci3`). Each node and ABCI server are connected to a custom Docker network named `localnet` with specific IP addresses assigned to each container.

The configuration mounts local directories (`./node0`, `./node1`, `./node2`, `./node3`) as volumes in the Tendermint containers, allowing for persistence of blockchain data and configuration files. The ports `26656` and `26657` are exposed for Tendermint node RPC and P2P communication.

## Initialization and Usage

To initialize the Tendermint cluster, run the following command in the terminal:

```
sudo docker-compose up --build
```

To shut down the cluster, use the following command:

```
sudo docker-compose down
```

To access the shell of a specific Tendermint node, use the following command:

```
sudo docker exec -it node0 /bin/bash
```

To check the status of a Tendermint node, send a GET request to its RPC endpoint:

```
curl -s localhost:26657/status
```

Transactions can be submitted to the Tendermint nodes using the `/broadcast_tx_commit` endpoint. For example:


With the dummy app running (go down for our implementetion), we can send transactions:

```
curl -s 'localhost:46657/broadcast_tx_commit?tx="abcd"'
```

and check that it worked with:

```
curl -s 'localhost:46657/abci_query?data="abcd"'
```

We can send transactions with a key and value too:

```
curl -s 'localhost:46657/broadcast_tx_commit?tx="name=satoshi"'
```

and query the key:

```
curl -s 'localhost:46657/abci_query?data="name"'
# query the key at other node
curl -s 'localhost:36657/abci_query?data="name"'
{
  "jsonrpc": "2.0",
  "id": "",
  "result": {
    "response": {
      "log": "exists",
      "index": "-1",
      "key": "bmFtZQ==",
      "value": "c2F0b3NoaQ=="
    }
  }
}
```

where the value is returned in hex.

Since we are using for now counter.js example.. so, transactions has to be sent (app is expecting a transaction with value=last+1):

curl localhost:26657/broadcast_tx_commit?tx=0x00


## Important Notes

- Each Tendermint node will attempt to dial its peers specified in the `p2p.persistent_peers` configuration. During the initial startup, there may be warnings indicating that seed nodes are offline. This behavior is expected.
  
- Each node will also attempt to dial itself, resulting in a dialing error message. This error can be ignored as it does not affect the functionality of the cluster.

## Additional Considerations

- **Database Backend**: The configuration specifies the use of Go LevelDB (`goleveldb`) as the database backend. This backend is stable and widely used in Tendermint deployments.

- **Debugging**: Debug logging is enabled for ABCI (`abci*`) to facilitate troubleshooting and monitoring of ABCI server interactions.


## Cluster of Nodes

First create four Ubuntu cloud machines. The following was tested on Digital Ocean Ubuntu 16.04 x64 (3GB/1CPU, 20GB SSD). We'll refer to their respective IP addresses below as IP1, IP2, IP3, IP4.

Then, `ssh` into each machine, and execute [this script](https://git.io/vh40C):

```
curl -L https://git.io/vh40C | bash
source ~/.profile
```

This will install `go` and other dependencies, get the Tendermint source code, then compile the `tendermint` binary.

Next, `cd` into `docs/examples`. Each command below should be run from each node, in sequence:

```
abci-cli dummy --addr="tcp://IP1:46658"
abci-cli dummy --addr="tcp://IP2:46658"
abci-cli dummy --addr="tcp://IP3:46658"
abci-cli dummy --addr="tcp://IP4:46658"

tendermint node --home ./node1 --proxy_app=tcp://IP1:46658 --p2p.seeds IP2:46656,IP3:46656,IP4:46656 --consensus.create_empty_blocks=false

tendermint node --home ./node2 --proxy_app=tcp://IP2:46658 --p2p.seeds IP1:46656,IP3:46656,IP4:46656 --consensus.create_empty_blocks=false

tendermint node --home ./node3 --proxy_app=tcp://IP3:46658 --p2p.seeds IP1:46656,IP2:46656,IP4:46656 --consensus.create_empty_blocks=false

tendermint node --home ./node4 --proxy_app=tcp://IP4:46658 --p2p.seeds IP1:46656,IP2:46656,IP3:46656 --consensus.create_empty_blocks=false
```

Note that after the third node is started, blocks will start to stream in because >2/3 of validators (defined in the `genesis.json`) have come online. Seeds can also be specified in the `config.toml`. See [this PR](https://github.com/tendermint/tendermint/pull/792) for more information about configuration options.

Transactions can then be sent as covered in the single, local node example above.
