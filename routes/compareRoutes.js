const express = require("express");
const router = express.Router();
const db = require("../db");

// ========================================
// Add Product To Compare
// ========================================
router.post("/", async (req, res) => {
    try {
        const { user_id, product_id } = req.body;

        if (!user_id || !product_id) {
            return res.status(400).json({
                success: false,
                message: "user_id and product_id are required."
            });
        }

        // Check if product exists
        const [productCheck] = await db.execute(
            "SELECT id FROM products WHERE id = ?",
            [product_id]
        );

        if (productCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        // Check if product already exists in compare list
        const [exists] = await db.execute(
            "SELECT * FROM compare WHERE user_id = ? AND product_id = ?",
            [user_id, product_id]
        );

        if (exists.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Product already exists in compare list."
            });
        }

        // Check if user has reached max limit (4 products)
        const [countResult] = await db.execute(
            "SELECT COUNT(*) AS count FROM compare WHERE user_id = ?",
            [user_id]
        );

        if (countResult[0].count >= 4) {
            return res.status(400).json({
                success: false,
                message: "Maximum 4 products can be compared at a time."
            });
        }

        // Insert into compare table
        const [result] = await db.execute(
            "INSERT INTO compare (user_id, product_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
            [user_id, product_id]
        );

        // Get the inserted record
        const [newRecord] = await db.execute(
            "SELECT * FROM compare WHERE id = ?",
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: "Product added to compare list.",
            data: newRecord[0]
        });

    } catch (err) {
        console.error('Error adding to compare:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Get User Compare List with Product Details
// ========================================
router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required."
            });
        }

        // Only select columns that exist in your products table
        const [rows] = await db.execute(
            `SELECT
                c.id AS compare_id,
                c.user_id,
                c.created_at AS compare_created_at,
                c.updated_at AS compare_updated_at,
                p.id AS product_id,
                p.product_name,
                p.product_code,
                p.product_category_id,
                p.product_brand,
                p.product_details_pdf,
                p.price,
                p.discount,
                p.product_description,
                p.warranty,
                p.product_series,
                p.product_type,
                p.created_at AS product_created_at,
                p.updated_at AS product_updated_at,
                cat.category_name
            FROM compare c
            INNER JOIN products p ON c.product_id = p.id
            LEFT JOIN product_categories cat ON p.product_category_id = cat.id
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC`,
            [userId]
        );

        // Get variants for each product
        for (const product of rows) {
            const [variants] = await db.execute(
                `SELECT 
                    id,
                    product_id,
                    variant_name,
                    part_code,
                    category,
                    brand,
                    description,
                    spec_type,
                    color,
                    size,
                    price,
                    availability,
                    datasheet_url,
                    image_url,
                    stock,
                    created_at,
                    updated_at
                FROM product_variants 
                WHERE product_id = ?`,
                [product.product_id]
            );
            product.variants = variants;
        }

        res.json({
            success: true,
            data: rows,
            count: rows.length
        });

    } catch (err) {
        console.error('Error fetching compare list:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Check if Product is in Compare List
// ========================================
router.get("/check/:userId/:productId", async (req, res) => {
    try {
        const { userId, productId } = req.params;

        const [rows] = await db.execute(
            "SELECT * FROM compare WHERE user_id = ? AND product_id = ?",
            [userId, productId]
        );

        res.json({
            success: true,
            exists: rows.length > 0
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Get Compare Count
// ========================================
router.get("/count/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const [rows] = await db.execute(
            "SELECT COUNT(*) AS total FROM compare WHERE user_id = ?",
            [userId]
        );

        res.json({
            success: true,
            total: rows[0].total
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Remove Product from Compare by Product ID
// ========================================
router.delete("/:userId/:productId", async (req, res) => {
    try {
        const { userId, productId } = req.params;

        const [result] = await db.execute(
            "DELETE FROM compare WHERE user_id = ? AND product_id = ?",
            [userId, productId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found in compare list."
            });
        }

        res.json({
            success: true,
            message: "Product removed from compare list."
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Clear All Compare Items for a User
// ========================================
router.delete("/clear/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const [result] = await db.execute(
            "DELETE FROM compare WHERE user_id = ?",
            [userId]
        );

        res.status(200).json({
            success: true,
            message: "Compare list cleared successfully.",
            deletedItems: result.affectedRows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Bulk Add Products to Compare
// ========================================
router.post("/bulk", async (req, res) => {
    try {
        const { user_id, product_ids } = req.body;

        if (!user_id || !product_ids || !Array.isArray(product_ids)) {
            return res.status(400).json({
                success: false,
                message: "user_id and product_ids array are required."
            });
        }

        if (product_ids.length > 4) {
            return res.status(400).json({
                success: false,
                message: "Maximum 4 products can be compared at a time."
            });
        }

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Clear existing compare items for user
            await connection.execute(
                "DELETE FROM compare WHERE user_id = ?",
                [user_id]
            );

            // Add new compare items
            const addedProducts = [];
            for (const productId of product_ids) {
                // Check if product exists
                const [productCheck] = await connection.execute(
                    "SELECT id FROM products WHERE id = ?",
                    [productId]
                );

                if (productCheck.length > 0) {
                    await connection.execute(
                        "INSERT INTO compare (user_id, product_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
                        [user_id, productId]
                    );
                    addedProducts.push(productId);
                }
            }

            await connection.commit();
            connection.release();

            res.status(201).json({
                success: true,
                message: `${addedProducts.length} products added to compare list.`,
                data: addedProducts
            });

        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }

    } catch (err) {
        console.error('Error bulk adding to compare:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;