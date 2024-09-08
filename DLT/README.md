# Tendermint Cluster Setup

## Overview

This document provides a formal explanation of setting up a Tendermint cluster using Docker Compose. The cluster consists of multiple Tendermint nodes running in separate Docker containers and ABCI server installed in Ubuntu local machine.

The diagram below illustrates the basic functioning of Tendermint: 

![Tendermint_logic](PBFT-DLT-comparison/evaluation/images/Tendermint_logic.png)

## Docker Compose configuration for Tendermint local network

This `docker-compose.yml` sets up a local Tendermint network with n nodes. Each node runs in its own Docker container using the `tendermint/localnode` image and communicates over a custom network named `localnet`.

- **nodes**: Each node is configured with a unique ID and exposed ports for P2P (`26656`) and RPC (`26657`) communication.
- **ports**: Maps container ports to host ports.
- **environment**: Sets environment variables (`ID` for the node ID, `LOG` for the log file location).
- **volumes**: Mounts the local `./build` directory to `/tendermint` in each container.
- **networks**: Assigns a static IP address in the `localnet` network.
- **localnet**: A custom Docker bridge network with a specified subnet (`192.167.0.0/16`).



## Tendermint Installation

To install Tendermint, you will first need to install Go and set up the necessary environment variables.

Make sure Go is installed on your system. If not, you can download it from [golang.org](https://golang.org/dl/).

After installing Go, set up your Go environment by adding the following lines to your `~/.bash_profile`:

```bash
echo export GOPATH="\$HOME/go" >> ~/.bash_profile
echo export PATH="\$PATH:\$GOPATH/bin" >> ~/.bash_profile
source ~/.bash_profile
```

Clone the Tendermint repository from GitHub:

```bash
git clone https://github.com/tendermint/tendermint.git
cd tendermint
```

To build and install Tendermint, run:

```bash
make install
```

To build the Tendermint binary:

```bash
make build
```

Check the installed Tendermint version:

```bash
tendermint version
```

To install the ABCI application, run:

```bash
make install_abci
```

Copy `localnet.mk` and `generate_makefile.sh` in your Tendermint directory. Replace the existing `docker-compose.yml`.


## Tendermint nodes initialization 

To initialize the Tendermint makefile:

```bash
./generate_makefile.sh <number_of_nodes>
```

To remove old Tendermint nodes:

```bash
sudo rm -rf ./build/node*
```

To start the cluster:

```bash
make localnet-start
```

To check the status of a Tendermint node:

```bash
curl -s localhost:26657/status
```

Transactions can be submitted to the Tendermint nodes using the `/broadcast_tx_commit` endpoint. We can send transactions:

```bash
curl -s 'localhost:26657/broadcast_tx_commit?tx="data"'
```

and check that it worked with:

```bash
curl -s 'localhost:26657/abci_query?data="data"'
```


## Important notes

To optimize the Tendermint node configuration, perform the following adjustments:

1. **Disable empty block creation**: Prevent the creation of empty blocks by modifying the `config.toml` file for nodes. 

2. **Disable peer exchange**: To disable peer exchange (PEX) and prevent automatic peer discovery, modify the config.toml file for node0 by setting pex to false.

3. **Change consensus timeouts**: in the makefile you can change timeouts, look at the `localnet.mk` file.

4. **Windows configuration**: our implementation in not available in windows.
