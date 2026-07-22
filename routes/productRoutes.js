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

// ====================================
// MULTER STORAGE CONFIGURATION
// ====================================
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

// ====================================
// MULTER CONFIGURATION
// ====================================
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "images" || file.fieldname === "product_images") {
      const allowed = /jpeg|jpg|png|webp|gif/;
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.test(ext) && allowed.test(file.mimetype)) {
        return cb(null, true);
      }
      console.warn(`Rejected image upload "${file.originalname}" - invalid type (${file.mimetype})`);
      return cb(new Error("Only image files are allowed"));
    }
    if (file.fieldname === "product_details_pdf") {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === ".pdf") {
        return cb(null, true);
      }
      console.warn(`Rejected PDF upload "${file.originalname}" - invalid extension`);
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
});

// ====================================
// MULTER ERROR-WRAPPING HELPER
// ====================================
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

// ====================================
// CREATE PRODUCT
// ====================================
router.post(
  "/",
  uploadWithLogging(upload.fields([{ name: "product_details_pdf", maxCount: 1 }]), "POST /api/products"),
  async (req, res) => {
    console.log('--- POST /api/products ---');
    console.log('req.body:', req.body);
    console.log('req.files:', req.files);

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
      } = req.body;

      let pdfFile = "";
      if (req.files && req.files["product_details_pdf"]) {
        pdfFile = req.files["product_details_pdf"][0].filename;
      }
      console.log('PDF filename:', pdfFile || '(none uploaded)');

      const sql = `
        INSERT INTO products (
          product_name, product_code, product_category_id, product_brand,
          product_details_pdf, price, dimensions, specifications,
          weight, discount, product_description, warranty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      ]);

      console.log('✅ Product inserted successfully, ID:', result.insertId);
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

// ====================================
// CREATE VARIANT (POST)
// ====================================
router.post(
  "/variants",
  uploadWithLogging(upload.array("images", 5), "POST /api/products/variants"),
  async (req, res) => {
    console.log('=== POST /api/products/variants ===');
    console.log('req.body:', req.body);
    console.log('req.files:', req.files ? req.files.map(f => ({ 
      filename: f.filename, 
      originalname: f.originalname,
      size: f.size 
    })) : 'none');

    try {
      const { product_id, color_name, color_hex, price, stock } = req.body;

      // Validate required fields
      if (!product_id) {
        return res.status(400).json({ success: false, error: "product_id is required" });
      }
      if (!color_name) {
        return res.status(400).json({ success: false, error: "color_name is required" });
      }
      if (!color_hex) {
        return res.status(400).json({ success: false, error: "color_hex is required" });
      }
      if (!price) {
        return res.status(400).json({ success: false, error: "price is required" });
      }

      // Parse values
      const productIdInt = parseInt(product_id, 10);
      const variantPrice = parseFloat(price);
      const variantStock = stock ? parseInt(stock, 10) : 100;

      if (isNaN(productIdInt) || productIdInt <= 0) {
        return res.status(400).json({ success: false, error: "product_id must be a valid positive integer" });
      }
      if (isNaN(variantPrice) || variantPrice < 0) {
        return res.status(400).json({ success: false, error: "price must be a valid positive number" });
      }

      // Check if product exists
      const [productResult] = await db.query("SELECT id FROM products WHERE id = ?", [productIdInt]);
      if (productResult.length === 0) {
        return res.status(404).json({ success: false, error: `Product with id ${productIdInt} not found` });
      }

      // Get first image path
      const firstImage = req.files && req.files.length > 0 
        ? `/uploads/products/${req.files[0].filename}` 
        : null;

      // Insert variant
      const insertSql = `
        INSERT INTO product_variants 
        (product_id, color_name, color_hex, price, stock, image_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const [insertResult] = await db.query(insertSql, [
        productIdInt, 
        color_name, 
        color_hex, 
        variantPrice, 
        variantStock, 
        firstImage
      ]);

      const variantId = insertResult.insertId;
      console.log(`✅ Variant inserted successfully, ID: ${variantId}`);

      // Return the inserted variant
      const [variantRows] = await db.query(
        "SELECT * FROM product_variants WHERE id = ?",
        [variantId]
      );

      res.status(201).json({
        success: true,
        message: "Variant added successfully",
        id: variantId,
        image_url: firstImage,
        variant: variantRows[0] || null
      });
    } catch (error) {
      console.error("Error in variant creation:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ====================================
// UPDATE VARIANT (PUT)
// ====================================
router.put(
  "/variants/:id",
  uploadWithLogging(upload.array("images", 5), "PUT /api/products/variants/:id"),
  async (req, res) => {
    console.log('=== PUT /api/products/variants/:id ===');
    console.log('Variant ID:', req.params.id);
    console.log('req.body:', req.body);
    console.log('req.files:', req.files ? req.files.map(f => f.filename) : 'none');

    try {
      const variantId = parseInt(req.params.id, 10);
      const { product_id, color_name, color_hex, price, stock, keep_image } = req.body;

      if (isNaN(variantId) || variantId <= 0) {
        return res.status(400).json({ success: false, error: "Invalid variant ID" });
      }

      // Check if variant exists
      const [variantResult] = await db.query(
        "SELECT * FROM product_variants WHERE id = ?",
        [variantId]
      );

      if (variantResult.length === 0) {
        return res.status(404).json({ success: false, error: `Variant with id ${variantId} not found` });
      }

      // Get existing variant
      const existingVariant = variantResult[0];
      
      // Use provided values or keep existing
      const finalColorName = color_name || existingVariant.color_name;
      const finalColorHex = color_hex || existingVariant.color_hex;
      const finalPrice = price ? parseFloat(price) : existingVariant.price;
      const finalStock = stock ? parseInt(stock, 10) : existingVariant.stock;
      const finalProductId = product_id ? parseInt(product_id, 10) : existingVariant.product_id;

      // Determine image URL
      let imageUrl = existingVariant.image_url;
      if (req.files && req.files.length > 0) {
        // If new image uploaded, use it
        imageUrl = `/uploads/products/${req.files[0].filename}`;
      } else if (keep_image === 'false' || keep_image === false) {
        // If keep_image is false, remove the image
        imageUrl = null;
      }
      // else keep existing image

      console.log('Updating variant with data:', {
        id: variantId,
        product_id: finalProductId,
        color_name: finalColorName,
        color_hex: finalColorHex,
        price: finalPrice,
        stock: finalStock,
        image_url: imageUrl
      });

      // Update variant
      const updateSql = `
        UPDATE product_variants 
        SET product_id = ?, color_name = ?, color_hex = ?, 
            price = ?, stock = ?, image_url = ?
        WHERE id = ?
      `;

      await db.query(updateSql, [
        finalProductId, 
        finalColorName, 
        finalColorHex, 
        finalPrice, 
        finalStock, 
        imageUrl, 
        variantId
      ]);

      console.log(`✅ Variant ${variantId} updated successfully`);

      // Return updated variant
      const [updatedVariant] = await db.query(
        "SELECT * FROM product_variants WHERE id = ?",
        [variantId]
      );

      res.json({
        success: true,
        message: "Variant updated successfully",
        id: variantId,
        variant: updatedVariant[0] || null
      });
    } catch (error) {
      console.error("Error updating variant:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ====================================
// DELETE VARIANT
// ====================================
router.delete("/variants/:id", async (req, res) => {
  console.log(`--- DELETE /api/products/variants/${req.params.id} ---`);
  try {
    const variantId = parseInt(req.params.id, 10);
    
    if (isNaN(variantId) || variantId <= 0) {
      return res.status(400).json({ success: false, error: "Invalid variant ID" });
    }

    // Check if variant exists
    const [variantResult] = await db.query(
      "SELECT * FROM product_variants WHERE id = ?",
      [variantId]
    );

    if (variantResult.length === 0) {
      return res.status(404).json({ success: false, error: "Variant not found" });
    }

    // Delete variant
    await db.query("DELETE FROM product_variants WHERE id = ?", [variantId]);

    console.log(`Variant ${variantId} deleted`);
    res.json({ success: true, message: "Variant deleted successfully" });
  } catch (error) {
    console.error("Error deleting variant:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================
// GET ALL PRODUCTS (SIMPLE)
// ====================================
router.get("/only-products", async (req, res) => {
  try {
    const sql = `SELECT * FROM products ORDER BY id DESC`;
    const [result] = await db.query(sql);
    res.json(result);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json(error);
  }
});

// ====================================
// GET PRODUCTS WITH VARIANTS
// ====================================
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
        "SELECT * FROM product_variants WHERE product_id = ?",
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

// ====================================
// GET PRODUCT WITH VARIANTS BY ID
// ====================================
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
      "SELECT * FROM product_variants WHERE product_id = ?",
      [product.id]
    );

    product.variants = variants;
    res.json(product);
  } catch (error) {
    console.error("Error in single product-with-variants:", error);
    res.status(500).json(error);
  }
});

// ====================================
// UPDATE PRODUCT
// ====================================
router.put(
  "/:id",
  uploadWithLogging(upload.fields([{ name: "product_details_pdf", maxCount: 1 }]), "PUT /api/products/:id"),
  async (req, res) => {
    console.log(`--- PUT /api/products/${req.params.id} ---`);
    console.log('req.body:', req.body);
    console.log('req.files:', req.files);

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
      } = req.body;

      let finalPdf = existing_pdf || "";
      if (req.files && req.files["product_details_pdf"]) {
        finalPdf = req.files["product_details_pdf"][0].filename;
      }
      console.log('Final PDF filename:', finalPdf || '(none)');

      const sql = `
        UPDATE products SET
          product_name=?, product_code=?, product_category_id=?,
          product_brand=?, product_details_pdf=?, price=?,
          dimensions=?, specifications=?, weight=?,
          discount=?, product_description=?, warranty=?
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
        req.params.id,
      ]);

      console.log(`Product ${req.params.id} updated successfully`);
      res.json({ message: "Product updated successfully" });
    } catch (error) {
      console.error("Error in product update:", error);
      res.status(500).json(error);
    }
  }
);

// ====================================
// DELETE PRODUCT
// ====================================
router.delete("/:id", async (req, res) => {
  console.log(`--- DELETE /api/products/${req.params.id} ---`);
  try {
    const productId = parseInt(req.params.id, 10);

    if (isNaN(productId) || productId <= 0) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    // First delete variants
    await db.query(
      "DELETE FROM product_variants WHERE product_id = ?",
      [productId]
    );

    // Delete product
    await db.query(
      "DELETE FROM products WHERE id = ?",
      [productId]
    );

    console.log(`Product ${productId} and its variants deleted`);
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json(error);
  }
});

// ====================================
// GET VARIANTS BY PRODUCT ID
// ====================================
router.get("/variants/:productId", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId, 10);
    
    if (isNaN(productId) || productId <= 0) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const [variants] = await db.query(
      "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id",
      [productId]
    );

    res.json(variants);
  } catch (error) {
    console.error("Error fetching variants by product:", error);
    res.status(500).json(error);
  }
});

// ====================================
// GET ALL VARIANTS
// ====================================
router.get("/all-variants", async (req, res) => {
  try {
    const sql = `
      SELECT pv.*, p.product_name
      FROM product_variants pv
      LEFT JOIN products p ON pv.product_id = p.id
      ORDER BY pv.id DESC
    `;

    const [variants] = await db.query(sql);
    res.json(variants);
  } catch (error) {
    console.error("Error fetching all variants:", error);
    res.status(500).json(error);
  }
});

// ====================================
// GET SINGLE VARIANT
// ====================================
router.get("/variant/:id", async (req, res) => {
  try {
    const variantId = parseInt(req.params.id, 10);
    
    if (isNaN(variantId) || variantId <= 0) {
      return res.status(400).json({ error: "Invalid variant ID" });
    }

    const [result] = await db.query(
      "SELECT * FROM product_variants WHERE id = ?",
      [variantId]
    );

    if (!result.length) {
      return res.status(404).json({ message: "Variant not found" });
    }

    res.json(result[0]);
  } catch (error) {
    console.error("Error fetching variant:", error);
    res.status(500).json(error);
  }
});

// ====================================
// GET SINGLE PRODUCT
// ====================================
router.get("/:id", async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    
    if (isNaN(productId) || productId <= 0) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const sql = `
      SELECT p.*, c.category_name
      FROM products p
      LEFT JOIN product_categories c ON p.product_category_id = c.id
      WHERE p.id = ?
    `;

    const [result] = await db.query(sql, [productId]);

    if (result.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(result[0]);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json(error);
  }
});

module.exports = router;