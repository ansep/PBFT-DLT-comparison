#!/bin/bash

# Check if a number of nodes is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <number-of-nodes>"
    exit 1
fi

NUM_NODES=$1

# Validate the number of nodes
if ! [[ "$NUM_NODES" =~ ^[0-9]+$ ]] || [ "$NUM_NODES" -lt 1 ]; then
    echo "Please provide a valid number of nodes (positive integer)."
    exit 1
fi

# Calculate timeouts based on the number of nodes
MULTIPLIER=$NUM_NODES/2

timeout_propose=$(echo "3 * $MULTIPLIER" | bc) # Timeout for proposal
timeout_propose_delta=$(echo "500 * $MULTIPLIER" | bc) # Proposal delta
timeout_prevote=$(echo "1 * $MULTIPLIER" | bc) # Timeout for prevote
timeout_prevote_delta=$(echo "500 * $MULTIPLIER" | bc) # Prevote delta
timeout_precommit=$(echo "1 * $MULTIPLIER" | bc) # Timeout for precommit
timeout_precommit_delta=$(echo "500 * $MULTIPLIER" | bc) # Precommit delta
timeout_commit=$(echo "1 * $MULTIPLIER" | bc) # Timeout for commit

# Create the localnet.mk file
cat <<EOF > localnet.mk
# localnet.mk

localnet-start: localnet-stop build-docker-localnode
	@if ! [ -f build/node0/config/genesis.json ]; then docker run --rm -v \$(CURDIR)/build:/tendermint:Z tendermint/localnode testnet --config /etc/tendermint/config-template.toml --v ${NUM_NODES} --o .  --populate-persistent-peers --starting-ip-address 192.167.10.2; fi
EOF

# Add sed commands for each node to localnet.mk
for ((i=0; i<NUM_NODES; i++)); do
    cat <<EOF >> localnet.mk
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node${i}/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node${i}/config/config.toml
EOF
done

# Add this to the previous block of loop code to have the change of timeout in localnet.mk
# sed -i 's/timeout_propose = "3s"/timeout_propose = "12s"/' build/node${i}/config/config.toml
#	sed -i 's/timeout_propose_delta = "500ms"/timeout_propose_delta = "2000ms"/' build/node${i}/config/config.toml
#	sed -i 's/timeout_prevote = "1s"/timeout_prevote = "4s"/' build/node${i}/config/config.toml
#	sed -i 's/timeout_prevote_delta = "500ms"/timeout_prevote_delta = "2000ms"/' build/node${i}/config/config.toml
#	sed -i 's/timeout_precommit = "1s"/timeout_precommit = "4s"/' build/node${i}/config/config.toml
#	sed -i 's/timeout_precommit_delta = "500ms"/timeout_precommit_delta = "2000ms"/' build/node${i}/config/config.toml
#	sed -i 's/timeout_commit = "1s"/timeout_commit = "4s"/' build/node${i}/config/config.toml

# Add docker-compose up command
cat <<EOF >> localnet.mk
	docker-compose up
.PHONY: localnet-start
EOF

# Create the docker-compose.yml file
cat <<EOF > docker-compose.yml
version: '3.8'

services:
EOF

# Add services for each node to docker-compose.yml
for ((i=0; i<NUM_NODES; i++)); do
    PORT_START=$((26656 + i * 3))
    PORT_END=$((PORT_START + 1))
    
    cat <<EOF >> docker-compose.yml
  node${i}:
    container_name: node${i}
    image: "tendermint/localnode"
    ports:
      - "${PORT_START}-${PORT_END}:26656-26657"
    environment:
      - ID=${i}
      - LOG=\${LOG:-tendermint.log}
    volumes:
      - ./build:/tendermint:Z
    networks:
      localnet:
        ipv4_address: 192.167.10.$((i + 2))
EOF
done

# Complete docker-compose.yml file
cat <<EOF >> docker-compose.yml

networks:
  localnet:
    driver: bridge
    ipam:
      config:
        - subnet: 192.167.0.0/16
EOF

echo "Files generated: localnet.mk and docker-compose.yml"
