// routes/brandRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// Get all brands with category information
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT pb.id, pb.brand_name,
              pb.category_id, pc.category_name,
              pb.created_at, pb.updated_at 
       FROM product_brands pb
       LEFT JOIN product_categories pc ON pb.category_id = pc.id
       ORDER BY pb.brand_name ASC`
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
      `SELECT pb.id, pb.brand_name,
              pb.category_id, pc.category_name,
              pb.created_at, pb.updated_at 
       FROM product_brands pb
       LEFT JOIN product_categories pc ON pb.category_id = pc.id
       WHERE pb.id = ?`,
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
    const { 
      brand_name, 
      category_id
    } = req.body;

    // Validate required fields
    if (!brand_name || !brand_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required"
      });
    }

    // Validate category is provided
    if (!category_id) {
      return res.status(400).json({
        success: false,
        message: "Category is required"
      });
    }

    // Check if brand with same name exists
    const [existing] = await db.query(
      "SELECT id FROM product_brands WHERE brand_name = ?",
      [brand_name.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Brand with this name already exists"
      });
    }

    // Check if category exists
    const [categoryExists] = await db.query(
      "SELECT id FROM product_categories WHERE id = ?",
      [category_id]
    );

    if (categoryExists.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Selected category does not exist"
      });
    }

    // Insert new brand
    const [result] = await db.query(
      `INSERT INTO product_brands 
       (brand_name, category_id) 
       VALUES (?, ?)`,
      [
        brand_name.trim(), 
        category_id
      ]
    );

    // Get the newly created brand
    const [newBrand] = await db.query(
      `SELECT pb.id, pb.brand_name,
              pb.category_id, pc.category_name,
              pb.created_at, pb.updated_at 
       FROM product_brands pb
       LEFT JOIN product_categories pc ON pb.category_id = pc.id
       WHERE pb.id = ?`,
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
    const { 
      brand_name, 
      category_id
    } = req.body;

    // Validate required fields
    if (!brand_name || !brand_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required"
      });
    }

    // Validate category is provided
    if (!category_id) {
      return res.status(400).json({
        success: false,
        message: "Category is required"
      });
    }

    // Check if brand exists
    const [brand] = await db.query(
      "SELECT id FROM product_brands WHERE id = ?",
      [id]
    );

    if (brand.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Brand not found"
      });
    }

    // Check if category exists
    const [categoryExists] = await db.query(
      "SELECT id FROM product_categories WHERE id = ?",
      [category_id]
    );

    if (categoryExists.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Selected category does not exist"
      });
    }

    // Check if another brand has the same name (excluding current brand)
    const [existing] = await db.query(
      "SELECT id FROM product_brands WHERE brand_name = ? AND id != ?",
      [brand_name.trim(), id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Another brand with this name already exists"
      });
    }

    // Update brand
    await db.query(
      `UPDATE product_brands SET 
        brand_name = ?, 
        category_id = ?
       WHERE id = ?`,
      [
        brand_name.trim(), 
        category_id,
        id
      ]
    );

    // Get the updated brand
    const [updatedBrand] = await db.query(
      `SELECT pb.id, pb.brand_name,
              pb.category_id, pc.category_name,
              pb.created_at, pb.updated_at 
       FROM product_brands pb
       LEFT JOIN product_categories pc ON pb.category_id = pc.id
       WHERE pb.id = ?`,
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
      "SELECT id, brand_name FROM product_brands WHERE id = ?",
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
      "DELETE FROM product_brands WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: `Brand "${brand[0].brand_name}" deleted successfully`
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