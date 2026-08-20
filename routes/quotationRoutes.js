// quotationRoutes.js - Fixed without price column

const express = require("express");
const router = express.Router();
const db = require("../db");

// =======================================================
// Generate Quotation From Wishlist
// POST /api/quotations/generate-from-wishlist
// =======================================================
router.post("/quotations/generate-from-wishlist", async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { user_id, products, remarks = "" } = req.body;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: "user_id is required"
            });
        }

        if (!products || products.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No products selected"
            });
        }

        // Get User
        const [users] = await connection.execute(
            "SELECT * FROM users WHERE id=?",
            [user_id]
        );

        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const user = users[0];

        let totalAmount = 0;
        let totalDiscountAmount = 0;
        let grandTotal = 0;
        let totalItems = 0;

        const quotationNo = "QT-" + Date.now() + "-W";

        // Insert quotation
        const [quotation] = await connection.execute(
            `INSERT INTO quotations
            (
                quotation_no,
                user_id,
                customer_name,
                customer_mobile,
                customer_email,
                total_items,
                total_amount,
                total_discount,
                grand_total,
                remarks,
                status
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
                quotationNo,
                user_id,
                user.name,
                user.mobile,
                user.email,
                0, // Will update later
                0,
                0,
                0,
                remarks || `Quotation for ${products.length} selected wishlist items`,
                'Pending'
            ]
        );

        const quotationId = quotation.insertId;

        // Process each selected product
        for (const item of products) {
            let price = Number(item.price) || 0;
            const discountPercent = Number(item.discount || 0);
            const discountAmount = (price * discountPercent) / 100;
            const finalPrice = price - discountAmount;
            const quantity = Number(item.quantity) || 1;
            const subtotal = finalPrice * quantity;

            // Get product variants - FIXED: removed 'price' column
            const [variants] = await connection.execute(
                `SELECT 
                    id,
                    variant_name,
                    part_code,
                    spec_type,
                    color,
                    size,
                    min_price,
                    max_price,
                    image_url,
                    stock
                FROM product_variants 
                WHERE product_id = ?
                ORDER BY id`,
                [item.product_id]
            );

            let variantImage = null;
            let variantDetails = null;
            
            if (variants && variants.length > 0) {
                variantImage = variants[0].image_url || null;
                variantDetails = JSON.stringify(variants);
            }

            await connection.execute(
                `INSERT INTO quotation_items
                (
                    quotation_id,
                    product_id,
                    product_name,
                    product_code,
                    brand,
                    quantity,
                    price,
                    min_price,
                    max_price,
                    discount,
                    discount_amount,
                    final_price,
                    subtotal,
                    variant_image,
                    variant_details
                )
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    quotationId,
                    item.product_id,
                    item.product_name,
                    item.product_code,
                    item.product_brand,
                    quantity,
                    price,
                    item.min_price || null,
                    item.max_price || null,
                    discountPercent,
                    discountAmount,
                    finalPrice,
                    subtotal,
                    variantImage,
                    variantDetails
                ]
            );

            totalAmount += price * quantity;
            totalDiscountAmount += discountAmount * quantity;
            grandTotal += finalPrice * quantity;
            totalItems += quantity;

            // Remove from wishlist
            await connection.execute(
                "DELETE FROM wishlist WHERE user_id=? AND product_id=?",
                [user_id, item.product_id]
            );
        }

        // Update quotation with totals
        await connection.execute(
            `UPDATE quotations 
            SET total_items = ?, total_amount = ?, total_discount = ?, grand_total = ?
            WHERE id = ?`,
            [totalItems, totalAmount, totalDiscountAmount, grandTotal, quotationId]
        );

        await connection.commit();

        res.json({
            success: true,
            message: "Quotation generated successfully.",
            quotation_id: quotationId,
            quotation_no: quotationNo,
            total_items: totalItems,
            grand_total: grandTotal
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error generating quotation from wishlist:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    } finally {
        connection.release();
    }
});

