const express = require("express");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
const { ethers } = require("ethers");
const Document = require("../models/Document");
const contractData = require("../contract.json");
require("dotenv").config({path: require("path").resolve(__dirname, "../.env")});

const router = express.Router();

// File upload setup
const upload = multer({ dest: "uploads/" });

// Ethereum setup
const provider = new ethers.JsonRpcProvider(`https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`);
// console.log("PRIVATE_KEY:", process.env.PRIVATE_KEY || "(undefined)");
// console.log("PRIVATE_KEY length:", process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.length : "N/A");
// console.log("PRIVATE_KEY sample (first 6 chars):", process.env.PRIVATE_KEY.slice(0, 6));
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// console.log("Contract address:", contractData.address);
// console.log("ABI loaded?", Array.isArray(contractData.abi));

const contract = new ethers.Contract(contractData.address, contractData.abi, wallet);

// POST /submit-doc
router.post("/submit-doc", upload.single("document"), async (req, res) => {
    try {
        const { docId, name } = req.body;
        const filePath = req.file.path;

        if(!docId || !name || !req.file) {
            return res.status(400).json({error: "Missing required fields."});
        }

        // Hash the file using SHA-256
        const fileBuffer = fs.readFileSync(filePath);
        const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
        const hashBytes32 = "0x" + hash;

        // Call smart contract
        const tx = await contract.submitDocument(docId, hashBytes32);
        await tx.wait();

        // Save to MongoDB
        const newDoc = new Document({
            docId,
            name,
            currentStatus: "Submitted",
            history: [
                {
                    status: "Submitted",
                    author: wallet.address,
                    timestamp: new Date(),
                    hash: hashBytes32,
                    txHash: tx.hash,
                },
            ],
        });

        await newDoc.save();

        res.status(200).json({
            message: "Document submitted and notarized successfully.",
            docId,
            hash: hashBytes32,
            txHash: tx.hash,
        });
    } catch (err) {
        console.error("Error in /submit-doc:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/update-status", upload.single("document"), async (req, res) => {
    try {
        const {docId, status} = req.body;
        const filePath = req.file.path;

        if (!docId || !status || !req.file) {
            return res.status(400).json({error: "Missing required fields."});
        }

        const statusEnum = {
            Submitted: 0,
            Signed1: 1,
            Signed2: 2,
            Signed3: 3
        };

        const statusIndex = statusEnum[status];
        if (statusIndex === undefined) {
            return res.status(400).json({error: "Missing required fields."});
        }

        const fileBuffer = fs.readFileSync(filePath);
        const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
        const hashBytes32 = "0x" + hash;

        const tx = await contract.updateStatus(docId, statusIndex, hashBytes32);
        await tx.wait();

        const document = await Document.findOne({docId});
        if (!document) {
            return res.status(404).json({error: "Document not found."});
        }

        document.currentStatus = status;
        document.history.push({
            status,
            author: wallet.address,
            timestamp: new Date(),
            hash: hashBytes32,
            txHash: tx.hash,
        });
        await document.save();
        res.status(200).json({
            message: `Document status updated to ${status}`,
            docId,
            hash: hashBytes32,
            txHash: tx.hash,
        });
    } catch (err) {
        console.error("Error in /update-status:", err);
        res.status(500).json({error: err.message});
    }
});

router.post("/verify", upload.single("document"), async (req, res) => {
    try {
        const { docId, status } = req.body;
        const filePath = req.file?.path;

        if (!docId || !status || !filePath) {
            return res.status(400).json({ error: "Missing docId, status, or file" });
        }

        // Convert status to enum index
        const statusEnum = {
            Submitted: 0,
            Signed1: 1,
            Signed2: 2,
            Signed3: 3
        };

        const statusIndex = statusEnum[status];
        const timestamp = await contract.getDocumentTimestamp(docId, statusIndex);
        console.log(`Blockchain timestamp for ${docId} at ${status}: ${timestamp}`);

        if (statusIndex === undefined) {
            return res.status(400).json({ error: "Invalid status value." });
        }

        // Hash the uploaded file
        const fileBuffer = fs.readFileSync(filePath);
        const localHash = "0x" + crypto.createHash("sha256").update(fileBuffer).digest("hex");

        // Query smart contract for original hash
        console.log("Calling verifyDocument on:", contract.target || contract.address);
        console.log("docId:", docId, "statusIndex:", statusIndex, "localHash:", localHash);

        const isValid = await contract.verifyDocument(docId, statusIndex, localHash);

        res.status(200).json({
            docId,
            status,
            localHash,
            valid: isValid,
            message: isValid ? "✅ File is authentic" : "❌ File does NOT match blockchain record"
        });
    } catch (err) {
        console.error("Error in /verify:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
