const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db");

const categoryRoutes = require("./routes/categoriesRoutes");
const brandRoutes = require("./routes/brandRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));




// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});



// API Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});