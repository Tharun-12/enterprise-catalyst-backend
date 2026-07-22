// routes/categoriesRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// Get all categories
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, category_name, created_at, updated_at FROM product_categories ORDER BY category_name ASC"
    );
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
      error: error.message
    });
  }
});

// Get a single category by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      "SELECT id, category_name, created_at, updated_at FROM product_categories WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch category",
      error: error.message
    });
  }
});

// Create a new category
router.post("/", async (req, res) => {
  try {
    const { category_name } = req.body;

    // Validate required fields
    if (!category_name || !category_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required"
      });
    }

    // Check if category with same name exists
    const [existing] = await db.query(
      "SELECT id FROM product_categories WHERE category_name = ?",
      [category_name.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Category with this name already exists"
      });
    }

    // Insert new category
    const [result] = await db.query(
      "INSERT INTO product_categories (category_name) VALUES (?)",
      [category_name.trim()]
    );

    // Get the newly created category
    const [newCategory] = await db.query(
      "SELECT id, category_name, created_at, updated_at FROM product_categories WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: newCategory[0]
    });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create category",
      error: error.message
    });
  }
});

// Update a category
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { category_name } = req.body;

    // Validate required fields
    if (!category_name || !category_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required"
      });
    }

    // Check if category exists
    const [category] = await db.query(
      "SELECT id FROM product_categories WHERE id = ?",
      [id]
    );

    if (category.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Check if another category has the same name (excluding current category)
    const [existing] = await db.query(
      "SELECT id FROM product_categories WHERE category_name = ? AND id != ?",
      [category_name.trim(), id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Another category with this name already exists"
      });
    }

    // Update category
    await db.query(
      "UPDATE product_categories SET category_name = ? WHERE id = ?",
      [category_name.trim(), id]
    );

    // Get the updated category
    const [updatedCategory] = await db.query(
      "SELECT id, category_name, created_at, updated_at FROM product_categories WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory[0]
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update category",
      error: error.message
    });
  }
});

// Delete a category
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const [category] = await db.query(
      "SELECT id, category_name FROM product_categories WHERE id = ?",
      [id]
    );

    if (category.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Delete category
    await db.query(
      "DELETE FROM product_categories WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: `Category "${category[0].category_name}" deleted successfully`
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete category",
      error: error.message
    });
  }
});

module.exports = router;