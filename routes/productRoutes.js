const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");

const productUploadDir = "uploads/products";
const pdfUploadDir = "uploads/pdfs";

// Ensure upload directories exist
if (!fs.existsSync(productUploadDir)) {
    fs.mkdirSync(productUploadDir, { recursive: true });
}
if (!fs.existsSync(pdfUploadDir)) {
    fs.mkdirSync(pdfUploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === "images" || file.fieldname === "product_images") {
            cb(null, productUploadDir);
        } else if (file.fieldname === "product_details_pdf") {
            cb(null, pdfUploadDir);
        } else {
            cb(null, productUploadDir);
        }
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === "images" || file.fieldname === "product_images") {
            const allowed = /jpeg|jpg|png|webp|gif/;
            const ext = path.extname(file.originalname).toLowerCase();
            if (allowed.test(ext) && allowed.test(file.mimetype)) {
                return cb(null, true);
            }
            return cb(new Error("Only image files are allowed"));
        }
        if (file.fieldname === "product_details_pdf") {
            const ext = path.extname(file.originalname).toLowerCase();
            if (ext === ".pdf") {
                return cb(null, true);
            }
            return cb(new Error("Only PDF files are allowed"));
        }
        cb(null, true);
    },
});

function uploadWithLogging(multerMiddleware, routeLabel) {
    return (req, res, next) => {
        multerMiddleware(req, res, (err) => {
            if (err) {
                console.error(`Multer error on ${routeLabel}:`, err.message);
                return res.status(400).json({ error: err.message });
            }
            next();
        });
    };
}

// ============================================
// PRODUCT CRUD OPERATIONS
// ============================================

