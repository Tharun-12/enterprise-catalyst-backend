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
                min_price,
                max_price,
                discount,
                product_description,
                warranty,
                product_series,
                product_type,
                conductor_type,
                cable_od,
                jacket_material,
                bandwidth,
                operating_temperature,
                poe_support
            } = req.body;

            if (!product_code) {
                return res.status(400).json({
                    success: false,
                    error: "Product code is required. Please enter a unique product code."
                });
            }

            let pdfFile = "";
            if (req.files && req.files["product_details_pdf"]) {
                pdfFile = req.files["product_details_pdf"][0].filename;
            }

            const finalCategoryId = product_category_id || null;
            const finalBrand = product_brand || null;

            const sql = `
                INSERT INTO products (
                    product_name, product_code, product_category_id, product_brand,
                    product_details_pdf, min_price, max_price,
                    discount, product_description, warranty,
                    product_series, product_type,
                    conductor_type, cable_od, jacket_material,
                    bandwidth, operating_temperature, poe_support
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const [result] = await db.query(sql, [
                product_name,
                product_code,
                finalCategoryId,
                finalBrand,
                pdfFile,
                min_price || null,
                max_price || null,
                discount || 0,
                product_description || null,
                warranty || null,
                product_series || null,
                product_type || null,
                conductor_type || null,
                cable_od || null,
                jacket_material || null,
                bandwidth || null,
                operating_temperature || null,
                poe_support || null
            ]);

            res.status(201).json({
                success: true,
                message: "Product added successfully",
                id: result.insertId,
                product_code: product_code
            });
        } catch (error) {
            console.error("Error in product creation:", error);
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({
                    success: false,
                    error: "Product code already exists. Please enter a unique product code."
                });
            }
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
                min_price,
                max_price,
                discount,
                product_description,
                warranty,
                existing_pdf,
                product_series,
                product_type,
                conductor_type,
                cable_od,
                jacket_material,
                bandwidth,
                operating_temperature,
                poe_support
            } = req.body;

            let finalPdf = existing_pdf || "";
            
            if (req.files && req.files["product_details_pdf"]) {
                if (existing_pdf) {
                    const oldPdfPath = path.join(pdfUploadDir, existing_pdf);
                    try {
                        if (fs.existsSync(oldPdfPath)) {
                            fs.unlinkSync(oldPdfPath);
                        }
                    } catch (err) {
                        console.error("Error deleting old PDF:", err);
                    }
                }
                finalPdf = req.files["product_details_pdf"][0].filename;
            }

            const [existingProduct] = await db.query(
                "SELECT product_code, product_category_id, product_brand FROM products WHERE id = ?",
                [req.params.id]
            );
            
            if (existingProduct.length === 0) {
                return res.status(404).json({ error: "Product not found" });
            }

            const finalProductCode = product_code || existingProduct[0].product_code;
            const finalCategoryId = product_category_id !== undefined && product_category_id !== null && product_category_id !== '' 
                ? product_category_id 
                : existingProduct[0].product_category_id;
            const finalBrand = product_brand !== undefined && product_brand !== null && product_brand !== '' 
                ? product_brand 
                : existingProduct[0].product_brand;

            const sql = `
                UPDATE products SET
                    product_name=?, product_code=?, product_category_id=?,
                    product_brand=?, product_details_pdf=?, min_price=?,
                    max_price=?, discount=?, product_description=?, warranty=?,
                    product_series=?, product_type=?,
                    conductor_type=?, cable_od=?, jacket_material=?,
                    bandwidth=?, operating_temperature=?, poe_support=?
                WHERE id=?
            `;

            await db.query(sql, [
                product_name,
                finalProductCode,
                finalCategoryId,
                finalBrand,
                finalPdf,
                min_price || null,
                max_price || null,
                discount || 0,
                product_description || null,
                warranty || null,
                product_series || null,
                product_type || null,
                conductor_type || null,
                cable_od || null,
                jacket_material || null,
                bandwidth || null,
                operating_temperature || null,
                poe_support || null,
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

        const [product] = await db.query(
            "SELECT product_details_pdf FROM products WHERE id = ?",
            [productId]
        );
        
        if (product.length > 0 && product[0].product_details_pdf) {
            const pdfPath = path.join(pdfUploadDir, product[0].product_details_pdf);
            try {
                if (fs.existsSync(pdfPath)) {
                    fs.unlinkSync(pdfPath);
                }
            } catch (err) {
                console.error("Error deleting PDF:", err);
            }
        }

        await db.query("DELETE FROM product_variants WHERE product_id = ?", [productId]);
        await db.query("DELETE FROM spec_comparison WHERE product_id = ?", [productId]);
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

            console.log("Creating variant with data:", req.body);

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

            console.log("Updating variant:", variantId, req.body);

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
                if (existingVariant.image_url) {
                    const oldImagePath = path.join(productUploadDir, path.basename(existingVariant.image_url));
                    try {
                        if (fs.existsSync(oldImagePath)) {
                            fs.unlinkSync(oldImagePath);
                        }
                    } catch (err) {
                        console.error("Error deleting old image:", err);
                    }
                }
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
        
        const [variant] = await db.query(
            "SELECT image_url FROM product_variants WHERE id = ?",
            [variantId]
        );
        
        if (variant.length > 0 && variant[0].image_url) {
            const imagePath = path.join(productUploadDir, path.basename(variant[0].image_url));
            try {
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            } catch (err) {
                console.error("Error deleting variant image:", err);
            }
        }
        
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
// SPEC COMPARISON OPERATIONS
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

        console.log("Saving spec comparison:", req.body);

        const [existing] = await db.query(
            "SELECT id FROM spec_comparison WHERE product_id = ? AND spec_type = ?",
            [product_id, spec_type]
        );

        if (existing.length > 0) {
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

// DELETE ALL SPEC COMPARISONS FOR A PRODUCT
router.delete("/spec-comparison/:productId/all", async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        await db.query(
            "DELETE FROM spec_comparison WHERE product_id = ?",
            [productId]
        );
        res.json({ success: true, message: "All spec comparisons deleted successfully" });
    } catch (error) {
        console.error("Error deleting spec comparisons:", error);
        res.status(500).json(error);
    }
});

module.exports = router;