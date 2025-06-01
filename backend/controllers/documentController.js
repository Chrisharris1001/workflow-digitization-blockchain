const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');

exports.downloadDocument = async (req, res) => {
    const { filename } = req.params;
    try {
        // Find the document by stored filename (hash)
        const doc = await Document.findOne({ filename });
        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const filePath = path.join(__dirname, '../uploads', filename);
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                return res.status(404).json({ error: 'File not found' });
            }
            // Use the original name (e.g., test3_2.pdf) for download
            res.download(filePath, doc.name, (err) => {
                if (err) {
                    res.status(500).json({ error: 'Error downloading file' });
                }
            });
        });
    } catch (error) {
        console.error('Error downloading document:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

