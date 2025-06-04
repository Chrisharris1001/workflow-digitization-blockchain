const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { InfuraProvider, Wallet, Contract, keccak256 } = require('ethers');
const path = require('path');
require('dotenv').config();

const Document = require('../models/Document');
const contractJson = require('../contract.json');
const documentController = require('../controllers/documentController');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

const contractAddress = '0xBADFe18893763645bF24d8d34C62D48495Bb414A';

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
        const {docId, hash, department} = req.body;
        if (!docId || !hash) {
            return res.status(400).json({error: 'docId and hash are required.'});
        }

        // Find the document to get its current status
        const doc = await Document.findOne({docId});
        if (!doc) {
            return res.status(404).json({error: 'Document not found.'});
        }

        // Only allow rejection if the department matches the current status
        const statusToDepartment = {
            Submitted: 'Accounting',
            AccountingApproved: 'Legal',
            LegalApproved: 'Rector',
        };
        const allowedDepartment = statusToDepartment[doc.status];
        if (department !== allowedDepartment) {
            return res.status(403).json({error: `Only the ${allowedDepartment} department can reject at this stage.`});
        }

        // On-chain hash verification (strict)
        const onChainHash = await contract.callStatic["documents"](docId).then(d => d.hash);
        if (!onChainHash || onChainHash === '0x' || onChainHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            return res.status(404).json({error: 'Document not found on-chain.'});
        }
        if (onChainHash !== hash) {
            return res.status(400).json({error: 'Hash mismatch with on-chain document.'});
        }

        // Always set status to 'Rejected' for any department
        const tx = await contract.rejectDocument(docId, hash);
        await tx.wait();

        // Always set newStatus to 'Rejected'
        let newStatus = 'Rejected';

        // Add department to history for rejection
        const historyEntry = {
            status: newStatus,
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
                    timestamp: new Date(),
                },
            },
            $push: {history: historyEntry},
        };
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

router.post('/revert', async (req, res) => {
    try {
        const { docId } = req.body;
        if (!docId) {
            return res.status(400).json({ error: 'docId is required.' });
        }

        const doc = await Document.findOne({ docId });
        if (!doc) {
            return res.status(404).json({ error: 'Document not found.' });
        }

        // Only allow revert from approval statuses or if rejected
        const approvalStatuses = ['AccountingApproved', 'LegalApproved', 'RectorApproved', 'Rejected'];
        if (!approvalStatuses.includes(doc.status)) {
            return res.status(400).json({ error: 'Can only revert from an approval or rejected status.' });
        }

        // Call the smart contract revert function (corrected function name)
        const tx = await contract.revertToPreviousStatus(docId);
        await tx.wait();

        // Find the previous status from history
        let previousStatus = 'Submitted'; // fallback if no previous status
        if (doc.history && doc.history.length > 0) {
            // Find the last status that is different from the current one
            for (let i = doc.history.length - 1; i >= 0; i--) {
                if (doc.history[i].status !== doc.status) {
                    previousStatus = doc.history[i].status;
                    break;
                }
            }
        }
        const newStatus = previousStatus;
        const historyEntry = {
            status: newStatus,
            action: 'Reverted',
            timestamp: new Date(),
            txHash: tx.hash,
            author: wallet.address
        };

        // Update the document in the database
        const updated = await Document.findOneAndUpdate(
            { docId },
            {
                $set: { status: newStatus, timestamp: new Date() },
                $push: { history: historyEntry }
            },
            { new: true }
        );
        if (!updated) {
            return res.status(404).json({ error: 'Document not found after revert.' });
        }
        res.json({ success: true, document: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.reason || err.message || 'Failed to revert document.' });
    }
});

// Get all documents for dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const docs = await Document.find({});
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch documents for dashboard.' });
    }
});

// Add this route for downloading documents by filename
router.get('/download/:filename', documentController.downloadDocument);

// Delete a document by docId
router.delete('/delete/:docId', async (req, res) => {
    try {
        const { docId } = req.params;
        if (!docId) {
            return res.status(400).json({ error: 'docId is required.' });
        }
        const doc = await Document.findOne({ docId });
        if (!doc) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        // Remove file from uploads directory
        if (doc.filename) {
            const filePath = path.join(__dirname, '../uploads', doc.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        // Remove from database
        await Document.deleteOne({ docId });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete document.' });
    }
});

module.exports = router;
