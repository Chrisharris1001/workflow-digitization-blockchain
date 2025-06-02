const mongoose = require("mongoose");

const HistorySchema = new mongoose.Schema({
    status: String,
    author: String,
    timestamp: Date,
    hash: String,
    txHash: String,
});

const DocumentSchema = new mongoose.Schema({
    docId: String,
    name: String,
    version: {
        type: Number,
        default: 1,
    },
    status: String, // Use only status
    filename: String,
    history: [HistorySchema],
});

module.exports = mongoose.model("Document", DocumentSchema);
