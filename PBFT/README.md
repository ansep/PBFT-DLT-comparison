# PBFT Setup

## Overview

This document provides a formal explanation of setting up a PBFT cluster using Docker Compose. The cluster consists of multiple nodes with their database running in separate Docker containers.

The diagram below illustrates the basic functioning of PBFT algorithm: 

![pbft_logic](PBFT-DLT-comparison/evaluation/images/logic_pbft.png)

## Build and Start the Docker Containers

To build and start the PBFT network, run the following command:

```bash
docker-compose up --build
```

## Interact with the PBFT Client

To interact with the PBFT client:

List the running Docker containers:

```bash
docker ps
```

Access the PBFT client container:

```bash
docker exec -it pbft-client /bin/bash
```

Start the client application:

```bash
npm start
```

Send a transaction using the format:

```bash
send transaction <from> <to> <value>
```

Example:

```bash
send transaction alice bob 4
```

## Check the State Database

To check the current state of the database:

Access one of the nodes (e.g., `node1`):

```bash
docker exec -it node1 bash
```

Open the SQLite database:

```bash
sqlite3 data/data.db
```

Query the state table:

```sql
SELECT * FROM state;
```

## Stop the Docker Containers

To stop and remove all containers, run:

```bash
docker-compose down
```
