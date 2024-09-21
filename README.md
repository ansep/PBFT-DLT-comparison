# Implementation of PBFT and DLT Tendermint for SMR problem

The State Machine Replication is a distributed computing approach used to ensure fault tolerance by replicating services across multiple machines. All replicas execute the same sequence of operations in the same order, ensuring consistent state across distributed servers.

The implementations provided are about a PBFT with database and the DLT Tendermint.

## PBFT with database

![PBFT architecture](https://github.com/ansep/PBFT-DLT-comparison/blob/main/evaluation/images/architecture_PBFT.png)

### Technologies Used:
- **Docker**: Containerization for dynamic scalability.
- **Node.js**: Backend implementation for efficient, asynchronous operations.
- **SQLite**: Persistent, lightweight database storage.

### Implementation Highlights:
1. **Based on State of the Art PBFT**: Implements core distributed systems concepts.
2. **Failure Detector**: Detects node crashes and manages recovery.
3. **Leader Election (ViewChange)**: Handles leader election during failures.
4. **Security**: Uses digital signatures and hashing for integrity and security.


## DLT Tendermint

![DLT architecture](https://github.com/ansep/PBFT-DLT-comparison/blob/main/evaluation/images/architecture_DLT.png)


### Technologies Used:
- **Tendermint Core**: Based on the official Tendermint Core for consensus.
- **Docker**: Containerization for dynamic scalability and consistent environments.
- **ABCI (Application Blockchain Interface)**: Used for sending transactions, running on Ubuntu.

### Implementation Highlights:
1. **All Nodes as Validators**: Every node participates in the consensus process.
2. **Peer Exchange Disabled**: Disables peer exchange to control network topology.
3. **Empty Block Disabled**: Blocks without transactions are not created to optimize performance.




## References

This Project has been done for the DDS exam at La Sapienza University of Rome
