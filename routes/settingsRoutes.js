const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");

// Configure multer for logo upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = "uploads/logo/";
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, "logo-" + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error("Only image files are allowed"));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: fileFilter
});

// GET company settings
router.get("/", async (req, res) => {
    try {
        const [settings] = await db.query(
            "SELECT * FROM company_settings ORDER BY id DESC LIMIT 1"
        );
        
        if (settings.length === 0) {
            return res.json({
                success: true,
                data: {
                    id: null,
                    name: '',
                    short_name: '',
                    description: '',
                    gstin: '',
                    working_hours: '',
                    address: '',
                    phone: '',
                    whatsapp: '',
                    email: '',
                    linkedin: '',
                    twitter: '',
                    facebook: '',
                    youtube: '',
                    instagram: '',
                    logo_url: ''
                }
            });
        }
        
        res.json({
            success: true,
            data: settings[0]
        });
    } catch (error) {
        console.error("Error fetching settings:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch settings",
            error: error.message
        });
    }
});

// PUT update company details
router.put("/company", async (req, res) => {
    try {
        const {
            name,
            short_name,
            description,
            gstin,
            working_hours,
            address
        } = req.body;
        
        // Check if record exists
        const [existing] = await db.query(
            "SELECT id FROM company_settings LIMIT 1"
        );
        
        if (existing.length === 0) {
            // Insert new record
            await db.query(
                `INSERT INTO company_settings 
                (name, short_name, description, gstin, working_hours, address) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [name, short_name, description, gstin, working_hours, address]
            );
        } else {
            // Update existing record
            await db.query(
                `UPDATE company_settings SET 
                    name = ?,
                    short_name = ?,
                    description = ?,
                    gstin = ?,
                    working_hours = ?,
                    address = ?
                WHERE id = ?`,
                [name, short_name, description, gstin, working_hours, address, existing[0].id]
            );
        }
        
        res.json({
            success: true,
            message: "Company details updated successfully"
        });
    } catch (error) {
        console.error("Error updating company details:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update company details",
            error: error.message
        });
    }
});

// PUT update social links
router.put("/social", async (req, res) => {
    try {
        const {
            linkedin,
            twitter,
            facebook,
            youtube,
            instagram
        } = req.body;
        
        const [existing] = await db.query(
            "SELECT id FROM company_settings LIMIT 1"
        );
        
        if (existing.length === 0) {
            await db.query(
                `INSERT INTO company_settings 
                (linkedin, twitter, facebook, youtube, instagram) 
                VALUES (?, ?, ?, ?, ?)`,
                [linkedin, twitter, facebook, youtube, instagram]
            );
        } else {
            await db.query(
                `UPDATE company_settings SET 
                    linkedin = ?,
                    twitter = ?,
                    facebook = ?,
                    youtube = ?,
                    instagram = ?
                WHERE id = ?`,
                [linkedin, twitter, facebook, youtube, instagram, existing[0].id]
            );
        }
        
        res.json({
            success: true,
            message: "Social links updated successfully"
        });
    } catch (error) {
        console.error("Error updating social links:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update social links",
            error: error.message
        });
    }
});

// PUT update contact info
router.put("/contact", async (req, res) => {
    try {
        const {
            phone,
            whatsapp,
            email,
            address
        } = req.body;
        
        const [existing] = await db.query(
            "SELECT id FROM company_settings LIMIT 1"
        );
        
        if (existing.length === 0) {
            await db.query(
                `INSERT INTO company_settings 
                (phone, whatsapp, email, address) 
                VALUES (?, ?, ?, ?)`,
                [phone, whatsapp, email, address]
            );
        } else {
            await db.query(
                `UPDATE company_settings SET 
                    phone = ?,
                    whatsapp = ?,
                    email = ?,
                    address = ?
                WHERE id = ?`,
                [phone, whatsapp, email, address, existing[0].id]
            );
        }
        
        res.json({
            success: true,
            message: "Contact info updated successfully"
        });
    } catch (error) {
        console.error("Error updating contact info:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update contact info",
            error: error.message
        });
    }
});

// PUT update all settings (including logo)
router.put("/", upload.single("logo"), async (req, res) => {
    try {
        console.log("Request body:", req.body);
        console.log("File:", req.file);
        
        const {
            name,
            short_name,
            description,
            gstin,
            working_hours,
            address,
            phone,
            whatsapp,
            email,
            linkedin,
            twitter,
            facebook,
            youtube,
            instagram
        } = req.body;
        
        // Check if record exists
        const [existing] = await db.query(
            "SELECT id, logo_url FROM company_settings LIMIT 1"
        );
        
        let logo_url = existing.length > 0 ? existing[0].logo_url : null;
        
        // Handle logo upload
        if (req.file) {
            // Delete old logo if exists
            if (logo_url) {
                const oldLogoPath = path.join(__dirname, "..", logo_url);
                try {
                    if (fs.existsSync(oldLogoPath)) {
                        fs.unlinkSync(oldLogoPath);
                        console.log("Old logo deleted:", oldLogoPath);
                    }
                } catch (err) {
                    console.error("Error deleting old logo:", err);
                }
            }
            logo_url = `/uploads/logo/${req.file.filename}`;
            console.log("New logo uploaded:", logo_url);
        }
        
        if (existing.length === 0) {
            // Insert new record
            const query = `
                INSERT INTO company_settings 
                (name, short_name, description, gstin, working_hours, address,
                phone, whatsapp, email, linkedin, twitter, facebook, youtube, instagram, logo_url) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await db.query(query, [
                name || '', short_name || '', description || '', gstin || '', working_hours || '', address || '',
                phone || '', whatsapp || '', email || '', 
                linkedin || '', twitter || '', facebook || '', youtube || '', instagram || '', 
                logo_url
            ]);
        } else {
            // Update existing record
            const query = `
                UPDATE company_settings SET 
                    name = ?,
                    short_name = ?,
                    description = ?,
                    gstin = ?,
                    working_hours = ?,
                    address = ?,
                    phone = ?,
                    whatsapp = ?,
                    email = ?,
                    linkedin = ?,
                    twitter = ?,
                    facebook = ?,
                    youtube = ?,
                    instagram = ?,
                    logo_url = ?
                WHERE id = ?
            `;
            await db.query(query, [
                name || '', short_name || '', description || '', gstin || '', working_hours || '', address || '',
                phone || '', whatsapp || '', email || '', 
                linkedin || '', twitter || '', facebook || '', youtube || '', instagram || '', 
                logo_url,
                existing[0].id
            ]);
        }
        
        res.json({
            success: true,
            message: "Settings updated successfully",
            data: { logo_url }
        });
    } catch (error) {
        console.error("Error updating settings:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update settings",
            error: error.message
        });
    }
});

// DELETE logo
router.delete("/logo", async (req, res) => {
    try {
        const [existing] = await db.query(
            "SELECT id, logo_url FROM company_settings LIMIT 1"
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No settings found"
            });
        }
        
        if (existing[0].logo_url) {
            const logoPath = path.join(__dirname, "..", existing[0].logo_url);
            try {
                if (fs.existsSync(logoPath)) {
                    fs.unlinkSync(logoPath);
                    console.log("Logo deleted:", logoPath);
                }
            } catch (err) {
                console.error("Error deleting logo:", err);
            }
            
            await db.query(
                "UPDATE company_settings SET logo_url = NULL WHERE id = ?",
                [existing[0].id]
            );
        }
        
        res.json({
            success: true,
            message: "Logo deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting logo:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete logo",
            error: error.message
        });
    }
});

module.exports = router;