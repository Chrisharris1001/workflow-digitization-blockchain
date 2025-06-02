const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { InfuraProvider, Wallet, Contract, keccak256 } = require('ethers');
require('dotenv').config();

const Document = require('../models/Document');
const contractJson = require('../contract.json');

const upload = multer({ dest: 'uploads/' });
const contractAddress = '0xe35dE5dca335e8ad597794e54Cf62eb700817639';

const provider = new InfuraProvider('sepolia', process.env.INFURA_API_KEY);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
const contract = new Contract(contractAddress, contractJson.abi, wallet);

const statusEnum = {
    Submitted: 0,
    AccountingApproved: 1,
    LegalApproved: 2,
    RectorApproved: 3,
    Rejected: 4
};

const statusMap = {
    0: 'Submitted',
    1: 'AccountingApproved',
    2: 'LegalApproved',
    3: 'RectorApproved',
    4: 'Rejected'
};

router.post('/submit-doc', upload.single('document'), async (req, res) => {
    try {
        const { docId } = req.body;
        const file = req.file;

        const fileBuffer = fs.readFileSync(file.path);
        const parsed = await pdfParse(fileBuffer);
        const hash = keccak256(fileBuffer);

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

        // Define required phrases for different document types
        const requiredPhrases = [
            'Purpose of trip',
            'Budget approval',
            'Employee details',
            'Travel itinerary',
            'Expense report',
            'Research project',
            'Conference participation',
            'Course syllabus',
            'Student list',
            'Faculty approval',
            'Grant application',
            'Academic transcript',
            'Enrollment certificate',
            'Thesis submission',
            'Internship agreement',
            'Scholarship application',
            'Exam schedule',
            'Laboratory report',
            'Meeting minutes',
            'Committee decision',
        ];
        // Check if at least one required phrase is present
        const containsRequiredPhrase = requiredPhrases.some(phrase => parsed.text.includes(phrase));
        if (!containsRequiredPhrase) {
            return res.status(400).json({ error: 'PDF missing required content. It must contain at least one of the required phrases.' });
        }

        const tx = await contract.submitDocument(docId, hash);
        await tx.wait();

        // Save the document to the database
        await Document.findOneAndUpdate(
            { docId },
            {
                docId,
                name: file.originalname, // Save file name
                filename: file.filename, // Save multer-generated filename
                status: 'Submitted',
                hash: hash,
                timestamp: new Date(),
                $push: {
                    history: {
                        status: 'Submitted',
                        author: wallet.address, // Save author
                        timestamp: new Date(),
                        hash: hash,
                        txHash: tx.hash, // Save txHash
                        docId: docId,
                    }
                }
            },
            { upsert: true }
        );

        res.json({ message: 'The document is submitted!', txHash: tx.hash });
    } catch (err) {
        console.error('Submit error:', err);
        res.status(500).json({ error: err.reason || err.message || 'Submission failed!' });
    }
});

router.post('/sign', upload.single('document'), async (req, res) => {
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

        // Only return the hash, do not call the smart contract or check required phrases
        res.json({ message: 'Validated. Ready for blockchain signature.', hash: hash });
    } catch (err) {
        console.error('Sign error:', err);
        res.status(500).json({ error: err.reason || err.message || 'Sign failed!' });
    }
});

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

        const [isValid, isPartial, message] = await contract.verifyDocument(docId, status, hash);

        res.json({
            valid: isValid,
            partiallyApproved: isPartial,
            message: message,
            blockchainStatus: statusStr
        });
    } catch (err) {
        console.error('Verify error:', err);
        res.status(500).json({ error: err.reason || err.message || 'Verification failed' });
    }
});

router.post('/update-document', async (req, res) => {
    try {
        const { docId, status, hash, txHash, author } = req.body;
        if (!docId || !status || !hash || !txHash || !author) {
            return res.status(400).json({ error: 'docId, status, hash, txHash, and author are required.' });
        }
        const updated = await Document.findOneAndUpdate(
            { docId },
            {
                $set: {
                    status,
                    hash,
                    timestamp: new Date(),
                    txHash,
                    author
                },
                $push: {
                    history: {
                        status,
                        hash,
                        timestamp: new Date(),
                        txHash,
                        author
                    }
                }
            },
            { new: true }
        );
        if (!updated) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        res.json({ success: true, document: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update document status.' });
    }
});

router.post('/reject', async (req, res) => {
    try {
        const { docId, status, reason } = req.body;
        if (!docId) {
            return res.status(400).json({ error: 'docId is required.' });
        }

        // Always set status to 'Rejected' for any department
        const tx = await contract.rejectDocument(docId, reason || 'Rejected');
        await tx.wait();

        // Find the document to get its current status
        const doc = await Document.findOne({ docId });
        if (!doc) {
            return res.status(404).json({ error: 'Document not found.' });
        }

        // Always set newStatus to 'Rejected'
        let newStatus = 'Rejected';
        let revertHistory = null;

        // Determine department (for now, hardcoded to Accounting, but should be dynamic in a real app)
        let department = 'Accounting';
        // If you have department info in the request/session, use that instead
        if (req.body.department) {
            department = req.body.department;
        }

        // Add department to history for rejection
        const historyEntry = {
            status: newStatus,
            reason: reason || 'Rejected',
            timestamp: new Date(),
            department,
            txHash: tx.hash,
            author: wallet.address
        };

        // Update the document in the database
        const updateOps = {
            $set: {
                status: newStatus,
                lastAction: {
                    action: 'Rejected',
                    department,
                    reason: reason || 'Rejected',
                    timestamp: new Date(),
                },
            },
            $push: { history: historyEntry },
        };
        if (revertHistory) {
            updateOps.$push.history = revertHistory;
        }
        const updated = await Document.findOneAndUpdate(
            { docId },
            updateOps,
            { new: true }
        );
        if (!updated) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        res.json({ success: true, document: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update document status.' });
    }
});

// Get all documents for dashboard (Admin sees all, others filter on frontend)
router.get('/dashboard', async (req, res) => {
    try {
        const docs = await Document.find({}).sort({ timestamp: -1 });
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch documents for dashboard.' });
    }
});

// Delete a document by docId
router.delete('/delete/:docId', async (req, res) => {
    try {
        const { docId } = req.params;
        if (!docId) {
            return res.status(400).json({ error: 'docId is required.' });
        }
        const deleted = await Document.findOneAndDelete({ docId });
        if (!deleted) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete document.' });
    }
});

module.exports = router;
