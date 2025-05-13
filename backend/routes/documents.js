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

module.exports = router;
