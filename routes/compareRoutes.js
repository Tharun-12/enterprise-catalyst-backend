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

        // Get product details including product_type
        const [productCheck] = await db.execute(
            "SELECT id, product_type FROM products WHERE id = ?",
            [product_id]
        );

        if (productCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        const productType = productCheck[0].product_type;

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

        // Check if user has any products in compare and get their product_type
        const [existingCompare] = await db.execute(
            "SELECT product_type FROM compare WHERE user_id = ? LIMIT 1",
            [user_id]
        );

        if (existingCompare.length > 0) {
            const existingType = existingCompare[0].product_type;
            if (existingType !== productType) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot compare different product types. Existing: ${existingType}, New: ${productType}`
                });
            }
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

        // Insert into compare table with product_type
        const [result] = await db.execute(
            "INSERT INTO compare (user_id, product_id, product_type, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
            [user_id, product_id, productType]
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

        // Modified query to include product_type from compare table
        const [rows] = await db.execute(
            `SELECT
                c.id AS compare_id,
                c.user_id,
                c.product_type AS compare_product_type,
                c.created_at AS compare_created_at,
                c.updated_at AS compare_updated_at,
                p.id AS product_id,
                p.product_name,
                p.product_code,
                p.product_category_id,
                p.product_brand,
                p.product_details_pdf,
                p.product_description,
                p.warranty,
                p.product_series,
                p.product_type,
                p.created_at AS product_created_at,
                p.updated_at AS product_updated_at,
                p.min_price,
                p.max_price,
                p.discount,
                p.conductor_type,
                p.cable_od,
                p.jacket_material,
                p.bandwidth,
                p.operating_temperature,
                p.poe_support,
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
            
            // Calculate min and max price from variants if min_price/max_price are null
            if (variants.length > 0) {
                const prices = variants.map(v => parseFloat(v.price)).filter(p => !isNaN(p));
                if (prices.length > 0) {
                    product.min_price = Math.min(...prices).toFixed(2);
                    product.max_price = Math.max(...prices).toFixed(2);
                }
            }
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
            // Get product types for all products
            const placeholders = product_ids.map(() => '?').join(',');
            const [products] = await connection.execute(
                `SELECT id, product_type FROM products WHERE id IN (${placeholders})`,
                product_ids
            );

            if (products.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({
                    success: false,
                    message: "No valid products found."
                });
            }

            // Check if all products have the same product_type
            const productTypes = products.map(p => p.product_type);
            const uniqueTypes = [...new Set(productTypes)];
            
            if (uniqueTypes.length > 1) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    success: false,
                    message: `Cannot compare products with different types: ${uniqueTypes.join(', ')}`
                });
            }

            const productType = uniqueTypes[0];

            // Clear existing compare items for user
            await connection.execute(
                "DELETE FROM compare WHERE user_id = ?",
                [user_id]
            );

            // Add new compare items
            const addedProducts = [];
            for (const product of products) {
                await connection.execute(
                    "INSERT INTO compare (user_id, product_id, product_type, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
                    [user_id, product.id, productType]
                );
                addedProducts.push(product.id);
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