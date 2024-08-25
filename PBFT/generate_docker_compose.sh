#!/bin/bash

# Check if the user provided the number of nodes
if [ -z "$1" ]; then
  echo "Usage: $0 <number_of_nodes>"
  exit 1
fi

NODE_COUNT=$1

# Generate the Docker Compose file
echo "Generating docker-compose.yml with $NODE_COUNT nodes..."

cat << EOF > docker-compose.yml
version: '3'
services:
$(for i in $(seq 1 $NODE_COUNT); do
cat << SERVICE
  node$i:
    build: ./node
    container_name: node$i
    hostname: node$i
    environment:
      - HOSTNAME=node$i
      - NODE_COUNT=$NODE_COUNT
    volumes:
      - ./node/data/node$i:/app/data 
    ports:
      - "30$(printf "%02d" $i):3000"
      - "40$(printf "%02d" $i):4000"
    networks:
      - pbft_network
SERVICE
done)

  client:
    build: ./client
    container_name: pbft-client
    hostname: pbft-client
    environment:
      - HOSTNAME=pbft-client
      - NODE_COUNT=$NODE_COUNT
    depends_on:
$(for i in $(seq 1 $NODE_COUNT); do echo "      - node$i"; done)
    networks:
      - pbft_network
    ports:
      - "4000:4000"
    stdin_open: true
    tty: true

networks:
  pbft_network:
    driver: bridge
EOF

echo "docker-compose.yml generated successfully."