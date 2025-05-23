const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
// const path = require('path');
const pdfParse = require('pdf-parse');
const { InfuraProvider, Wallet, Contract, keccak256 } = require('ethers');
require('dotenv').config();

const Document = require('../models/Document');
const contractJson = require('../contract.json');

// Set up file upload
const upload = multer({ dest: 'uploads/' });

// Replace with your actual deployed address
const contractAddress = '0x8B1429fF058FB545B8Dc2115797159587C6F2db5';

const provider = new InfuraProvider('sepolia', process.env.INFURA_API_KEY);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
const contract = new Contract(contractAddress, contractJson.abi, wallet);

// Map readable status to enum values used in the smart contract
const statusEnum = {
    Submitted: 0,
    AccountingApproved: 1,
    LegalApproved: 2,
    RectorApproved: 3,
    Rejected: 4,
};

// -------------------------------
// POST /api/documents/submit-doc
// -------------------------------
router.post('/submit-doc', upload.single('document'), async (req, res) => {
    try {
        const { docId } = req.body;
        const file = req.file;
        const existing = await Document.findOne({ docId });
        const version = existing ? existing.version + 1 : 1;

        if (!docId || !file) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        if(!file.originalname.endsWith('.pdf')) {
            return res.status(400).json({ error: 'Only PDF files are allowed.' });
        }

        if (file.size > 5 * 1024 * 1024) { // 5 MB limit
            return res.status(400).json({ error: 'File size exceeds 5 MB limit.' });
        }

        if (!/^TRIP-\d{3,}$/.test(docId)) {
            return res.status(400).json({ error: 'Document ID must start with "TRIP-" followed by at least 3 digits.' });
        }


        const fileBuffer = fs.readFileSync(file.path);
        const parsed = await pdfParse(fileBuffer);
        const hash = keccak256(fileBuffer);

        if (!parsed.text.includes('Purpose of trip')) {
            return res.status(400).json({ error: 'PDF missing required content: "Purpose of trip"' });
        }

        // Check if the document already exists in the database
        if (existing && existing.status !== 'Rejected') {
            return res.status(400).json({ error: 'Document already submitted and not rejected' });
        }

        const tx = await contract.submitDocument(docId, hash);
        await tx.wait();

        // Save the document to the database
        await Document.findOneAndUpdate(
            { docId },
            {
                docId,
                name: file.originalname, // Save file name
                status: 'Submitted',
                currentStatus: 'Submitted',
                hash: hash,
                timestamp: new Date(),
                version,
                $push: {
                    history: {
                        status: 'Submitted',
                        author: wallet.address, // Save author
                        timestamp: new Date(),
                        hash: hash,
                        txHash: tx.hash, // Save txHash
                        version: version,
                        docId: docId,
                    }
                }
            },
            { upsert: true }
        );

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
        console.log('Received statusStr:', statusStr);
        if (status === undefined) {
            return res.status(400).json({ error: 'Invalid status selected.' });
        }

        const fileBuffer = fs.readFileSync(file.path);
        const hash = keccak256(fileBuffer);

        const tx = await contract.updateStatus(docId, status, hash);
        await tx.wait();

        await Document.findOneAndUpdate(
            {docId},
            {
                status: statusStr,
                currentStatus: statusStr,
                hash: hash,
                timestamp: new Date(),
                $push: {
                    history: {
                        status: statusStr,
                        author: wallet.address,
                        timestamp: new Date(),
                        hash: hash,
                        txHash: tx.hash,
                        version: 1,
                        docId: docId,
                    }
                }
            }
        )

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

// -------------------------------
// GET /api/documents
// -------------------------------
router.get('/dashboard', async (req, res) => {
    try {
        const docs = await Document.find({});
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to fetch documents' });
    }
});

module.exports = router;