// =======================================================
// Generate Single Product Quotation
// POST /api/quotations/single
// =======================================================
router.post("/quotations/single", async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { 
            user_id, 
            product_id, 
            product_name,
            product_code,
            product_brand,
            price,
            min_price,
            max_price,
            discount = 0,
            quantity = 1, 
            remarks = "",
            customer_name,
            customer_mobile,
            customer_email,
            variant_image,
            variant_details
        } = req.body;

        // Validate required fields
        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: "user_id is required"
            });
        }

        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: "product_id is required"
            });
        }

        // Get User if not provided
        let user = null;
        if (customer_name && customer_mobile && customer_email) {
            user = {
                name: customer_name,
                mobile: customer_mobile,
                email: customer_email
            };
        } else {
            const [users] = await connection.execute(
                "SELECT * FROM users WHERE id=?",
                [user_id]
            );

            if (users.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }
            user = users[0];
        }

        // Get Product if not provided
        let product = null;
        let productVariants = null;
        
        if (product_name && product_code && product_brand && price !== undefined) {
            product = {
                id: product_id,
                product_name: product_name,
                product_code: product_code,
                product_brand: product_brand,
                price: price,
                min_price: min_price || null,
                max_price: max_price || null,
                discount: discount
            };
        } else {
            // Get product details
            const [products] = await connection.execute(
                `SELECT 
                    p.id,
                    p.product_name,
                    p.product_code,
                    p.product_brand,
                    p.min_price,
                    p.max_price,
                    p.discount
                FROM products p
                WHERE p.id = ?`,
                [product_id]
            );

            if (products.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }
            product = products[0];

            // Get variants separately - FIXED: removed 'price' column
            const [variants] = await connection.execute(
                `SELECT 
                    id,
                    variant_name,
                    part_code,
                    spec_type,
                    color,
                    size,
                    min_price,
                    max_price,
                    image_url,
                    stock
                FROM product_variants 
                WHERE product_id = ?
                ORDER BY id`,
                [product_id]
            );
            productVariants = variants;
        }

        // Calculate amounts - discount is percentage
        let priceNum = Number(product.price) || Number(product.max_price) || Number(product.min_price) || 0;
        const discountPercent = Number(product.discount || 0);
        const discountAmount = (priceNum * discountPercent) / 100;
        const finalPrice = priceNum - discountAmount;
        const subtotal = finalPrice * quantity;

        // Get variant image if not provided
        let finalVariantImage = variant_image || null;
        let finalVariantDetails = variant_details || null;
        
        if (!finalVariantImage && productVariants && productVariants.length > 0) {
            finalVariantImage = productVariants[0].image_url || null;
            finalVariantDetails = JSON.stringify(productVariants);
        }

        // Generate quotation number
        const quotationNo = "QT-" + Date.now() + "-S";

        // Insert quotation
        const [quotation] = await connection.execute(
            `INSERT INTO quotations
            (
                quotation_no,
                user_id,
                customer_name,
                customer_mobile,
                customer_email,
                total_items,
                total_amount,
                total_discount,
                grand_total,
                remarks,
                status
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
                quotationNo,
                user_id,
                user.name,
                user.mobile,
                user.email,
                1, // Single product
                priceNum,
                discountAmount,
                finalPrice,
                remarks || `Quotation requested for ${product.product_name}`,
                'Pending'
            ]
        );

        const quotationId = quotation.insertId;

        // Insert quotation item with min_price, max_price, and variant image
        await connection.execute(
            `INSERT INTO quotation_items
            (
                quotation_id,
                product_id,
                product_name,
                product_code,
                brand,
                quantity,
                price,
                min_price,
                max_price,
                discount,
                discount_amount,
                final_price,
                subtotal,
                variant_image,
                variant_details
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                quotationId,
                product.id,
                product.product_name,
                product.product_code,
                product.product_brand,
                quantity,
                priceNum,
                product.min_price || null,
                product.max_price || null,
                discountPercent,
                discountAmount,
                finalPrice,
                subtotal,
                finalVariantImage,
                finalVariantDetails
            ]
        );

        // Remove the product from wishlist after generating quotation
        await connection.execute(
            "DELETE FROM wishlist WHERE user_id=? AND product_id=?",
            [user_id, product_id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: "Quotation generated successfully.",
            quotation_id: quotationId,
            quotation_no: quotationNo,
            product_name: product.product_name,
            quantity: quantity,
            final_price: finalPrice,
            grand_total: finalPrice
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error generating quotation:', err);
        res.status(500).json({
            success: false,
            message: err.message || 'Failed to generate quotation'
        });
    } finally {
        connection.release();
    }
});

