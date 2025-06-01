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
const contractAddress = '0x4BE5AF0dB8945dE0A901A21fAc17063Ef893e5BF';

const provider = new InfuraProvider('sepolia', process.env.INFURA_API_KEY);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
const contract = new Contract(contractAddress, contractJson.abi, wallet);

const statusEnum = {
    Submitted: 0,
    AccountingApproved: 1,
    LegalApproved: 2,
    RectorApproved: 3,
    Rejected: 4,
};

router.post('/submit-doc', upload.single('document'), async (req, res) => {
    try {
        const { docId } = req.body;
        const file = req.file;

        const fileBuffer = fs.readFileSync(file.path);
        const parsed = await pdfParse(fileBuffer);
        const hash = keccak256(fileBuffer);

        const rejectAndLog = async (reason) => {
            try {
                await contract.rejectDocument(docId);
                await Document.findOneAndUpdate(
                    {docId},
                    {
                        docId,
                        name: file.originalname,
                        status: 'Rejected',
                        currentStatus: 'Rejected',
                        hash: hash,
                        timestamp: new Date(),
                        $push: {
                            history: {
                                status: 'Rejected',
                                author: wallet.address,
                                timestamp: new Date(),
                                hash: hash,
                                txHash: '',
                                docId: docId,
                                reason: reason,
                            }
                        }
                    },
                    { upsert: true }
                );
                return res.status(200).json({ status: 'Rejected!', reason });
            } catch (err) {
                console.error('Error rejecting document:', err);
                return res.status(500).json({ error: 'Failed to reject the document!' });
            }
        };

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
                status: 'Submitted',
                currentStatus: 'Submitted',
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
                    currentStatus: status,
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

router.get('/dashboard', async (req, res) => {
    try {
        const docs = await Document.find({});
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to fetch documents' });
    }
});

module.exports = router;
