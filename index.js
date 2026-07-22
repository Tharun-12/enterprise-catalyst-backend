const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const db = require("./db");

const categoryRoutes = require("./routes/categoriesRoutes");
// const variantRoutes = require("./routes/variantRoutes");
const brandRoutes = require("./routes/brandRoutes");
const productRoutes = require("./routes/productRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const adminRoutes = require('./routes/adminRoutes');
const resetpasswordRoutes = require('./routes/resetpasswordRoutes');
const userRoutes = require('./routes/userRoutes');
const inquiryRoutes = require("./routes/inquiryRoutes");



const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));




// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});



// API Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
// app.use("/api/variants", variantRoutes);
app.use("/api/products", productRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/password", resetpasswordRoutes);
app.use("/api/users", userRoutes);
app.use("/api", inquiryRoutes);


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