// =======================================================
// Get All Quotations with Items
// GET /api/quotations
// =======================================================
router.get("/quotations", async (req, res) => {
    try {
        const [quotations] = await db.execute(`
            SELECT *
            FROM quotations
            ORDER BY id DESC
        `);

        // Fetch items for each quotation
        const quotationsWithDetails = await Promise.all(
            quotations.map(async (quotation) => {
                const [items] = await db.execute(
                    `SELECT *
                     FROM quotation_items
                     WHERE quotation_id = ?
                     ORDER BY id ASC`,
                    [quotation.id]
                );
                return {
                    ...quotation,
                    details: items
                };
            })
        );

        res.json({
            success: true,
            data: quotationsWithDetails
        });

    } catch (err) {
        console.error('Error fetching quotations:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// =======================================================
// Get Single Quotation
// GET /api/quotations/:id
// =======================================================
router.get("/quotations/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const [quotation] = await db.execute(
            "SELECT * FROM quotations WHERE id=?",
            [id]
        );

        if (quotation.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Quotation not found"
            });
        }

        const [items] = await db.execute(
            `SELECT *
             FROM quotation_items
             WHERE quotation_id=?`,
            [id]
        );

        res.json({
            success: true,
            quotation: quotation[0],
            items
        });

    } catch (err) {
        console.error('Error fetching quotation:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// =======================================================
// Get User Quotations with Items
// GET /api/quotations/user/:userId
// =======================================================
router.get("/quotations/user/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const [quotations] = await db.execute(
            `SELECT *
             FROM quotations
             WHERE user_id = ?
             ORDER BY id DESC`,
            [userId]
        );

        // Fetch items for each quotation
        const quotationsWithDetails = await Promise.all(
            quotations.map(async (quotation) => {
                const [items] = await db.execute(
                    `SELECT *
                     FROM quotation_items
                     WHERE quotation_id = ?
                     ORDER BY id ASC`,
                    [quotation.id]
                );
                return {
                    ...quotation,
                    details: items
                };
            })
        );

        res.json({
            success: true,
            data: quotationsWithDetails
        });

    } catch (err) {
        console.error('Error fetching user quotations:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// =======================================================
// Update Status
// PUT /api/quotations/:id/status
// =======================================================
router.put("/quotations/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["Pending", "Approved", "Rejected"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status."
            });
        }

        const [result] = await db.execute(
            "UPDATE quotations SET status=? WHERE id=?",
            [status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Quotation not found."
            });
        }

        res.json({
            success: true,
            message: "Quotation status updated."
        });

    } catch (err) {
        console.error('Error updating quotation status:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// =======================================================
// Update Quotation Item Quantity
// PUT /api/quotations/update-quantity
// =======================================================
router.put("/quotations/update-quantity", async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { user_id, quotation_id, item_id, quantity } = req.body;

        // Validate required fields
        if (!user_id || !quotation_id || !item_id || !quantity) {
            return res.status(400).json({
                success: false,
                message: "user_id, quotation_id, item_id, and quantity are required"
            });
        }

        if (quantity < 1) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be at least 1"
            });
        }

        // Verify the quotation belongs to the user
        const [quotations] = await connection.execute(
            "SELECT * FROM quotations WHERE id = ? AND user_id = ?",
            [quotation_id, user_id]
        );

        if (quotations.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Quotation not found or does not belong to this user"
            });
        }

        const quotation = quotations[0];

        // Check if quotation is pending (only allow editing pending quotations)
        if (quotation.status !== 'Pending') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Only pending quotations can be modified"
            });
        }

        // Get the current item
        const [items] = await connection.execute(
            "SELECT * FROM quotation_items WHERE id = ? AND quotation_id = ?",
            [item_id, quotation_id]
        );

        if (items.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Item not found in this quotation"
            });
        }

        const item = items[0];
        const oldQuantity = item.quantity;

        // Calculate new values
        const price = parseFloat(item.price);
        const discountPercent = parseFloat(item.discount) || 0;
        const discountAmount = (price * discountPercent) / 100;
        const finalPrice = price - discountAmount;
        const newSubtotal = finalPrice * quantity;

        // Update the item quantity
        await connection.execute(
            `UPDATE quotation_items 
            SET quantity = ?, subtotal = ?
            WHERE id = ? AND quotation_id = ?`,
            [quantity, newSubtotal, item_id, quotation_id]
        );

        // Recalculate quotation totals
        const [allItems] = await connection.execute(
            "SELECT * FROM quotation_items WHERE quotation_id = ?",
            [quotation_id]
        );

        let totalItems = 0;
        let totalAmount = 0;
        let totalDiscount = 0;
        let grandTotal = 0;

        allItems.forEach(item => {
            const qty = item.quantity;
            const price = parseFloat(item.price);
            const discount = parseFloat(item.discount) || 0;
            const discountAmount = (price * discount) / 100;
            const finalPrice = price - discountAmount;

            totalItems += qty;
            totalAmount += price * qty;
            totalDiscount += discountAmount * qty;
            grandTotal += finalPrice * qty;
        });

        // Update quotation totals
        await connection.execute(
            `UPDATE quotations 
            SET total_items = ?, total_amount = ?, total_discount = ?, grand_total = ?
            WHERE id = ?`,
            [totalItems, totalAmount, totalDiscount, grandTotal, quotation_id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: "Quantity updated successfully",
            data: {
                quotation_id,
                item_id,
                old_quantity: oldQuantity,
                new_quantity: quantity,
                total_items: totalItems,
                grand_total: grandTotal
            }
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error updating quotation quantity:', err);
        res.status(500).json({
            success: false,
            message: err.message || 'Failed to update quantity'
        });
    } finally {
        connection.release();
    }
});

module.exports = router;