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

const contractAddress = '0x1be7b9Ba6994Cad1497c8D21c3b02424DE901Cd4';

const provider = new InfuraProvider('sepolia', process.env.INFURA_API_KEY);

// Wallet and provider setup with error handling
let wallet;
if (!process.env.PRIVATE_KEY) {
    console.error('❌ Error: No PRIVATE_KEY found in environment variables. Please set PRIVATE_KEY in your .env file.');
    throw new Error('No active wallet found: PRIVATE_KEY missing.');
}
try {
    wallet = new Wallet(process.env.PRIVATE_KEY, provider);
} catch (err) {
    console.error('❌ Error: Failed to create wallet. Check your PRIVATE_KEY.');
    throw err;
}
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

        console.log('[SUBMIT] docId:', docId, 'hash:', hash);

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

        console.log('[DEBUG] Using contract address:', contractAddress);
        console.log('[DEBUG] ABI first function:', contractJson.abi[0]?.name);

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
        res.status(500).json({ error: err.message || 'Submission failed!' });
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

        console.log('[SIGN] docId:', docId, 'status:', statusStr, 'hash:', hash);

        // Fetch on-chain document and log the on-chain hash for debugging
        try {
            const docOnChain = await contract.getDocument(docId);
            const onChainHash = docOnChain[1];
            console.log(`[SIGN DEBUG] On-chain hash for docId ${docId}:`, onChainHash);
            if (!onChainHash || onChainHash === '0x' || onChainHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
                return res.status(404).json({ error: 'Document not found on-chain.' });
            }
            if (onChainHash !== hash) {
                return res.status(400).json({ error: 'Hash mismatch with on-chain document.' });
            }
        } catch (err) {
            console.error('[SIGN ERROR] Failed to fetch on-chain document:', err);
            return res.status(500).json({ error: 'Failed to fetch on-chain document.' });
        }

        // Call verifyDocument to check if signing is allowed
        const [isValid, isPartial, message] = await contract.verifyDocument(docId, status, hash);
        // Allow signing if:
        // - isValid is true (fully approved)
        // - isPartial is true and message contains 'You may sign for the next approval.'
        // - isPartial is true and message contains 'not yet approved.' (for first approval)
        if (!isValid) {
            if (
                isPartial &&
                (message.includes('You may sign for the next approval.') || message.includes('not yet approved.'))
            ) {
                // Allow signing for next approval or first approval
                // No error, continue
            } else {
                return res.status(400).json({ error: `Cannot sign: ${message}` });
            }
        }

        // Only return the hash, do not call the smart contract or check required phrases
        res.json({ message: 'Validated. Ready for blockchain signature.', hash: hash });
    } catch (err) {
        console.error('Sign error:', err);
        res.status(500).json({ error: err.message || 'Sign failed!' });
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
        res.status(500).json({ error: err.message || 'Verification failed' });
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

        // On-chain status check
        let docOnChain;
        try {
            docOnChain = await contract.getDocument(docId);
        } catch (err) {
            return res.status(404).json({error: 'Document not found on-chain.'});
        }
        const onChainHash = docOnChain[1];
        if (!onChainHash || onChainHash === '0x' || onChainHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            return res.status(404).json({error: 'Document not found on-chain.'});
        }
        if (onChainHash !== hash) {
            return res.status(400).json({error: 'Hash mismatch with on-chain document.'});
        }

        // On-chain status
        const onChainStatus = await contract.getDocumentStatus(docId);
        console.log(`[REJECT DEBUG] Backend - docId: ${docId}, onChainStatus: ${onChainStatus}`);
        // If already rejected on-chain, only update the database
        if (Number(onChainStatus) === 4) { // Already rejected on-chain
            let newStatus = 'Rejected';
            // Try to get the last rejection txHash from history if available
            let lastRejectionTxHash = null;
            if (doc.history && doc.history.length > 0) {
                const lastRejection = [...doc.history].reverse().find(h => h.status === 'Rejected' && h.txHash);
                if (lastRejection) lastRejectionTxHash = lastRejection.txHash;
            }
            const historyEntry = {
                status: newStatus,
                timestamp: new Date(),
                department,
                txHash: lastRejectionTxHash, // Use last known rejection txHash if available
                author: wallet.address,
            };
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
            return res.json({ success: true, document: updated });
        }
        // Only allow rejection if the document was actually submitted
        if (![0, 1, 2, 3].includes(Number(onChainStatus))) {
            return res.status(400).json({ error: 'Can only reject from a valid approval or submitted status.' });
        }

        // Only allow rejection if the department matches the current status
        const statusToDepartment = {
            Submitted: 'Accounting',
            AccountingApproved: 'Legal',
            LegalApproved: 'Rector',
            RectorApproved: '',
        };
        const allowedDepartment = statusToDepartment[doc.status];
        if (department !== allowedDepartment) {
            return res.status(403).json({error: `Only the ${allowedDepartment} department can reject at this stage.`});
        }

        // If already rejected on-chain, only update the database
        if (Number(onChainStatus) === 4) { // Already rejected on-chain
            let newStatus = 'Rejected';
            // Try to get the last rejection txHash from history if available
            let lastRejectionTxHash = null;
            if (doc.history && doc.history.length > 0) {
                const lastRejection = [...doc.history].reverse().find(h => h.status === 'Rejected' && h.txHash);
                if (lastRejection) lastRejectionTxHash = lastRejection.txHash;
            }
            const historyEntry = {
                status: newStatus,
                timestamp: new Date(),
                department,
                txHash: lastRejectionTxHash, // Use last known rejection txHash if available
                author: wallet.address,
            };
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
            return res.json({ success: true, document: updated });
        }

        // Always set status to 'Rejected' for any department
        const tx = await contract.rejectDocument(docId, hash);
        await tx.wait();

        let newStatus = 'Rejected';
        const historyEntry = {
            status: newStatus,
            timestamp: new Date(),
            department,
            txHash: tx.hash,
            author: wallet.address,
            reason: 'Rejected on-chain'
        };
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

        // Fetch the new on-chain status after revert
        const onChainStatus = await contract.getDocumentStatus(docId);
        const newStatus = statusMap[Number(onChainStatus)] || 'Submitted';

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
        res.status(500).json({ error: err.message || 'Failed to revert document.' });
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