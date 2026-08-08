// routes/specificationsRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// Helper function to ensure brand exists in product_brands table
const ensureBrandExists = async (brandName, categoryId) => {
  try {
    // Check if brand already exists
    const [existingBrand] = await db.query(
      "SELECT id FROM product_brands WHERE brand_name = ?",
      [brandName.trim()]
    );

    if (existingBrand.length > 0) {
      // Brand exists, return its id
      return existingBrand[0].id;
    }

    // Brand doesn't exist, create it
    const [result] = await db.query(
      "INSERT INTO product_brands (brand_name, category_id) VALUES (?, ?)",
      [brandName.trim(), categoryId]
    );

    console.log(`✅ New brand created: "${brandName}" with ID: ${result.insertId}`);
    return result.insertId;
  } catch (error) {
    console.error(`Error ensuring brand exists for "${brandName}":`, error);
    throw error;
  }
};

// Process all brands in color_brand_mapping
const processBrandsInMapping = async (colorBrandMapping, categoryId) => {
  const processedMapping = {};
  
  for (const [color, brands] of Object.entries(colorBrandMapping)) {
    processedMapping[color] = [];
    for (const brandName of brands) {
      try {
        // Ensure brand exists in product_brands
        await ensureBrandExists(brandName, categoryId);
        processedMapping[color].push(brandName);
      } catch (error) {
        console.error(`Failed to process brand "${brandName}":`, error);
        // Still add the brand name to the mapping even if creation fails
        processedMapping[color].push(brandName);
      }
    }
  }
  
  return processedMapping;
};

// Get all specifications with category info
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, s.spec_name, 
              s.color_brand_mapping,
              s.created_at, s.updated_at 
       FROM specifications s
       LEFT JOIN product_categories c ON s.category_id = c.id
       ORDER BY s.spec_name ASC`
    );
    
    // Parse JSON fields before sending
    const parsedRows = rows.map(row => ({
      ...row,
      color_brand_mapping: row.color_brand_mapping ? JSON.parse(row.color_brand_mapping) : {}
    }));
    
    res.json({
      success: true,
      data: parsedRows
    });
  } catch (error) {
    console.error("Error fetching specifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch specifications",
      error: error.message
    });
  }
});

// Get a single specification by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, s.spec_name, 
              s.color_brand_mapping,
              s.created_at, s.updated_at 
       FROM specifications s
       LEFT JOIN product_categories c ON s.category_id = c.id
       WHERE s.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Specification not found"
      });
    }

    // Parse JSON fields
    const row = rows[0];
    const parsedRow = {
      ...row,
      color_brand_mapping: row.color_brand_mapping ? JSON.parse(row.color_brand_mapping) : {}
    };

    res.json({
      success: true,
      data: parsedRow
    });
  } catch (error) {
    console.error("Error fetching specification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch specification",
      error: error.message
    });
  }
});

// Create a new specification
router.post("/", async (req, res) => {
  try {
    const { 
      category_id, spec_name, color_brand_mapping
    } = req.body;

    console.log('Received data:', req.body);

    // Validate required fields
    if (!category_id) {
      return res.status(400).json({
        success: false,
        message: "Category is required"
      });
    }

    if (!spec_name || !spec_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Specification name is required"
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

    // Check if spec_name already exists for this category
    const [existingSpec] = await db.query(
      "SELECT id FROM specifications WHERE spec_name = ? AND category_id = ?",
      [spec_name.trim(), category_id]
    );

    if (existingSpec.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This specification already exists for the selected category"
      });
    }

    // Process brands to ensure they exist in product_brands
    let processedMapping = color_brand_mapping || {};
    if (Object.keys(processedMapping).length > 0) {
      try {
        processedMapping = await processBrandsInMapping(processedMapping, category_id);
        console.log('✅ Processed brand mapping:', processedMapping);
      } catch (error) {
        console.error('Error processing brands:', error);
        // Continue with original mapping if processing fails
      }
    }

    // Insert new specification
    const [result] = await db.query(
      `INSERT INTO specifications 
       (category_id, spec_name, color_brand_mapping) 
       VALUES (?, ?, ?)`,
      [
        category_id,
        spec_name.trim(),
        processedMapping ? JSON.stringify(processedMapping) : null
      ]
    );

    // Get the newly created specification
    const [newSpec] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, s.spec_name, 
              s.color_brand_mapping,
              s.created_at, s.updated_at 
       FROM specifications s
       LEFT JOIN product_categories c ON s.category_id = c.id
       WHERE s.id = ?`,
      [result.insertId]
    );

    // Parse JSON fields
    const parsedSpec = {
      ...newSpec[0],
      color_brand_mapping: newSpec[0].color_brand_mapping ? JSON.parse(newSpec[0].color_brand_mapping) : {}
    };

    res.status(201).json({
      success: true,
      message: "Specification created successfully",
      data: parsedSpec
    });
  } catch (error) {
    console.error("Error creating specification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create specification",
      error: error.message
    });
  }
});

