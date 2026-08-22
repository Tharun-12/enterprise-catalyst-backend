const express = require("express");
const router = express.Router();
const db = require("../db");

// ========================================
// Add Product To Wishlist (with variant)
// ========================================
router.post("/wishlist", async (req, res) => {
    try {
        const { user_id, product_id, variant_id } = req.body;

        if (!user_id || !product_id) {
            return res.status(400).json({
                success: false,
                message: "user_id and product_id are required."
            });
        }

        // Check if product exists
        const [productCheck] = await db.execute(
            "SELECT * FROM products WHERE id = ?",
            [product_id]
        );

        if (productCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        // If variant_id is provided, check if it exists
        if (variant_id) {
            const [variantCheck] = await db.execute(
                "SELECT * FROM product_variants WHERE id = ? AND product_id = ?",
                [variant_id, product_id]
            );
            if (variantCheck.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Variant not found for this product."
                });
            }
        }

        // Check if product already exists in wishlist (with same variant)
        let query = "SELECT * FROM wishlist WHERE user_id=? AND product_id=?";
        let params = [user_id, product_id];
        
        if (variant_id) {
            query += " AND (variant_id = ? OR variant_id IS NULL)";
            params.push(variant_id);
        } else {
            query += " AND variant_id IS NULL";
        }

        const [exists] = await db.execute(query, params);

        if (exists.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Product already exists in wishlist."
            });
        }

        // Insert into wishlist with variant_id
        const [result] = await db.execute(
            "INSERT INTO wishlist(user_id, product_id, variant_id) VALUES(?, ?, ?)",
            [user_id, product_id, variant_id || null]
        );

        res.status(201).json({
            success: true,
            message: "Product added to wishlist.",
            wishlistId: result.insertId
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
// Get User Wishlist with selected variants
// ========================================
router.get("/wishlist/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const [rows] = await db.execute(
            `SELECT
                w.id AS wishlist_id,
                w.variant_id AS selected_variant_id,
                p.id,
                p.product_name,
                p.product_code,
                p.product_brand,
                p.product_details_pdf,
                p.min_price,
                p.max_price,
                p.discount,
                p.product_description,
                p.warranty,
                p.product_series,
                p.product_type,
                p.created_at,
                p.updated_at,
                c.category_name
            FROM wishlist w
            INNER JOIN products p ON w.product_id = p.id
            LEFT JOIN product_categories c ON p.product_category_id = c.id
            WHERE w.user_id = ?
            ORDER BY w.created_at DESC`,
            [userId]
        );

        for (const product of rows) {
            // Get all variants for the product
            const [variants] = await db.execute(
                `SELECT 
                    id, 
                    product_id, 
                    variant_name,
                    part_code,
                    category,
                    sub_category,
                    brand,
                    description,
                    spec_type,
                    color,
                    size,
                    min_price,
                    max_price,
                    availability,
                    datasheet_url,
                    stock, 
                    image_url,
                    created_at,
                    updated_at
                FROM product_variants 
                WHERE product_id = ?
                ORDER BY id`,
                [product.id]
            );
            
            // Mark which variant is selected
            const selectedVariantId = product.selected_variant_id;
            product.variants = variants.map(v => ({
                ...v,
                is_selected: v.id === selectedVariantId
            }));
            
            // Calculate min and max based on the selected variant only
            if (selectedVariantId) {
                const selectedVariant = variants.find(v => v.id === selectedVariantId);
                if (selectedVariant) {
                    product.min_price = selectedVariant.min_price;
                    product.max_price = selectedVariant.max_price;
                }
            }
        }

        res.json({
            success: true,
            data: rows
        });

    } catch (err) {
        console.error('Error fetching wishlist:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Get All Wishlist Items with User Details
// ========================================
router.get("/wishlist/all-with-users", async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
                w.id AS wishlist_id,
                w.user_id,
                w.variant_id AS selected_variant_id,
                w.created_at AS wishlist_created_at,
                p.id AS product_id,
                p.product_name,
                p.product_code,
                p.product_brand,
                p.product_details_pdf,
                p.min_price,
                p.max_price,
                p.discount,
                p.product_description,
                p.warranty,
                p.product_series,
                p.product_type,
                p.created_at AS product_created_at,
                p.updated_at AS product_updated_at,
                c.category_name,
                u.id AS user_id,
                u.name AS user_name,
                u.mobile AS user_mobile,
                u.email AS user_email,
                u.created_at AS user_created_at
            FROM wishlist w
            INNER JOIN products p ON w.product_id = p.id
            LEFT JOIN product_categories c ON p.product_category_id = c.id
            INNER JOIN users u ON w.user_id = u.id
            ORDER BY w.created_at DESC`
        );

        for (const item of rows) {
            const [variants] = await db.execute(
                `SELECT 
                    id, 
                    product_id, 
                    variant_name,
                    part_code,
                    category,
                    sub_category,
                    brand,
                    description,
                    spec_type,
                    color,
                    size,
                    min_price,
                    max_price,
                    availability,
                    datasheet_url,
                    stock, 
                    image_url,
                    created_at,
                    updated_at
                FROM product_variants 
                WHERE product_id = ?`,
                [item.product_id]
            );
            
            // Mark which variant is selected
            const selectedVariantId = item.selected_variant_id;
            item.variants = variants.map(v => ({
                ...v,
                is_selected: v.id === selectedVariantId
            }));
            
            // Calculate min and max based on the selected variant only
            if (selectedVariantId) {
                const selectedVariant = variants.find(v => v.id === selectedVariantId);
                if (selectedVariant) {
                    item.min_price = selectedVariant.min_price;
                    item.max_price = selectedVariant.max_price;
                }
            }
        }

        const groupedData = rows.reduce((acc, item) => {
            const userId = item.user_id;
            if (!acc[userId]) {
                acc[userId] = {
                    user: {
                        id: item.user_id,
                        name: item.user_name,
                        mobile: item.user_mobile,
                        email: item.user_email,
                        created_at: item.user_created_at
                    },
                    wishlist_items: []
                };
            }
            
            const { user_name, user_mobile, user_email, user_created_at, ...wishlistItem } = item;
            acc[userId].wishlist_items.push(wishlistItem);
            
            return acc;
        }, {});

        const result = Object.values(groupedData);

        res.json({
            success: true,
            total_users: result.length,
            total_wishlist_items: rows.length,
            data: result
        });

    } catch (err) {
        console.error('Error fetching wishlist with users:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Check Wishlist
// ========================================
router.get("/wishlist/check/:userId/:productId", async (req, res) => {
    try {
        const { userId, productId } = req.params;

        const [rows] = await db.execute(
            "SELECT * FROM wishlist WHERE user_id=? AND product_id=?",
            [userId, productId]
        );

        res.json({
            success: true,
            isWishlisted: rows.length > 0
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Wishlist Count
// ========================================
router.get("/wishlist/count/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const [rows] = await db.execute(
            "SELECT COUNT(*) AS total FROM wishlist WHERE user_id=?",
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
// Remove by Wishlist Id
// ========================================
router.delete("/wishlist/:wishlistId", async (req, res) => {
    try {
        const { wishlistId } = req.params;

        const [result] = await db.execute(
            "DELETE FROM wishlist WHERE id=?",
            [wishlistId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Wishlist item not found."
            });
        }

        res.json({
            success: true,
            message: "Removed from wishlist."
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Remove by Product Id
// ========================================
router.delete("/wishlist/user/:userId/product/:productId", async (req, res) => {
    try {
        const { userId, productId } = req.params;

        const [result] = await db.execute(
            "DELETE FROM wishlist WHERE user_id=? AND product_id=?",
            [userId, productId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Wishlist item not found."
            });
        }

        res.json({
            success: true,
            message: "Product removed from wishlist."
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ========================================
// Clear Wishlist By User ID
// ========================================
router.delete("/wishlist/clear/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const [result] = await db.execute(
            "DELETE FROM wishlist WHERE user_id = ?",
            [userId]
        );

        res.status(200).json({
            success: true,
            message: "Wishlist cleared successfully.",
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

module.exports = router;