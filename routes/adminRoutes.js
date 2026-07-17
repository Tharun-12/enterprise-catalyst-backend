const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');


// Check if an admin already exists
router.get('/exists', async (req, res) => {
    try {
        const [results] = await db.query('SELECT COUNT(*) as count FROM admin');
        const adminExists = results[0].count > 0;
        res.json({
            success: true,
            exists: adminExists
        });
    } catch (error) {
        console.error('❌ Exists check error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Admin Login Route - only creates admin if NONE exists yet
router.post('/login', async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Step 1: check how many admins exist in total
        const [countResult] = await db.query('SELECT COUNT(*) as count FROM admin');
        const adminCount = countResult[0].count;

        let admin = null;
        let isFirstTime = false;

        if (adminCount === 0) {
            // No admin exists yet anywhere — create the ONE admin
            isFirstTime = true;
            const hashedPassword = await bcrypt.hash(password, 10);

            const [insertResult] = await db.query(
                'INSERT INTO admin (email, password) VALUES (?, ?)',
                [email, hashedPassword]
            );

            const [newAdmin] = await db.query(
                'SELECT id, email, password FROM admin WHERE id = ?',
                [insertResult.insertId]
            );
            admin = newAdmin[0];
        } else {
            // An admin already exists — must match by email, no new creation allowed
            const [results] = await db.query(
                'SELECT id, email, password FROM admin WHERE email = ?',
                [email]
            );

            if (results.length === 0) {
                // Wrong email — do NOT create a new admin
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

            admin = results[0];
            const isPasswordValid = await bcrypt.compare(password, admin.password);

            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }
        }

        delete admin.password;

        res.json({
            success: true,
            message: isFirstTime ? 'Account created successfully! Welcome admin!' : 'Login successful',
            admin: admin,
            isFirstTime: isFirstTime,
            rememberMe: rememberMe || false
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});


// Verify Admin Route (for checking if user is logged in)
router.get('/verify', async (req, res) => {
    console.log('🔍 Verify route called');
    
    try {
        // Get admin ID from headers
        const adminId = req.headers['x-admin-id'];
        console.log('🆔 Admin ID from header:', adminId);
        
        if (!adminId) {
            console.log('❌ No admin ID provided');
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        // Get admin info from database
        const query = 'SELECT id, email, created_at FROM admin WHERE id = ?';
        const [results] = await db.query(query, [adminId]);

        if (results.length === 0) {
            console.log('❌ Admin not found with ID:', adminId);
            return res.status(401).json({
                success: false,
                message: 'Admin not found'
            });
        }

        console.log('✅ Admin verified:', results[0].email);
        res.json({
            success: true,
            admin: results[0],
            valid: true
        });

    } catch (error) {
        console.error('❌ Verify error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Logout Route
router.post('/logout', (req, res) => {
    console.log('🚪 Logout route called');
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Change Password Route
router.put('/change-password', async (req, res) => {
    console.log('🔑 Change password route called');
    
    try {
        const { currentPassword, newPassword } = req.body;
        const adminId = req.headers['x-admin-id'];
        console.log('🆔 Admin ID:', adminId);

        if (!adminId) {
            console.log('❌ No admin ID provided');
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        // Get current admin
        const query = 'SELECT id, password FROM admin WHERE id = ?';
        const [results] = await db.query(query, [adminId]);
        
        if (results.length === 0) {
            console.error('❌ Admin not found');
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        const admin = results[0];
        console.log('✅ Admin found for password change');
        
        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, admin.password);
        console.log('🔐 Current password valid:', isValid);
        
        if (!isValid) {
            console.log('❌ Current password is incorrect');
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        console.log('✅ New password hashed');

        // Update password
        const updateQuery = 'UPDATE admin SET password = ? WHERE id = ?';
        await db.query(updateQuery, [hashedPassword, adminId]);
        
        console.log('✅ Password updated successfully');
        res.json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error) {
        console.error('❌ Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;