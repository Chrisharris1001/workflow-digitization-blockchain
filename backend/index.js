//Express server
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require('cors');
const app = express();
const port = 5000;

app.use(cors({
  origin: 'http://localhost:3000', // Change this to your frontend URL if different
  credentials: true
}));
app.use(express.json());

// Load your route here
const docRoutes = require("./routes/documents");
app.use("/api/documents", docRoutes);


// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    // useNewUrlParser: true,
    // useUnifiedTopology: true,
})
    .then(() => {
        console.log("✅ Connected to MongoDB");
        app.listen(port, () => console.log(`🚀 Server running at http://localhost:${port}`));
    })
    .catch((err) => console.error("❌ MongoDB connection error:", err));

