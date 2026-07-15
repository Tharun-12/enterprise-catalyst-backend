// routes/brands.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// Get all brands
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, description, created_at, updated_at FROM brands ORDER BY name ASC"
    );
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch brands",
      error: error.message
    });
  }
});

// Get a single brand by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      "SELECT id, name, description, created_at, updated_at FROM brands WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Brand not found"
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error("Error fetching brand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch brand",
      error: error.message
    });
  }
});

// Create a new brand
router.post("/", async (req, res) => {
  try {
    const { name, description } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required"
      });
    }

    // Check if brand with same name exists
    const [existing] = await db.query(
      "SELECT id FROM brands WHERE name = ?",
      [name.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Brand with this name already exists"
      });
    }

    // Insert new brand
    const [result] = await db.query(
      "INSERT INTO brands (name, description) VALUES (?, ?)",
      [name.trim(), description?.trim() || '']
    );

    // Get the newly created brand
    const [newBrand] = await db.query(
      "SELECT id, name, description, created_at, updated_at FROM brands WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Brand created successfully",
      data: newBrand[0]
    });
  } catch (error) {
    console.error("Error creating brand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create brand",
      error: error.message
    });
  }
});

// Update a brand
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required"
      });
    }

    // Check if brand exists
    const [brand] = await db.query(
      "SELECT id FROM brands WHERE id = ?",
      [id]
    );

    if (brand.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Brand not found"
      });
    }

    // Check if another brand has the same name (excluding current brand)
    const [existing] = await db.query(
      "SELECT id FROM brands WHERE name = ? AND id != ?",
      [name.trim(), id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Another brand with this name already exists"
      });
    }

    // Update brand
    await db.query(
      "UPDATE brands SET name = ?, description = ? WHERE id = ?",
      [name.trim(), description?.trim() || '', id]
    );

    // Get the updated brand
    const [updatedBrand] = await db.query(
      "SELECT id, name, description, created_at, updated_at FROM brands WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: "Brand updated successfully",
      data: updatedBrand[0]
    });
  } catch (error) {
    console.error("Error updating brand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update brand",
      error: error.message
    });
  }
});

// Delete a brand
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if brand exists
    const [brand] = await db.query(
      "SELECT id, name FROM brands WHERE id = ?",
      [id]
    );

    if (brand.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Brand not found"
      });
    }

    // Delete brand
    await db.query(
      "DELETE FROM brands WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: `Brand "${brand[0].name}" deleted successfully`
    });
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete brand",
      error: error.message
    });
  }
});

module.exports = router;