// CREATE PRODUCT
router.post(
    "/",
    uploadWithLogging(upload.fields([{ name: "product_details_pdf", maxCount: 1 }]), "POST /api/products"),
    async (req, res) => {
        try {
            const {
                product_name,
                product_code,
                product_category_id,
                product_brand,
                price,
                dimensions,
                specifications,
                weight,
                discount,
                product_description,
                warranty,
                bandwidth,
                max_data_rate,
                internal_design,
                typical_applications,
                conductor_type,
                cable_od,
                jacket_material,
                operating_temperature,
                poe_support,
                product_series,
                rack_type,
                static_load,
                mounting_type,
                rack_standard,
                construction_type
            } = req.body;

            let pdfFile = "";
            if (req.files && req.files["product_details_pdf"]) {
                pdfFile = req.files["product_details_pdf"][0].filename;
            }

            const sql = `
                INSERT INTO products (
                    product_name, product_code, product_category_id, product_brand,
                    product_details_pdf, price, dimensions, specifications,
                    weight, discount, product_description, warranty,
                    bandwidth, max_data_rate, internal_design, typical_applications,
                    conductor_type, cable_od, jacket_material, operating_temperature,
                    poe_support, product_series, rack_type, static_load,
                    mounting_type, rack_standard, construction_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const [result] = await db.query(sql, [
                product_name,
                product_code,
                product_category_id,
                product_brand,
                pdfFile,
                price,
                dimensions,
                specifications,
                weight,
                discount || 0,
                product_description,
                warranty,
                bandwidth || null,
                max_data_rate || null,
                internal_design || null,
                typical_applications || null,
                conductor_type || null,
                cable_od || null,
                jacket_material || null,
                operating_temperature || null,
                poe_support || null,
                product_series || null,
                rack_type || null,
                static_load || null,
                mounting_type || null,
                rack_standard || null,
                construction_type || null
            ]);

            res.status(201).json({
                success: true,
                message: "Product added successfully",
                id: result.insertId,
            });
        } catch (error) {
            console.error("Error in product creation:", error);
            res.status(500).json({ error: error.message });
        }
    }
);

// GET PRODUCTS WITH VARIANTS
router.get("/products-with-variants", async (req, res) => {
    try {
        const sql = `
            SELECT p.*, c.category_name
            FROM products p
            LEFT JOIN product_categories c ON p.product_category_id = c.id
            ORDER BY p.id DESC
        `;

        const [products] = await db.query(sql);

        for (const product of products) {
            const [variants] = await db.query(
                "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id",
                [product.id]
            );
            product.variants = variants;
        }

        res.json(products);
    } catch (error) {
        console.error("Error in products-with-variants:", error);
        res.status(500).json(error);
    }
});

// GET SINGLE PRODUCT WITH VARIANTS
router.get("/products-with-variants/:id", async (req, res) => {
    try {
        const [productResult] = await db.query(
            `
            SELECT p.*, c.category_name
            FROM products p
            LEFT JOIN product_categories c ON p.product_category_id = c.id
            WHERE p.id = ?
            `,
            [req.params.id]
        );

        if (!productResult.length) {
            return res.status(404).json({ message: "Product not found" });
        }

        const product = productResult[0];
        const [variants] = await db.query(
            "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id",
            [product.id]
        );

        product.variants = variants;
        res.json(product);
    } catch (error) {
        console.error("Error in single product-with-variants:", error);
        res.status(500).json(error);
    }
});

// UPDATE PRODUCT
router.put(
    "/:id",
    uploadWithLogging(upload.fields([{ name: "product_details_pdf", maxCount: 1 }]), "PUT /api/products/:id"),
    async (req, res) => {
        try {
            const {
                product_name,
                product_code,
                product_category_id,
                product_brand,
                price,
                dimensions,
                specifications,
                weight,
                discount,
                product_description,
                warranty,
                existing_pdf,
                bandwidth,
                max_data_rate,
                internal_design,
                typical_applications,
                conductor_type,
                cable_od,
                jacket_material,
                operating_temperature,
                poe_support,
                product_series,
                rack_type,
                static_load,
                mounting_type,
                rack_standard,
                construction_type
            } = req.body;

            let finalPdf = existing_pdf || "";
            if (req.files && req.files["product_details_pdf"]) {
                finalPdf = req.files["product_details_pdf"][0].filename;
            }

            const sql = `
                UPDATE products SET
                    product_name=?, product_code=?, product_category_id=?,
                    product_brand=?, product_details_pdf=?, price=?,
                    dimensions=?, specifications=?, weight=?,
                    discount=?, product_description=?, warranty=?,
                    bandwidth=?, max_data_rate=?, internal_design=?, typical_applications=?,
                    conductor_type=?, cable_od=?, jacket_material=?, operating_temperature=?,
                    poe_support=?, product_series=?, rack_type=?, static_load=?,
                    mounting_type=?, rack_standard=?, construction_type=?
                WHERE id=?
            `;

            await db.query(sql, [
                product_name,
                product_code,
                product_category_id,
                product_brand,
                finalPdf,
                price,
                dimensions,
                specifications,
                weight,
                discount || 0,
                product_description,
                warranty,
                bandwidth || null,
                max_data_rate || null,
                internal_design || null,
                typical_applications || null,
                conductor_type || null,
                cable_od || null,
                jacket_material || null,
                operating_temperature || null,
                poe_support || null,
                product_series || null,
                rack_type || null,
                static_load || null,
                mounting_type || null,
                rack_standard || null,
                construction_type || null,
                req.params.id,
            ]);

            res.json({ success: true, message: "Product updated successfully" });
        } catch (error) {
            console.error("Error in product update:", error);
            res.status(500).json(error);
        }
    }
);

// DELETE PRODUCT
router.delete("/:id", async (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);

        await db.query("DELETE FROM product_variants WHERE product_id = ?", [productId]);
        await db.query("DELETE FROM spec_comparison WHERE product_id = ?", [productId]);
        await db.query("DELETE FROM brand_comparison WHERE product_id = ?", [productId]);
        await db.query("DELETE FROM products WHERE id = ?", [productId]);

        res.json({ success: true, message: "Product deleted successfully" });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json(error);
    }
});

// ============================================
// VARIANT OPERATIONS
// ============================================

// CREATE VARIANT
router.post(
    "/variants",
    uploadWithLogging(upload.array("images", 5), "POST /api/products/variants"),
    async (req, res) => {
        try {
            const {
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
                stock
            } = req.body;

            if (!product_id || !variant_name || !part_code || !brand || !price) {
                return res.status(400).json({
                    success: false,
                    error: "product_id, variant_name, part_code, brand, and price are required"
                });
            }

            const firstImage = req.files && req.files.length > 0
                ? `/uploads/products/${req.files[0].filename}`
                : null;

            const insertSql = `
                INSERT INTO product_variants (
                    product_id, variant_name, part_code, category, brand,
                    description, spec_type, color, size, price,
                    availability, datasheet_url, image_url, stock
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const [insertResult] = await db.query(insertSql, [
                product_id,
                variant_name,
                part_code,
                category || null,
                brand,
                description || null,
                spec_type || null,
                color || null,
                size || null,
                price,
                availability || null,
                datasheet_url || null,
                firstImage,
                stock || 100
            ]);

            res.status(201).json({
                success: true,
                message: "Variant added successfully",
                id: insertResult.insertId,
                image_url: firstImage
            });
        } catch (error) {
            console.error("Error in variant creation:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// UPDATE VARIANT
router.put(
    "/variants/:id",
    uploadWithLogging(upload.array("images", 5), "PUT /api/products/variants/:id"),
    async (req, res) => {
        try {
            const variantId = parseInt(req.params.id, 10);
            const {
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
                stock,
                keep_image
            } = req.body;

            const [variantResult] = await db.query(
                "SELECT * FROM product_variants WHERE id = ?",
                [variantId]
            );

            if (variantResult.length === 0) {
                return res.status(404).json({ success: false, error: "Variant not found" });
            }

            const existingVariant = variantResult[0];
            let imageUrl = existingVariant.image_url;

            if (req.files && req.files.length > 0) {
                imageUrl = `/uploads/products/${req.files[0].filename}`;
            } else if (keep_image === 'false' || keep_image === false) {
                imageUrl = null;
            }

            const updateSql = `
                UPDATE product_variants SET
                    product_id = ?,
                    variant_name = ?,
                    part_code = ?,
                    category = ?,
                    brand = ?,
                    description = ?,
                    spec_type = ?,
                    color = ?,
                    size = ?,
                    price = ?,
                    availability = ?,
                    datasheet_url = ?,
                    image_url = ?,
                    stock = ?
                WHERE id = ?
            `;

            await db.query(updateSql, [
                product_id || existingVariant.product_id,
                variant_name || existingVariant.variant_name,
                part_code || existingVariant.part_code,
                category !== undefined ? category : existingVariant.category,
                brand || existingVariant.brand,
                description !== undefined ? description : existingVariant.description,
                spec_type !== undefined ? spec_type : existingVariant.spec_type,
                color !== undefined ? color : existingVariant.color,
                size !== undefined ? size : existingVariant.size,
                price || existingVariant.price,
                availability !== undefined ? availability : existingVariant.availability,
                datasheet_url !== undefined ? datasheet_url : existingVariant.datasheet_url,
                imageUrl,
                stock !== undefined ? stock : existingVariant.stock,
                variantId
            ]);

            res.json({
                success: true,
                message: "Variant updated successfully",
                id: variantId
            });
        } catch (error) {
            console.error("Error updating variant:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// DELETE VARIANT
router.delete("/variants/:id", async (req, res) => {
    try {
        const variantId = parseInt(req.params.id, 10);
        await db.query("DELETE FROM product_variants WHERE id = ?", [variantId]);
        res.json({ success: true, message: "Variant deleted successfully" });
    } catch (error) {
        console.error("Error deleting variant:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET VARIANTS BY PRODUCT
router.get("/variants/:productId", async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        const [variants] = await db.query(
            "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id",
            [productId]
        );
        res.json(variants);
    } catch (error) {
        console.error("Error fetching variants:", error);
        res.status(500).json(error);
    }
});

// ============================================
// SPEC COMPARISON OPERATIONS (CAT6 vs CAT6A)
// ============================================

// CREATE/UPDATE SPEC COMPARISON
router.post("/spec-comparison", async (req, res) => {
    try {
        const {
            product_id,
            spec_type,
            bandwidth,
            max_data_rate,
            internal_design,
            typical_applications
        } = req.body;

        // Check if exists
        const [existing] = await db.query(
            "SELECT id FROM spec_comparison WHERE product_id = ? AND spec_type = ?",
            [product_id, spec_type]
        );

        if (existing.length > 0) {
            // Update
            await db.query(
                `UPDATE spec_comparison SET
                    bandwidth = ?,
                    max_data_rate = ?,
                    internal_design = ?,
                    typical_applications = ?
                WHERE product_id = ? AND spec_type = ?`,
                [bandwidth, max_data_rate, internal_design, typical_applications, product_id, spec_type]
            );
        } else {
            // Insert
            await db.query(
                `INSERT INTO spec_comparison
                    (product_id, spec_type, bandwidth, max_data_rate, internal_design, typical_applications)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [product_id, spec_type, bandwidth, max_data_rate, internal_design, typical_applications]
            );
        }

        res.json({ success: true, message: "Spec comparison saved successfully" });
    } catch (error) {
        console.error("Error saving spec comparison:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET SPEC COMPARISONS BY PRODUCT
router.get("/spec-comparison/:productId", async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        const [comparisons] = await db.query(
            "SELECT * FROM spec_comparison WHERE product_id = ?",
            [productId]
        );

        // Format as object with spec_type as key
        const result = {};
        comparisons.forEach(item => {
            result[item.spec_type] = item;
        });

        res.json(result);
    } catch (error) {
        console.error("Error fetching spec comparisons:", error);
        res.status(500).json(error);
    }
});

// DELETE SPEC COMPARISON
router.delete("/spec-comparison/:productId/:specType", async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        const { specType } = req.params;
        await db.query(
            "DELETE FROM spec_comparison WHERE product_id = ? AND spec_type = ?",
            [productId, specType]
        );
        res.json({ success: true, message: "Spec comparison deleted successfully" });
    } catch (error) {
        console.error("Error deleting spec comparison:", error);
        res.status(500).json(error);
    }
});

// ============================================
// BRAND COMPARISON OPERATIONS
// ============================================

// CREATE BRAND COMPARISON
router.post("/brand-comparisons", async (req, res) => {
    try {
        const {
            product_id,
            brand,
            product_series,
            conductor_type,
            cable_od,
            jacket_material,
            bandwidth,
            operating_temperature,
            poe_support
        } = req.body;

        // Check if brand already exists for this product
        const [existing] = await db.query(
            "SELECT id FROM brand_comparison WHERE product_id = ? AND brand = ?",
            [product_id, brand]
        );

        if (existing.length > 0) {
            // Update
            await db.query(
                `UPDATE brand_comparison SET
                    product_series = ?,
                    conductor_type = ?,
                    cable_od = ?,
                    jacket_material = ?,
                    bandwidth = ?,
                    operating_temperature = ?,
                    poe_support = ?
                WHERE product_id = ? AND brand = ?`,
                [product_series, conductor_type, cable_od, jacket_material,
                    bandwidth, operating_temperature, poe_support, product_id, brand]
            );
        } else {
            // Insert
            await db.query(
                `INSERT INTO brand_comparison
                    (product_id, brand, product_series, conductor_type, cable_od,
                     jacket_material, bandwidth, operating_temperature, poe_support)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [product_id, brand, product_series, conductor_type, cable_od,
                    jacket_material, bandwidth, operating_temperature, poe_support]
            );
        }

        res.json({ success: true, message: "Brand comparison saved successfully" });
    } catch (error) {
        console.error("Error saving brand comparison:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET BRAND COMPARISONS BY PRODUCT
router.get("/brand-comparisons/:productId", async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        const [comparisons] = await db.query(
            "SELECT * FROM brand_comparison WHERE product_id = ? ORDER BY brand",
            [productId]
        );
        res.json(comparisons);
    } catch (error) {
        console.error("Error fetching brand comparisons:", error);
        res.status(500).json(error);
    }
});

// DELETE BRAND COMPARISON
router.delete("/brand-comparisons/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await db.query("DELETE FROM brand_comparison WHERE id = ?", [id]);
        res.json({ success: true, message: "Brand comparison deleted successfully" });
    } catch (error) {
        console.error("Error deleting brand comparison:", error);
        res.status(500).json(error);
    }
});

// GET ALL BRANDS (for dropdown)
router.get("/brands/list", async (req, res) => {
    try {
        const [brands] = await db.query("SELECT DISTINCT brand FROM brand_comparison ORDER BY brand");
        res.json(brands);
    } catch (error) {
        console.error("Error fetching brands:", error);
        res.status(500).json(error);
    }
});

module.exports = router;