// Update a specification
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      category_id, spec_name, color_brand_mapping
    } = req.body;

    // Validate required fields
    if (!category_id) {
      return res.status(400).json({
        success: false,
        message: "Category is required"
      });
    }

    if (!spec_name || !spec_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Specification name is required"
      });
    }

    // Check if specification exists
    const [spec] = await db.query(
      "SELECT id FROM specifications WHERE id = ?",
      [id]
    );

    if (spec.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Specification not found"
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

    // Check if another spec has the same name (excluding current)
    const [existingSpec] = await db.query(
      "SELECT id FROM specifications WHERE spec_name = ? AND category_id = ? AND id != ?",
      [spec_name.trim(), category_id, id]
    );

    if (existingSpec.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Another specification with this name already exists for the selected category"
      });
    }

    // Process brands to ensure they exist in product_brands
    let processedMapping = color_brand_mapping || {};
    if (Object.keys(processedMapping).length > 0) {
      try {
        processedMapping = await processBrandsInMapping(processedMapping, category_id);
        console.log('✅ Processed brand mapping:', processedMapping);
      } catch (error) {
        console.error('Error processing brands:', error);
        // Continue with original mapping if processing fails
      }
    }

    // Update specification
    await db.query(
      `UPDATE specifications SET 
        category_id = ?,
        spec_name = ?,
        color_brand_mapping = ?
       WHERE id = ?`,
      [
        category_id,
        spec_name.trim(),
        processedMapping ? JSON.stringify(processedMapping) : null,
        id
      ]
    );

    // Get the updated specification
    const [updatedSpec] = await db.query(
      `SELECT s.id, s.category_id, c.category_name, s.spec_name, 
              s.color_brand_mapping,
              s.created_at, s.updated_at 
       FROM specifications s
       LEFT JOIN product_categories c ON s.category_id = c.id
       WHERE s.id = ?`,
      [id]
    );

    // Parse JSON fields
    const parsedSpec = {
      ...updatedSpec[0],
      color_brand_mapping: updatedSpec[0].color_brand_mapping ? JSON.parse(updatedSpec[0].color_brand_mapping) : {}
    };

    res.json({
      success: true,
      message: "Specification updated successfully",
      data: parsedSpec
    });
  } catch (error) {
    console.error("Error updating specification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update specification",
      error: error.message
    });
  }
});

// Delete a specification
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if specification exists
    const [spec] = await db.query(
      "SELECT id, spec_name FROM specifications WHERE id = ?",
      [id]
    );

    if (spec.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Specification not found"
      });
    }

    // Delete specification
    await db.query(
      "DELETE FROM specifications WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: `Specification "${spec[0].spec_name}" deleted successfully`
    });
  } catch (error) {
    console.error("Error deleting specification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete specification",
      error: error.message
    });
  }
});

module.exports = router;