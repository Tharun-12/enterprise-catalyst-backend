// // routes/variantsRoutes.js
// const express = require("express");
// const router = express.Router();
// const db = require("../db");

// // Get all variants with product names
// router.get("/", async (req, res) => {
//   try {
//     const [rows] = await db.query(
//       `SELECT v.*, p.name as product_name 
//        FROM product_variants v 
//        LEFT JOIN products p ON v.product_id = p.id 
//        ORDER BY v.id DESC`
//     );
//     res.json({
//       success: true,
//       data: rows
//     });
//   } catch (error) {
//     console.error("Error fetching variants:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch variants",
//       error: error.message
//     });
//   }
// });

// // Get a single variant by ID
// router.get("/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const [rows] = await db.query(
//       `SELECT v.*, p.name as product_name 
//        FROM product_variants v 
//        LEFT JOIN products p ON v.product_id = p.id 
//        WHERE v.id = ?`,
//       [id]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Variant not found"
//       });
//     }

//     res.json({
//       success: true,
//       data: rows[0]
//     });
//   } catch (error) {
//     console.error("Error fetching variant:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch variant",
//       error: error.message
//     });
//   }
// });

// // Create a new variant
// router.post("/", async (req, res) => {
//   try {
//     const { product_id, color_name, color_hex, price, stock, image_url } = req.body;

//     // Validate required fields
//     if (!product_id || !color_name || !color_hex || price === undefined) {
//       return res.status(400).json({
//         success: false,
//         message: "Product ID, color name, color hex, and price are required"
//       });
//     }

//     const [result] = await db.query(
//       `INSERT INTO product_variants 
//        (product_id, color_name, color_hex, price, stock, image_url) 
//        VALUES (?, ?, ?, ?, ?, ?)`,
//       [product_id, color_name.trim(), color_hex, price, stock || 0, image_url || null]
//     );

//     const [newVariant] = await db.query(
//       `SELECT v.*, p.name as product_name 
//        FROM product_variants v 
//        LEFT JOIN products p ON v.product_id = p.id 
//        WHERE v.id = ?`,
//       [result.insertId]
//     );

//     res.status(201).json({
//       success: true,
//       message: "Variant created successfully",
//       data: newVariant[0]
//     });
//   } catch (error) {
//     console.error("Error creating variant:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to create variant",
//       error: error.message
//     });
//   }
// });

// // Update a variant
// router.put("/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { product_id, color_name, color_hex, price, stock, image_url } = req.body;

//     // Validate required fields
//     if (!product_id || !color_name || !color_hex || price === undefined) {
//       return res.status(400).json({
//         success: false,
//         message: "Product ID, color name, color hex, and price are required"
//       });
//     }

//     // Check if variant exists
//     const [variant] = await db.query(
//       "SELECT id FROM product_variants WHERE id = ?",
//       [id]
//     );

//     if (variant.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Variant not found"
//       });
//     }

//     await db.query(
//       `UPDATE product_variants 
//        SET product_id = ?, color_name = ?, color_hex = ?, price = ?, stock = ?, image_url = ? 
//        WHERE id = ?`,
//       [product_id, color_name.trim(), color_hex, price, stock || 0, image_url || null, id]
//     );

//     const [updatedVariant] = await db.query(
//       `SELECT v.*, p.name as product_name 
//        FROM product_variants v 
//        LEFT JOIN products p ON v.product_id = p.id 
//        WHERE v.id = ?`,
//       [id]
//     );

//     res.json({
//       success: true,
//       message: "Variant updated successfully",
//       data: updatedVariant[0]
//     });
//   } catch (error) {
//     console.error("Error updating variant:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to update variant",
//       error: error.message
//     });
//   }
// });

// // Delete a variant
// router.delete("/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     const [variant] = await db.query(
//       "SELECT id, color_name FROM product_variants WHERE id = ?",
//       [id]
//     );

//     if (variant.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Variant not found"
//       });
//     }

//     await db.query("DELETE FROM product_variants WHERE id = ?", [id]);

//     res.json({
//       success: true,
//       message: `Variant "${variant[0].color_name}" deleted successfully`
//     });
//   } catch (error) {
//     console.error("Error deleting variant:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to delete variant",
//       error: error.message
//     });
//   }
// });

// module.exports = router;