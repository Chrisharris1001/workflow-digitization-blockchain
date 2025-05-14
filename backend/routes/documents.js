const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { InfuraProvider, Wallet, Contract, keccak256 } = require('ethers');
require('dotenv').config();

const contractJson = require('../contract.json');

// Set up file upload
const upload = multer({ dest: 'uploads/' });

// Replace with your actual deployed address
const contractAddress = '0x884041Cb11DB62a7f783eABF9d5CB0da6d57F42E';

const provider = new InfuraProvider('sepolia', process.env.INFURA_API_KEY);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
const contract = new Contract(contractAddress, contractJson.abi, wallet);

// Map readable status to enum values used in the smart contract
const statusEnum = {
    Submitted: 0,
    AccountingApproved: 1,
    LegalApproved: 2,
    RectorApproved: 3,
};

// -------------------------------
// POST /api/documents/submit-doc
// -------------------------------
router.post('/submit-doc', upload.single('document'), async (req, res) => {
    try {
        const { docId } = req.body;
        const file = req.file;

        if (!docId || !file) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        const fileBuffer = fs.readFileSync(file.path);
        const hash = keccak256(fileBuffer);

        const tx = await contract.submitDocument(docId, hash);
        await tx.wait();

        res.json({ message: '✅ Document submitted.', txHash: tx.hash });
    } catch (err) {
        console.error('Submit error:', err);
        res.status(500).json({ error: err.reason || err.message || 'Submission failed' });
    }
});

// ----------------------------------------
// POST /api/documents/update-status
// ----------------------------------------
router.post('/update-status', upload.single('document'), async (req, res) => {
    try {
        const { docId, status: statusStr } = req.body;
        const file = req.file;

        if (!docId || !statusStr || !file) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        const status = statusEnum[statusStr];
        if (status === undefined) {
            return res.status(400).json({ error: 'Invalid status selected.' });
        }

        const fileBuffer = fs.readFileSync(file.path);
        const hash = keccak256(fileBuffer);

        const tx = await contract.updateStatus(docId, status, hash);
        await tx.wait();

        res.json({ message: '✅ Status updated.', txHash: tx.hash });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ error: err.reason || err.message || 'Update failed' });
    }
});

// -------------------------------
// POST /api/documents/verify
// -------------------------------
router.post('/verify', upload.single('document'), async (req, res) => {
    try {
        const { docId, status: statusStr } = req.body;
        const file = req.file;

        if (!docId || !statusStr || !file) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        const status = statusEnum[statusStr];
        if (status === undefined) {
            return res.status(400).json({ error: 'Invalid status selected.' });
        }

        const fileBuffer = fs.readFileSync(file.path);
        const hash = keccak256(fileBuffer);

        const isValid = await contract.verifyDocument(docId, status, hash);
        res.json({ valid: isValid });
    } catch (err) {
        console.error('Verify error:', err);
        res.status(500).json({ error: err.reason || err.message || 'Verification failed' });
    }
});

module.exports = router;
