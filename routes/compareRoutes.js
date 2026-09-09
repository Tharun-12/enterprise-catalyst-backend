// compareRoutes.js - Fixed to use sub_category for comparison
const express = require("express");
const router = express.Router();
const db = require("../db");

// ========================================
// Add Product To Compare (with variant_id)
// ========================================
router.post("/", async (req, res) => {
    try {
        const { user_id, product_id, variant_id } = req.body;

        if (!user_id || !product_id) {
            return res.status(400).json({
                success: false,
                message: "user_id and product_id are required."
            });
        }

        // Get product details including sub_category_id and specifications
        const [productCheck] = await db.execute(
            "SELECT id, sub_category_id, specifications FROM products WHERE id = ?",
            [product_id]
        );

        if (productCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        const subCategoryId = productCheck[0].sub_category_id;

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

        // Check if product already exists in compare list
        const [exists] = await db.execute(
            "SELECT * FROM compare WHERE user_id = ? AND product_id = ?",
            [user_id, product_id]
        );

        if (exists.length > 0) {
            // Update variant_id if different
            if (variant_id && exists[0].variant_id !== variant_id) {
                await db.execute(
                    "UPDATE compare SET variant_id = ?, updated_at = NOW() WHERE user_id = ? AND product_id = ?",
                    [variant_id, user_id, product_id]
                );
                return res.json({
                    success: true,
                    message: "Variant updated in compare list.",
                    data: { product_id, variant_id }
                });
            }
            return res.status(409).json({
                success: false,
                message: "Product already exists in compare list."
            });
        }

        // Check if user has any products in compare and get their sub_category_id
        const [existingCompare] = await db.execute(
            "SELECT sub_category_id FROM compare WHERE user_id = ? LIMIT 1",
            [user_id]
        );

        if (existingCompare.length > 0) {
            const existingSubCategoryId = existingCompare[0].sub_category_id;
            if (existingSubCategoryId !== subCategoryId) {
                // Get subcategory names for better error message
                const [existingSubCat] = await db.execute(
                    "SELECT subcategory_name FROM category_subcategories WHERE id = ?",
                    [existingSubCategoryId]
                );
                const [newSubCat] = await db.execute(
                    "SELECT subcategory_name FROM category_subcategories WHERE id = ?",
                    [subCategoryId]
                );
                const existingName = existingSubCat.length > 0 ? existingSubCat[0].subcategory_name : 'Unknown';
                const newName = newSubCat.length > 0 ? newSubCat[0].subcategory_name : 'Unknown';
                return res.status(400).json({
                    success: false,
                    message: `Cannot compare different subcategories. Existing: ${existingName}, New: ${newName}`
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

        // Insert into compare table with sub_category_id and variant_id
        const [result] = await db.execute(
            "INSERT INTO compare (user_id, product_id, sub_category_id, variant_id, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
            [user_id, product_id, subCategoryId, variant_id || null]
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
// Get User Compare List with Product Details and Variants
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

        const [rows] = await db.execute(
            `SELECT
                c.id AS compare_id,
                c.user_id,
                c.sub_category_id AS compare_sub_category_id,
                c.variant_id AS selected_variant_id,
                c.created_at AS compare_created_at,
                c.updated_at AS compare_updated_at,
                p.id AS product_id,
                p.product_name,
                p.product_code,
                p.category_id AS product_category_id,
                p.sub_category_id,
                p.product_brand,
                p.product_details_pdf,
                p.product_description,
                p.extra_information,
                p.warranty,
                p.specifications,
                p.created_at AS product_created_at,
                p.updated_at AS product_updated_at,
                p.discount,
                cat.category_name,
                subcat.subcategory_name
            FROM compare c
            INNER JOIN products p ON c.product_id = p.id
            LEFT JOIN product_categories cat ON p.category_id = cat.id
            LEFT JOIN category_subcategories subcat ON p.sub_category_id = subcat.id
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC`,
            [userId]
        );

        // Get variants and parse specifications for each product
        for (const product of rows) {
            // Get all variants for the product - only select columns that exist
            const [variants] = await db.execute(
                `SELECT 
                    id,
                    product_id,
                    variant_name,
                    part_code,
                    brand,
                    description,
                    color,
                    size,
                    min_price,
                    max_price,
                    availability,
                    image_url,
                    stock,
                    created_at,
                    updated_at
                FROM product_variants 
                WHERE product_id = ?`,
                [product.product_id]
            );
            
            // Mark which variant is selected
            const selectedVariantId = product.selected_variant_id;
            product.variants = variants.map(v => ({
                ...v,
                is_selected: v.id === selectedVariantId
            }));
            
            // Set min_price and max_price from variants
            if (selectedVariantId) {
                const selectedVariant = variants.find(v => v.id === selectedVariantId);
                if (selectedVariant) {
                    product.min_price = selectedVariant.min_price;
                    product.max_price = selectedVariant.max_price;
                }
            } else {
                // If no variant selected, calculate from all variants
                const minPrices = variants
                    .map(v => parseFloat(v.min_price || '0'))
                    .filter(p => !isNaN(p) && p > 0);
                
                const maxPrices = variants
                    .map(v => parseFloat(v.max_price || '0'))
                    .filter(p => !isNaN(p) && p > 0);
                
                if (minPrices.length > 0) {
                    product.min_price = Math.min(...minPrices).toString();
                } else {
                    product.min_price = null;
                }
                if (maxPrices.length > 0) {
                    product.max_price = Math.max(...maxPrices).toString();
                } else {
                    product.max_price = null;
                }
            }

            // Parse specifications from the product's specifications JSON field
            if (product.specifications) {
                try {
                    if (typeof product.specifications === 'string') {
                        product.specifications = JSON.parse(product.specifications);
                    }
                } catch (parseErr) {
                    console.error('Error parsing specifications for product', product.product_id, ':', parseErr);
                    product.specifications = {};
                }
            } else {
                product.specifications = {};
            }

            // Extract individual spec fields for easier access in frontend
            const specFields = product.specifications || {};
            product.spec_type = specFields['Spec Type'] || specFields['spec_type'] || '—';
            product.bandwidth = specFields['Bandwidth'] || specFields['bandwidth'] || '—';
            product.max_data_rate = specFields['Max Data Rate'] || specFields['max_data_rate'] || '—';
            product.internal_design = specFields['Internal Design'] || specFields['internal_design'] || '—';
            product.typical_applications = specFields['Typical Applications'] || specFields['typical_applications'] || '—';
            product.product_series = specFields['Product Series'] || specFields['product_series'] || '—';
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

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const placeholders = product_ids.map(() => '?').join(',');
            const [products] = await connection.execute(
                `SELECT id, sub_category_id FROM products WHERE id IN (${placeholders})`,
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

            const subCategoryIds = products.map(p => p.sub_category_id);
            const uniqueSubCategoryIds = [...new Set(subCategoryIds)];
            
            if (uniqueSubCategoryIds.length > 1) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    success: false,
                    message: `Cannot compare products with different subcategories.`
                });
            }

            const subCategoryId = uniqueSubCategoryIds[0];

            await connection.execute(
                "DELETE FROM compare WHERE user_id = ?",
                [user_id]
            );

            const addedProducts = [];
            for (const product of products) {
                await connection.execute(
                    "INSERT INTO compare (user_id, product_id, sub_category_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
                    [user_id, product.id, subCategoryId]
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