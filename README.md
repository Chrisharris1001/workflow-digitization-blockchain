<h1 style="text-align:center"><a href="https://github.com/Chrisharris1001/workflow-digitization-blockchain">Workflow Digitization Blockchain</a></h1>

<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/0/05/Ethereum_logo_2014.svg" alt="workflow-logo" height="150"/>
  <br><br>
  <i>A decentralized platform for secure document notarization using blockchain technology.<br>
    Guarantee integrity, traceability, and authenticity in workflows by leveraging smart contracts and cryptographic hashing.
  </i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Ethereum-3C3C3D?style=for-the-badge&logo=ethereum&logoColor=white" alt="ethereum"/>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="nodejs"/>
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="express"/>
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="react"/>
  <img src="https://img.shields.io/badge/Hardhat-F4F4F4?style=for-the-badge&logo=hardhat&logoColor=000000" alt="hardhat"/>
  <img src="https://img.shields.io/badge/Solidity-363636?style=for-the-badge&logo=solidity&logoColor=white" alt="solidity"/>
</p>

---

## 📚 Table of Contents

- [Getting Started](#getting-started)
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Application](#running-the-application)
- [Features](#features)
- [License](#license)

---

## Getting Started

### Requirements

* Node.js (v14 or higher)
* Docker & Docker Compose
* Hardhat CLI
* Git

---

### Installation

```bash
git clone https://github.com/Chrisharris1001/workflow-digitization-blockchain.git
cd workflow-digitization-blockchain
npm install
cd frontend && npm install
```
---

### Configuration
Create a .env file in the root, backend/, and frontend/ directories with the following variables:
```env
# Blockchain and API
RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=0x...

# Backend
PORT=5000

# Frontend
REACT_APP_API_URL=http://localhost:5000
REACT_APP_CONTRACT_ADDRESS=0x...
```
A sample file is available as .env.example if provided.

---

### Running the Application
To start all services locally:
```bash
# Start blockchain and database (if any)
docker-compose up -d

# Deploy smart contracts
npx hardhat run scripts/deploy.js --network localhost

# Start backend
cd backend && npm run dev

# Start frontend
cd ../frontend && npm start
```
Visit the app at http://localhost:3000.

---

### Features
* 🧾 Document Hashing & Storage
Convert files to SHA-256 hashes and anchor them on the Ethereum blockchain.

* ⛓️ Smart Contract Notarization
Ensure document authenticity with verifiable, immutable records.

* 👨‍⚖️ Role-Based Access Control
Only authorized users can notarize or verify documents.

* 🔍 Blockchain Verification
Publicly validate document proofs through transaction hashes.

* 🧪 Testing Suite
Unit and integration tests for contracts and backend services.

---

### License
This project is licensed under the [MIT License](LICENSE).

